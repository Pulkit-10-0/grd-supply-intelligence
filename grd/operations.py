"""Operational workflows; every write runs under the existing organisation lock."""

from datetime import date, datetime, timedelta, timezone
import math

from sqlalchemy import select

from . import domain as d
from .models import (
    Availability,
    Batch,
    Case,
    Demand,
    Movement,
    Plan,
    Product,
    Shipment,
    ShipmentLine,
    StockRequest,
    User,
    Workflow,
    now,
)
from .scenarios import clean


def rows(s, user, kind):
    return [
        w
        for w in s.scalars(
            select(Workflow)
            .where(
                Workflow.org_id == user.org_id,
                Workflow.kind.in_(["count_session", "supplier_order", "exception", "return_transfer"])
                if kind == "all"
                else Workflow.kind == kind,
            )
            .order_by(Workflow.created_at.desc())
        )
        if all(d.allowed(user, loc) for loc in w.location_ids)
    ]


def get(s, user, identifier, kind=None):
    w = d.get(s, Workflow, identifier, user)
    if kind and w.kind != kind:
        d.fail("Workflow not found", 404)
    d.scope(user, *w.location_ids)
    return w


def create(s, user, kind, locations, payload, state="draft", identity=None):
    d.scope(user, *locations)
    w = Workflow(
        org_id=user.org_id,
        kind=kind,
        location_ids=sorted(set(locations)),
        payload=clean(payload),
        state=state,
        identity=identity,
    )
    s.add(w)
    s.flush()
    d.audit(s, user, kind + ".created", w.id, {"state": state}, w.location_ids)
    return w


def version(w, expected):
    if w.version != expected:
        d.fail("Workflow changed; refresh before retrying with new inputs")


def update(s, user, w, state, payload, reason):
    w.state, w.payload, w.version = state, clean(payload), w.version + 1
    d.audit(s, user, w.kind + "." + state, w.id, {"version": w.version, "reason": reason}, w.location_ids)
    return d.record(w)


def owner(s, user, owner_id, locations):
    assigned = d.get(s, User, owner_id, user)
    if not assigned.active or not all(d.allowed(assigned, loc) for loc in locations):
        d.fail("Owner cannot access this worklist", 422)


def shipment_document(s, user, identifier):
    ship = d.get(s, Shipment, identifier, user)
    plan = d.get(s, Plan, ship.plan_id, user)
    if not (d.allowed(user, plan.source_id) or d.allowed(user, plan.destination_id)):
        d.fail("Shipment not in your scope", 403)
    lines = []
    for line in s.scalars(select(ShipmentLine).where(ShipmentLine.shipment_id == ship.id)):
        batch = d.get(s, Batch, line.source_batch_id, user)
        lines.append(
            {
                **d.record(line),
                "batch_code": batch.code,
                "expiry": str(batch.expiry),
                "outstanding": line.quantity - line.received,
            }
        )
    return {
        "shipment": {
            **d.record(ship),
            "source_id": plan.source_id,
            "destination_id": plan.destination_id,
            "lines": lines,
        },
        "product": d.record(d.get(s, Product, plan.product_id, user)),
        "label": "GRD:SHIPMENT:" + ship.id,
        "document": "Delivery note",
        "plan_version": plan.version,
        "source": "Verified internal shipment identifier",
        "proofs": [
            d.record(w) for w in rows(s, user, "delivery_proof") if w.payload["shipment_id"] == ship.id
        ],
    }


