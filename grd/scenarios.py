"""Frozen deterministic network projection shared by risk grids and plan comparisons."""

from copy import deepcopy
from datetime import date, timedelta
import hashlib
import json
import math

from fastapi import HTTPException
from sqlalchemy import select

from . import domain as d
from .models import Allocation, Batch, Plan, Product, Route, Shipment, ShipmentLine, StockRequest, Workflow


def clean(value):
    return json.loads(json.dumps(value, default=str))


def freeze(s, user, org, product_id, as_of, horizon, network):
    locations = []
    for row in network["table"]:
        loc = row["location_id"]
        books = list(
            s.scalars(
                select(StockRequest).where(
                    StockRequest.org_id == user.org_id,
                    StockRequest.destination_id == loc,
                    StockRequest.product_id == product_id,
                )
            )
        )
        incoming = []
        for ship, plan in s.execute(
            select(Shipment, Plan)
            .join(Plan, Shipment.plan_id == Plan.id)
            .where(Plan.org_id == user.org_id, Plan.destination_id == loc, Plan.product_id == product_id)
        ):
            for line in s.scalars(select(ShipmentLine).where(ShipmentLine.shipment_id == ship.id)):
                b = d.get(s, Batch, line.source_batch_id, user)
                if line.quantity > line.received:
                    incoming.append(
                        {
                            "id": ship.id,
                            "date": str(max(as_of + timedelta(days=1), ship.expected_on)),
                            "quantity": line.quantity - line.received,
                            "expiry": str(b.expiry),
                            "eligible": b.status == "usable",
                        }
                    )
        for plan in s.scalars(
            select(Plan).where(
                Plan.org_id == user.org_id,
                Plan.destination_id == loc,
                Plan.product_id == product_id,
                Plan.status.in_(["approved", "partial"]),
            )
        ):
            for a in s.scalars(select(Allocation).where(Allocation.plan_id == plan.id)):
                b = d.get(s, Batch, a.batch_id, user)
                qty = a.quantity - a.dispatched - a.released
                if qty:
                    incoming.append(
                        {
                            "id": plan.id,
                            "date": str(max(as_of + timedelta(days=1), plan.arrival_date)),
                            "quantity": qty,
                            "expiry": str(b.expiry),
                            "eligible": b.status == "usable",
                        }
                    )
        locations.append(
            {
                **row,
                "stock": [
                    {"id": b.id, "quantity": b.quantity - b.reserved, "expiry": str(b.expiry)}
                    for b in d.batches(s, user, loc, product_id, as_of)
                ],
                "bookings": [
                    {
                        "date": str(max(as_of + timedelta(days=1), r.needed_by)),
                        "quantity": r.quantity - r.fulfilled - r.cancelled,
                    }
                    for r in books
                ],
                "incoming": incoming,
            }
        )
        for order in s.scalars(
            select(Workflow).where(
                Workflow.org_id == user.org_id,
                Workflow.kind == "supplier_order",
                Workflow.state.in_(["acknowledged", "partial"]),
            )
        ):
            p = order.payload
            if p["location_id"] == loc and p["product_id"] == product_id:
                # Supplier shelf life is not known before receipt: provisional supply
                # remains visible but cannot be treated as expiry-verified usable stock.
                incoming.append(
                    {
                        "id": order.id,
                        "date": str(max(as_of + timedelta(days=1), date.fromisoformat(p["promised_on"]))),
                        "quantity": p["quantity"] - p["received"],
                        "expiry": "9999-12-31",
                        "eligible": False,
                        "provisional_supplier": True,
                    }
                )
    snapshot = clean(
        {
            "product_id": product_id,
            "as_of": as_of,
            "horizon": horizon,
            "inventory_revision": org.revision,
            "evidence_type": org.mode,
            "locations": locations,
        }
    )
    snapshot["digest"] = hashlib.sha256(json.dumps(snapshot, sort_keys=True).encode()).hexdigest()
    return snapshot


