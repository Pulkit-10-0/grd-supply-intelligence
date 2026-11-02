from datetime import date, timedelta
from sqlalchemy import select
from conftest import post, plan, approve
from grd.db import transaction
from grd.models import Batch, Demand


def ok(r):
    assert r.status_code == 200, r.text
    return r.json()


def test_frozen_comparison_approval_and_scenario(env):
    c = ok(
        post(
            env,
            "/planning/comparisons",
            {"product_id": "P", "destination_id": "DEST", "quantity": 40, "as_of": env.today},
        )
    )
    assert c["payload"]["alternatives"][0]["projection"]["total_service_gap"] > 0
    before = env.client.get("/api/v1/inventory/reconciliation", headers=env.headers).json()
    shock = {
        "name": "Flood delay",
        "delay_days": 5,
        "demand_uplift_pct": 30,
        "supply_reduction_pct": 50,
        "location_ids": ["DEST"],
    }
    scenario = ok(post(env, f"/planning/comparisons/{c['id']}/scenarios", shock, "shock"))
    assert scenario["payload"]["snapshot_digest"] == c["payload"]["snapshot"]["digest"]
    assert before == env.client.get("/api/v1/inventory/reconciliation", headers=env.headers).json()
    body = {"version": c["version"], "as_of": env.today, "alternative": 1}
    approved = ok(post(env, f"/planning/comparisons/{c['id']}/approve", body, "approve-comparison"))
    assert len(approved["payload"]["plan_ids"]) == 1
    assert (
        post(env, f"/planning/comparisons/{c['id']}/approve", body, "approve-comparison").json() == approved
    )
    assert post(env, f"/planning/comparisons/{c['id']}/approve", body, "again").status_code == 409


def test_grid_deadline_and_stock_card(env):
    n = env.client.get(
        f"/api/v1/network?product_id=P&as_of={env.today}&horizon=21", headers=env.headers
    ).json()
    dest = next(x for x in n["table"] if x["location_id"] == "DEST")
    assert len(dest["timeline"]) == 21
    assert dest["timeline"][0]["status"] == "shortage"
    assert dest["action_deadline"]["slack_days"] == -2
    card = ok(
        env.client.get(
            f"/api/v1/inventory/stock-card?product_id=P&location_id=SOURCE&as_of={env.today}",
            headers=env.headers,
        )
    )
    assert card["opening"] == card["calculated_physical"] == 50 and card["reconciled"]
    assert (
        env.client.get(
            f"/api/v1/inventory/stock-card?product_id=P&location_id=SOURCE&as_of={env.today}",
            headers=env.operator,
        ).status_code
        == 403
    )


def test_supplier_lifecycle_ledger_and_repeat(env):
    order = ok(
        post(
            env,
            "/suppliers/orders",
            {
                "product_id": "P",
                "location_id": "DEST",
                "supplier": "Recorded demo supplier",
                "quantity": 100,
                "unit_cost_paise": 100,
                "as_of": env.today,
                "reason": "Review replenishment",
            },
        )
    )

    def event(action, version, **kw):
        return post(
            env,
            f"/suppliers/orders/{order['id']}/events",
            {
                "version": version,
                "as_of": env.today,
                "action": action,
                "reference": "Manual recorded confirmation",
                **kw,
            },
            action,
        )

    assert event("acknowledge", 1, promised_on=env.today).status_code == 422
    approved = ok(event("approve", 1))
    ack = ok(event("acknowledge", approved["version"], promised_on=env.today))
    body = {
        "version": ack["version"],
        "as_of": env.today,
        "quantity": 60,
        "damaged": 2,
        "code": "SUP-01",
        "expiry": str(date.fromisoformat(env.today) + timedelta(days=120)),
        "reference": "Received by warehouse",
    }
    receipt = ok(post(env, f"/suppliers/orders/{order['id']}/receipts", body, "supplier-receive"))
    assert receipt["state"] == "partial" and receipt["payload"]["received"] == 62
    assert ok(post(env, f"/suppliers/orders/{order['id']}/receipts", body, "supplier-receive")) == receipt
    assert env.client.get("/api/v1/inventory/reconciliation", headers=env.headers).json()["ok"]