def delivery(s, user, org, identifier, data):
    ship = d.get(s, Shipment, identifier, user)
    plan = d.get(s, Plan, ship.plan_id, user)
    d.scope(user, plan.destination_id)
    all_lines = list(s.scalars(select(ShipmentLine).where(ShipmentLine.shipment_id == ship.id)))
    ids = {x.id for x in all_lines}
    if not set(data.short_lines) <= ids or len(set(data.short_lines)) != len(data.short_lines):
        d.fail("Short lines must belong to the shipment", 422)
    if not data.lines and not data.short_lines:
        d.fail("Confirm at least one receipt or short line", 422)
    # A short line is an exception; do not invent receipt or close goods still in transit.
    if data.lines:
        d.receive(s, user, org, ship, data.lines, data.as_of)
    else:
        d.operating_date(org, data.as_of)
        d.role(user, "operator", "manager")
    for line_id in data.short_lines:
        if (
            next(x for x in all_lines if x.id == line_id).received
            == next(x for x in all_lines if x.id == line_id).quantity
        ):
            d.fail("Fully received line cannot be marked short", 422)
    w = create(
        s,
        user,
        "delivery_proof",
        [plan.destination_id],
        {
            **data.model_dump(),
            "shipment_id": ship.id,
            "plan_version": plan.version,
            "receiver_user_id": user.id,
            "remaining": {x.id: x.quantity - x.received for x in all_lines},
        },
        "recorded",
    )
    if data.short_lines:
        create(
            s,
            user,
            "exception",
            [plan.destination_id],
            {
                "title": "Short delivery requires reconciliation",
                "reference": ship.id,
                "kind": "short_receipt",
                "active": True,
                "owner_id": user.id,
                "due_on": str(data.as_of),
                "comments": [],
                "proof_id": w.id,
            },
            "open",
            "short:" + w.id,
        )
    return d.record(w)


def picking_document(s, user, plan_id):
    p = d.get(s, Plan, plan_id, user)
    d.scope(user, p.source_id)
    if p.status not in ["approved", "partial", "dispatched", "completed"]:
        d.fail("Documents require an approved plan version")
    from .models import Allocation

    items = []
    for a in s.scalars(select(Allocation).where(Allocation.plan_id == p.id)):
        b = d.get(s, Batch, a.batch_id, user)
        items.append(
            {
                "batch_id": b.id,
                "batch_code": b.code,
                "expiry": str(b.expiry),
                "approved": a.quantity,
                "to_pick": a.quantity - a.dispatched - a.released,
                "dispatched": a.dispatched,
                "released": a.released,
                "status": b.status,
            }
        )
    return {
        "plan_id": p.id,
        "version": p.version,
        "status": p.status,
        "source_id": p.source_id,
        "destination_id": p.destination_id,
        "product_id": p.product_id,
        "documents": ["Approved pick list", "Packing checklist"],
        "lines": items,
        "instruction": "Printing does not move stock. Verify batch, expiry and quantity; dispatch rechecks current eligibility.",
    }


def replenishment(s, user, org, product_id, location_id, as_of, lead_days, coverage_days):
    d.scope(user, location_id)
    d.operating_date(org, as_of)
    product = d.get(s, Product, product_id, user)
    pos = d.position(s, user, location_id, product_id, as_of)
    daily, measure, samples = d.rate(s, user, product_id, location_id, as_of)
    end = as_of + timedelta(days=lead_days + coverage_days)
    commitments = sum(
        r.quantity - r.fulfilled - r.cancelled
        for r in s.scalars(
            select(StockRequest).where(
                StockRequest.org_id == user.org_id,
                StockRequest.product_id == product_id,
                StockRequest.destination_id == location_id,
                StockRequest.needed_by <= end,
            )
        )
    )
    from .planning import network_view
    from .scenarios import freeze

    network = network_view(s, user, org, product_id, as_of, min(90, lead_days + coverage_days))
    snapshot = freeze(s, user, org, product_id, as_of, min(90, lead_days + coverage_days), network)
    row = next(x for x in snapshot["locations"] if x["location_id"] == location_id)
    # Ignore stock expiring before promised arrival; incoming must survive that date too.
    arrival = as_of + timedelta(days=lead_days)
    stock = sum(b["quantity"] for b in row["stock"] if b["expiry"] > str(arrival))
    inbound = sum(
        x["quantity"]
        for x in row["incoming"]
        if x["eligible"] and x["date"] <= str(end) and x["expiry"] > str(end)
    )
    for w in rows(s, user, "supplier_order"):
        p = w.payload
        if (
            w.state in ["acknowledged", "partial"]
            and p["location_id"] == location_id
            and p["product_id"] == product_id
            and p["promised_on"] <= str(end)
        ):
            inbound += p["quantity"] - p.get("received", 0)
    demand = max(commitments, (daily or 0) * (lead_days + coverage_days))
    suggested = (
        math.ceil(max(0, demand - stock - inbound) / product.pack_size) * product.pack_size
        if daily is not None and samples >= 7 and pos["known"]
        else None
    )
    return {
        "product_id": product_id,
        "location_id": location_id,
        "suggested_quantity": suggested,
        "available_surviving_arrival": stock,
        "physical": pos["physical"],
        "reserved": pos["reserved"],
        "confirmed_inbound": inbound,
        "commitments": commitments,
        "daily_rate": daily,
        "measure": measure,
        "history_days": samples,
        "pack_size": product.pack_size,
        "lead_days": lead_days,
        "coverage_days": coverage_days,
        "formula": "ceil_pack(max(0, max(booked demand, rate × coverage+lead) − eligible unreserved stock − confirmed inbound))",
        "evidence_type": org.mode,
        "inventory_revision": org.revision,
        "warning": None
        if suggested is not None
        else "Insufficient stock/demand evidence for an automatic suggestion",
    }


