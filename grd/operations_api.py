"""Authenticated routes for the operations upgrade. No external actions are implied."""

from datetime import date

from fastapi import Depends, Header, Query
from sqlalchemy import select

from . import domain as d, operation_schemas as v, operations as op
from .models import Availability, Job, Location, Workflow
from .scenarios import alternatives, freeze, project


def install_operations(app, context):
    @app.get("/api/v1/team", tags=["collaboration"])
    def team(location_id: str, ctx=Depends(context)):
        s, u, _ = ctx
        from .models import User

        d.scope(u, location_id)
        return {
            "items": [
                {"id": person.id, "email": person.email, "role": person.role}
                for person in s.scalars(select(User).where(User.org_id == u.org_id, User.active.is_(True)))
                if d.allowed(person, location_id) and person.role != "viewer"
            ]
        }

    @app.get("/api/v1/operations/{kind}", tags=["operations"])
    def list_workflows(kind: str, ctx=Depends(context)):
        s, u, _ = ctx
        return {"items": [d.record(w) for w in op.rows(s, u, kind)]}

    @app.get("/api/v1/operations/record/{identifier}", tags=["operations"])
    def workflow(identifier: str, ctx=Depends(context)):
        s, u, _ = ctx
        return d.record(op.get(s, u, identifier))

    @app.get("/api/v1/inventory/stock-card", tags=["evidence"])
    def card(product_id: str, location_id: str, as_of: date, ctx=Depends(context)):
        s, u, o = ctx
        return op.stock_card(s, u, o, product_id, location_id, as_of)

    @app.post("/api/v1/planning/comparisons", tags=["planning"])
    def comparison(data: v.Compare, key: str = Header(alias="Idempotency-Key"), ctx=Depends(context)):
        s, u, o = ctx
        d.role(u, "planner", "manager")
        d.operating_date(o, data.as_of)

        def work():
            from .planning import network_view

            network = network_view(s, u, o, data.product_id, data.as_of, data.horizon)
            snapshot = freeze(s, u, o, data.product_id, data.as_of, data.horizon, network)
            variants, exclusions = alternatives(
                s, u, o, data.product_id, data.destination_id, data.quantity, data.as_of
            )
            for variant in variants:
                variant["projection"] = project(snapshot, variant["legs"])
            return d.record(
                op.create(
                    s,
                    u,
                    "comparison",
                    [r["location_id"] for r in snapshot["locations"]],
                    {
                        **data.model_dump(),
                        "snapshot": snapshot,
                        "alternatives": variants,
                        "exclusions": exclusions,
                    },
                )
            )

        return d.once(s, u, key, "comparison", data.model_dump(), work)

    @app.post("/api/v1/planning/comparisons/{identifier}/approve", tags=["planning"])
    def approve_comparison(
        identifier: str, data: v.Choice, key: str = Header(alias="Idempotency-Key"), ctx=Depends(context)
    ):
        s, u, o = ctx
        return d.once(
            s,
            u,
            key,
            "comparison.approve:" + identifier,
            data.model_dump(),
            lambda: op.approve_alternative(s, u, o, op.get(s, u, identifier, "comparison"), data),
        )

    @app.post("/api/v1/planning/comparisons/{identifier}/scenarios", tags=["planning"])
    def scenario(
        identifier: str, data: v.Shock, key: str = Header(alias="Idempotency-Key"), ctx=Depends(context)
    ):
        s, u, _ = ctx
        d.role(u, "planner", "manager")

        def work():
            base = op.get(s, u, identifier, "comparison")
            if not set(data.location_ids) <= set(base.location_ids):
                d.fail("Scenario effects must be inside the frozen network", 422)
            shock = data.model_dump()
            variants = [
                {
                    "name": variant["name"],
                    "legs": variant["legs"],
                    "projection": project(base.payload["snapshot"], variant["legs"], shock),
                }
                for variant in base.payload["alternatives"]
            ]
            return d.record(
                op.create(
                    s,
                    u,
                    "scenario",
                    base.location_ids,
                    {
                        "name": data.name,
                        "base_id": base.id,
                        "base_version": base.version,
                        "snapshot_digest": base.payload["snapshot"]["digest"],
                        "shock": shock,
                        "product_id": base.payload["product_id"],
                        "as_of": base.payload["as_of"],
                        "alternatives": variants,
                    },
                    "saved",
                )
            )

        return d.once(s, u, key, "scenario:" + identifier, data.model_dump(), work)

    @app.get("/api/v1/plans/{identifier}/documents", tags=["execution"])
    def documents(identifier: str, ctx=Depends(context)):
        s, u, _ = ctx
        return op.picking_document(s, u, identifier)

    @app.get("/api/v1/shipments/{identifier}/document", tags=["execution"])
    def delivery_note(identifier: str, ctx=Depends(context)):
        s, u, _ = ctx
        return op.shipment_document(s, u, identifier)

    @app.post("/api/v1/shipments/{identifier}/proof", tags=["execution"])
    def proof(
        identifier: str, data: v.Delivery, key: str = Header(alias="Idempotency-Key"), ctx=Depends(context)
    ):
        s, u, o = ctx
        return d.once(
            s,
            u,
            key,
            "delivery.proof:" + identifier,
            data.model_dump(),
            lambda: op.delivery(s, u, o, identifier, data),
        )

    @app.get("/api/v1/suppliers/suggestion", tags=["supplier orders"])
    def suggestion(
        product_id: str,
        location_id: str,
        as_of: date,
        lead_days: int = Query(7, ge=1, le=90),
        coverage_days: int = Query(28, ge=1, le=180),
        ctx=Depends(context),
    ):
        s, u, o = ctx
        return op.replenishment(s, u, o, product_id, location_id, as_of, lead_days, coverage_days)

    @app.post("/api/v1/suppliers/orders", tags=["supplier orders"])
    def order(data: v.SupplierOrder, key: str = Header(alias="Idempotency-Key"), ctx=Depends(context)):
        s, u, o = ctx
        return d.once(s, u, key, "supplier.order", data.model_dump(), lambda: op.new_order(s, u, o, data))

    @app.post("/api/v1/suppliers/orders/{identifier}/events", tags=["supplier orders"])
    def order_transition(
        identifier: str, data: v.OrderEvent, key: str = Header(alias="Idempotency-Key"), ctx=Depends(context)
    ):
        s, u, o = ctx
        return d.once(
            s,
            u,
            key,
            "supplier.event:" + identifier,
            data.model_dump(),
            lambda: op.order_event(s, u, o, op.get(s, u, identifier, "supplier_order"), data),
        )

    @app.post("/api/v1/suppliers/orders/{identifier}/receipts", tags=["supplier orders"])
    def supplier_receipt(
        identifier: str,
        data: v.SupplierReceipt,
        key: str = Header(alias="Idempotency-Key"),
        ctx=Depends(context),
    ):
        s, u, o = ctx
        return d.once(
            s,
            u,
            key,
            "supplier.receipt:" + identifier,
            data.model_dump(),
            lambda: op.supplier_receipt(s, u, o, op.get(s, u, identifier, "supplier_order"), data),
        )

    @app.post("/api/v1/count-sessions", tags=["inventory"])
    def count_session(data: v.CountSession, key: str = Header(alias="Idempotency-Key"), ctx=Depends(context)):
        s, u, _ = ctx
        return d.once(s, u, key, "count.session", data.model_dump(), lambda: op.new_count(s, u, data))

    @app.post("/api/v1/count-sessions/{identifier}/events", tags=["inventory"])
    def count_transition(
        identifier: str, data: v.CountEvent, key: str = Header(alias="Idempotency-Key"), ctx=Depends(context)
    ):
        s, u, o = ctx
        return d.once(
            s,
            u,
            key,
            "count.event:" + identifier,
            data.model_dump(),
            lambda: op.count_event(s, u, o, op.get(s, u, identifier, "count_session"), data),
        )

    @app.post("/api/v1/data/availability", tags=["demand quality"])
    def availability(
        data: v.AvailabilityInput, key: str = Header(alias="Idempotency-Key"), ctx=Depends(context)
    ):
        s, u, _ = ctx
        d.role(u, "steward", "manager")
        d.scope(u, data.location_id)
        from .models import Product

        d.get(s, Product, data.product_id, u)
        d.get(s, Location, data.location_id, u)

        def work():
            if len({x.date for x in data.days}) != len(data.days):
                d.fail("Duplicate availability dates", 422)
            for day in data.days:
                existing = s.scalar(
                    select(Availability).where(
                        Availability.org_id == u.org_id,
                        Availability.product_id == data.product_id,
                        Availability.location_id == data.location_id,
                        Availability.date == day.date,
                    )
                )
                if existing:
                    d.fail(
                        "Availability evidence already exists; corrections require a reviewed source import"
                    )
                s.add(
                    Availability(
                        org_id=u.org_id,
                        product_id=data.product_id,
                        location_id=data.location_id,
                        source=data.source,
                        **day.model_dump(),
                    )
                )
            d.audit(s, u, "availability.recorded", data.location_id, data.model_dump(), [data.location_id])
            return {"recorded_days": len(data.days), "source": data.source}

        return d.once(s, u, key, "availability", data.model_dump(), work)

    @app.get("/api/v1/data/demand-quality", tags=["demand quality"])
    def quality(product_id: str, location_id: str, start: date, end: date, ctx=Depends(context)):
        s, u, _ = ctx
        return op.demand_quality(s, u, product_id, location_id, start, end)

    @app.post("/api/v1/inbox/refresh", tags=["collaboration"])
    def inbox_refresh(data: v.Version, key: str = Header(alias="Idempotency-Key"), ctx=Depends(context)):
        s, u, o = ctx
        return d.once(
            s,
            u,
            key,
            "inbox.refresh",
            data.model_dump(),
            lambda: {"items": op.refresh_inbox(s, u, o, data.as_of)},
        )

    @app.post("/api/v1/inbox/{identifier}/events", tags=["collaboration"])
    def inbox_transition(
        identifier: str, data: v.InboxEvent, key: str = Header(alias="Idempotency-Key"), ctx=Depends(context)
    ):
        s, u, _ = ctx
        return d.once(
            s,
            u,
            key,
            "inbox.event:" + identifier,
            data.model_dump(),
            lambda: op.inbox_event(s, u, op.get(s, u, identifier, "exception"), data),
        )

    @app.post("/api/v1/inbox/sync-failures", tags=["mobile"])
    def sync_failure(data: v.SyncFailure, key: str = Header(alias="Idempotency-Key"), ctx=Depends(context)):
        s, u, _ = ctx
        d.role(u, "operator", "planner", "steward", "manager")

        def work():
            identity = "sync:" + u.id + ":" + data.command_id
            existing = s.scalar(
                select(Workflow).where(
                    Workflow.org_id == u.org_id, Workflow.kind == "exception", Workflow.identity == identity
                )
            )
            if existing:
                d.scope(u, *existing.location_ids)
                return d.record(existing)
            return d.record(
                op.create(
                    s,
                    u,
                    "exception",
                    [data.location_id],
                    {
                        "title": "Device command needs reconciliation",
                        "kind": "failed_sync",
                        "reference": data.command_id,
                        "active": True,
                        "owner_id": u.id,
                        "due_on": None,
                        "comments": [{"actor_id": u.id, "text": data.reason}],
                    },
                    "open",
                    identity,
                )
            )

        return d.once(s, u, key, "sync.failure", data.model_dump(), work)

    @app.get("/api/v1/notifications/capabilities", tags=["mobile"])
    def notification_capabilities(ctx=Depends(context)):
        return {
            "in_app_inbox": True,
            "push_delivery": False,
            "supplier_adapter": "manual_recorded_confirmation",
            "reason": "Android FCM / Expo push credentials and supplier credentials are not configured. No external event is simulated as delivered.",
            "scheduler": "Inbox refresh on demand; Free hosting sleeps, continuous background escalation is not guaranteed.",
        }

    @app.post("/api/v1/return-transfers", tags=["execution"])
    def start_return(data: v.ReturnStart, key: str = Header(alias="Idempotency-Key"), ctx=Depends(context)):
        s, u, o = ctx
        return d.once(s, u, key, "return.start", data.model_dump(), lambda: op.new_return(s, u, o, data))

    @app.post("/api/v1/return-transfers/{identifier}/events", tags=["execution"])
    def return_transition(
        identifier: str, data: v.ReturnEvent, key: str = Header(alias="Idempotency-Key"), ctx=Depends(context)
    ):
        s, u, o = ctx
        return d.once(
            s,
            u,
            key,
            "return.event:" + identifier,
            data.model_dump(),
            lambda: op.return_event(s, u, o, op.get(s, u, identifier, "return_transfer"), data),
        )

    @app.get("/api/v1/benchmarks/source", tags=["evidence"])
    def benchmark_source(ctx=Depends(context)):
        from .benchmark import source

        return source()

    @app.post("/api/v1/benchmarks/run", tags=["evidence"])
    def benchmark(
        category: str = Query(pattern="^(M01AB|M01AE|N02BA|N02BE|N05B|N05C|R03|R06)$"),
        key: str = Header(alias="Idempotency-Key"),
        ctx=Depends(context),
    ):
        s, u, _ = ctx
        d.role(u, "planner", "manager", "steward")

        def work():
            locations = [
                x
                for x in s.scalars(select(Location).where(Location.org_id == u.org_id))
                if d.allowed(u, x.id)
            ]
            if not locations:
                d.fail("An authorised workspace location is required", 403)
            job = Job(
                org_id=u.org_id,
                actor_id=u.id,
                kind="benchmark",
                payload={
                    "category": category,
                    "location_id": locations[0].id,
                    "product_id": "PUBLIC-BENCHMARK",
                    "as_of": "2019-10-08",
                },
            )
            s.add(job)
            s.flush()
            return d.record(job)

        return d.once(s, u, key, "benchmark", {"category": category}, work)
