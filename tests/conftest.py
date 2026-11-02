from datetime import date, timedelta
import os
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from grd.api import create_app
from grd.db import transaction
from grd.models import Base, Organisation, User, Product, Location, Route, Batch, Movement, Demand
from grd.security import passwords, token


@pytest.fixture
def env(tmp_path, monkeypatch):
    monkeypatch.setenv("GRD_TOKEN_SECRET", "testing-secret-not-valid-for-deployment-123456789")
    url = os.getenv("GRD_TEST_DATABASE_URL", "sqlite:///" + str(tmp_path / "test.db"))
    if url.startswith("postgresql") and not url.endswith("/grd_test"):
        raise ValueError("PostgreSQL tests may only use a dedicated database named grd_test")
    app = create_app(url)
    if url.startswith("postgresql"):
        Base.metadata.drop_all(app.state.engine)
    Base.metadata.create_all(app.state.engine)
    today = date(2026, 11, 1)
    with transaction(app.state.factory) as s:
        org = Organisation(id="org", name="Test", mode="synthetic")
        s.add(org)
        s.flush()
        admin = User(
            id="admin",
            org_id=org.id,
            email="admin@example.test",
            password_hash=passwords.hash("test-password-123"),
            role="admin",
            location_ids=[],
        )
        operator = User(
            id="operator",
            org_id=org.id,
            email="operator@example.test",
            password_hash=passwords.hash("test-password-123"),
            role="operator",
            location_ids=["DEST"],
        )
        s.add_all([admin, operator])
        s.flush()
        for ident, kind in [
            ("SOURCE", "warehouse"),
            ("DEST", "distributor"),
            ("OTHER", "distributor"),
            ("EMPTY", "distributor"),
        ]:
            s.add(
                Location(
                    id=ident,
                    org_id=org.id,
                    name=ident,
                    kind=kind,
                    district="Assam",
                    latitude=26,
                    longitude=92,
                    coordinate_source="test synthetic",
                )
            )
        p = Product(
            id="P",
            org_id=org.id,
            name="Demo product",
            base_unit="tablet",
            pack_size=10,
            provenance={"evidence_type": "synthetic"},
            unit_cost_paise=100,
            transfer_allowed=True,
        )
        s.add(p)
        s.flush()
        for dest in ["DEST", "OTHER", "EMPTY"]:
            s.add(
                Route(
                    id="R-" + dest,
                    org_id=org.id,
                    origin_id="SOURCE",
                    destination_id=dest,
                    lead_days=1,
                    lead_days_upper=2,
                    min_shelf_days=7,
                    safety_days=2,
                    min_order=1,
                    cost_paise=100,
                    permitted=True,
                    policy_source="test",
                )
            )
        for loc, qty in [("SOURCE", 50), ("DEST", 0)]:
            b = Batch(
                id="B-" + loc,
                org_id=org.id,
                location_id=loc,
                product_id="P",
                code="LOT",
                expiry=today + timedelta(days=100),
                quantity=qty,
                reserved=0,
                status="usable",
            )
            s.add(b)
            s.flush()
            s.add(
                Movement(
                    org_id=org.id,
                    batch_id=b.id,
                    delta=qty,
                    reason="opening",
                    reference="seed",
                    actor_id=admin.id,
                )
            )
        for i in range(28):
            for loc in ["SOURCE", "DEST", "OTHER", "EMPTY"]:
                s.add(
                    Demand(
                        org_id=org.id,
                        date=today - timedelta(days=i),
                        product_id="P",
                        location_id=loc,
                        quantity=0 if loc == "SOURCE" else 10,
                        measure="requested",
                        dataset_id="fixture",
                    )
                )
        headers = {"Authorization": "Bearer " + token(admin)}
        operator_headers = {"Authorization": "Bearer " + token(operator)}
    with TestClient(app) as client:
        yield SimpleNamespace(
            app=app, client=client, headers=headers, operator=operator_headers, today=str(today)
        )


def post(env, path, data, key="event", headers=None):
    return env.client.post(
        "/api/v1" + path, json=data, headers={**(headers or env.headers), "Idempotency-Key": key}
    )


def plan(env, quantity=40, dest="DEST", key="plan"):
    r = post(
        env,
        "/plans",
        {
            "source_id": "SOURCE",
            "destination_id": dest,
            "product_id": "P",
            "quantity": quantity,
            "as_of": env.today,
        },
        key,
    )
    assert r.status_code == 200, r.text
    return r.json()


def approve(env, p, key="approve"):
    r = post(env, "/plans/" + p["id"] + "/approve", {"version": p["version"], "as_of": env.today}, key)
    assert r.status_code == 200, r.text
    return r.json()