def new_order(s, user, org, data):
    d.role(user, "planner", "manager")
    p = d.get(s, Product, data.product_id, user)
    if data.quantity % p.pack_size:
        d.fail("Order quantity must be a pack multiple", 422)
    suggestion = replenishment(
        s, user, org, data.product_id, data.location_id, data.as_of, data.lead_days, data.coverage_days
    )
    return d.record(
        create(
            s,
            user,
            "supplier_order",
            [data.location_id],
            {
                **data.model_dump(),
                "suggestion": suggestion,
                "received": 0,
                "accepted": 0,
                "history": [],
                "event_source": "Manual supplier confirmation; no external purchase is placed",
            },
        )
    )


def order_event(s, user, org, w, data):
    version(w, data.version)
    d.operating_date(org, data.as_of)
    p = dict(w.payload)
    if data.action == "approve":
        d.role(user, "manager")
        if w.state != "draft":
            d.fail("Only draft orders can be approved")
        # Evidence may have changed; publish fresh explanation at approval.
        p["approval_evidence"] = replenishment(
            s, user, org, p["product_id"], p["location_id"], data.as_of, p["lead_days"], p["coverage_days"]
        )
        state = "approved"
    elif data.action == "acknowledge":
        d.role(user, "planner", "manager")
        if w.state != "approved" or data.promised_on is None or data.promised_on < data.as_of:
            d.fail("An approved order and non-past promised date are required", 422)
        p["promised_on"] = str(data.promised_on)
        state = "acknowledged"
    else:
        d.role(user, "manager")
        if w.state in ["received", "cancelled"]:
            d.fail("Order is already closed")
        state = "cancelled"
    p["history"] = [
        *p["history"],
        {"actor_id": user.id, "action": data.action, "reference": data.reference, "date": str(data.as_of)},
    ]
    org.revision += 1
    return update(s, user, w, state, p, data.reference)


def supplier_receipt(s, user, org, w, data):
    d.role(user, "operator", "manager")
    d.operating_date(org, data.as_of)
    version(w, data.version)
    p = dict(w.payload)
    if (
        w.state not in ["acknowledged", "partial"]
        or data.quantity + data.damaged <= 0
        or data.quantity + data.damaged > p["quantity"] - p["received"]
    ):
        d.fail("Receipt exceeds acknowledged outstanding order")
    if data.expiry <= data.as_of and data.quantity:
        d.fail("Expired goods cannot be accepted as usable", 422)
    for qty, status in [(data.quantity, "usable"), (data.damaged, "quarantined")]:
        if not qty:
            continue
        b = Batch(
            org_id=user.org_id,
            product_id=p["product_id"],
            location_id=p["location_id"],
            code=data.code,
            expiry=data.expiry,
            quantity=0,
            reserved=0,
            status=status,
        )
        s.add(b)
        s.flush()
        d.change(s, user, b, qty, "supplier_receipt", w.id)
    p["received"] += data.quantity + data.damaged
    p["accepted"] += data.quantity
    p["history"] = [*p["history"], {"actor_id": user.id, "action": "receipt", **data.model_dump()}]
    org.revision += 1
    return update(s, user, w, "received" if p["received"] == p["quantity"] else "partial", p, data.reference)


def count_snapshot(b):
    return {
        "batch_id": b.id,
        "code": b.code,
        "product_id": b.product_id,
        "recorded": b.quantity,
        "updated_at": b.updated_at.isoformat(),
        "status": b.status,
        "expiry": str(b.expiry),
    }


