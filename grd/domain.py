from datetime import date, datetime, timedelta, timezone
import hashlib
import json
import math

from fastapi import HTTPException
from sqlalchemy import select, func

from .models import (
    Allocation,
    Audit,
    Batch,
    Case,
    Demand,
    Idempotency,
    Location,
    Movement,
    Plan,
    Product,
    Route,
    Shipment,
    ShipmentLine,
    StockRequest,
    now,
)


def fail(message, code=409):
    raise HTTPException(code, message)


def utc_datetime(value):
    # SQLite returns naive UTC; PostgreSQL may return an aware session-local time.
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)


def allowed(user, location_id):
    return user.role == "admin" or location_id in user.location_ids


def scope(user, *locations):
    if not all(allowed(user, loc) for loc in locations):
        fail("Location not in your authorised scope", 403)


def role(user, *roles):
    if user.role not in ("admin", *roles):
        fail("Role does not permit this action", 403)


def operating_date(org, as_of):
    from datetime import datetime
    from zoneinfo import ZoneInfo

    if org.mode == "synthetic" and org.scenario_on is not None and as_of != org.scenario_on:
        fail(
            "Use this sandbox's scenario date; create a separate scenario instead of mixing stock from different dates",
            422,
        )

    if org.mode != "synthetic" and as_of != datetime.now(ZoneInfo("Asia/Kolkata")).date():
        fail(
            "Live inventory commands must use today's operating date; use a synthetic organisation for historical scenarios",
            422,
        )


def get(s, cls, identifier, user):
    obj = s.get(cls, identifier)
    if obj is None or obj.org_id != user.org_id:
        fail("Record not found", 404)
    return obj


def record(obj):
    return {c.name: getattr(obj, c.name) for c in obj.__table__.columns}


def audit(s, user, action, reference, details, locations=()):
    # JSON canonicalisation also handles dates in version snapshots.
    s.add(
        Audit(
            org_id=user.org_id,
            actor_id=user.id,
            action=action,
            reference=reference,
            details=json.loads(json.dumps(details, default=str)),
            location_ids=list(locations),
        )
    )


def once(s, user, key, operation, body, work):
    if not key or len(key) > 150:
        fail("A stable Idempotency-Key (1-150 characters) is required", 422)
    digest = hashlib.sha256(json.dumps([operation, body], sort_keys=True, default=str).encode()).hexdigest()
    existing = s.scalar(
        select(Idempotency).where(
            Idempotency.org_id == user.org_id, Idempotency.actor_id == user.id, Idempotency.key == key
        )
    )
    if existing:
        if existing.digest != digest:
            fail("Idempotency key already used with different content")
        return existing.result
    result = json.loads(json.dumps(work(), default=str))
    s.add(Idempotency(org_id=user.org_id, actor_id=user.id, key=key, digest=digest, result=result))
    return result


def change(s, user, batch, delta, reason, reference, reverses_id=None):
    if batch.quantity + delta < batch.reserved:
        fail("Movement would consume reserved units or create negative stock")
    batch.quantity += delta
    batch.updated_at = now()
    s.add(
        Movement(
            org_id=user.org_id,
            batch_id=batch.id,
            delta=delta,
            reason=reason,
            reference=reference,
            actor_id=user.id,
            reverses_id=reverses_id,
        )
    )


def batches(s, user, location, product, as_of, shelf=0):
    return list(
        s.scalars(
            select(Batch)
            .where(
                Batch.org_id == user.org_id,
                Batch.location_id == location,
                Batch.product_id == product,
                Batch.status == "usable",
                Batch.expiry >= as_of + timedelta(days=max(1, shelf)),
            )
            .order_by(Batch.expiry, Batch.id)
        )
    )


def rate(s, user, product, location, as_of):
    # Requested and sold quantities are alternatives, never added together.
    for measure in ["requested", "sales"]:
        observations = list(
            s.scalars(
                select(Demand).where(
                    Demand.org_id == user.org_id,
                    Demand.product_id == product,
                    Demand.location_id == location,
                    Demand.measure == measure,
                    Demand.date <= as_of,
                    Demand.date > as_of - timedelta(days=28),
                )
            )
        )
        if observations:
            dates = {x.date for x in observations}
            # Multiple imports of the same observation are forbidden separately by importer.
            return sum(x.quantity for x in observations) / len(dates), measure, len(dates)
    return None, None, 0