def test_count_rounds_and_changed_stock_guard(env):
    session = ok(
        post(
            env,
            "/count-sessions",
            {
                "location_id": "SOURCE",
                "batch_ids": ["B-SOURCE"],
                "owner_id": "admin",
                "due_on": env.today,
                "reason": "Cycle count",
            },
        )
    )

    def event(action, version, lines=[]):
        return post(
            env,
            f"/count-sessions/{session['id']}/events",
            {
                "action": action,
                "version": version,
                "as_of": env.today,
                "lines": lines,
                "reason": "Verified physical stock",
            },
            action + str(version),
        )

    submitted = ok(event("submit", 1, [{"batch_id": "B-SOURCE", "quantity": 48}]))
    with transaction(env.app.state.factory) as s:
        b = s.get(Batch, "B-SOURCE")
        from grd import domain as d
        from grd.models import User

        d.change(s, s.get(User, "admin"), b, -1, "issue", "intervening")
    assert event("approve", submitted["version"]).status_code == 409
    recount = ok(event("recount", submitted["version"]))
    review = ok(event("submit", recount["version"], [{"batch_id": "B-SOURCE", "quantity": 48}]))
    assert ok(event("approve", review["version"]))["state"] == "approved"
    assert env.client.get("/api/v1/inventory/reconciliation", headers=env.headers).json()["ok"]


def test_delivery_proof_internal_scan_documents_and_return_transit(env):
    p = approve(env, plan(env))
    doc = ok(env.client.get(f"/api/v1/plans/{p['id']}/documents", headers=env.headers))
    assert doc["lines"][0]["to_pick"] == 40
    ship = ok(post(env, f"/plans/{p['id']}/dispatch", {"quantity": 40, "as_of": env.today}, "dispatch"))
    scanned = ok(env.client.get("/api/v1/scan/GRD:SHIPMENT:" + ship["id"], headers=env.operator))
    assert scanned["shipment"]["lines"][0]["outstanding"] == 40
    body = {
        "lines": [{"line_id": ship["lines"][0]["id"], "accepted": 40, "damaged": 0}],
        "as_of": env.today,
        "receiver": "Test receiver",
        "reference": "Signed delivery check",
        "confirmed": True,
    }
    proof = ok(post(env, f"/shipments/{ship['id']}/proof", body, "proof", env.operator))
    assert ok(post(env, f"/shipments/{ship['id']}/proof", body, "proof", env.operator)) == proof
    with transaction(env.app.state.factory) as s:
        b = s.scalar(select(Batch).where(Batch.location_id == "DEST", Batch.quantity == 40))
        batch_id = b.id
    ret = ok(
        post(
            env,
            "/return-transfers",
            {
                "line_id": ship["lines"][0]["id"],
                "batch_id": batch_id,
                "quantity": 10,
                "as_of": env.today,
                "reason": "Unneeded received stock",
            },
            "return",
        )
    )
    for action, state in [
        ("approve", "approved"),
        ("dispatch", "in_transit"),
        ("receive", "received_for_review"),
        ("quarantine", "closed"),
    ]:
        ret = ok(
            post(
                env,
                f"/return-transfers/{ret['id']}/events",
                {
                    "action": action,
                    "version": ret["version"],
                    "as_of": env.today,
                    "reason": "Supervised return check",
                },
                "return-" + action,
            )
        )
        assert ret["state"] == state
        if state == "in_transit":
            with transaction(env.app.state.factory) as s:
                assert sum(b.quantity for b in s.scalars(select(Batch))) == 40
    assert env.client.get("/api/v1/inventory/reconciliation", headers=env.headers).json()["ok"]


def test_availability_quality_requires_evidence(env):
    query = "/api/v1/data/demand-quality?product_id=P&location_id=DEST&start=2026-10-31&end=2026-11-01"
    assert env.client.get(query, headers=env.headers).json()["status"] == "unsupported"
    with transaction(env.app.state.factory) as s:
        for day, qty in [("2026-10-31", 10), (env.today, 0)]:
            s.add(
                Demand(
                    org_id="org",
                    location_id="DEST",
                    product_id="P",
                    date=date.fromisoformat(day),
                    quantity=qty,
                    measure="sales",
                    dataset_id="sales-fixture",
                )
            )
    ok(
        post(
            env,
            "/data/availability",
            {
                "product_id": "P",
                "location_id": "DEST",
                "source": "Dated inventory export",
                "days": [
                    {"date": "2026-10-31", "reported": True, "available": True},
                    {"date": env.today, "reported": True, "available": False},
                ],
            },
        )
    )
    q = env.client.get(query, headers=env.headers).json()
    assert q["raw_sales"] == 10 and q["adjusted_demand"] == 20 and q["inferred_lost_units"] == 10
    assert q["raw_requested"] == 20