def new_count(s, user, data):
    d.role(user, "steward", "manager")
    if len(set(data.batch_ids)) != len(data.batch_ids):
        d.fail("Duplicate batches", 422)
    owner(s, user, data.owner_id, [data.location_id])
    stock = [d.get(s, Batch, bid, user) for bid in data.batch_ids]
    if any(b.location_id != data.location_id for b in stock):
        d.fail("Every count batch must belong to the selected location", 422)
    return d.record(
        create(
            s,
            user,
            "count_session",
            [data.location_id],
            {**data.model_dump(), "snapshot": [count_snapshot(b) for b in stock], "round": 1, "rounds": []},
            "counting",
        )
    )


def unchanged(s, user, snapshot):
    for item in snapshot:
        b = d.get(s, Batch, item["batch_id"], user)
        if (
            b.quantity != item["recorded"]
            or d.utc_datetime(b.updated_at) != d.utc_datetime(datetime.fromisoformat(item["updated_at"]))
            or b.status != item["status"]
        ):
            d.fail("Stock changed since the session snapshot; start a recount")


def count_event(s, user, org, w, data):
    d.operating_date(org, data.as_of)
    version(w, data.version)
    p = dict(w.payload)
    if w.state in ["approved", "cancelled"]:
        d.fail("Count session already closed")
    if data.action == "submit":
        d.role(user, "operator", "steward", "manager")
        if user.id != p["owner_id"] and user.role not in ["admin", "manager"]:
            d.fail("Only the assigned counter or manager can submit", 403)
        if w.state != "counting":
            d.fail("Request a recount before submitting another round")
        unchanged(s, user, p["snapshot"])
        counts = {x.batch_id: x.quantity for x in data.lines}
        if len(counts) != len(data.lines) or set(counts) != set(p["batch_ids"]):
            d.fail("Submit exactly one count for every assigned batch", 422)
        p["counts"] = counts
        p["variances"] = {x["batch_id"]: counts[x["batch_id"]] - x["recorded"] for x in p["snapshot"]}
        p["submitted_by"] = user.id
        state = "review"
    elif data.action == "recount":
        d.role(user, "steward", "manager")
        p["rounds"] = [
            *p["rounds"],
            {
                "round": p["round"],
                "snapshot": p["snapshot"],
                "counts": p.get("counts"),
                "reason": data.reason,
            },
        ]
        p["snapshot"] = [count_snapshot(d.get(s, Batch, bid, user)) for bid in p["batch_ids"]]
        p["round"] += 1
        p.pop("counts", None)
        p.pop("variances", None)
        state = "counting"
    elif data.action == "approve":
        d.role(user, "manager")
        if w.state != "review":
            d.fail("Submit a complete count before review")
        unchanged(s, user, p["snapshot"])
        for item in p["snapshot"]:
            b = d.get(s, Batch, item["batch_id"], user)
            delta = p["counts"][b.id] - b.quantity
            if delta:
                d.change(s, user, b, delta, "session_count_adjustment", w.id)
        org.revision += 1
        state = "approved"
    else:
        d.role(user, "steward", "manager")
        state = "cancelled"
    return update(s, user, w, state, p, data.reason)


def stock_card(s, user, org, product_id, location_id, as_of):
    d.scope(user, location_id)
    d.operating_date(org, as_of)
    stock = list(
        s.scalars(
            select(Batch).where(
                Batch.org_id == user.org_id, Batch.product_id == product_id, Batch.location_id == location_id
            )
        )
    )
    ids = [b.id for b in stock]
    movements = list(
        s.scalars(
            select(Movement)
            .where(Movement.org_id == user.org_id, Movement.batch_id.in_(ids))
            .order_by(Movement.created_at, Movement.id)
        )
    )
    opening = sum(m.delta for m in movements if m.reason in ["opening", "demo_opening"])
    other = [m for m in movements if m.reason not in ["opening", "demo_opening"]]
    receipts = sum(m.delta for m in other if m.delta > 0)
    outflows = -sum(m.delta for m in other if m.delta < 0)
    pos = d.position(s, user, location_id, product_id, as_of)
    return {
        "product_id": product_id,
        "location_id": location_id,
        "as_of": str(as_of),
        "opening": opening,
        "receipts_and_positive_adjustments": receipts,
        "issues_and_negative_adjustments": outflows,
        "calculated_physical": opening + receipts - outflows,
        "balance": clean(pos),
        "reconciled": opening + receipts - outflows == pos["physical"],
        "equation": "opening + receipts/positive adjustments − dispatch/issues/write-offs/negative adjustments = physical",
        "batches": [d.record(b) for b in stock],
        "movements": [d.record(m) for m in movements],
        "evidence_type": org.mode,
        "inventory_revision": org.revision,
    }


