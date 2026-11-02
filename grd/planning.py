from datetime import timedelta, datetime, timezone
from sqlalchemy import select

from . import domain as d
from .models import Batch, Location, Plan, Shipment, ShipmentLine, StockRequest, Job


def network_view(s, user, org, product_id, as_of, horizon):
    d.operating_date(org, as_of)
    features, risks = [], []
    for loc in s.scalars(select(Location).where(Location.org_id == user.org_id)):
        if not d.allowed(user, loc.id):
            continue
        pos = d.position(s, user, loc.id, product_id, as_of)
        daily, measure, samples = d.rate(s, user, product_id, loc.id, as_of)
        published = None
        for job in s.scalars(
            select(Job)
            .where(Job.org_id == user.org_id, Job.kind == "forecast", Job.status == "completed")
            .order_by(Job.created_at.desc())
        ):
            if (
                job.payload.get("location_id") == loc.id
                and job.payload.get("product_id") == product_id
                and job.payload.get("measure", "requested") == measure
                and job.result.get("status") == "ready"
                and 0 <= (as_of - __import__("datetime").date.fromisoformat(job.payload["as_of"])).days <= 7
            ):
                published = job
                break
        stock = [[b.quantity - b.reserved, b.expiry] for b in d.batches(s, user, loc.id, product_id, as_of)]
        requests = list(
            s.scalars(
                select(StockRequest).where(
                    StockRequest.org_id == user.org_id,
                    StockRequest.destination_id == loc.id,
                    StockRequest.product_id == product_id,
                )
            )
        )
        pending = {}
        for req in requests:
            amount = req.quantity - req.fulfilled - req.cancelled
            day = max(as_of + timedelta(days=1), req.needed_by)
            pending[day] = pending.get(day, 0) + amount
        inbound = []
        for ship in s.scalars(
            select(Shipment)
            .join(Plan, Shipment.plan_id == Plan.id)
            .where(Plan.org_id == user.org_id, Plan.destination_id == loc.id, Plan.product_id == product_id)
        ):
            for line in s.scalars(select(ShipmentLine).where(ShipmentLine.shipment_id == ship.id)):
                source = s.get(Batch, line.source_batch_id)
                if line.quantity > line.received:
                    inbound.append(
                        (
                            max(as_of + timedelta(days=1), ship.expected_on),
                            line.quantity - line.received,
                            source.expiry,
                            source.status,
                        )
                    )
        shortage = None
        expiry_exposure = 0.0
        backlog = 0.0
        if pos["known"] and daily is not None:
            for n in range(1, horizon + 1):
                day = as_of + timedelta(days=n)
                for arrival, qty, expiry, status in inbound:
                    if arrival == day and expiry > day and status == "usable":
                        stock.append([qty, expiry])
                for batch in stock:
                    if batch[1] <= day:
                        expiry_exposure += batch[0]
                        batch[0] = 0
                booked = pending.get(day, 0) + backlog
                rate_today = daily
                if published:
                    point = next(
                        (
                            x
                            for x in published.result.get(
                                "operational_forecast", published.result["forecast"]
                            )
                            if __import__("datetime").date.fromisoformat(x["week_ending"]) >= day
                        ),
                        None,
                    )
                    if point:
                        rate_today = point["quantity"] / 7
                need = max(rate_today, booked)
                served = 0
                for batch in sorted(stock, key=lambda b: b[1]):
                    take = min(need, batch[0])
                    batch[0] -= take
                    need -= take
                    served += take
                backlog = max(0, booked - served)
                if need > 1e-8 and shortage is None:
                    shortage = str(day)
        updated = pos["updated_at"]
        age = (
            (datetime.now(timezone.utc) - d.utc_datetime(updated)).total_seconds() / 3600 if updated else None
        )
        props = {
            "location_id": loc.id,
            "name": loc.name,
            "district": loc.district,
            "kind": loc.kind,
            "product_id": product_id,
            "coordinate_source": loc.coordinate_source,
            "balance": pos,
            "daily_rate": daily,
            "rate_measure": measure,
            "history_days": samples,
            "forecast_job_id": published.id if published else None,
            "forecast_range": published.result.get("forecast") if published else None,
            "projection_forecast": published.result.get("operational_forecast", published.result.get("forecast")) if published else None,
            "shortage_date": shortage,
            "days_of_cover": pos["available"] / daily if daily else None,
            "projected_expiry_units": expiry_exposure,
            "stock_age_hours": age,
            "status": "unknown"
            if not pos["known"] or daily is None
            else "shortage"
            if shortage
            else "covered",
            "projection_method": (
                "Published forecast; historical mean fallback outside its horizon"
                if published
                else "Historical mean fallback; no published forecast"
            )
            + "; max(booked due demand, forecast) avoids double counting",
            "inbound_units": sum(x[1] for x in inbound),
            "evidence_type": org.mode,
        }
        risks.append(props)
        features.append(
            {
                "type": "Feature",
                "id": loc.id,
                "geometry": {"type": "Point", "coordinates": [loc.longitude, loc.latitude]}
                if loc.longitude is not None and loc.latitude is not None
                else None,
                "properties": props,
            }
        )
    from .scenarios import deadline, freeze, project

    base = {"table": risks}
    snapshot = freeze(s, user, org, product_id, as_of, horizon, base)
    projection = project(snapshot)
    for row, projected in zip(risks, projection["rows"]):
        row.update(projected)
        row["status"] = "unknown" if projected["service_gap_units"] is None else "shortage" if projected["shortage_date"] else "covered"
        row["action_deadline"] = deadline(s, user, row, as_of)
        frozen = next(x for x in snapshot["locations"] if x["location_id"] == row["location_id"])
        row["inbound_units"] = sum(x["quantity"] for x in frozen["incoming"] if x["eligible"])
        row["projected_expiry_units"] = sum(x["expiry"] for x in projected["timeline"])
    return {
        "type": "FeatureCollection",
        "features": features,
        "table": risks,
        "as_of": str(as_of),
        "horizon_days": horizon,
        "inventory_revision": org.revision,
        "evidence_type": org.mode,
        "stale_after_hours": 24,
        "note": "No live vehicle positions; incoming supply uses declared arrival dates, not future actual delivery truth",
    }
