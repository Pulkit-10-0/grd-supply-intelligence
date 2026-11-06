from datetime import date, datetime, timezone
from sqlalchemy import select

from . import domain as d
from .models import Job, Location, Product


def network_view(s, user, org, product_id, as_of, horizon):
    d.operating_date(org, as_of)
    pack_size = d.get(s, Product, product_id, user).pack_size
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
                and 0 <= (as_of - date.fromisoformat(job.payload["as_of"])).days <= 7
            ):
                published = job
                break
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
            "days_of_cover": pos["available"] / daily if daily else None,
            "stock_age_hours": age,
            "projection_method": (
                "Published forecast; historical mean fallback outside its horizon"
                if published
                else "Historical mean fallback; no published forecast"
            )
            + "; max(booked due demand, forecast) avoids double counting",
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
    from .scenarios import deadline, freeze, project, suggested_top_up

    base = {"table": risks}
    snapshot = freeze(s, user, org, product_id, as_of, horizon, base)
    projection = project(snapshot)
    for row, projected, frozen in zip(risks, projection["rows"], snapshot["locations"]):
        row.update(projected)
        row["status"] = "unknown" if projected["service_gap_units"] is None else "shortage" if projected["shortage_date"] else "covered"
        row["action_deadline"] = deadline(s, user, row, as_of)
        row["inbound_units"] = sum(x["quantity"] for x in frozen["incoming"] if x["eligible"])
        row["in_transit_units"] = sum(x["quantity"] for x in frozen["incoming"] if x.get("kind") == "shipment")
        row["recommendation"] = suggested_top_up(snapshot, frozen, projected, pack_size)
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
