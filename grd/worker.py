from datetime import date, timedelta
import logging

from sqlalchemy import select

from . import domain as d
from .db import transaction
from .forecasting import forecast
from .models import Demand, Job, User, now, Organisation
from .simulation import compare

logger = logging.getLogger("grd.worker")


def run_once(factory):
    with transaction(factory) as s:
        j = s.scalar(
            select(Job)
            .where(Job.status == "queued")
            .order_by(Job.created_at)
            .with_for_update(skip_locked=True)
            .limit(1)
        )
        if not j:
            return False
        j.status = "running"
        j.started_at = now()
        j.progress = 10
        identifier, payload, kind, actor, org = j.id, j.payload, j.kind, j.actor_id, j.org_id
        claimed_at = j.started_at
    try:
        with transaction(factory) as s:
            user = s.get(User, actor)
            if not user or not user.active or not d.allowed(user, payload["location_id"]):
                raise ValueError("Requesting user's scope was revoked")
            records = list(
                s.scalars(
                    select(Demand)
                    .where(
                        Demand.org_id == org,
                        Demand.location_id == payload["location_id"],
                        Demand.product_id == payload["product_id"],
                        Demand.measure == payload.get("measure", "requested"),
                        Demand.date <= date.fromisoformat(payload["as_of"]),
                    )
                    .order_by(Demand.date)
                )
            )
            dataset_ids = sorted({x.dataset_id for x in records})
            evidence_type = s.get(Organisation, org).mode
            observations = [{"date": str(x.date), "quantity": x.quantity} for x in records]

        if kind == "benchmark":
            from .benchmark import run
            result = run(payload["category"])
        elif kind == "forecast":
            result = forecast(observations, date.fromisoformat(payload["as_of"]), payload["horizons"])
        else:
            cutoff = date.fromisoformat(payload["as_of"]) - timedelta(days=28)
            recent = [x["quantity"] for x in observations if date.fromisoformat(x["date"]) > cutoff]
            if not recent:
                raise ValueError("No requested demand history for simulation")
            result = compare(
                sum(recent) / len(recent),
                payload["seed"],
                payload["days"],
                payload["lead_days"],
                payload["proposed_safety_days"],
            )
        with transaction(factory) as s:
            j = s.scalar(
                select(Job)
                .where(Job.id == identifier, Job.status == "running", Job.started_at == claimed_at)
                .with_for_update()
            )
            if j is not None:
                j.result = {
                    **result,
                    "source_cutoff": payload["as_of"],
                    "product_id": payload["product_id"],
                    "location_id": payload["location_id"],
                    "dataset_ids": dataset_ids,
                    "source_evidence_type": evidence_type,
                    "evidence_type": result.get("evidence_type", evidence_type),
                }
                j.status = "completed"
                j.progress = 100
    except Exception as exc:
        logger.exception("job failed id=%s", identifier)
        with transaction(factory) as s:
            j = s.scalar(
                select(Job)
                .where(Job.id == identifier, Job.status == "running", Job.started_at == claimed_at)
                .with_for_update()
            )
            if j is not None:
                j.status = "failed"
                j.error = str(exc)[:1000]
    return True