def demand_quality(s, user, product_id, location_id, start, end):
    d.scope(user, location_id)
    d.get(s, Product, product_id, user)
    if end < start or (end - start).days > 365:
        d.fail("Choose a range of at most 366 days", 422)
    observations = list(
        s.scalars(
            select(Demand).where(
                Demand.org_id == user.org_id,
                Demand.product_id == product_id,
                Demand.location_id == location_id,
                Demand.date.between(start, end),
            )
        )
    )
    availability = {
        x.date: x
        for x in s.scalars(
            select(Availability).where(
                Availability.org_id == user.org_id,
                Availability.product_id == product_id,
                Availability.location_id == location_id,
                Availability.date.between(start, end),
            )
        )
    }
    sales = {x.date: x.quantity for x in observations if x.measure == "sales"}
    requested = {x.date: x.quantity for x in observations if x.measure == "requested"}
    eligible = [day for day, a in availability.items() if a.reported and a.available and day in sales]
    unavailable = [day for day, a in availability.items() if a.reported and not a.available]
    daily = sum(sales[day] for day in eligible) / len(eligible) if eligible else None
    covered_unavailable = [day for day in unavailable if day in sales]
    inferred = (
        sum(max(sales[day], daily) - sales[day] for day in covered_unavailable)
        if daily is not None and covered_unavailable
        else None
    )
    return {
        "start": str(start),
        "end": str(end),
        "raw_sales": sum(sales.values()) if sales else None,
        "raw_requested": sum(requested.values()) if requested else None,
        "sales_reporting_days": len(sales),
        "availability_reporting_days": sum(x.reported for x in availability.values()),
        "calendar_days": (end - start).days + 1,
        "observed_stockout_days": len(unavailable),
        "supported_available_sales_days": len(eligible),
        "unsupported_stockout_days": len(unavailable) - len(covered_unavailable),
        "inferred_lost_units": inferred,
        "adjusted_demand": sum(sales.values()) + inferred if inferred is not None else None,
        "sensitivity": [
            {
                "rate_multiplier": m,
                "estimated_lost_units": sum(
                    max(sales[day], daily * m) - sales[day] for day in covered_unavailable
                ),
            }
            for m in [0.75, 1, 1.25]
        ]
        if inferred is not None
        else [],
        "status": "supported_estimate" if daily is not None and covered_unavailable else "unsupported",
        "assumptions": "Observed in-stock reported sales mean estimates stock-out-day demand only where sales reporting exists; raw data is unchanged. No adjustment feeds operational forecasts automatically.",
        "sources": sorted({x.source for x in availability.values()}),
    }


