"""Reproduce the extended NESFIC forecast benchmark without touching the live ledger."""

import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
import pandas as pd
import sklearn

from grd.benchmark import ASSETS, CATEGORIES
from grd.forecasting import VERSION, metric, predict
from grd.simulation import compare

HORIZONS = (1, 2, 4)
METHODS = ("naive", "recent4", "croston", "seasonal", "ml")
ORIGIN_COUNTS = {"validation": 24, "calibration": 24, "test": 52}
NOMINAL_COVERAGE = 0.90


def evaluate(weekly, windows):
    ends = weekly.index.date
    values = weekly.to_numpy()
    horizon_offsets = np.array(HORIZONS) - 1

    def score_window(origins, method):
        actual = values[np.array(origins)[:, None] + horizon_offsets]
        forecasts = [
            predict(values[:origin], ends[:origin], max(HORIZONS), method)
            for origin in origins
        ]
        return actual, np.array(forecasts)[:, horizon_offsets]

    validation = {}
    for method in METHODS:
        actual, estimates = score_window(windows["validation"], method)
        validation[method] = metric(actual.ravel(), estimates.ravel())["mae"]
    selected = min(validation, key=validation.get)

    metrics = {str(horizon): {} for horizon in HORIZONS}
    for method in METHODS:
        actual, estimates = score_window(windows["calibration"], method)
        residuals = np.abs(actual - estimates)
        # Use an order statistic of the calibration residuals. Coverage is
        # empirical: rolling origins are dependent and drift may occur.
        rank = int(np.ceil((len(residuals) + 1) * NOMINAL_COVERAGE))
        half_widths = np.sort(residuals, axis=0)[rank - 1]
        actual, estimates = score_window(windows["test"], method)
        for index, horizon in enumerate(HORIZONS):
            a, p = actual[:, index], estimates[:, index]
            width = half_widths[index]
            metrics[str(horizon)][method] = {
                **metric(a, p),
                "interval_coverage_pct": float(100 * (np.abs(a - p) <= width).mean()),
                "interval_half_width": float(width),
            }

    return {"selected": selected, "validation_mae": validation, "test": metrics}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    source = ASSETS / "pharma-salesdaily.csv"
    daily = pd.read_csv(source, usecols=["datum", *CATEGORIES])
    dates = pd.to_datetime(daily.pop("datum"), format="%m/%d/%Y")
    daily.index = dates
    if not dates.is_unique or not np.isfinite(daily.to_numpy()).all() or (daily < 0).any().any():
        raise ValueError("Benchmark must contain unique dates and finite nonnegative values")
    grouped = daily.resample("W-SUN")
    weekly = grouped.sum().loc[grouped.size() == 7]
    if not weekly.index.to_series().diff().dropna().eq(pd.Timedelta(weeks=1)).all():
        raise ValueError("Missing weeks between benchmark observations")

    windows = {}
    last = len(weekly) - max(HORIZONS)
    for name, count in reversed(ORIGIN_COUNTS.items()):
        first = last - count + 1
        windows[name] = list(range(first, last + 1))
        # The last target in a preceding window must precede the first
        # target in the next window, including the four-week lead.
        last = first - max(HORIZONS)
    if windows["validation"][0] < 90:
        raise ValueError("Insufficient complete weeks to evaluate all five methods")

    report = {
        "evidence_type": "observed_public_pharmacy_categories",
        "sha256": hashlib.sha256(source.read_bytes()).hexdigest(),
        "algorithm": VERSION,
        "runtime": {"numpy": np.__version__, "pandas": pd.__version__, "scikit-learn": sklearn.__version__},
        "complete_weeks": len(weekly),
        "nominal_interval_coverage_pct": 100 * NOMINAL_COVERAGE,
        "windows": {
            name: {
                "origins": len(origins),
                "first_target_week_ending": weekly.index[origins[0]].date().isoformat(),
                "last_target_week_ending": weekly.index[origins[-1] + max(HORIZONS) - 1].date().isoformat(),
            }
            for name, origins in windows.items()
        },
        "categories": {},
        "synthetic_policy_example": compare(mean=10),
    }
    for category in CATEGORIES:
        report["categories"][category] = evaluate(weekly[category], windows)
        print(f"Evaluated {category}", flush=True)
    args.output.write_text(json.dumps(report, indent=2, allow_nan=False) + "\n")


if __name__ == "__main__":
    main()