def position(s, user, location, product, as_of):
    all_batches = list(
        s.scalars(
            select(Batch).where(
                Batch.org_id == user.org_id, Batch.location_id == location, Batch.product_id == product
            )
        )
    )
    eligible = [b for b in all_batches if b.status == "usable" and b.expiry > as_of]
    return {
        "known": bool(all_batches),
        "physical": sum(b.quantity for b in all_batches),
        "usable": sum(b.quantity for b in eligible),
        "reserved": sum(b.reserved for b in eligible),
        "available": sum(b.quantity - b.reserved for b in eligible),
        # A new receipt must not make an older positive stock position look fresh.
        "updated_at": min((b.updated_at for b in all_batches if b.quantity > 0), default=None)
        or max((b.updated_at for b in all_batches), default=None),
    }


def require_fresh_stock(org, stock):
    if org.mode == "synthetic":
        return
    import os

    cutoff = datetime.now(timezone.utc) - timedelta(hours=float(os.getenv("STOCK_MAX_AGE_HOURS", "24")))
    if any(b.quantity > 0 and utc_datetime(b.updated_at) < cutoff for b in stock):
        fail("Source stock is stale; reconcile before creating or dispatching an actionable plan")


def choose(
    s,
    user,
    org,
    source,
    dest,
    product_id,
    quantity,
    as_of,
    request_id=None,
    extra_reserved=None,
    extra_incoming=0,
):
    operating_date(org, as_of)
    scope(user, source, dest)
    if source == dest:
        fail("Source and destination must differ", 422)
    origin = get(s, Location, source, user)
    get(s, Location, dest, user)
    product = get(s, Product, product_id, user)
    rt = s.scalar(
        select(Route).where(
            Route.org_id == user.org_id, Route.origin_id == source, Route.destination_id == dest
        )
    )
    if not rt or not rt.permitted:
        fail("No approved supply route")
    if origin.kind != "warehouse" and not product.transfer_allowed:
        fail("Product not permitted for distributor transfer")
    if quantity < rt.min_order or quantity % product.pack_size:
        fail("Quantity must meet the route minimum and be an exact pack multiple", 422)
    arrival = as_of + timedelta(days=rt.lead_days_upper)
    eligible = batches(s, user, source, product_id, arrival, rt.min_shelf_days)
    require_fresh_stock(org, eligible)
    extra_reserved = extra_reserved or {}
    available = sum(max(0, b.quantity - b.reserved - extra_reserved.get(b.id, 0)) for b in eligible)
    own_rate, measure, samples = rate(s, user, product_id, source, as_of)
    if origin.kind != "warehouse" and (own_rate is None or samples < 7):
        fail("Insufficient donor history to protect its own demand")
    protected = (
        math.ceil((own_rate or 0) * (rt.lead_days_upper + rt.safety_days))
        if origin.kind != "warehouse"
        else 0
    )
    if quantity > max(0, available - protected):
        fail(f"Insufficient eligible unreserved donor stock: {available} available, {protected} protected")
    if request_id:
        req = get(s, StockRequest, request_id, user)
        if req.product_id != product_id or req.destination_id != dest:
            fail("Plan does not match request", 422)
        committed = req.fulfilled
        for plan in s.scalars(
            select(Plan).where(
                Plan.org_id == user.org_id, Plan.request_id == req.id, Plan.status != "proposed"
            )
        ):
            committed += sum(
                a.quantity - a.dispatched - a.released
                for a in s.scalars(select(Allocation).where(Allocation.plan_id == plan.id))
            )
            for ship in s.scalars(select(Shipment).where(Shipment.plan_id == plan.id)):
                committed += sum(
                    x.quantity - x.received
                    for x in s.scalars(select(ShipmentLine).where(ShipmentLine.shipment_id == ship.id))
                )
        if committed + quantity > req.quantity - req.cancelled:
            fail("Request already fulfilled or committed")
    remaining, allocations = quantity, []
    for b in eligible:
        n = min(remaining, max(0, b.quantity - b.reserved - extra_reserved.get(b.id, 0)))
        if n:
            allocations.append({"batch_id": b.id, "quantity": n})
            remaining -= n
        if not remaining:
            break
    cost = (
        None
        if product.unit_cost_paise is None or rt.cost_paise is None
        else quantity * product.unit_cost_paise + rt.cost_paise
    )
    if rt.max_order_units is not None and quantity > rt.max_order_units:
        fail("Route maximum order quantity exceeded")
    if rt.order_budget_paise is not None and (cost is None or cost > rt.order_budget_paise):
        fail("Order budget exceeded or required cost unknown")
    if rt.destination_capacity_units is not None:
        occupied = sum(
            b.quantity
            for b in s.scalars(
                select(Batch).where(
                    Batch.org_id == user.org_id, Batch.location_id == dest, Batch.product_id == product_id
                )
            )
        )
        incoming = 0
        for p in s.scalars(
            select(Plan).where(
                Plan.org_id == user.org_id,
                Plan.destination_id == dest,
                Plan.product_id == product_id,
                Plan.status != "proposed",
            )
        ):
            incoming += sum(
                a.quantity - a.dispatched - a.released
                for a in s.scalars(select(Allocation).where(Allocation.plan_id == p.id))
            )
            for ship in s.scalars(select(Shipment).where(Shipment.plan_id == p.id)):
                incoming += sum(
                    x.quantity - x.received
                    for x in s.scalars(select(ShipmentLine).where(ShipmentLine.shipment_id == ship.id))
                )
        if occupied + incoming + quantity + extra_incoming > rt.destination_capacity_units:
            fail("Destination product storage capacity exceeded")
    return {
        "allocations": allocations,
        "arrival_date": arrival.isoformat(),
        "minimum_shelf_days": rt.min_shelf_days,
        "source_available": available,
        "donor_protected": protected,
        "donor_measure": measure,
        "cost_paise": cost,
        "route_id": rt.id,
        "route_fingerprint": hashlib.sha256(
            json.dumps(record(rt), sort_keys=True, default=str).encode()
        ).hexdigest(),
        "policy_source": rt.policy_source,
        "input_revision": org.revision,
        "evidence_type": org.mode,
        "forecast_consumption_rule": "max(requested commitments, forecast), never sum",
    }


