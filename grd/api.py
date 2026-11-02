from contextlib import asynccontextmanager
from datetime import date, timedelta
import logging
import os
import time
from collections import defaultdict, deque
from threading import Lock

from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, Request, UploadFile
from fastapi.encoders import jsonable_encoder
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select, text
from sqlalchemy.exc import IntegrityError

from . import domain as d, schemas as v
from .db import database, lock_org, transaction
from .models import (
    Audit,
    Batch,
    Case,
    Dataset,
    Demand,
    Job,
    Location,
    Movement,
    Plan,
    Policy,
    Product,
    Route,
    Shipment,
    ShipmentLine,
    StockRequest,
    User,
)
from .security import decode, passwords, secret, token

logger = logging.getLogger("grd")
bearer = HTTPBearer(auto_error=False)


def create_app(database_url=None):
    secret()
    engine, factory = database(database_url)

    @asynccontextmanager
    async def lifespan(app):
        yield
        engine.dispose()

    app = FastAPI(
        title="GRD Supply Intelligence",
        version="0.1.0",
        lifespan=lifespan,
        description="Shared web/React Native API. All quantities are integer product base units. /docs is interactive.",
    )
    app.state.factory, app.state.engine = factory, engine
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[
            x
            for x in os.getenv("CORS_ORIGINS", "http://localhost:3000,http://localhost:8081").split(",")
            if x
        ],
        allow_credentials=False,
        allow_methods=["GET", "POST", "PATCH"],
        allow_headers=["Authorization", "Content-Type", "Idempotency-Key"],
    )
    attempts, attempts_lock = defaultdict(deque), Lock()

    @app.middleware("http")
    async def trace(request, call_next):
        start = time.monotonic()
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Cache-Control"] = "no-store"
        logger.info(
            "http method=%s status=%s duration_ms=%.1f",
            request.method,
            response.status_code,
            (time.monotonic() - start) * 1000,
        )
        return response

    @app.exception_handler(IntegrityError)
    async def integrity_error(request, exc):
        return JSONResponse(
            status_code=409, content={"detail": "Conflicting record or invalid database constraint"}
        )

    def context(credentials: HTTPAuthorizationCredentials | None = Depends(bearer)):
        if not credentials:
            raise HTTPException(401, "Authentication required")
        try:
            claims = decode(credentials.credentials)
        except Exception:
            raise HTTPException(401, "Invalid or expired token") from None
        with transaction(factory) as s:
            user = s.get(User, claims["sub"])
            if not user or not user.active or user.token_version != claims["ver"]:
                raise HTTPException(401, "Session revoked")
            org = lock_org(s, user.org_id)
            yield s, user, org

    def items(s, cls, user):
        return list(s.scalars(select(cls).where(cls.org_id == user.org_id).order_by(cls.created_at, cls.id)))

    def page(rows, offset=0, limit=100):
        if offset < 0 or limit < 1 or limit > 200:
            d.fail("offset >= 0 and limit between 1 and 200 required", 422)
        return {
            "items": [d.record(x) if not isinstance(x, dict) else x for x in rows[offset : offset + limit]],
            "total": len(rows),
            "offset": offset,
            "limit": limit,
        }

    def accessible_plan(s, user, identifier):
        plan = d.get(s, Plan, identifier, user)
        if not (d.allowed(user, plan.source_id) or d.allowed(user, plan.destination_id)):
            d.fail("Plan not in your scope", 403)
        return plan

    @app.get("/health/live", tags=["health"])
    def live():
        return {"status": "alive"}

    @app.get("/health/ready", tags=["health"])
    def ready():
        try:
            with engine.connect() as conn:
                revision = conn.execute(text("SELECT version_num FROM alembic_version")).scalar()
                if revision != "c92e56a1f710":
                    raise RuntimeError("Schema revision does not match this application release")
        except Exception:
            raise HTTPException(503, "Database or migrations unavailable") from None
        return {"status": "ready"}

    @app.post("/api/v1/auth/login", tags=["identity"])
    def login(data: v.Login, request: Request):
        ip = request.client.host if request.client else "unknown"
        with attempts_lock:
            queue = attempts[ip]
            while queue and queue[0] < time.monotonic() - 60:
                queue.popleft()
            if len(queue) >= 10:
                raise HTTPException(429, "Too many attempts; retry in one minute")
            queue.append(time.monotonic())
        with transaction(factory) as s:
            user = s.scalar(select(User).where(User.email == data.email.lower()))
            if not user or not user.active or not passwords.verify(data.password, user.password_hash):
                raise HTTPException(401, "Invalid credentials")
            return {"access_token": token(user), "token_type": "bearer", "expires_in": 28800}

    @app.get("/api/v1/me", tags=["identity"])
    def me(ctx=Depends(context), credentials: HTTPAuthorizationCredentials = Depends(bearer)):
        _, u, o = ctx
        return {
            "id": u.id,
            "email": u.email,
            "role": u.role,
            "location_ids": u.location_ids,
            "organisation_id": o.id,
            "evidence_type": o.mode,
            "inventory_revision": o.revision,
            "scenario_on": str(o.scenario_on) if o.scenario_on else None,
            "session_expires_at": __import__("datetime").datetime.fromtimestamp(decode(credentials.credentials)["exp"], __import__("datetime").timezone.utc).isoformat(),
        }

    @app.post("/api/v1/auth/logout", tags=["identity"])
    def logout(ctx=Depends(context)):
        _, u, _ = ctx
        u.token_version += 1
        return {"revoked": True}

    @app.post("/api/v1/users", tags=["identity"])
    def user_create(data: v.UserInput, ctx=Depends(context)):
        s, u, _ = ctx
        d.role(u)
        for loc in data.location_ids:
            d.get(s, Location, loc, u)
        user = User(
            org_id=u.org_id,
            email=data.email.lower(),
            password_hash=passwords.hash(data.password),
            role=data.role,
            location_ids=data.location_ids,
        )
        s.add(user)
        s.flush()
        d.audit(s, u, "user.created", user.id, {"role": user.role, "location_ids": user.location_ids})
        return {"id": user.id, "email": user.email, "role": user.role, "location_ids": user.location_ids}

    @app.post("/api/v1/products", tags=["master data"])
    def product_create(data: v.ProductInput, ctx=Depends(context)):
        s, u, o = ctx
        d.role(u, "steward")
        if "evidence_type" not in data.provenance:
            d.fail("Product provenance must identify evidence_type", 422)
        if (
            data.unit_conversions.get(data.base_unit, 1) != 1
            or data.unit_conversions.get("pack", data.pack_size) != data.pack_size
        ):
            d.fail("Base unit must convert to 1; pack factor must equal pack_size", 422)
        data.unit_conversions = {**data.unit_conversions, data.base_unit: 1, "pack": data.pack_size}
        obj = Product(org_id=u.org_id, **data.model_dump())
        s.add(obj)
        s.flush()
        o.revision += 1
        d.audit(s, u, "product.created", obj.id, {"name": obj.name})
        return d.record(obj)

    @app.get("/api/v1/products", tags=["master data"])
    def products(offset: int = 0, limit: int = 100, ctx=Depends(context)):
        s, u, _ = ctx
        return page(items(s, Product, u), offset, limit)

    @app.post("/api/v1/units/convert", tags=["master data"])
    def convert(data: v.UnitConversion, ctx=Depends(context)):
        s, u, _ = ctx
        p = d.get(s, Product, data.product_id, u)
        units = {p.base_unit: 1, "pack": p.pack_size, **p.unit_conversions}
        if data.from_unit not in units or data.to_unit not in units:
            d.fail("Unknown approved unit", 422)
        base = data.quantity * units[data.from_unit]
        if base % units[data.to_unit]:
            d.fail("Conversion produces a fractional destination unit", 422)
        return {"quantity": base // units[data.to_unit], "unit": data.to_unit, "base_quantity": base}

    @app.post("/api/v1/routes/{route_id}/rules", tags=["master data"])
    def route_rules(route_id: str, data: v.RouteInput, ctx=Depends(context)):
        s, u, o = ctx
        d.role(u, "manager")
        rt = d.get(s, Route, route_id, u)
        d.scope(u, rt.origin_id, rt.destination_id)
        if (data.origin_id, data.destination_id) != (
            rt.origin_id,
            rt.destination_id,
        ) or data.lead_days_upper < data.lead_days:
            d.fail("Route identity cannot change; lead range must be valid", 422)
        before = d.record(rt)
        for key, value in data.model_dump().items():
            setattr(rt, key, value)
        o.revision += 1
        d.audit(
            s,
            u,
            "route.rules_changed",
            rt.id,
            {"before": before, "after": d.record(rt)},
            [rt.origin_id, rt.destination_id],
        )
        return d.record(rt)

    @app.post("/api/v1/inventory/batches/{batch_id}/issue", tags=["inventory"])
    def issue(batch_id: str, data: v.Issue, key: str = Header(alias="Idempotency-Key"), ctx=Depends(context)):
        s, u, o = ctx
        d.role(u, "operator", "manager")
        b = d.get(s, Batch, batch_id, u)
        d.scope(u, b.location_id)
        d.operating_date(o, data.as_of)

        def work():
            if b.status != "usable" or b.expiry <= data.as_of:
                d.fail("Batch is ineligible")
            d.change(s, u, b, -data.quantity, "customer_issue", data.reason)
            o.revision += 1
            d.audit(s, u, "batch.issued", b.id, data.model_dump(), [b.location_id])
            return d.record(b)

        return d.once(s, u, key, "issue:" + batch_id, data.model_dump(), work)

    @app.post("/api/v1/movements/{movement_id}/reverse", tags=["inventory"])
    def reverse(
        movement_id: str,
        data: v.Explanation,
        key: str = Header(alias="Idempotency-Key"),
        ctx=Depends(context),
    ):
        s, u, o = ctx
        d.role(u, "manager")
        m = d.get(s, Movement, movement_id, u)
        b = d.get(s, Batch, m.batch_id, u)
        d.scope(u, b.location_id)

        def work():
            if m.reason not in ["opening_or_external_receipt", "customer_issue", "count_adjustment"]:
                d.fail("Shipment/return corrections require the linked receipt/return workflow")
            if s.scalar(select(Movement).where(Movement.reverses_id == m.id)):
                d.fail("Movement already reversed")
            d.change(s, u, b, -m.delta, "reversal", data.reason, m.id)
            o.revision += 1
            d.audit(s, u, "movement.reversed", m.id, {"reason": data.reason}, [b.location_id])
            return d.record(b)

        return d.once(s, u, key, "reverse:" + movement_id, data.model_dump(), work)

    @app.get("/api/v1/movements", tags=["inventory"])
    def movements(location_id: str, offset: int = 0, limit: int = 100, ctx=Depends(context)):
        s, u, _ = ctx
        d.scope(u, location_id)
        rows = list(
            s.scalars(
                select(Movement)
                .join(Batch, Movement.batch_id == Batch.id)
                .where(Movement.org_id == u.org_id, Batch.location_id == location_id)
                .order_by(Movement.created_at, Movement.id)
            )
        )
        return page(rows, offset, limit)

    @app.post("/api/v1/requests/{request_id}/cancel", tags=["execution"])
    def request_cancel(
        request_id: str, data: v.Explanation, key: str = Header(alias="Idempotency-Key"), ctx=Depends(context)
    ):
        s, u, o = ctx
        d.role(u, "manager")
        req = d.get(s, StockRequest, request_id, u)
        d.scope(u, req.destination_id)

        def work():
            for plan in s.scalars(
                select(Plan).where(
                    Plan.request_id == req.id, Plan.status.in_(["approved", "partial", "dispatched"])
                )
            ):
                d.fail("Cancel linked plans first; in-transit goods remain committed")
            for ship in s.scalars(
                select(Shipment).join(Plan, Shipment.plan_id == Plan.id).where(Plan.request_id == req.id)
            ):
                if any(
                    x.received < x.quantity
                    for x in s.scalars(select(ShipmentLine).where(ShipmentLine.shipment_id == ship.id))
                ):
                    d.fail("Resolve in-transit quantities before cancelling request")
            req.cancelled = req.quantity - req.fulfilled
            o.revision += 1
            d.audit(s, u, "request.cancelled", req.id, data.model_dump(), [req.destination_id])
            return d.record(req)

        return d.once(s, u, key, "request.cancel:" + request_id, data.model_dump(), work)

    @app.post("/api/v1/plans/{plan_id}/revise", tags=["planning"])
    def plan_revise(
        plan_id: str, data: v.PlanInput, key: str = Header(alias="Idempotency-Key"), ctx=Depends(context)
    ):
        s, u, o = ctx
        d.role(u, "planner", "manager")
        plan = accessible_plan(s, u, plan_id)

        def work():
            if plan.status != "proposed":
                d.fail(
                    "Cancel approved plan and create a new proposal; approval cannot survive a material edit"
                )
            before = d.record(plan)
            ev = d.choose(
                s,
                u,
                o,
                data.source_id,
                data.destination_id,
                data.product_id,
                data.quantity,
                data.as_of,
                data.request_id,
            )
            for field in ["source_id", "destination_id", "product_id", "quantity", "as_of", "request_id"]:
                setattr(plan, field, getattr(data, field))
            plan.version += 1
            plan.input_revision = o.revision
            plan.explanation = ev
            plan.arrival_date = date.fromisoformat(ev["arrival_date"])
            plan.minimum_shelf_days = ev["minimum_shelf_days"]
            d.audit(
                s,
                u,
                "plan.revised",
                plan.id,
                {"before": before, "after": d.record(plan)},
                [plan.source_id, plan.destination_id],
            )
            return d.record(plan)

        return d.once(s, u, key, "plan.revise:" + plan_id, data.model_dump(), work)

    @app.post("/api/v1/locations", tags=["master data"])
    def location_create(data: v.LocationInput, ctx=Depends(context)):
        s, u, o = ctx
        d.role(u)
        obj = Location(org_id=u.org_id, **data.model_dump())
        s.add(obj)
        s.flush()
        o.revision += 1
        d.audit(s, u, "location.created", obj.id, {"name": obj.name}, [obj.id])
        return d.record(obj)

    @app.get("/api/v1/locations", tags=["master data"])
    def locations(offset: int = 0, limit: int = 100, ctx=Depends(context)):
        s, u, _ = ctx
        return page([x for x in items(s, Location, u) if d.allowed(u, x.id)], offset, limit)

    @app.post("/api/v1/routes", tags=["master data"])
    def route_create(data: v.RouteInput, ctx=Depends(context)):
        s, u, o = ctx
        d.role(u, "manager")
        d.scope(u, data.origin_id, data.destination_id)
        d.get(s, Location, data.origin_id, u)
        d.get(s, Location, data.destination_id, u)
        if data.origin_id == data.destination_id or data.lead_days_upper < data.lead_days:
            d.fail("Invalid route/lead-time range", 422)
        obj = Route(org_id=u.org_id, **data.model_dump())
        s.add(obj)
        s.flush()
        o.revision += 1
        d.audit(s, u, "route.created", obj.id, data.model_dump(), [data.origin_id, data.destination_id])
        return d.record(obj)

    @app.get("/api/v1/routes", tags=["master data"])
    def routes(ctx=Depends(context)):
        s, u, _ = ctx
        return {
            "items": [
                d.record(x)
                for x in items(s, Route, u)
                if d.allowed(u, x.origin_id) and d.allowed(u, x.destination_id)
            ]
        }

    @app.post("/api/v1/inventory/batches", tags=["inventory"])
    def batch_create(data: v.BatchInput, key: str = Header(alias="Idempotency-Key"), ctx=Depends(context)):
        s, u, o = ctx
        d.role(u, "steward", "manager")
        d.scope(u, data.location_id)
        d.get(s, Product, data.product_id, u)
        d.get(s, Location, data.location_id, u)

        def work():
            obj = Batch(
                org_id=u.org_id, **data.model_dump(exclude={"quantity", "reason"}), quantity=0, reserved=0
            )
            s.add(obj)
            s.flush()
            d.change(s, u, obj, data.quantity, "opening_or_external_receipt", data.reason)
            o.revision += 1
            d.audit(
                s,
                u,
                "batch.received",
                obj.id,
                {"quantity": data.quantity, "reason": data.reason},
                [data.location_id],
            )
            return d.record(obj)

        return d.once(s, u, key, "batch.create", data.model_dump(), work)

    @app.get("/api/v1/inventory/batches", tags=["inventory"])
    def inventory(
        location_id: str | None = None,
        product_id: str | None = None,
        offset: int = 0,
        limit: int = 100,
        ctx=Depends(context),
    ):
        s, u, _ = ctx
        if location_id:
            d.scope(u, location_id)
        rows = [
            x
            for x in items(s, Batch, u)
            if d.allowed(u, x.location_id)
            and (not location_id or x.location_id == location_id)
            and (not product_id or x.product_id == product_id)
        ]
        return page(rows, offset, limit)

    @app.post("/api/v1/inventory/batches/{batch_id}/status", tags=["inventory"])
    def hold(batch_id: str, data: v.Hold, key: str = Header(alias="Idempotency-Key"), ctx=Depends(context)):
        s, u, o = ctx
        d.role(u, "steward", "manager")
        b = d.get(s, Batch, batch_id, u)
        d.scope(u, b.location_id)

        def work():
            old = b.status
            b.status = data.status
            o.revision += 1
            if old == "return_pending" and data.status != "return_pending":
                for case in s.scalars(
                    select(Case).where(
                        Case.org_id == u.org_id,
                        Case.reference == b.id,
                        Case.kind == "return_disposition",
                        Case.status == "open",
                    )
                ):
                    case.status = "resolved"
            d.audit(
                s,
                u,
                "batch.status",
                b.id,
                {"old": old, "status": data.status, "reason": data.reason},
                [b.location_id],
            )
            return d.record(b)

        return d.once(s, u, key, "batch.status:" + batch_id, data.model_dump(), work)

    @app.post("/api/v1/inventory/batches/{batch_id}/count", tags=["inventory"])
    def count(batch_id: str, data: v.Count, key: str = Header(alias="Idempotency-Key"), ctx=Depends(context)):
        s, u, _ = ctx
        d.role(u, "operator", "steward", "manager")
        b = d.get(s, Batch, batch_id, u)
        d.scope(u, b.location_id)

        def work():
            if data.expected_updated_at is not None and (
                d.utc_datetime(data.expected_updated_at) != d.utc_datetime(b.updated_at)
            ):
                d.fail("Stock changed since the mobile count snapshot; refresh and recount required")
            case = Case(
                org_id=u.org_id,
                location_id=b.location_id,
                kind="count_difference",
                reference=b.id,
                details={
                    "observed": data.quantity,
                    "recorded": b.quantity,
                    "reason": data.reason,
                    "recorded_updated_at": b.updated_at.isoformat(),
                },
            )
            s.add(case)
            s.flush()
            d.audit(s, u, "count.recorded", case.id, case.details, [b.location_id])
            return d.record(case)

        # Omit the new optional snapshot when absent so pre-mobile idempotency
        # records keep the same digest after deploying this compatible extension.
        return d.once(s, u, key, "count:" + batch_id, data.model_dump(exclude_none=True), work)

    @app.post("/api/v1/inventory/adjustments", tags=["inventory"])
    def adjust(data: v.Adjustment, key: str = Header(alias="Idempotency-Key"), ctx=Depends(context)):
        s, u, o = ctx
        d.role(u, "manager")
        case = d.get(s, Case, data.case_id, u)
        d.scope(u, case.location_id)

        def work():
            if case.kind != "count_difference" or case.status != "open":
                d.fail("Count case is not open")
            b = d.get(s, Batch, case.reference, u)
            if b.quantity != case.details["recorded"] or (
                case.details.get("recorded_updated_at") is not None
                and b.updated_at.isoformat() != case.details["recorded_updated_at"]
            ):
                d.fail("Stock changed since count; recount required")
            d.change(s, u, b, case.details["observed"] - b.quantity, "count_adjustment", case.id)
            case.status = "resolved"
            o.revision += 1
            d.audit(s, u, "count.adjusted", case.id, {"reason": data.reason}, [b.location_id])
            return d.record(b)

        return d.once(s, u, key, "adjust", data.model_dump(), work)

    @app.get("/api/v1/inventory/reconciliation", tags=["inventory"])
    def reconciliation(ctx=Depends(context)):
        s, u, _ = ctx
        return d.reconcile(s, u)

    @app.post("/api/v1/requests", tags=["execution"])
    def request_create(
        data: v.RequestInput, key: str = Header(alias="Idempotency-Key"), ctx=Depends(context)
    ):
        s, u, o = ctx
        d.role(u, "operator", "planner", "manager")
        d.scope(u, data.destination_id)
        d.get(s, Location, data.destination_id, u)
        d.get(s, Product, data.product_id, u)

        def work():
            obj = StockRequest(org_id=u.org_id, **data.model_dump())
            s.add(obj)
            s.flush()
            o.revision += 1
            d.audit(s, u, "request.created", obj.id, data.model_dump(), [obj.destination_id])
            return d.record(obj)

        return d.once(s, u, key, "request.create", data.model_dump(), work)

    @app.get("/api/v1/requests", tags=["execution"])
    def requests(offset: int = 0, limit: int = 100, ctx=Depends(context)):
        s, u, _ = ctx
        return page([x for x in items(s, StockRequest, u) if d.allowed(u, x.destination_id)], offset, limit)

    @app.post("/api/v1/plans", tags=["planning"])
    def plan_create(data: v.PlanInput, key: str = Header(alias="Idempotency-Key"), ctx=Depends(context)):
        s, u, o = ctx
        d.role(u, "planner", "manager")
        return d.once(s, u, key, "plan.create", data.model_dump(), lambda: d.propose(s, u, o, data))

    @app.get("/api/v1/plans", tags=["planning"])
    def plans(offset: int = 0, limit: int = 100, ctx=Depends(context)):
        s, u, _ = ctx
        return page(
            [x for x in items(s, Plan, u) if d.allowed(u, x.source_id) or d.allowed(u, x.destination_id)],
            offset,
            limit,
        )

    @app.get("/api/v1/plans/{plan_id}", tags=["planning"])
    def plan_get(plan_id: str, ctx=Depends(context)):
        s, u, _ = ctx
        return d.record(accessible_plan(s, u, plan_id))

    @app.post("/api/v1/plans/{plan_id}/approve", tags=["execution"])
    def plan_approve(
        plan_id: str, data: v.Approval, key: str = Header(alias="Idempotency-Key"), ctx=Depends(context)
    ):
        s, u, o = ctx
        plan = accessible_plan(s, u, plan_id)
        return d.once(
            s,
            u,
            key,
            "plan.approve:" + plan_id,
            data.model_dump(),
            lambda: d.approve(s, u, o, plan, data.version, data.as_of),
        )

    @app.post("/api/v1/plans/{plan_id}/cancel", tags=["execution"])
    def plan_cancel(
        plan_id: str, data: v.Explanation, key: str = Header(alias="Idempotency-Key"), ctx=Depends(context)
    ):
        s, u, o = ctx
        plan = accessible_plan(s, u, plan_id)
        return d.once(
            s,
            u,
            key,
            "plan.cancel:" + plan_id,
            data.model_dump(),
            lambda: d.cancel(s, u, o, plan, data.reason),
        )

    @app.post("/api/v1/plans/{plan_id}/dispatch", tags=["execution"])
    def plan_dispatch(
        plan_id: str, data: v.Dispatch, key: str = Header(alias="Idempotency-Key"), ctx=Depends(context)
    ):
        s, u, o = ctx
        plan = accessible_plan(s, u, plan_id)
        return d.once(
            s,
            u,
            key,
            "plan.dispatch:" + plan_id,
            data.model_dump(),
            lambda: d.dispatch(s, u, o, plan, data.quantity, data.as_of),
        )

    @app.get("/api/v1/shipments", tags=["execution"])
    def shipments(offset: int = 0, limit: int = 100, ctx=Depends(context)):
        s, u, _ = ctx
        rows = []
        for x in items(s, Shipment, u):
            p = d.get(s, Plan, x.plan_id, u)
            if d.allowed(u, p.source_id) or d.allowed(u, p.destination_id):
                rows.append(
                    {
                        **d.record(x),
                        "source_id": p.source_id,
                        "destination_id": p.destination_id,
                        "lines": [
                            {**d.record(line), "batch_code": code, "expiry": expiry}
                            for line, code, expiry in s.execute(
                                select(ShipmentLine, Batch.code, Batch.expiry)
                                .join(Batch, ShipmentLine.source_batch_id == Batch.id)
                                .where(ShipmentLine.shipment_id == x.id, Batch.org_id == u.org_id)
                            )
                        ],
                    }
                )
        return page(rows, offset, limit)

    @app.post("/api/v1/shipments/{shipment_id}/receipts", tags=["execution"])
    def receipt(
        shipment_id: str, data: v.Receipt, key: str = Header(alias="Idempotency-Key"), ctx=Depends(context)
    ):
        s, u, o = ctx
        ship = d.get(s, Shipment, shipment_id, u)
        return d.once(
            s,
            u,
            key,
            "receipt:" + shipment_id,
            data.model_dump(),
            lambda: d.receive(s, u, o, ship, data.lines, data.as_of),
        )

    @app.post("/api/v1/returns", tags=["execution"])
    def returned(data: v.Return, key: str = Header(alias="Idempotency-Key"), ctx=Depends(context)):
        s, u, o = ctx
        d.role(u, "manager")
        line = d.get(s, ShipmentLine, data.line_id, u)
        ship = d.get(s, Shipment, line.shipment_id, u)
        plan = d.get(s, Plan, ship.plan_id, u)
        d.scope(u, plan.source_id, plan.destination_id)
        b = d.get(s, Batch, data.batch_id, u)
        original = d.get(s, Batch, line.source_batch_id, u)

        def work():
            if (
                b.location_id != plan.destination_id
                or b.product_id != plan.product_id
                or b.code != original.code
                or b.expiry != original.expiry
            ):
                d.fail("Return batch does not match received shipment")
            if data.quantity > line.accepted - line.returned:
                d.fail("Return exceeds accepted quantity")
            d.change(s, u, b, -data.quantity, "return_dispatch", ship.id)
            pending = Batch(
                org_id=u.org_id,
                product_id=b.product_id,
                location_id=plan.source_id,
                code=b.code,
                expiry=b.expiry,
                status="return_pending",
                quantity=0,
                reserved=0,
            )
            s.add(pending)
            s.flush()
            d.change(s, u, pending, data.quantity, "return_receipt", ship.id)
            line.returned += data.quantity
            o.revision += 1
            case = Case(
                org_id=u.org_id,
                location_id=plan.source_id,
                kind="return_disposition",
                reference=pending.id,
                details={"reason": data.reason, "line_id": line.id},
            )
            s.add(case)
            s.flush()
            d.audit(
                s,
                u,
                "return.received_for_review",
                case.id,
                data.model_dump(),
                [plan.source_id, plan.destination_id],
            )
            return {
                "batch": d.record(pending),
                "case": d.record(case),
                "note": "Supervised confirmed return receipt; transport events are not inferred",
            }

        return d.once(s, u, key, "return", data.model_dump(), work)

    @app.get("/api/v1/cases", tags=["collaboration"])
    def cases(offset: int = 0, limit: int = 100, ctx=Depends(context)):
        s, u, _ = ctx
        return page([x for x in items(s, Case, u) if d.allowed(u, x.location_id)], offset, limit)

    @app.patch("/api/v1/cases/{case_id}", tags=["collaboration"])
    def case_update(case_id: str, data: v.CaseUpdate, ctx=Depends(context)):
        s, u, _ = ctx
        d.role(u, "operator", "manager", "steward", "planner")
        case = d.get(s, Case, case_id, u)
        d.scope(u, case.location_id)
        if "owner_id" in data.model_fields_set:
            if data.owner_id is not None:
                owner = d.get(s, User, data.owner_id, u)
                if not owner.active or not d.allowed(owner, case.location_id):
                    d.fail("Owner cannot access this case", 422)
            case.owner_id = data.owner_id
        if data.resolve:
            d.role(u, "manager", "steward")
            if case.kind in ["count_difference", "return_disposition"]:
                d.fail("Use the stock adjustment/disposition action to resolve this case")
            case.status = "resolved"
        if "due_on" in data.model_fields_set:
            case.due_on = data.due_on
        case.comments = [*case.comments, {"actor_id": u.id, "text": data.comment}]
        d.audit(s, u, "case.updated", case.id, data.model_dump(), [case.location_id])
        return d.record(case)

    @app.get("/api/v1/audit", tags=["evidence"])
    def audits(offset: int = 0, limit: int = 100, ctx=Depends(context)):
        s, u, _ = ctx
        d.role(u, "manager", "steward")
        return page(
            [
                x
                for x in items(s, Audit, u)
                if u.role == "admin"
                or (x.location_ids and all(d.allowed(u, location) for location in x.location_ids))
            ],
            offset,
            limit,
        )

    @app.post("/api/v1/policies", tags=["assistant"])
    def policy_create(data: v.PolicyInput, ctx=Depends(context)):
        s, u, _ = ctx
        d.role(u, "steward", "manager")
        for loc in data.location_ids:
            d.get(s, Location, loc, u)
            d.scope(u, loc)
        if not data.location_ids and u.role != "admin":
            d.fail("Only admin can publish organisation-wide policies", 403)
        p = Policy(org_id=u.org_id, **data.model_dump())
        s.add(p)
        s.flush()
        return d.record(p)

    @app.post("/api/v1/policies/{policy_id}/approve", tags=["assistant"])
    def policy_approve(policy_id: str, ctx=Depends(context)):
        s, u, o = ctx
        d.role(u, "manager")
        p = d.get(s, Policy, policy_id, u)
        if p.location_ids:
            d.scope(u, *p.location_ids)
        elif u.role != "admin":
            d.fail("Only admin can approve organisation-wide policies", 403)
        p.approved = True
        o.revision += 1
        d.audit(s, u, "policy.approved", p.id, {"version": p.version}, p.location_ids)
        return d.record(p)

    @app.post("/api/v1/assistant", tags=["assistant"])
    def assistant(data: v.Question, ctx=Depends(context)):
        s, u, _ = ctx
        if data.mode == "operations":
            if not data.reference_id:
                return {
                    "answer": "Provide a plan ID for a grounded operational explanation.",
                    "citations": [],
                }
            plan = accessible_plan(s, u, data.reference_id)
            return {
                "answer": "Recorded plan evidence; no actions were executed.",
                "facts": {
                    "plan_id": plan.id,
                    "status": plan.status,
                    "quantity": plan.quantity,
                    "as_of": str(plan.as_of),
                    "explanation": plan.explanation,
                },
                "citations": [
                    {
                        "type": "plan",
                        "id": plan.id,
                        "version": plan.version,
                        "url": "/api/v1/plans/" + plan.id,
                    }
                ],
            }
        terms = set(data.question.lower().split())
        matches = []
        for p in items(s, Policy, u):
            if (
                not p.approved
                or p.effective_on > data.as_of
                or (
                    u.role != "admin"
                    and p.location_ids
                    and not all(d.allowed(u, location) for location in p.location_ids)
                )
            ):
                continue
            for number, passage in enumerate(p.text.splitlines(), 1):
                score = len(terms & set(passage.lower().split()))
                if score:
                    matches.append((score, p, number, passage))
        matches = sorted(matches, key=lambda x: x[0], reverse=True)[:3]
        return {
            "answer": "Approved policy excerpts"
            if matches
            else "No approved, accessible policy passage supports this question.",
            "citations": [
                {
                    "type": "policy",
                    "id": p.id,
                    "title": p.title,
                    "version": p.version,
                    "effective_on": str(p.effective_on),
                    "passage": n,
                    "quote": passage,
                }
                for _, p, n, passage in matches
            ],
            "method": "Deterministic extractive retrieval; policy text is data, never executable instructions",
        }

    def queue_job(kind, data, ctx, key):
        s, u, _ = ctx
        d.role(u, "planner", "manager")
        d.scope(u, data.location_id)
        d.get(s, Product, data.product_id, u)
        d.get(s, Location, data.location_id, u)

        def work():
            j = Job(org_id=u.org_id, actor_id=u.id, kind=kind, payload=jsonable_encoder(data))
            s.add(j)
            s.flush()
            return d.record(j)

        return d.once(s, u, key, "job:" + kind, data.model_dump(), work)

    @app.post("/api/v1/jobs/forecast", status_code=202, tags=["forecasting"])
    def forecast_job(data: v.ForecastJob, key: str = Header(alias="Idempotency-Key"), ctx=Depends(context)):
        return queue_job("forecast", data, ctx, key)

    @app.post("/api/v1/jobs/simulation", status_code=202, tags=["evidence"])
    def simulation_job(
        data: v.SimulationJob, key: str = Header(alias="Idempotency-Key"), ctx=Depends(context)
    ):
        return queue_job("simulation", data, ctx, key)

    @app.get("/api/v1/jobs", tags=["jobs"])
    def jobs(offset: int = 0, limit: int = 100, ctx=Depends(context)):
        s, u, _ = ctx
        return page([x for x in items(s, Job, u) if d.allowed(u, x.payload["location_id"])], offset, limit)

    @app.get("/api/v1/jobs/{job_id}", tags=["jobs"])
    def job_get(job_id: str, ctx=Depends(context)):
        s, u, _ = ctx
        j = d.get(s, Job, job_id, u)
        d.scope(u, j.payload["location_id"])
        return d.record(j)

    @app.post("/api/v1/jobs/{job_id}/cancel", tags=["jobs"])
    def job_cancel(job_id: str, ctx=Depends(context)):
        s, u, _ = ctx
        d.role(u, "planner", "manager")
        j = s.scalar(select(Job).where(Job.id == job_id, Job.org_id == u.org_id).with_for_update())
        if j is None:
            d.fail("Record not found", 404)
        d.scope(u, j.payload["location_id"])
        if j.status not in ["queued", "running"]:
            d.fail("Job already finished")
        j.status = "cancelled"
        return d.record(j)

    @app.post("/api/v1/imports/demand", tags=["data"])
    def demand_import(
        file: UploadFile = File(), metadata: str = Form(), dry_run: bool = Form(True), ctx=Depends(context)
    ):
        from .imports import import_demand

        s, u, o = ctx
        d.role(u, "steward", "manager")
        raw = file.file.read(5_000_001)
        if len(raw) > 5_000_000:
            d.fail("Maximum upload size 5 MB", 413)
        return import_demand(s, u, o, raw, file.filename or "", metadata, dry_run)

    @app.get("/api/v1/datasets", tags=["data"])
    def datasets(offset: int = 0, limit: int = 200, ctx=Depends(context)):
        s, u, _ = ctx
        d.role(u, "steward", "manager")
        return page(items(s, Dataset, u), offset, limit)

    @app.get("/api/v1/demand", tags=["data"])
    def demand(location_id: str, product_id: str, offset: int = 0, limit: int = 100, ctx=Depends(context)):
        s, u, _ = ctx
        d.scope(u, location_id)
        rows = list(
            s.scalars(
                select(Demand)
                .where(
                    Demand.org_id == u.org_id,
                    Demand.location_id == location_id,
                    Demand.product_id == product_id,
                )
                .order_by(Demand.date)
            )
        )
        return page(rows, offset, limit)

    @app.get("/api/v1/network", tags=["map and planning"])
    def network(product_id: str, as_of: date, horizon: int = 21, ctx=Depends(context)):
        from .planning import network_view

        s, u, o = ctx
        if horizon < 1 or horizon > 90:
            d.fail("Horizon must be between 1 and 90 days", 422)
        d.get(s, Product, product_id, u)
        return network_view(s, u, o, product_id, as_of, horizon)

    @app.get("/api/v1/planning/expiry-rescue", tags=["map and planning"])
    def expiry_rescue(as_of: date, within_days: int = 60, ctx=Depends(context)):
        s, u, o = ctx
        d.role(u, "planner", "manager")
        d.operating_date(o, as_of)
        if not 1 <= within_days <= 365:
            d.fail("within_days must be 1..365", 422)
        result = []
        for b in items(s, Batch, u):
            if (
                not d.allowed(u, b.location_id)
                or b.status != "usable"
                or not (as_of < b.expiry <= as_of + timedelta(days=within_days))
                or b.quantity <= b.reserved
            ):
                continue
            p = d.get(s, Product, b.product_id, u)
            for loc in items(s, Location, u):
                if not d.allowed(u, loc.id) or loc.id == b.location_id or loc.kind == "warehouse":
                    continue
                rt = s.scalar(
                    select(Route).where(
                        Route.org_id == u.org_id,
                        Route.origin_id == b.location_id,
                        Route.destination_id == loc.id,
                    )
                )
                if not rt or not rt.permitted:
                    continue
                daily, _, _ = d.rate(s, u, p.id, loc.id, as_of)
                recipient = d.position(s, u, loc.id, p.id, as_of)
                if not recipient["known"]:
                    continue
                window = (b.expiry - as_of).days - rt.lead_days_upper - rt.min_shelf_days
                qty = int(
                    min(
                        b.quantity - b.reserved,
                        max(0, max(0, window) * (daily or 0) - recipient["available"]),
                    )
                    // p.pack_size
                    * p.pack_size
                )
                if qty <= 0:
                    continue
                try:
                    ev = d.choose(s, u, o, b.location_id, loc.id, p.id, qty, as_of)
                    if not any(x["batch_id"] == b.id for x in ev["allocations"]):
                        continue
                    result.append(
                        {
                            "source_batch_id": b.id,
                            "expiry": str(b.expiry),
                            "source_id": b.location_id,
                            "destination_id": loc.id,
                            "product_id": p.id,
                            "quantity": qty,
                            "evidence": ev,
                        }
                    )
                except HTTPException:
                    continue
        return {
            "candidates": sorted(result, key=lambda x: x["expiry"]),
            "note": "Draft alternatives share stock; only a fresh approved plan reserves units. Recipient demand and donor protection are checked.",
            "evidence_type": o.mode,
        }

    @app.get("/api/v1/planning/allocate", tags=["map and planning"])
    def allocate(source_id: str, product_id: str, as_of: date, ctx=Depends(context)):
        s, u, o = ctx
        d.role(u, "planner", "manager")
        d.operating_date(o, as_of)
        d.scope(u, source_id)
        product = d.get(s, Product, product_id, u)
        d.get(s, Location, source_id, u)
        requests = list(
            s.scalars(
                select(StockRequest)
                .where(StockRequest.org_id == u.org_id, StockRequest.product_id == product_id)
                .order_by(StockRequest.needed_by, StockRequest.created_at, StockRequest.id)
            )
        )
        used = 0
        result = []
        virtual_reserved = {}
        for req in requests:
            if not d.allowed(u, req.destination_id) or req.destination_id == source_id:
                continue
            unmet = req.quantity - req.fulfilled - req.cancelled
            if unmet <= 0:
                continue
            available = (
                sum(b.quantity - b.reserved for b in d.batches(s, u, source_id, product_id, as_of)) - used
            )
            qty = max(0, int(min(unmet, available) // product.pack_size * product.pack_size))
            if qty <= 0:
                result.append(
                    {
                        "request_id": req.id,
                        "quantity": 0,
                        "remaining": unmet,
                        "reason": "No remaining complete pack",
                    }
                )
                continue
            try:
                ev = d.choose(
                    s, u, o, source_id, req.destination_id, product_id, qty, as_of, req.id, virtual_reserved
                )
                used += qty
                for allocation in ev["allocations"]:
                    bid = allocation["batch_id"]
                    virtual_reserved[bid] = virtual_reserved.get(bid, 0) + allocation["quantity"]
                result.append(
                    {
                        "request_id": req.id,
                        "destination_id": req.destination_id,
                        "quantity": qty,
                        "remaining": unmet - qty,
                        "evidence": ev,
                    }
                )
            except HTTPException as exc:
                result.append({"request_id": req.id, "quantity": 0, "remaining": unmet, "reason": exc.detail})
        return {
            "allocations": result,
            "rule": "Earliest required date, then request time; business scheduling only, no clinical priority inferred",
            "proposed_total": used,
            "inventory_revision": o.revision,
            "note": "Draft allocations share one finite stock budget; approvals revalidate and reserve physical batches",
        }

    @app.get("/api/v1/scan/{code}", tags=["mobile"])
    def scan(code: str, ctx=Depends(context)):
        s, u, _ = ctx
        if code.startswith("GRD:SHIPMENT:"):
            from .operations import shipment_document
            return shipment_document(s, u, code.removeprefix("GRD:SHIPMENT:"))
        # Internal labels only. Never infer batch/expiry from an ordinary product barcode.
        identifier = code.removeprefix("GRD:BATCH:")
        b = d.get(s, Batch, identifier, u)
        d.scope(u, b.location_id)
        return {
            "batch": d.record(b),
            "product": d.record(d.get(s, Product, b.product_id, u)),
            "source": "verified internal batch ID",
            "manual_entry_supported": True,
        }

    @app.post("/api/v1/inventory/batches/{batch_id}/writeoff", tags=["inventory"])
    def writeoff(
        batch_id: str, data: v.Issue, key: str = Header(alias="Idempotency-Key"), ctx=Depends(context)
    ):
        s, u, o = ctx
        d.role(u, "manager")
        b = d.get(s, Batch, batch_id, u)
        d.scope(u, b.location_id)
        d.operating_date(o, data.as_of)

        def work():
            if b.expiry > data.as_of:
                d.fail("Batch has not expired")
            d.change(s, u, b, -data.quantity, "expiry_writeoff", data.reason)
            o.revision += 1
            d.audit(s, u, "batch.written_off", b.id, data.model_dump(), [b.location_id])
            return d.record(b)

        return d.once(s, u, key, "writeoff:" + batch_id, data.model_dump(), work)

    @app.get("/api/v1/planning/options", tags=["map and planning"])
    def options(product_id: str, destination_id: str, quantity: int, as_of: date, ctx=Depends(context)):
        s, u, o = ctx
        d.operating_date(o, as_of)
        d.scope(u, destination_id)
        if quantity <= 0:
            d.fail("Quantity must be positive", 422)
        result = []
        for loc in items(s, Location, u):
            if loc.id == destination_id or not d.allowed(u, loc.id):
                continue
            try:
                evidence = d.choose(s, u, o, loc.id, destination_id, product_id, quantity, as_of)
                result.append({"source_id": loc.id, "feasible": True, "evidence": evidence})
            except HTTPException as exc:
                result.append({"source_id": loc.id, "feasible": False, "reason": exc.detail})
        return {
            "options": result,
            "no_action": {"quantity": 0, "note": "Inspect projected shortage/expiry risk in /network"},
            "evidence_type": o.mode,
        }

    @app.get("/api/v1/mobile/sync", tags=["mobile"])
    def sync(offset: int = 0, limit: int = 100, ctx=Depends(context)):
        s, u, o = ctx
        # Stable audit pages, scoped at the server; clients also refetch current stock.
        rows = [
            x
            for x in items(s, Audit, u)
            if x.location_ids and all(d.allowed(u, location) for location in x.location_ids)
        ]
        return {
            **page(rows, offset, limit),
            "inventory_revision": o.revision,
            "server_time": __import__("datetime")
            .datetime.now(__import__("datetime").timezone.utc)
            .isoformat(),
            "offline_rule": "Commands remain provisional until accepted; replay their persisted Idempotency-Key; HTTP409 requires reconciliation",
        }

    from .operations_api import install_operations
    install_operations(app, context)

    from .web import mount_workspace

    mount_workspace(app)
    return app
