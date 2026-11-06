"""Fixed-origin, recursive multi-horizon evaluation; no held-out actuals as future lags."""

from datetime import timedelta
import math

import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingRegressor

VERSION = "weekly-rolling-v2"
MIN_TRAIN = 12
MIN_SELECTION = 12
MIN_CALIBRATION = 12
NOMINAL_COVERAGE = 0.9


def features(hist, week):
    return [
        hist[-1],
        hist[-2],
        hist[-4],
        hist[-52],
        np.mean(hist[-4:]),
        np.mean(hist[-13:]),
        math.sin(2 * math.pi * week / 52),
        math.cos(2 * math.pi * week / 52),
    ]


def croston(values):
    size, interval, gap = 0.0, 1.0, 1
    for value in values:
        if value > 0:
            size = value if size == 0 else size + 0.1 * (value - size)
            interval += 0.1 * (gap - interval)
            gap = 1
        else:
            gap += 1
    return 0.95 * size / interval


def predict(values, ends, horizon, method):
    hist = list(map(float, values))
    model = None
    if method == "ml":
        x = [features(hist[:i], ends[i].isocalendar().week) for i in range(52, len(hist))]
        model = HistGradientBoostingRegressor(
            loss="poisson" if sum(hist[52:]) > 0 else "squared_error",
            max_iter=80,
            max_depth=3,
            min_samples_leaf=5,
            random_state=42,
        )
        model.fit(x, hist[52:])
    output = []
    for h in range(1, horizon + 1):
        end = ends[-1] + timedelta(weeks=h)
        if method == "ml":
            value = float(model.predict([features(hist, end.isocalendar().week)])[0])
        elif method == "seasonal":
            value = hist[-52]
        elif method == "croston":
            value = croston(hist)
        elif method == "naive":
            value = hist[-1]
        else:
            value = float(np.mean(hist[-4:]))
        value = max(0.0, value)
        output.append(value)
        hist.append(value)
    return output


def metric(actual, predicted):
    a, p = np.asarray(actual), np.asarray(predicted)
    total = float(a.sum())
    return {
        "wape_pct": float(100 * np.abs(a - p).sum() / total) if total else None,
        "bias_pct": float(100 * (p.sum() - total) / total) if total else None,
        "mae": float(np.abs(a - p).mean()),
        "observations": len(a),
    }