def propose(s, user, org, data):
    evidence = choose(
        s,
        user,
        org,
        data.source_id,
        data.destination_id,
        data.product_id,
        data.quantity,
        data.as_of,
        data.request_id,
    )
    plan = Plan(
        org_id=user.org_id,
        request_id=data.request_id,
        source_id=data.source_id,
        destination_id=data.destination_id,
        product_id=data.product_id,
        quantity=data.quantity,
        input_revision=org.revision,
        explanation=evidence,
        as_of=data.as_of,
        arrival_date=date.fromisoformat(evidence["arrival_date"]),
        minimum_shelf_days=evidence["minimum_shelf_days"],
    )
    s.add(plan)
    s.flush()
    audit(s, user, "plan.proposed", plan.id, record(plan), [plan.source_id, plan.destination_id])
    return record(plan)


def approve(s, user, org, plan, version, as_of):
    role(user, "manager")
    scope(user, plan.source_id, plan.destination_id)
    if plan.status != "proposed" or plan.version != version:
        fail("Plan version/state has changed")
    if plan.input_revision != org.revision or plan.as_of != as_of:
        fail("Plan inputs/date are stale; create a fresh plan")
    evidence = choose(
        s,
        user,
        org,
        plan.source_id,
        plan.destination_id,
        plan.product_id,
        plan.quantity,
        as_of,
        plan.request_id,
    )
    for item in evidence["allocations"]:
        b = get(s, Batch, item["batch_id"], user)
        b.reserved += item["quantity"]
        s.add(Allocation(org_id=user.org_id, plan_id=plan.id, batch_id=b.id, quantity=item["quantity"]))
    plan.status, plan.approved_by, plan.explanation = "approved", user.id, evidence
    org.revision += 1
    audit(
        s,
        user,
        "plan.approved",
        plan.id,
        {"version": version, "allocations": evidence["allocations"]},
        [plan.source_id, plan.destination_id],
    )
    return record(plan)