def project(snapshot, legs=(), shock=None):
    """No ORM writes. Same base and demand assumptions for every alternative."""
    base = deepcopy(snapshot)
    shock = shock or {}
    uplift = 1 + shock.get("demand_uplift_pct", 0) / 100
    supply = 1 - shock.get("supply_reduction_pct", 0) / 100
    delay = shock.get("delay_days", 0)
    affected = set(shock.get("location_ids", []))

    def active(loc):
        return not affected or loc in affected

    byloc = {r["location_id"]: r for r in base["locations"]}
    for leg in legs:
        src, dest = byloc[leg["source_id"]], byloc[leg["destination_id"]]
        for allocation in leg["evidence"]["allocations"]:
            batch = next(b for b in src["stock"] if b["id"] == allocation["batch_id"])
            batch["quantity"] -= allocation["quantity"]
            if batch["quantity"] < 0:
                d.fail("Comparison would allocate a frozen batch twice")
            dest["incoming"].append(
                {
                    "id": "comparison",
                    "date": leg["evidence"]["arrival_date"],
                    "quantity": allocation["quantity"],
                    "expiry": batch["expiry"],
                    "eligible": True,
                }
            )
    as_of = date.fromisoformat(base["as_of"])
    rows = []
    for row in byloc.values():
        stock = row["stock"]
        timeline, shortage, total_gap, backlog = [], None, 0.0, 0.0
        known = row["balance"]["known"] and row["daily_rate"] is not None
        for n in range(1, base["horizon"] + 1):
            day = as_of + timedelta(days=n)
            expired, arrived = 0.0, 0.0
            for incoming in row["incoming"]:
                arrival = date.fromisoformat(incoming["date"]) + timedelta(
                    days=delay if active(row["location_id"]) else 0
                )
                if arrival == day and incoming["eligible"] and incoming["expiry"] > str(day):
                    qty = incoming["quantity"] * (supply if active(row["location_id"]) else 1)
                    stock.append({"id": incoming["id"], "quantity": qty, "expiry": incoming["expiry"]})
                    arrived += qty
            for b in stock:
                if b["expiry"] <= str(day):
                    expired += b["quantity"]
                    b["quantity"] = 0
            rate = row["daily_rate"] or 0
            for point in row.get("projection_forecast") or row.get("forecast_range") or []:
                if point["week_ending"] >= str(day):
                    rate = point["quantity"] / 7
                    break
            rate *= uplift if active(row["location_id"]) else 1
            booked = backlog + sum(b["quantity"] for b in row["bookings"] if b["date"] == str(day))
            need = max(rate, booked)
            served = 0.0
            if known:
                for b in sorted(stock, key=lambda b: b["expiry"]):
                    take = min(need, b["quantity"])
                    b["quantity"] -= take
                    need -= take
                    served += take
                backlog = max(0, booked - served)
                total_gap += need
                if need > 1e-8 and shortage is None:
                    shortage = str(day)
            timeline.append(
                {
                    "date": str(day),
                    "balance": round(sum(b["quantity"] for b in stock), 2) if known else None,
                    "unserved": round(need, 2) if known else None,
                    "receipts": round(arrived, 2),
                    "expiry": round(expired, 2),
                    "demand": round(max(rate, booked), 2),
                    "status": "unknown" if not known else "shortage" if need > 1e-8 else "covered",
                }
            )
        rows.append(
            {
                "location_id": row["location_id"],
                "name": row["name"],
                "timeline": timeline,
                "shortage_date": shortage,
                "service_gap_units": round(total_gap, 2) if known else None,
                "input_status": "synthetic"
                if base["evidence_type"] == "synthetic"
                else "unknown"
                if not known
                else "stale"
                if row["stock_age_hours"] is None or row["stock_age_hours"] > 24
                else "current",
            }
        )
    return {
        "rows": rows,
        "total_service_gap": round(sum(r["service_gap_units"] or 0 for r in rows), 2),
        "unsupported_locations": sum(r["service_gap_units"] is None for r in rows),
        "shock": shock,
        "note": "Deterministic planning estimate, not measured outcomes. Requests and forecast are alternatives, not added. Gaps are unit-days: an unfilled booked unit carried to another day contributes again; this is not a count of unique lost sales.",
    }


def alternatives(s, user, org, product_id, dest, quantity, as_of):
    d.scope(user, dest)
    product = d.get(s, Product, product_id, user)
    if quantity % product.pack_size:
        d.fail("Comparison quantity must be a pack multiple", 422)
    routes = list(
        s.scalars(
            select(Route)
            .where(Route.org_id == user.org_id, Route.destination_id == dest, Route.permitted.is_(True))
            .order_by(Route.lead_days_upper, Route.id)
        )
    )
    variants, exclusions = [{"name": "No action", "legs": []}], []
    for rt in routes:
        if not d.allowed(user, rt.origin_id):
            continue
        try:
            ev = d.choose(s, user, org, rt.origin_id, dest, product_id, quantity, as_of)
            variants.append(
                {
                    "name": "Single source",
                    "legs": [
                        {
                            "source_id": rt.origin_id,
                            "destination_id": dest,
                            "product_id": product_id,
                            "quantity": quantity,
                            "evidence": ev,
                        }
                    ],
                }
            )
        except HTTPException as exc:
            exclusions.append({"source_id": rt.origin_id, "reason": exc.detail})
    remaining, split = quantity, []
    for rt in routes:
        if not remaining or not d.allowed(user, rt.origin_id):
            continue
        # Monotone stock constraints above route minimum; use pack-level binary search.
        low = max(1, math.ceil(rt.min_order / product.pack_size))
        high = remaining // product.pack_size
        best = None
        while low <= high:
            mid = (low + high) // 2
            try:
                ev = d.choose(
                    s,
                    user,
                    org,
                    rt.origin_id,
                    dest,
                    product_id,
                    mid * product.pack_size,
                    as_of,
                    extra_incoming=sum(x["quantity"] for x in split),
                )
                best = (mid * product.pack_size, ev)
                low = mid + 1
            except HTTPException:
                high = mid - 1
        if best:
            qty, ev = best
            split.append(
                {
                    "source_id": rt.origin_id,
                    "destination_id": dest,
                    "product_id": product_id,
                    "quantity": qty,
                    "evidence": ev,
                }
            )
            remaining -= qty
    if split and (len(split) > 1 or remaining > 0):
        variants.append(
            {
                "name": "Split sources" if len(split) > 1 else "Partial supply",
                "legs": split,
                "unallocated_units": remaining,
            }
        )
    return variants, exclusions


def deadline(s, user, row, as_of, buffer_days=1):
    routes = list(
        s.scalars(
            select(Route).where(
                Route.org_id == user.org_id,
                Route.destination_id == row["location_id"],
                Route.permitted.is_(True),
            )
        )
    )
    leads = [r.lead_days_upper for r in routes if d.allowed(user, r.origin_id)]
    if not row["shortage_date"] or not leads:
        return None
    lead = min(leads)
    latest = date.fromisoformat(row["shortage_date"]) - timedelta(days=lead + buffer_days)
    return {
        "latest_action_on": str(latest),
        "slack_days": (latest - as_of).days,
        "lead_days_upper": lead,
        "approval_handling_days": buffer_days,
        "assumption": "Fastest permitted visible route; availability must still be checked. Lead counted once.",
    }
