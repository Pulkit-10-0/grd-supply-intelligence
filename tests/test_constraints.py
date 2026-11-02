from datetime import date
from grd.db import transaction
from grd.models import Route, Organisation
from conftest import plan, approve, post


def test_budget_and_storage_capacity_are_hard_limits(env):
    with transaction(env.app.state.factory) as s:
        s.get(Route, "R-DEST").order_budget_paise = 500
    r = post(
        env,
        "/plans",
        {
            "source_id": "SOURCE",
            "destination_id": "DEST",
            "product_id": "P",
            "quantity": 10,
            "as_of": env.today,
        },
        "budget",
    )
    assert r.status_code == 409 and "budget" in r.text
    with transaction(env.app.state.factory) as s:
        rt = s.get(Route, "R-DEST")
        rt.order_budget_paise = None
        rt.destination_capacity_units = 5
    r = post(
        env,
        "/plans",
        {
            "source_id": "SOURCE",
            "destination_id": "DEST",
            "product_id": "P",
            "quantity": 10,
            "as_of": env.today,
        },
        "capacity",
    )
    assert r.status_code == 409 and "capacity" in r.text


def test_changed_route_blocks_old_approved_dispatch(env):
    p = plan(env, 20)
    approve(env, p)
    r = post(
        env,
        "/routes/R-DEST/rules",
        {
            "origin_id": "SOURCE",
            "destination_id": "DEST",
            "lead_days": 1,
            "lead_days_upper": 8,
            "min_shelf_days": 30,
            "policy_source": "Updated approved route",
        },
    )
    assert r.status_code == 200, r.text
    assert (
        post(
            env, "/plans/" + p["id"] + "/dispatch", {"quantity": 20, "as_of": env.today}, "dispatch"
        ).status_code
        == 409
    )


def test_edit_requires_renewed_version_approval(env):
    p = plan(env, 20)
    changed = post(
        env,
        "/plans/" + p["id"] + "/revise",
        {
            "source_id": "SOURCE",
            "destination_id": "DEST",
            "product_id": "P",
            "quantity": 10,
            "as_of": env.today,
        },
        "revise",
    )
    assert changed.status_code == 200 and changed.json()["version"] == 2
    assert (
        post(env, "/plans/" + p["id"] + "/approve", {"version": 1, "as_of": env.today}, "old").status_code
        == 409
    )
    approve(env, changed.json())


def test_pack_conversion_uses_exact_integer_units(env):
    r = post(
        env, "/units/convert", {"product_id": "P", "quantity": 2, "from_unit": "pack", "to_unit": "tablet"}
    )
    assert r.status_code == 200 and r.json()["quantity"] == 20
    assert (
        post(
            env,
            "/units/convert",
            {"product_id": "P", "quantity": 3, "from_unit": "tablet", "to_unit": "pack"},
        ).status_code
        == 422
    )


def test_live_org_cannot_backdate_stock_plans(env):
    with transaction(env.app.state.factory) as s:
        s.get(Organisation, "org").mode = "observed"
    r = post(
        env,
        "/plans",
        {
            "source_id": "SOURCE",
            "destination_id": "DEST",
            "product_id": "P",
            "quantity": 10,
            "as_of": "2020-01-01",
        },
        "past",
    )
    assert r.status_code == 422


def test_scarce_stock_allocation_keeps_a_shared_budget(env):
    for index, loc in enumerate(["DEST", "OTHER"]):
        assert (
            post(
                env,
                "/requests",
                {
                    "product_id": "P",
                    "destination_id": loc,
                    "quantity": 40,
                    "needed_by": env.today,
                    "reason": "Restock request",
                },
                "request-" + str(index),
            ).status_code
            == 200
        )
    r = env.client.get(
        "/api/v1/planning/allocate",
        params={"source_id": "SOURCE", "product_id": "P", "as_of": env.today},
        headers=env.headers,
    )
    assert r.status_code == 200, r.text
    assert r.json()["proposed_total"] == 50
    assert sum(x["quantity"] for x in r.json()["allocations"]) == 50


def test_distributor_cannot_issue_reserved_units(env):
    p = plan(env, 40)
    approve(env, p)
    r = post(
        env,
        "/inventory/batches/B-SOURCE/issue",
        {"quantity": 20, "reason": "Customer issue", "as_of": env.today},
        "issue",
    )
    assert r.status_code == 409


def test_synthetic_balance_cannot_be_reused_at_a_different_scenario_date(env):
    with transaction(env.app.state.factory) as s:
        s.get(Organisation, "org").scenario_on = date(2026, 11, 1)
    r = post(
        env,
        "/plans",
        {
            "source_id": "SOURCE",
            "destination_id": "DEST",
            "product_id": "P",
            "quantity": 10,
            "as_of": "2026-11-02",
        },
        "mix-dates",
    )
    assert r.status_code == 422