def cancel(s, user, org, plan, reason):
    role(user, "manager")
    scope(user, plan.source_id, plan.destination_id)
    if plan.status in ["completed", "cancelled"]:
        fail("Plan already closed")
    for a in s.scalars(select(Allocation).where(Allocation.plan_id == plan.id)):
        n = a.quantity - a.dispatched - a.released
        b = get(s, Batch, a.batch_id, user)
        b.reserved -= n
        a.released += n
    plan.status = "cancelled"
    org.revision += 1
    audit(
        s,
        user,
        "plan.cancelled",
        plan.id,
        {"reason": reason, "note": "Goods already dispatched remain in transit"},
        [plan.source_id, plan.destination_id],
    )
    return record(plan)


def dispatch(s, user, org, plan, quantity, as_of):
    operating_date(org, as_of)
    role(user, "operator", "manager")
    scope(user, plan.source_id)
    if plan.status not in ["approved", "partial", "dispatched"]:
        fail("Plan not approved or has been cancelled")
    allocations = list(
        s.scalars(
            select(Allocation)
            .join(Batch, Allocation.batch_id == Batch.id)
            .where(Allocation.plan_id == plan.id)
            .order_by(Batch.expiry, Allocation.id)
        )
    )
    if quantity > sum(a.quantity - a.dispatched - a.released for a in allocations):
        fail("Dispatch exceeds outstanding approved quantity")
    rt = get(s, Route, plan.explanation["route_id"], user)
    if (
        plan.explanation.get("route_fingerprint")
        != hashlib.sha256(json.dumps(record(rt), sort_keys=True, default=str).encode()).hexdigest()
    ):
        fail("Route rules changed after approval; cancel and replan")
    product = get(s, Product, plan.product_id, user)
    origin = get(s, Location, plan.source_id, user)
    if not rt.permitted or (origin.kind != "warehouse" and not product.transfer_allowed):
        fail("Route/product permission changed; cancel and replan")
    if quantity % product.pack_size:
        fail("Dispatch must use complete packs", 422)
    arrival = as_of + timedelta(days=rt.lead_days_upper)
    shipment = Shipment(org_id=user.org_id, plan_id=plan.id, expected_on=arrival, dispatched_on=as_of)
    s.add(shipment)
    s.flush()
    remaining = quantity
    for a in allocations:
        n = min(remaining, a.quantity - a.dispatched - a.released)
        if not n:
            continue
        b = get(s, Batch, a.batch_id, user)
        require_fresh_stock(org, [b])
        if (
            b.status != "usable"
            or b.expiry < arrival + timedelta(days=rt.min_shelf_days)
            or b.expiry <= as_of
        ):
            fail("Allocated batch is blocked or no longer meets arrival shelf life")
        b.reserved -= n
        change(s, user, b, -n, "dispatch", shipment.id)
        a.dispatched += n
        s.add(ShipmentLine(org_id=user.org_id, shipment_id=shipment.id, source_batch_id=b.id, quantity=n))
        remaining -= n
    plan.status = (
        "dispatched" if all(a.dispatched + a.released == a.quantity for a in allocations) else "partial"
    )
    org.revision += 1
    audit(
        s,
        user,
        "shipment.dispatched",
        shipment.id,
        {"quantity": quantity, "plan_id": plan.id},
        [plan.source_id, plan.destination_id],
    )
    s.flush()
    return {
        **record(shipment),
        "lines": [
            record(x) for x in s.scalars(select(ShipmentLine).where(ShipmentLine.shipment_id == shipment.id))
        ],
    }