def refresh_inbox(s, user, org, as_of):
    d.role(user, "operator", "planner", "steward", "manager")
    d.operating_date(org, as_of)
    candidates = []
    for ship, plan in s.execute(
        select(Shipment, Plan)
        .join(Plan, Shipment.plan_id == Plan.id)
        .where(Plan.org_id == user.org_id, Shipment.received_on.is_(None))
    ):
        if d.allowed(user, plan.destination_id) and ship.expected_on < as_of:
            candidates.append(
                (
                    "late:" + ship.id,
                    plan.destination_id,
                    "Overdue shipment receipt",
                    "late_shipment",
                    ship.id,
                    str(ship.expected_on),
                )
            )
    for case in s.scalars(select(Case).where(Case.org_id == user.org_id, Case.status == "open")):
        if d.allowed(user, case.location_id):
            candidates.append(
                (
                    "case:" + case.id,
                    case.location_id,
                    "Review " + case.kind.replace("_", " "),
                    "case",
                    case.id,
                    str(case.due_on or as_of),
                )
            )
    for b in s.scalars(select(Batch).where(Batch.org_id == user.org_id, Batch.quantity > 0)):
        if not d.allowed(user, b.location_id):
            continue
        if b.status != "usable":
            candidates.append(
                ("hold:" + b.id, b.location_id, "Held stock needs review", "hold", b.id, str(as_of))
            )
        if (
            org.mode != "synthetic"
            and (datetime.now(timezone.utc) - d.utc_datetime(b.updated_at)).total_seconds() > 86400
        ):
            candidates.append(
                (
                    "stale:" + b.id,
                    b.location_id,
                    "Stock input older than 24 hours",
                    "stale_stock",
                    b.id,
                    str(as_of),
                )
            )
    from .planning import network_view

    for product in s.scalars(select(Product).where(Product.org_id == user.org_id)):
        for row in network_view(s, user, org, product.id, as_of, 28)["table"]:
            deadline = row["action_deadline"]
            if deadline and deadline["slack_days"] <= 1:
                candidates.append(
                    (
                        "deadline:" + product.id + ":" + row["location_id"],
                        row["location_id"],
                        "Latest safe action is due: " + product.name,
                        "deadline",
                        product.id,
                        deadline["latest_action_on"],
                    )
                )
    for w in rows(s, user, "supplier_order"):
        if w.state in ["acknowledged", "partial"] and w.payload["promised_on"] < str(as_of):
            candidates.append(
                (
                    "order:" + w.id,
                    w.payload["location_id"],
                    "Supplier delivery overdue",
                    "supplier_order",
                    w.id,
                    w.payload["promised_on"],
                )
            )
    for w in rows(s, user, "count_session"):
        if w.state == "review" and any(w.payload.get("variances", {}).values()):
            candidates.append(
                (
                    "count:" + w.id,
                    w.payload["location_id"],
                    "Count variance awaiting review",
                    "count_session",
                    w.id,
                    w.payload["due_on"],
                )
            )
    existing = {w.identity: w for w in rows(s, user, "exception")}
    active_ids = set()
    for identity, loc, title, kind, ref, due in candidates:
        active_ids.add(identity)
        if identity not in existing:
            create(
                s,
                user,
                "exception",
                [loc],
                {
                    "title": title,
                    "kind": kind,
                    "reference": ref,
                    "due_on": due,
                    "owner_id": None,
                    "comments": [],
                    "active": True,
                },
                "open",
                identity,
            )
        else:
            w = existing[identity]
            p = dict(w.payload)
            was_active = p.get("active")
            p.update(active=True, due_on=due)
            if not was_active and w.state == "resolved":
                update(s, user, w, "open", p, "Exception recurred")
            elif p != w.payload:
                w.payload = p
    for identity, w in existing.items():
        if (
            identity
            and identity.split(":")[0] in ["late", "case", "hold", "stale", "deadline", "order", "count"]
            and identity not in active_ids
            and w.payload.get("active")
        ):
            update(s, user, w, "resolved", {**w.payload, "active": False}, "Underlying condition cleared")
    s.flush()
    return [d.record(w) for w in rows(s, user, "exception")]


def inbox_event(s, user, w, data):
    d.role(user, "operator", "planner", "steward", "manager")
    version(w, data.version)
    p = dict(w.payload)
    if data.owner_id is not None:
        owner(s, user, data.owner_id, w.location_ids)
        p["owner_id"] = data.owner_id
    if data.due_on is not None:
        p["due_on"] = str(data.due_on)
    p["comments"] = [
        *p.get("comments", []),
        {"actor_id": user.id, "text": data.reason, "at": now().isoformat()},
    ]
    state = {"acknowledge": "acknowledged", "resolve": "resolved", "reopen": "open", "assign": w.state}[
        data.action
    ]
    if data.action == "resolve":
        d.role(user, "steward", "manager")
    return update(s, user, w, state, p, data.reason)


def new_return(s, user, org, data):
    d.role(user, "operator", "manager")
    d.operating_date(org, data.as_of)
    line = d.get(s, ShipmentLine, data.line_id, user)
    ship = d.get(s, Shipment, line.shipment_id, user)
    p = d.get(s, Plan, ship.plan_id, user)
    b, original = d.get(s, Batch, data.batch_id, user), d.get(s, Batch, line.source_batch_id, user)
    d.scope(user, p.destination_id, p.source_id)
    if (
        b.location_id != p.destination_id
        or b.product_id != p.product_id
        or b.code != original.code
        or b.expiry != original.expiry
    ):
        d.fail("Return batch must match the accepted shipment", 422)
    return d.record(
        create(
            s,
            user,
            "return_transfer",
            [p.destination_id, p.source_id],
            {
                **data.model_dump(),
                "source_id": p.destination_id,
                "destination_id": p.source_id,
                "shipment_id": ship.id,
                "product_id": p.product_id,
                "expiry": str(b.expiry),
                "code": b.code,
            },
            "requested",
        )
    )


