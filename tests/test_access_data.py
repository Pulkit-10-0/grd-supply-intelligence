import json
from datetime import date

from sqlalchemy import select

from grd.db import transaction
from grd.models import Organisation, Location, Demand
from conftest import post, plan


def test_scope_is_enforced_on_reads_commands_and_assistant(env):
    assert (
        env.client.get(
            "/api/v1/inventory/batches", params={"location_id": "SOURCE"}, headers=env.operator
        ).status_code
        == 403
    )
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
            headers=env.operator,
        ).status_code
        == 403
    )
    p = plan(env, 10, "OTHER")
    assert (
        post(
            env,
            "/assistant",
            {"mode": "operations", "reference_id": p["id"], "question": "Explain plan", "as_of": env.today},
            headers=env.operator,
        ).status_code
        == 403
    )
    rows = env.client.get(
        "/api/v1/network", params={"product_id": "P", "as_of": env.today}, headers=env.operator
    ).json()["table"]
    assert [x["location_id"] for x in rows] == ["DEST"]


def test_foreign_org_identifier_cannot_be_used(env):
    with transaction(env.app.state.factory) as s:
        s.add(Organisation(id="foreign", name="Other org"))
        s.flush()
        s.add(
            Location(
                id="SECRET",
                org_id="foreign",
                name="Private",
                kind="warehouse",
                district="Private",
                coordinate_source="private",
            )
        )
    assert (
        post(
            env,
            "/routes",
            {
                "origin_id": "SECRET",
                "destination_id": "DEST",
                "lead_days": 1,
                "lead_days_upper": 2,
                "policy_source": "test route",
            },
        ).status_code
        == 404
    )


def test_policy_assistant_only_quotes_approved_effective_passages(env):
    p = post(
        env,
        "/policies",
        {
            "title": "Shelf life policy",
            "version": "1",
            "effective_on": "2026-01-01",
            "text": "Minimum shelf life at arrival is seven days.",
            "location_ids": ["DEST"],
        },
    ).json()
    q = {"mode": "policy", "question": "Minimum shelf life", "as_of": env.today}
    assert post(env, "/assistant", q, headers=env.operator).json()["citations"] == []
    assert post(env, "/policies/" + p["id"] + "/approve", {}).status_code == 200
    r = post(env, "/assistant", q, headers=env.operator).json()
    assert r["citations"][0]["version"] == "1"
    assert "seven days" in r["citations"][0]["quote"]


def test_import_dry_run_atomic_replay_and_no_double_count(env):
    meta = {
        "name": "Source",
        "source_url": "test",
        "licence": "synthetic",
        "geography": "Assam demo",
        "evidence_type": "synthetic",
        "units": "tablet",
        "limitations": ["fixture"],
    }

    def upload(raw, dry):
        return env.client.post(
            "/api/v1/imports/demand",
            headers=env.headers,
            data={"metadata": json.dumps(meta), "dry_run": str(dry).lower()},
            files={"file": ("demand.csv", raw, "text/csv")},
        )

    valid = b"date,product_id,location_id,quantity,measure\n2026-09-01,P,DEST,12,requested\n"
    assert upload(valid, True).json()["committed"] is False
    r = upload(valid, False)
    assert r.status_code == 200, r.text
    assert r.json()["source_total"] == 12
    assert upload(valid, False).json()["duplicate"] is True
    invalid = b"date,product_id,location_id,quantity,measure\n2026-09-02,P,DEST,10,requested\n2026-09-03,P,DEST,-1,requested\n"
    result = upload(invalid, False).json()
    assert result["committed"] is False and result["invalid_rows"] == 1
    with transaction(env.app.state.factory) as s:
        assert not s.scalar(select(Demand).where(Demand.date == date(2026, 9, 2)))


def test_logout_revokes_token(env):
    assert env.client.post("/api/v1/auth/logout", headers=env.operator).status_code == 200
    assert env.client.get("/api/v1/me", headers=env.operator).status_code == 401