def receive(s, user, org, shipment, items, as_of):
    operating_date(org, as_of)
    role(user, "operator", "manager")
    plan = get(s, Plan, shipment.plan_id, user)
    scope(user, plan.destination_id)
    if len({x.line_id for x in items}) != len(items):
        fail("Duplicate shipment line", 422)
    for item in items:
        line = get(s, ShipmentLine, item.line_id, user)
        if line.shipment_id != shipment.id:
            fail("Line does not belong to shipment", 422)
        total = item.accepted + item.damaged
        if item.damaged and len(item.reason.strip()) < 3:
            fail("Damaged receipt requires a discrepancy reason", 422)
        if total <= 0 or line.received + total > line.quantity:
            fail("Receipt exceeds remaining shipment quantity")
        original = get(s, Batch, line.source_batch_id, user)
        if as_of < shipment.dispatched_on:
            fail("Receipt cannot predate dispatch", 422)
        if item.accepted and (original.expiry <= as_of or original.status != "usable"):
            fail("Expired/held source batch must be received into quarantine, not usable stock")
        for qty, status in [(item.accepted, "usable"), (item.damaged, "quarantined")]:
            if not qty:
                continue
            batch = Batch(
                org_id=user.org_id,
                product_id=plan.product_id,
                location_id=plan.destination_id,
                code=original.code,
                expiry=original.expiry,
                status=status,
                quantity=0,
                reserved=0,
            )
            s.add(batch)
            s.flush()
            change(s, user, batch, qty, "receipt", shipment.id)
        line.received += total
        line.accepted += item.accepted
        if plan.request_id:
            req = get(s, StockRequest, plan.request_id, user)
            req.fulfilled += item.accepted
        if item.damaged:
            s.add(
                Case(
                    org_id=user.org_id,
                    location_id=plan.destination_id,
                    kind="damaged_receipt",
                    reference=shipment.id,
                    details={"line_id": line.id, "quantity": item.damaged, "reason": item.reason},
                )
            )
    s.flush()
    current_lines = list(s.scalars(select(ShipmentLine).where(ShipmentLine.shipment_id == shipment.id)))
    if all(x.received == x.quantity for x in current_lines):
        shipment.received_on = as_of
    shipments = list(s.scalars(select(Shipment).where(Shipment.plan_id == plan.id)))
    lines = list(
        s.scalars(select(ShipmentLine).where(ShipmentLine.shipment_id.in_([x.id for x in shipments])))
    )
    all_dispatched = all(
        a.dispatched + a.released == a.quantity
        for a in s.scalars(select(Allocation).where(Allocation.plan_id == plan.id))
    )
    if all_dispatched and all(x.received == x.quantity for x in lines) and plan.status != "cancelled":
        plan.status = "completed"
    org.revision += 1
    audit(
        s,
        user,
        "shipment.received",
        shipment.id,
        {"lines": [x.model_dump() for x in items], "as_of": str(as_of)},
        [plan.source_id, plan.destination_id],
    )
    return {
        "shipment_id": shipment.id,
        "plan_status": plan.status,
        "lines": [record(x) for x in lines if x.shipment_id == shipment.id],
    }


def reconcile(s, user):
    ledger_totals = (
        select(Movement.batch_id, func.sum(Movement.delta).label("quantity"))
        .where(Movement.org_id == user.org_id)
        .group_by(Movement.batch_id)
        .subquery()
    )
    reservation_totals = (
        select(
            Allocation.batch_id,
            func.sum(Allocation.quantity - Allocation.dispatched - Allocation.released).label("quantity"),
        )
        .where(Allocation.org_id == user.org_id)
        .group_by(Allocation.batch_id)
        .subquery()
    )
    rows = s.execute(
        select(
            Batch, func.coalesce(ledger_totals.c.quantity, 0), func.coalesce(reservation_totals.c.quantity, 0)
        )
        .outerjoin(ledger_totals, ledger_totals.c.batch_id == Batch.id)
        .outerjoin(reservation_totals, reservation_totals.c.batch_id == Batch.id)
        .where(Batch.org_id == user.org_id)
    )
    results = []
    for b, ledger, reserved in rows:
        if not allowed(user, b.location_id):
            continue
        results.append(
            {
                "batch_id": b.id,
                "quantity": b.quantity,
                "ledger_quantity": ledger,
                "reserved": b.reserved,
                "allocation_reserved": reserved,
                "ok": ledger == b.quantity and reserved == b.reserved,
            }
        )
    return {"ok": all(x["ok"] for x in results), "batches": results}
