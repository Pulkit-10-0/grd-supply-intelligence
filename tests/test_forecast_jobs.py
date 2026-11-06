from datetime import date, timedelta

import numpy as np

from grd.forecasting import forecast
from grd.simulation import compare
from grd.worker import run_once
from conftest import post


def test_forecast_uses_separate_validation_and_final_test_targets():
    rng = np.random.default_rng(42)
    start = date(2024, 1, 1)
    rows = [{"date": str(start + timedelta(days=i)), "quantity": int(rng.poisson(8))} for i in range(735)]
    r = forecast(rows, start + timedelta(days=734), [1, 2, 4])
    assert r["status"] == "ready"
    assert r["validation_last_target"] < r["test_first_target"]
    assert set(r["test_metrics_by_horizon"]) == {"1", "2", "4"}
    windows = r["evaluation_windows"]
    assert windows["validation"]["last_target_week_ending"] < windows["calibration"]["first_target_week_ending"]
    assert windows["calibration"]["last_target_week_ending"] < windows["test"]["first_target_week_ending"]
    assert windows["test"]["origins"] == 26
    assert r["history"][-1]["date"] == r["last_complete_week"]
    assert all(p["lower"] is not None for p in r["operational_forecast"])
    for x in r["forecast"]:
        assert 0 <= x["lower"] <= x["quantity"] <= x["upper"]
    assert (
        forecast(rows + [{"date": "2030-01-01", "quantity": 999999}], start + timedelta(days=734), [1, 2, 4])
        == r
    )


def test_insufficient_history_is_not_a_zero_forecast():
    assert forecast([], date(2026, 11, 1))["status"] == "insufficient_history"


def test_paired_simulation_is_reproducible_and_conserves_stock():
    a = compare(12)
    b = compare(12)
    assert a == b
    assert a["baseline"]["conservation_ok"] and a["proposed"]["conservation_ok"]
    assert a["measured_grd_impact"] is False
    assert a["evidence_type"] == "synthetic_policy_simulation"
    assert [point["safety_days"] for point in a["safety_stock_options"]] == [0, 1, 2, 3, 5, 7, 10]
    assert all(point["conservation_ok"] for point in a["safety_stock_options"])


def test_jobs_persist_and_finish_with_explicit_missing_history(env):
    r = post(env, "/jobs/forecast", {"product_id": "P", "location_id": "DEST", "as_of": env.today}, "job")
    assert r.status_code == 202, r.text
    j = r.json()
    assert j["status"] == "queued"
    assert run_once(env.app.state.factory)
    done = env.client.get("/api/v1/jobs/" + j["id"], headers=env.headers).json()
    assert done["status"] == "completed" and done["result"]["status"] == "insufficient_history"


def test_job_cancellation_cannot_modify_inventory(env):
    r = post(env, "/jobs/simulation", {"product_id": "P", "location_id": "DEST", "as_of": env.today}, "sim")
    assert r.status_code == 202
    assert post(env, "/jobs/" + r.json()["id"] + "/cancel", {}).status_code == 200
    assert run_once(env.app.state.factory) is False
    assert env.client.get("/api/v1/inventory/reconciliation", headers=env.headers).json()["ok"]