def return_event(s, user, org, w, data):
    version(w, data.version)
    d.operating_date(org, data.as_of)
    p = dict(w.payload)
    b = d.get(s, Batch, p["batch_id"], user)
    line = d.get(s, ShipmentLine, p["line_id"], user)
    qty = p["quantity"]
    if data.action == "approve":
        d.role(user, "manager")
        if w.state != "requested":
            d.fail("Only requested returns can be approved")
        pending = sum(
            x.payload["quantity"]
            for x in rows(s, user, "return_transfer")
            if x.id != w.id and x.state == "approved" and x.payload["line_id"] == line.id
        )
        if qty > line.accepted - line.returned - pending or qty > b.quantity - b.reserved:
            d.fail("Return exceeds accepted unreturned or available units")
        b.reserved += qty
        state = "approved"
    elif data.action == "dispatch":
        d.role(user, "operator", "manager")
        if w.state != "approved":
            d.fail("Return must be approved before dispatch")
        b.reserved -= qty
        d.change(s, user, b, -qty, "return_dispatch", w.id)
        line.returned += qty
        p["dispatched_on"] = str(data.as_of)
        state = "in_transit"
    elif data.action == "receive":
        d.role(user, "operator", "manager")
        if w.state != "in_transit" or str(data.as_of) < p["dispatched_on"]:
            d.fail("Only dispatched return stock can be received")
        pending = Batch(
            org_id=user.org_id,
            product_id=p["product_id"],
            location_id=p["destination_id"],
            code=p["code"],
            expiry=date.fromisoformat(p["expiry"]),
            status="return_pending",
            quantity=0,
            reserved=0,
        )
        s.add(pending)
        s.flush()
        d.change(s, user, pending, qty, "return_receipt", w.id)
        p["received_batch_id"] = pending.id
        p["received_on"] = str(data.as_of)
        state = "received_for_review"
    elif data.action in ["release", "quarantine"]:
        d.role(user, "steward", "manager")
        if w.state != "received_for_review":
            d.fail("Return must be received before disposition")
        pending = d.get(s, Batch, p["received_batch_id"], user)
        if data.action == "release" and pending.expiry <= data.as_of:
            d.fail("Expired return cannot be released")
        pending.status = "usable" if data.action == "release" else "quarantined"
        state = "closed"
    else:
        d.role(user, "manager")
        if w.state not in ["requested", "approved"]:
            d.fail("Dispatched return cannot be cancelled")
        if w.state == "approved":
            b.reserved -= qty
        state = "cancelled"
    org.revision += 1
    return update(s, user, w, state, p, data.reason)


def approve_alternative(s, user, org, w, data):
    from . import schemas as v

    version(w, data.version)
    d.role(user, "manager")
    d.operating_date(org, data.as_of)
    p = dict(w.payload)
    if (
        w.state != "draft"
        or p["snapshot"]["inventory_revision"] != org.revision
        or p["snapshot"]["as_of"] != str(data.as_of)
    ):
        d.fail("Comparison base is stale or already approved; create a fresh comparison")
    if data.alternative >= len(p["alternatives"]):
        d.fail("Unknown alternative", 422)
    variant = p["alternatives"][data.alternative]
    if not variant["legs"]:
        d.fail("Choose an actionable alternative", 422)
    request = StockRequest(
        org_id=user.org_id,
        product_id=p["product_id"],
        destination_id=p["destination_id"],
        quantity=p["quantity"],
        needed_by=data.as_of + timedelta(days=1),
        reason="Approved comparison " + w.id,
    )
    s.add(request)
    s.flush()
    plans = []
    # Real domain engine rechecks each leg; all legs commit or roll back together.
    for leg in variant["legs"]:
        proposal = d.propose(
            s,
            user,
            org,
            v.PlanInput(
                source_id=leg["source_id"],
                destination_id=leg["destination_id"],
                product_id=p["product_id"],
                quantity=leg["quantity"],
                as_of=data.as_of,
                request_id=request.id,
            ),
        )
        plan = d.get(s, Plan, proposal["id"], user)
        d.approve(s, user, org, plan, plan.version, data.as_of)
        s.flush()
        plans.append(plan.id)
    p["approved_alternative"], p["plan_ids"], p["request_id"] = data.alternative, plans, request.id
    return update(s, user, w, "approved", p, "Atomic approval; physical stock reserved, not dispatched")
