import json
from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo

import pytest

from conftest import post
from grd.db import transaction
from grd.models import Batch, Dataset, Job, Organisation
from grd.simulation import compare
from grd.worker import run_once


@pytest.mark.parametrize(
    "path,params",
    [
        ("/planning/options", {"product_id": "P", "destination_id": "DEST", "quantity": 10}),
        ("/planning/expiry-rescue", {}),
        ("/planning/allocate", {"product_id": "P", "source_id": "SOURCE"}),
    ],
)
def test_all_planning_views_enforce_the_scenario_clock_even_without_candidates(env, path, params):
    with transaction(env.app.state.factory) as s:
        s.get(Organisation, "org").scenario_on = date(2026, 11, 1)
    response = env.client.get("/api/v1" + path, params={**params, "as_of": "2026-11-02"}, headers=env.headers)
    assert response.status_code == 422


def test_count_adjustment_requires_recount_after_stock_moves_and_returns_to_same_quantity(env):
    case = post(
        env,
        "/inventory/batches/B-SOURCE/count",
        {"quantity": 60, "reason": "Observed physical count"},
        "count",
    ).json()
    assert (
        post(
            env,
            "/inventory/batches/B-SOURCE/issue",
            {"quantity": 10, "reason": "Customer issue", "as_of": env.today},
            "issue",
        ).status_code
        == 200
    )
    rows = env.client.get("/api/v1/movements?location_id=SOURCE", headers=env.headers).json()["items"]
    issued = next(x for x in rows if x["reason"] == "customer_issue")
    assert (
        post(
            env, f"/movements/{issued['id']}/reverse", {"reason": "Reverse test issue"}, "reverse"
        ).status_code
        == 200
    )
    response = post(
        env, "/inventory/adjustments", {"case_id": case["id"], "reason": "Review stale count"}, "adjust"
    )
    assert response.status_code == 409 and "recount" in response.text


def test_offline_count_rejects_stock_changed_before_upload_and_replays_recorded_result(env):
    batches = env.client.get("/api/v1/inventory/batches", headers=env.headers).json()["items"]
    snapshot = next(b for b in batches if b["id"] == "B-SOURCE")["updated_at"]
    body = {"quantity": 60, "reason": "Mobile physical count", "expected_updated_at": snapshot}
    first = post(env, "/inventory/batches/B-SOURCE/count", body, "mobile-count")
    assert first.status_code == 200
    assert (
        post(
            env,
            "/inventory/batches/B-SOURCE/issue",
            {"quantity": 10, "reason": "Customer issue", "as_of": env.today},
            "after-mobile-snapshot",
        ).status_code
        == 200
    )
    replayed = post(env, "/inventory/batches/B-SOURCE/count", body, "mobile-count")
    assert replayed.status_code == 200 and replayed.json()["id"] == first.json()["id"]
    stale = post(env, "/inventory/batches/B-SOURCE/count", body, "another-mobile-count")
    assert stale.status_code == 409 and "recount" in stale.text


def test_mobile_count_accepts_equivalent_timezone_snapshot(env):
    batches = env.client.get("/api/v1/inventory/batches", headers=env.headers).json()["items"]
    raw = next(b for b in batches if b["id"] == "B-SOURCE")["updated_at"]
    timestamp = datetime.fromisoformat(raw)
    if timestamp.tzinfo is None:
        timestamp = timestamp.replace(tzinfo=timezone.utc)
    response = post(
        env,
        "/inventory/batches/B-SOURCE/count",
        {
            "quantity": 60,
            "reason": "Mobile count in IST",
            "expected_updated_at": timestamp.astimezone(ZoneInfo("Asia/Kolkata")).isoformat(),
        },
        "mobile-count-ist",
    )
    assert response.status_code == 200


def test_password_whitespace_is_preserved_and_invalid_simulation_seed_is_rejected(env):
    password = " correct horse battery "
    created = post(
        env,
        "/users",
        {"email": "space@example.test", "password": password, "role": "viewer", "location_ids": ["DEST"]},
        "user",
    )
    assert created.status_code == 200
    assert (
        env.client.post(
            "/api/v1/auth/login", json={"email": "space@example.test", "password": password}
        ).status_code
        == 200
    )
    assert (
        env.client.post(
            "/api/v1/auth/login", json={"email": "space@example.test", "password": password.strip()}
        ).status_code
        == 401
    )
    assert (
        post(
            env,
            "/jobs/simulation",
            {"product_id": "P", "location_id": "DEST", "as_of": env.today, "seed": -1},
            "negative-seed",
        ).status_code
        == 422
    )


def test_reconciliation_uses_one_aggregate_query_and_preserves_the_ledger(env):
    from sqlalchemy import event
    from grd import domain
    from grd.models import User

    statements = []

    def record_query(conn, cursor, statement, params, context, many):
        if statement.lstrip().upper().startswith("SELECT"):
            statements.append(statement)

    with transaction(env.app.state.factory) as s:
        user = s.get(User, "admin")
        event.listen(env.app.state.engine, "before_cursor_execute", record_query)
        try:
            result = domain.reconcile(s, user)
        finally:
            event.remove(env.app.state.engine, "before_cursor_execute", record_query)
    assert result["ok"] and len(result["batches"]) == 2
    assert len(statements) == 1


