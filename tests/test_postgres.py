import os
import pytest
from concurrent.futures import ThreadPoolExecutor
from conftest import plan, post
from grd.models import Batch
from grd.db import transaction


@pytest.mark.skipif(
    not os.getenv("GRD_TEST_DATABASE_URL"), reason="Dedicated PostgreSQL test database not configured"
)
def test_postgres_serializes_competing_approvals(env):
    p = plan(env, 30, key="pg-a")
    q = plan(env, 30, "OTHER", "pg-b")

    def approve(item):
        return post(
            env, "/plans/" + item["id"] + "/approve", {"version": 1, "as_of": env.today}, item["id"]
        ).status_code

    with ThreadPoolExecutor(max_workers=2) as pool:
        assert sorted(pool.map(approve, [p, q])) == [200, 409]
    with transaction(env.app.state.factory) as s:
        b = s.get(Batch, "B-SOURCE")
        assert b.reserved == 30 and b.quantity == 50