def test_inbox_dedup_owner_scope_and_resolution(env):
    r = ok(post(env, "/inbox/refresh", {"version": 1, "as_of": env.today}, "refresh"))
    again = ok(post(env, "/inbox/refresh", {"version": 1, "as_of": env.today}, "refresh2"))
    assert {x["id"] for x in r["items"]} == {x["id"] for x in again["items"]}
    item = next(x for x in r["items"] if "DEST" in x["location_ids"])
    result = ok(
        post(
            env,
            f"/inbox/{item['id']}/events",
            {
                "version": item["version"],
                "action": "acknowledge",
                "owner_id": "operator",
                "reason": "Taking ownership",
            },
            "ack",
        )
    )
    assert result["state"] == "acknowledged"
    assert (
        post(
            env,
            f"/inbox/{item['id']}/events",
            {"version": result["version"], "action": "resolve", "reason": "Already addressed"},
            "resolve",
            env.operator,
        ).status_code
        == 403
    )


def test_new_routes_authentication(env):
    for path in ["/operations/comparison", "/benchmarks/source", "/notifications/capabilities"]:
        assert env.client.get("/api/v1" + path).status_code == 401


def test_split_approval_rolls_back_all_sources_if_second_route_changes(env):
    from grd.models import Route, Movement

    with transaction(env.app.state.factory) as s:
        b = Batch(
            id="B-OTHER",
            org_id="org",
            product_id="P",
            location_id="OTHER",
            code="SURPLUS",
            expiry=date.fromisoformat(env.today) + timedelta(days=100),
            quantity=100,
            reserved=0,
            status="usable",
        )
        s.add(b)
        s.add(
            Route(
                id="RT-OTHER",
                org_id="org",
                origin_id="OTHER",
                destination_id="DEST",
                lead_days=2,
                lead_days_upper=3,
                min_shelf_days=7,
                safety_days=2,
                min_order=1,
                permitted=True,
                policy_source="Test",
            )
        )
        s.flush()
        s.add(
            Movement(
                org_id="org", batch_id=b.id, delta=100, reason="opening", reference="test", actor_id="admin"
            )
        )
    c = ok(
        post(
            env,
            "/planning/comparisons",
            {"product_id": "P", "destination_id": "DEST", "quantity": 60, "as_of": env.today},
        )
    )
    index = next(i for i, x in enumerate(c["payload"]["alternatives"]) if len(x["legs"]) == 2)
    with transaction(env.app.state.factory) as s:
        s.get(Route, "RT-OTHER").permitted = False
    r = post(
        env,
        f"/planning/comparisons/{c['id']}/approve",
        {"version": 1, "as_of": env.today, "alternative": index},
        "split-approve",
    )
    assert r.status_code == 409
    with transaction(env.app.state.factory) as s:
        assert s.get(Batch, "B-SOURCE").reserved == 0
        assert s.get(Batch, "B-OTHER").reserved == 0
    assert env.client.get("/api/v1/plans", headers=env.headers).json()["items"] == []


def test_public_benchmark_worker_retains_source_identity(env, monkeypatch):
    from grd.worker import run_once
    from threadpoolctl import threadpool_limits

    r = ok(
        env.client.post(
            "/api/v1/benchmarks/run?category=N02BE",
            json={},
            headers={**env.headers, "Idempotency-Key": "public-benchmark"},
        )
    )
    with threadpool_limits(limits=1):
        assert run_once(env.app.state.factory)
    job = env.client.get(f"/api/v1/jobs/{r['id']}", headers=env.headers).json()
    assert job["status"] == "completed", job
    result = job["result"]
    assert result["category"] == "N02BE" and result["evidence_type"] == "observed_public_benchmark"
    assert result["validation_last_target"] < result["test_first_target"]
    assert result["daily_rows"] == 2106
    assert set(result["test_metrics_by_horizon"]) == {"1", "2", "4"}
    assert not result["source"]["operational_use"]


def test_comparison_snapshot_and_team_are_scoped(env):
    c=ok(post(env,"/planning/comparisons",{"product_id":"P","destination_id":"DEST","quantity":40,"as_of":env.today}))
    assert env.client.get("/api/v1/operations/comparison",headers=env.operator).json()["items"] == []
    assert env.client.get(f"/api/v1/operations/record/{c['id']}",headers=env.operator).status_code == 403
    assert env.client.get("/api/v1/team?location_id=SOURCE",headers=env.operator).status_code == 403
    assert {u['id'] for u in env.client.get("/api/v1/team?location_id=DEST",headers=env.operator).json()['items']} == {'admin','operator'}