def test_destination_operator_sees_the_shipped_batch_label_without_source_inventory_access(env):
    from conftest import plan, approve

    proposal = plan(env, 20)
    approve(env, proposal)
    assert (
        post(
            env, f"/plans/{proposal['id']}/dispatch", {"quantity": 20, "as_of": env.today}, "ship"
        ).status_code
        == 200
    )
    shipment = env.client.get("/api/v1/shipments", headers=env.operator).json()["items"][0]
    assert shipment["lines"][0]["batch_code"] == "LOT" and shipment["lines"][0]["expiry"]
    assert (
        env.client.get("/api/v1/inventory/batches?location_id=SOURCE", headers=env.operator).status_code
        == 403
    )


def test_example_token_secret_cannot_be_used_for_a_deployment(monkeypatch):
    from grd.security import secret

    monkeypatch.setenv("GRD_TOKEN_SECRET", "replace-with-at-least-32-random-characters")
    with pytest.raises(RuntimeError):
        secret()


def test_fresh_receipt_does_not_hide_old_positive_stock(env):
    with transaction(env.app.state.factory) as s:
        s.get(Batch, "B-SOURCE").updated_at = datetime.now(timezone.utc) - timedelta(hours=48)
        s.add(
            Batch(
                org_id="org",
                product_id="P",
                location_id="SOURCE",
                code="FRESH",
                expiry=date(2027, 1, 1),
                quantity=10,
                reserved=0,
                status="usable",
            )
        )
    rows = env.client.get(
        "/api/v1/network", params={"product_id": "P", "as_of": env.today}, headers=env.headers
    ).json()["table"]
    assert next(r for r in rows if r["location_id"] == "SOURCE")["stock_age_hours"] >= 47


def test_empty_old_batch_does_not_block_live_available_stock(env):
    today = datetime.now(ZoneInfo("Asia/Kolkata")).date()
    with transaction(env.app.state.factory) as s:
        s.get(Organisation, "org").mode = "observed"
        s.get(Batch, "B-SOURCE").expiry = today + timedelta(days=100)
        s.add(
            Batch(
                org_id="org",
                product_id="P",
                location_id="SOURCE",
                code="EMPTY-OLD",
                expiry=today + timedelta(days=100),
                quantity=0,
                reserved=0,
                status="usable",
                updated_at=datetime.now(timezone.utc) - timedelta(hours=48),
            )
        )
    response = post(
        env,
        "/plans",
        {
            "source_id": "SOURCE",
            "destination_id": "DEST",
            "product_id": "P",
            "quantity": 10,
            "as_of": str(today),
        },
        "fresh-plan",
    )
    assert response.status_code == 200, response.text


def test_live_dispatch_rechecks_freshness_after_approval(env):
    today = datetime.now(ZoneInfo("Asia/Kolkata")).date()
    with transaction(env.app.state.factory) as s:
        s.get(Batch, "B-SOURCE").expiry = today + timedelta(days=100)
    proposal = post(
        env,
        "/plans",
        {
            "source_id": "SOURCE",
            "destination_id": "DEST",
            "product_id": "P",
            "quantity": 10,
            "as_of": str(today),
        },
        "plan",
    ).json()
    assert (
        post(
            env, f"/plans/{proposal['id']}/approve", {"version": 1, "as_of": str(today)}, "approve"
        ).status_code
        == 200
    )
    with transaction(env.app.state.factory) as s:
        s.get(Organisation, "org").mode = "observed"
        s.get(Batch, "B-SOURCE").updated_at = datetime.now(timezone.utc) - timedelta(hours=48)
    response = post(
        env, f"/plans/{proposal['id']}/dispatch", {"quantity": 10, "as_of": str(today)}, "dispatch"
    )
    assert response.status_code == 409 and "stale" in response.text
    assert env.client.get("/api/v1/inventory/reconciliation", headers=env.headers).json()["ok"]


def test_comment_preserves_case_assignment_and_deadline_and_allows_explicit_clear(env):
    case = post(
        env, "/inventory/batches/B-DEST/count", {"quantity": 2, "reason": "Physical count"}, "case"
    ).json()
    url = f"/api/v1/cases/{case['id']}"
    response = env.client.patch(
        url,
        headers=env.headers,
        json={"comment": "Assign for review", "owner_id": "operator", "due_on": "2026-11-04"},
    )
    assert response.status_code == 200
    response = env.client.patch(url, headers=env.headers, json={"comment": "Still under review"})
    assert response.json()["owner_id"] == "operator" and response.json()["due_on"] == "2026-11-04"
    response = env.client.patch(
        url, headers=env.headers, json={"comment": "Clear assignment", "owner_id": None, "due_on": None}
    )
    assert response.json()["owner_id"] is None and response.json()["due_on"] is None


