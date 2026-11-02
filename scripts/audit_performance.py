"""Bounded, disposable SQLite read-load audit; never reads the team's database."""

from concurrent.futures import ThreadPoolExecutor
from datetime import date, timedelta
import json
import os
from pathlib import Path
import secrets
from statistics import median
from tempfile import TemporaryDirectory
from threading import Barrier
from time import perf_counter

from fastapi.testclient import TestClient
from sqlalchemy import insert

from grd.api import create_app
from grd.db import transaction
from grd.models import Base, Organisation, User, Product, Location, Batch, Movement, Demand
from grd.security import passwords, token


def main():
    os.environ.setdefault("GRD_TOKEN_SECRET", secrets.token_urlsafe(40))
    products, sites, days, sessions = 100, 5, 730, 10
    as_of = date(2026, 11, 1)
    with TemporaryDirectory(prefix="grd-read-audit-") as directory:
        app = create_app("sqlite:///" + str(Path(directory) / "audit.db"))
        Base.metadata.create_all(app.state.engine)
        with transaction(app.state.factory) as s:
            s.add(
                Organisation(id="audit", name="Disposable load fixture", mode="synthetic", scenario_on=as_of)
            )
            s.flush()
            user = User(
                id="audit-user",
                org_id="audit",
                email="load@example.test",
                role="admin",
                location_ids=[],
                password_hash=passwords.hash("synthetic-audit-password"),
            )
            s.add(user)
            s.flush()
            auth = {"Authorization": "Bearer " + token(user)}
            s.execute(
                insert(Product),
                [
                    {
                        "id": f"P{p}",
                        "org_id": "audit",
                        "name": f"Synthetic medicine {p}",
                        "base_unit": "tablet",
                        "pack_size": 10,
                        "provenance": {"evidence_type": "synthetic"},
                    }
                    for p in range(products)
                ],
            )
            s.execute(
                insert(Location),
                [
                    {
                        "id": f"L{n}",
                        "org_id": "audit",
                        "name": f"Synthetic site {n}",
                        "kind": "warehouse" if n == 0 else "distributor",
                        "district": "Synthetic Assam",
                        "coordinate_source": "Load fixture; not a real facility",
                    }
                    for n in range(sites)
                ],
            )
            s.execute(
                insert(Batch),
                [
                    {
                        "id": f"B{p}-{n}",
                        "org_id": "audit",
                        "product_id": f"P{p}",
                        "location_id": f"L{n}",
                        "code": f"LOT-{p}-{n}",
                        "expiry": as_of + timedelta(days=180),
                        "quantity": 500,
                        "reserved": 0,
                        "status": "usable",
                    }
                    for p in range(products)
                    for n in range(sites)
                ],
            )
            s.execute(
                insert(Movement),
                [
                    {
                        "org_id": "audit",
                        "batch_id": f"B{p}-{n}",
                        "delta": 500,
                        "reason": "opening",
                        "reference": "synthetic-benchmark",
                        "actor_id": "audit-user",
                    }
                    for p in range(products)
                    for n in range(sites)
                ],
            )
            for p in range(products):
                s.execute(
                    insert(Demand),
                    [
                        {
                            "org_id": "audit",
                            "product_id": f"P{p}",
                            "location_id": f"L{n}",
                            "date": as_of - timedelta(days=d),
                            "quantity": 10 + p % 3,
                            "measure": "requested",
                            "dataset_id": "synthetic-load-fixture",
                        }
                        for n in range(sites)
                        for d in range(days)
                    ],
                )
        endpoints = {
            "network": f"/api/v1/network?product_id=P0&as_of={as_of}",
            "reconciliation": "/api/v1/inventory/reconciliation",
            "demand_page": "/api/v1/demand?product_id=P0&location_id=L1&limit=200",
        }
        report = {
            "engine": "SQLite; in-process HTTP; not hosting certification",
            "products": products,
            "locations": sites,
            "history_days": days,
            "demand_rows": products * sites * days,
            "concurrent_sessions": sessions,
        }
        with TestClient(app) as client:

            def measure(url):
                gate = Barrier(sessions)

                def fetch(_):
                    gate.wait()
                    start = perf_counter()
                    response = client.get(url, headers=auth)
                    elapsed = 1000 * (perf_counter() - start)
                    assert response.status_code == 200, response.text
                    return elapsed

                with ThreadPoolExecutor(max_workers=sessions) as pool:
                    times = sorted(pool.map(fetch, range(sessions)))
                return {
                    "median_ms": round(median(times), 1),
                    "p95_ms": round(times[-1], 1),
                    "samples": sessions,
                }

            # Both index variants are exercised only inside this disposable database.
            with app.state.engine.begin() as c:
                c.exec_driver_sql("DROP INDEX IF EXISTS ix_demand_series_date")
            report["before_series_index"] = {name: measure(url) for name, url in endpoints.items()}
            with app.state.engine.begin() as c:
                c.exec_driver_sql(
                    "CREATE INDEX ix_demand_series_date ON demand (org_id, product_id, location_id, measure, date)"
                )
            report["with_series_index"] = {name: measure(url) for name, url in endpoints.items()}
        output = Path("data/audit-performance.json")
        output.parent.mkdir(exist_ok=True)
        output.write_text(json.dumps(report, indent=2) + "\n")
        print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
