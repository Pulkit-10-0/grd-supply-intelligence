from concurrent.futures import ThreadPoolExecutor

from sqlalchemy import select

from grd.db import transaction
from grd.models import Batch, Shipment
from conftest import post, plan, approve


def test_partial_dispatch_uses_earliest_expiring_allocated_batch(env):
    from datetime import date
    from grd.models import Movement

    with transaction(env.app.state.factory) as s:
        b = Batch(
            id="EARLY",
            org_id="org",
            location_id="SOURCE",
            product_id="P",
            code="EARLY",
            expiry=date(2026, 12, 1),
            quantity=30,
            reserved=0,
            status="usable",
        )
        s.add(b)
        s.flush()
        s.add(
            Movement(
                org_id="org", batch_id=b.id, delta=30, reason="opening", reference="fixture", actor_id="admin"
            )
        )
    p = plan(env, 40)
    approve(env, p)
    ship = post(env, "/plans/" + p["id"] + "/dispatch", {"quantity": 20, "as_of": env.today}, "fefo").json()
    assert ship["lines"][0]["source_batch_id"] == "EARLY"
    assert len(ship["lines"]) == 1


def test_unknown_and_verified_zero_stock_remain_visible(env):
    r = env.client.get("/api/v1/network", params={"product_id": "P", "as_of": env.today}, headers=env.headers)
    assert r.status_code == 200, r.text
    rows = {x["location_id"]: x for x in r.json()["table"]}
    assert rows["EMPTY"]["status"] == "unknown"
    assert rows["DEST"]["status"] == "shortage"
    assert rows["DEST"]["shortage_date"] == "2026-11-02"


def test_two_plans_cannot_overcommit_donor(env):
    p = plan(env, 30, key="p1")
    q = plan(env, 30, "OTHER", "p2")

    def call(item):
        return post(
            env, "/plans/" + item["id"] + "/approve", {"version": 1, "as_of": env.today}, item["id"]
        ).status_code

    with ThreadPoolExecutor(max_workers=2) as pool:
        codes = list(pool.map(call, [p, q]))
    assert sorted(codes) == [200, 409]
    with transaction(env.app.state.factory) as s:
        assert s.get(Batch, "B-SOURCE").reserved == 30
    assert env.client.get("/api/v1/inventory/reconciliation", headers=env.headers).json()["ok"]


def test_partial_dispatch_receipt_idempotency_and_cancel(env):
    p = plan(env)
    approve(env, p)
    body = {"quantity": 20, "as_of": env.today}
    r = post(env, "/plans/" + p["id"] + "/dispatch", body, "dispatch")
    assert r.status_code == 200, r.text
    assert post(env, "/plans/" + p["id"] + "/dispatch", body, "dispatch").json() == r.json()
    assert (
        post(
            env, "/plans/" + p["id"] + "/dispatch", {"quantity": 10, "as_of": env.today}, "dispatch"
        ).status_code
        == 409
    )
    ship = r.json()
    line = ship["lines"][0]["id"]
    receipt = {"as_of": env.today, "lines": [{"line_id": line, "accepted": 10, "damaged": 0}]}
    received = post(env, "/shipments/" + ship["id"] + "/receipts", receipt, "receipt", env.operator)
    assert received.status_code == 200, received.text
    assert (
        post(env, "/shipments/" + ship["id"] + "/receipts", receipt, "receipt", env.operator).json()
        == received.json()
    )
    assert (
        post(
            env, "/plans/" + p["id"] + "/cancel", {"reason": "Cancel unshipped remainder"}, "cancel"
        ).status_code
        == 200
    )
    receipt["lines"][0]["accepted"] = 10
    assert (
        post(env, "/shipments/" + ship["id"] + "/receipts", receipt, "receipt-2", env.operator).status_code
        == 200
    )
    assert (
        post(env, "/shipments/" + ship["id"] + "/receipts", receipt, "over-receive", env.operator).status_code
        == 409
    )
    with transaction(env.app.state.factory) as s:
        b = s.get(Batch, "B-SOURCE")
        assert (b.quantity, b.reserved) == (30, 0)
        assert len(list(s.scalars(select(Shipment)))) == 1
        assert sum(x.quantity for x in s.scalars(select(Batch).where(Batch.location_id == "DEST"))) == 20
    assert env.client.get("/api/v1/inventory/reconciliation", headers=env.headers).json()["ok"]


def test_hold_conflicts_with_queued_mobile_dispatch(env):
    p = plan(env)
    approve(env, p)
    assert (
        post(
            env, "/inventory/batches/B-SOURCE/status", {"status": "blocked", "reason": "Quality hold"}, "hold"
        ).status_code
        == 200
    )
    r = post(env, "/plans/" + p["id"] + "/dispatch", {"quantity": 20, "as_of": env.today}, "offline-event")
    assert r.status_code == 409
    with transaction(env.app.state.factory) as s:
        assert not list(s.scalars(select(Shipment)))
        b = s.get(Batch, "B-SOURCE")
        assert (b.quantity, b.reserved) == (50, 40)


def test_expiry_and_packs_are_hard_constraints(env):
    assert (
        post(
            env,
            "/plans",
            {
                "source_id": "SOURCE",
                "destination_id": "DEST",
                "product_id": "P",
                "quantity": 7,
                "as_of": env.today,
            },
            "badpack",
        ).status_code
        == 422
    )
    with transaction(env.app.state.factory) as s:
        s.get(Batch, "B-SOURCE").expiry = __import__("datetime").date(2026, 11, 5)
    assert (
        post(
            env,
            "/plans",
            {
                "source_id": "SOURCE",
                "destination_id": "DEST",
                "product_id": "P",
                "quantity": 10,
                "as_of": env.today,
            },
            "expiry",
        ).status_code
        == 409
    )


def test_return_is_not_automatically_usable(env):
    p = plan(env, 20)
    approve(env, p)
    ship = post(env, "/plans/" + p["id"] + "/dispatch", {"quantity": 20, "as_of": env.today}, "ship").json()
    line = ship["lines"][0]["id"]
    assert (
        post(
            env,
            "/shipments/" + ship["id"] + "/receipts",
            {"as_of": env.today, "lines": [{"line_id": line, "accepted": 20}]},
            "received",
        ).status_code
        == 200
    )
    with transaction(env.app.state.factory) as s:
        b = s.scalar(select(Batch).where(Batch.location_id == "DEST", Batch.quantity == 20))
        batch_id = b.id
    r = post(
        env,
        "/returns",
        {"line_id": line, "batch_id": batch_id, "quantity": 10, "reason": "Verified return received"},
        "return",
    )
    assert r.status_code == 200, r.text
    assert r.json()["batch"]["status"] == "return_pending"
    assert env.client.get("/api/v1/inventory/reconciliation", headers=env.headers).json()["ok"]


def test_request_commitment_cannot_be_duplicated(env):
    req = post(
        env,
        "/requests",
        {
            "product_id": "P",
            "destination_id": "DEST",
            "quantity": 20,
            "needed_by": env.today,
            "reason": "Stock request",
        },
        "req",
    ).json()
    body = {
        "source_id": "SOURCE",
        "destination_id": "DEST",
        "product_id": "P",
        "quantity": 20,
        "as_of": env.today,
        "request_id": req["id"],
    }
    p = post(env, "/plans", body, "p1").json()
    approve(env, p)
    assert post(env, "/plans", body, "p2").status_code == 409