def test_datasets_can_be_read_beyond_the_first_200(env):
    with transaction(env.app.state.factory) as s:
        s.add_all(
            [
                Dataset(
                    id=f"ds-{n}",
                    org_id="org",
                    name=f"Dataset {n}",
                    digest=f"digest-{n}",
                    provenance={"evidence_type": "synthetic"},
                    row_count=1,
                )
                for n in range(201)
            ]
        )
    first = env.client.get("/api/v1/datasets", headers=env.headers, params={"limit": 200}).json()
    last = env.client.get(
        "/api/v1/datasets", headers=env.headers, params={"offset": 200, "limit": 200}
    ).json()
    assert first["total"] == 201 and len(first["items"]) == 200 and len(last["items"]) == 1
    assert last["items"][0]["id"] not in {d["id"] for d in first["items"]}


@pytest.mark.parametrize(
    "raw,filename,override",
    [
        (b"date,product_id,location_id,quantity,measure\n", "empty.csv", {}),
        (
            b"date,product_id,location_id,quantity,quantity,measure\n2026-09-01,P,DEST,1,2,requested\n",
            "duplicate.csv",
            {},
        ),
        (
            b"date,product_id,location_id,quantity,measure\n2026-09-01,P,DEST,1,requested\n",
            "valid.csv",
            {"name": {"invalid": "type"}},
        ),
        (
            b"date,product_id,location_id,quantity,measure\n2026-09-01,P,DEST,1,requested\n",
            "valid.csv",
            {"limitations": "not a list"},
        ),
        (b"not a workbook", "broken.xlsx", {}),
    ],
)
def test_malformed_imports_fail_cleanly_without_committing(env, raw, filename, override):
    meta = {
        "name": "Audit fixture",
        "source_url": "test",
        "licence": "Synthetic fixture",
        "geography": "Assam",
        "evidence_type": "synthetic",
        "units": "tablet",
        "limitations": ["Synthetic test"],
        **override,
    }
    response = env.client.post(
        "/api/v1/imports/demand",
        headers=env.headers,
        data={"metadata": json.dumps(meta), "dry_run": "false"},
        files={"file": (filename, raw, "application/octet-stream")},
    )
    assert response.status_code == 422, response.text
    assert env.client.get("/api/v1/datasets", headers=env.headers).json()["total"] == 0


def test_zero_demand_simulation_does_not_invent_demand():
    result = compare(0, days=365)
    for name in ["baseline", "proposed"]:
        assert result[name]["fill_rate_pct"] is None
        assert result[name]["shortage_days"] == 0 and result[name]["unmet_units"] == 0
        assert result[name]["conservation_ok"]


@pytest.mark.parametrize("state", ["cancelled", "queued"])
def test_late_worker_result_cannot_overwrite_cancel_or_recovery(env, monkeypatch, state):
    job = post(
        env, "/jobs/forecast", {"product_id": "P", "location_id": "DEST", "as_of": env.today}, "job"
    ).json()

    def delayed_result(*args):
        with transaction(env.app.state.factory) as s:
            j = s.get(Job, job["id"])
            j.status = state
            if state == "queued":
                j.started_at = None
        return {"status": "ready"}

    monkeypatch.setattr("grd.worker.forecast", delayed_result)
    assert run_once(env.app.state.factory)
    result = env.client.get("/api/v1/jobs/" + job["id"], headers=env.headers).json()
    assert result["status"] == state and not result["result"]


def test_simulation_stays_synthetic_when_source_data_is_observed(env):
    with transaction(env.app.state.factory) as s:
        s.get(Organisation, "org").mode = "observed"
    job = post(
        env, "/jobs/simulation", {"product_id": "P", "location_id": "DEST", "as_of": env.today}, "sim"
    ).json()
    assert run_once(env.app.state.factory)
    result = env.client.get("/api/v1/jobs/" + job["id"], headers=env.headers).json()["result"]
    assert result["evidence_type"] == "synthetic_policy_simulation"
    assert result["source_evidence_type"] == "observed" and result["measured_grd_impact"] is False


def test_sales_forecast_cannot_replace_available_requested_demand(env):
    with transaction(env.app.state.factory) as s:
        s.add(
            Job(
                id="sales-job",
                org_id="org",
                actor_id="admin",
                kind="forecast",
                status="completed",
                payload={"location_id": "DEST", "product_id": "P", "as_of": env.today, "measure": "sales"},
                result={"status": "ready", "forecast": [{"week_ending": "2026-11-08", "quantity": 0}]},
            )
        )
    rows = env.client.get(
        "/api/v1/network", headers=env.headers, params={"product_id": "P", "as_of": env.today}
    ).json()["table"]
    dest = next(r for r in rows if r["location_id"] == "DEST")
    assert (
        dest["forecast_job_id"] is None
        and dest["status"] == "shortage"
        and dest["rate_measure"] == "requested"
    )