def evaluation_windows(n, max_h):
    # Keep all target dates disjoint, including the longest horizon.
    separation = 3 * (max_h - 1)
    if n >= 65 + 24 + 24 + 52 + separation:
        selection, calibration, test = 24, 24, 52
    else:
        test = 26
        available = n - test - separation
        train = next(
            (m for m in (65, 52, MIN_TRAIN) if available >= m + MIN_SELECTION + MIN_CALIBRATION),
            None,
        )
        if train is None:
            return {}
        selection = calibration = min(24, (available - train) // 2)
    windows = {}
    last = n - max_h
    for name, count in (("test", test), ("calibration", calibration), ("validation", selection)):
        first = last - count + 1
        windows[name] = range(first, last + 1)
        last = first - max_h
    return windows


def evaluate(values, ends, horizons, windows):
    methods = ["naive", "recent4", "croston"]
    first = windows["validation"].start
    if first >= 52:
        methods.append("seasonal")
    if first >= 65 and values[:first].sum() > 0:
        methods.append("ml")
    max_h = max(horizons)
    offsets = np.array(horizons) - 1

    def replay(origins, method):
        actual = values[np.array(origins)[:, None] + offsets]
        predicted = np.array([
            predict(values[:origin], ends[:origin], max_h, method) for origin in origins
        ])[:, offsets]
        return actual, predicted

    validation, validation_mae, widths, tests = {}, {}, {}, {str(h): {} for h in horizons}
    for method in methods:
        a, p = replay(windows["validation"], method)
        validation_mae[method] = metric(a.ravel(), p.ravel())["mae"]
        validation[method] = {str(h): metric(a[:, i], p[:, i]) for i, h in enumerate(horizons)}
        a, p = replay(windows["calibration"], method)
        # Finite-sample order statistic from a separate calibration window.
        rank = math.ceil((len(a) + 1) * NOMINAL_COVERAGE)
        widths[method] = np.sort(np.abs(a - p), axis=0)[rank - 1]
        a, p = replay(windows["test"], method)
        for i, h in enumerate(horizons):
            width = float(widths[method][i])
            tests[str(h)][method] = {
                **metric(a[:, i], p[:, i]),
                "interval_coverage": float(np.mean(np.abs(a[:, i] - p[:, i]) <= width)),
                "interval_half_width": width,
            }
    baseline = min((m for m in methods if m != "ml"), key=validation_mae.get)
    selected = "ml" if validation_mae.get("ml", math.inf) < validation_mae[baseline] else baseline
    return selected, baseline, validation, validation_mae, widths[selected], tests


def forecast(observations, as_of, horizons=(1, 2, 4)):
    if not observations:
        return {"status": "insufficient_history", "reason": "No observations; missing is not zero"}
    df = pd.DataFrame(observations)
    df["date"] = pd.to_datetime(df["date"])
    df = df[df.date.dt.date <= as_of].sort_values("date")
    if df.empty:
        return {"status": "insufficient_history", "reason": "No observations before cutoff"}
    # Missing days are unknown; only fully observed Monday-Sunday weeks enter training.
    weekly = df.groupby(pd.Grouper(key="date", freq="W-SUN")).agg(
        quantity=("quantity", "sum"), days=("date", "nunique")
    )
    weekly = weekly[(weekly.days == 7) & (weekly.index.date <= as_of)]
    if len(weekly) < 12:
        return {
            "status": "insufficient_history",
            "observed_complete_weeks": len(weekly),
            "reason": "Need at least 12 complete weeks; no gaps filled silently",
        }
    ends = [x.date() for x in weekly.index]
    if any((b - a).days != 7 for a, b in zip(ends, ends[1:])):
        return {
            "status": "insufficient_history",
            "reason": "Missing weeks; repair coverage before forecasting",
        }
    if (as_of - ends[-1]).days > 7:
        return {
            "status": "stale",
            "reason": "Last complete observation week is stale",
            "last_week": str(ends[-1]),
        }
    values = weekly.quantity.to_numpy(dtype=float)
    horizons = sorted(set(horizons))
    max_h = max(horizons)
    windows = evaluation_windows(len(values), max_h)
    # Evaluate intervening weeks too, so the operational chart has a continuous range.
    all_horizons = tuple(range(1, max_h + 1))
    selected, baseline, validations, validation_mae, widths, tests = (
        evaluate(values, ends, all_horizons, windows)
        if windows
        else ("recent4", "recent4", {}, {}, [None] * max_h, {})
    )
    future = predict(values, ends, max_h, selected)
    operational = [
        {
            "weeks_ahead": h,
            "week_ending": str(ends[-1] + timedelta(weeks=h)),
            "quantity": round(pred, 3),
            "lower": min(round(pred, 3), max(0.0, float(pred - width))) if width is not None else None,
            "upper": max(round(pred, 3), float(pred + width)) if width is not None else None,
        }
        for h, (pred, width) in enumerate(zip(future, widths), 1)
    ]
    evidence = {
        name: {
            "origins": len(origins),
            "first_target_week_ending": str(ends[origins.start]),
            "last_target_week_ending": str(ends[origins.stop + max_h - 2]),
        }
        for name, origins in windows.items()
    }
    return {
        "status": "ready",
        "model_version": VERSION,
        "selected_model": selected,
        "selection": (
            "Lowest validation MAE. ML must beat the strongest baseline on validation."
            if windows else "Short-history recent4 fallback. At least 26 test origins are required."
        ),
        "validation_baseline": baseline,
        "as_of": str(as_of),
        "last_complete_week": str(ends[-1]),
        "complete_weeks": len(values),
        "history": [
            {"date": str(end), "actual": float(value)}
            for end, value in zip(ends[-14:], values[-14:])
        ],
        "forecast": [operational[h - 1] for h in horizons],
        "operational_forecast": operational,
        "test_metrics_by_horizon": {str(h): tests[str(h)] for h in horizons} if windows else {},
        "validation_metrics": {
            m: {str(h): v[str(h)] for h in horizons}
            for m, v in validations.items()
        },
        "validation_mae": validation_mae,
        "evaluation_windows": evidence,
        "validation_last_target": evidence.get("validation", {}).get("last_target_week_ending"),
        "test_first_target": evidence.get("test", {}).get("first_target_week_ending"),
        "interval_note": "90% nominal range fitted on separate rolling calibration windows. Use held-out coverage to check it.",
        "seasonal_signal_comparison": "Seasonal baseline compared where history permits; local weather/outbreak signals unavailable, not claimed",
        "units": "product base units per week",
        "seed": 42,
    }
