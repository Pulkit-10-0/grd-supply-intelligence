"""Fixed-origin, recursive multi-horizon evaluation; no held-out actuals as future lags."""

from datetime import timedelta
import math

import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingRegressor

VERSION = "weekly-recursive-v1"


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
    methods = ["naive", "recent4", "croston"]
    if len(values) >= 90:
        methods += ["seasonal"]
        if values.sum() > 0:
            methods += ["ml"]
    # Final test targets start strictly after every validation target ends.
    test_first = len(values) - max_h - 3
    val_last = test_first - max_h
    val_origins = list(range(max(8, val_last - 3), val_last + 1))
    test_origins = list(range(test_first, len(values) - max_h + 1))
    if "ml" in methods and (not val_origins or min(val_origins) < 65):
        methods.remove("ml")
    if "seasonal" in methods and (not val_origins or min(val_origins) < 52):
        methods.remove("seasonal")
    evaluation = len(val_origins) >= 4 and test_first >= 12

    def evaluate(method, origins):
        result = {h: {"actual": [], "predicted": [], "errors": []} for h in horizons}
        for origin in origins:
            predictions = predict(values[:origin], ends[:origin], max_h, method)
            for h in horizons:
                actual, pred = float(values[origin + h - 1]), predictions[h - 1]
                result[h]["actual"].append(actual)
                result[h]["predicted"].append(pred)
                result[h]["errors"].append(abs(actual - pred))
        return result

    validations = {m: evaluate(m, val_origins) for m in methods} if evaluation else {}

    def score(m):
        a = sum((v["actual"] for v in validations[m].values()), [])
        p = sum((v["predicted"] for v in validations[m].values()), [])
        return metric(a, p)["mae"]

    selected = min(methods, key=score) if evaluation else "recent4"
    tests = {m: evaluate(m, test_origins) for m in methods} if evaluation else {}
    future = predict(values, ends, max_h, selected)
    output, results = [], {}
    for h in horizons:
        q = None
        if evaluation:
            errors = validations[selected][h]["errors"]
            quantile = min(1.0, math.ceil((len(errors) + 1) * 0.9) / len(errors))
            q = float(np.quantile(errors, quantile, method="higher"))
        pred = future[h - 1]
        output.append(
            {
                "weeks_ahead": h,
                "week_ending": str(ends[-1] + timedelta(weeks=h)),
                "quantity": round(pred, 3),
                "lower": max(0.0, pred - q) if q is not None else None,
                "upper": pred + q if q is not None else None,
            }
        )
        if evaluation:
            results[str(h)] = {m: metric(t[h]["actual"], t[h]["predicted"]) for m, t in tests.items()}
            results[str(h)][selected]["interval_coverage"] = float(
                np.mean(np.asarray(tests[selected][h]["errors"]) <= q)
            )
    return {
        "status": "ready",
        "model_version": VERSION,
        "selected_model": selected,
        "selection": "validation MAE; final test not used for selection"
        if evaluation
        else "short-history recent4 fallback",
        "as_of": str(as_of),
        "last_complete_week": str(ends[-1]),
        "complete_weeks": len(values),
        "forecast": output,
        "operational_forecast": [
            {"weeks_ahead": h, "week_ending": str(ends[-1] + timedelta(weeks=h)), "quantity": round(value, 3)}
            for h, value in enumerate(future, 1)
        ],
        "test_metrics_by_horizon": results,
        "validation_metrics": {
            m: {str(h): metric(x["actual"], x["predicted"]) for h, x in v.items()}
            for m, v in validations.items()
        },
        "validation_last_target": str(ends[max(val_origins) + max_h - 1]) if evaluation else None,
        "test_first_target": str(ends[test_first]) if evaluation else None,
        "interval_note": "90% nominal empirical residual interval; small overlapping calibration sample, inspect test coverage; no guarantee",
        "seasonal_signal_comparison": "Seasonal baseline compared where history permits; local weather/outbreak signals unavailable, not claimed",
        "units": "product base units per week",
        "seed": 42,
    }
