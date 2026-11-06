"""Paired synthetic lane experiment; immutable shared external randomness."""

import numpy as np

BASELINE_SAFETY_DAYS = 2
FRONTIER_SAFETY_DAYS = (0, 1, 2, 3, 5, 7, 10)


def compare(mean, seed=42, days=90, lead_days=5, proposed_safety_days=10):
    rng = np.random.default_rng(seed)
    demand = rng.poisson(max(mean, 0), days).astype(int)
    delay = rng.integers(lead_days, lead_days + 4, size=days)
    shelf = rng.integers(10, 45, size=days)
    opening = int(mean * 10)

    def replay(safety):
        batches, pipeline = [[opening, 15]], []
        fulfilled, shortage_days, expired, holding, placed = 0, 0, 0, 0, 0
        for day in range(days):
            for arrival, qty, expiry in pipeline:
                if arrival == day:
                    batches.append([qty, expiry])
            pipeline = [x for x in pipeline if x[0] > day]
            for b in batches:
                if b[1] <= day:
                    expired += b[0]
                    b[0] = 0
            need = int(demand[day])
            for b in sorted(batches, key=lambda b: b[1]):
                take = min(need, b[0])
                b[0] -= take
                need -= take
            fulfilled += int(demand[day]) - need
            shortage_days += int(need > 0)
            stock = sum(b[0] for b in batches)
            holding += stock
            if day % 7 == 0:
                qty = max(
                    0, int(np.ceil(mean * (lead_days + 7 + safety) - stock - sum(x[1] for x in pipeline)))
                )
                if qty:
                    arrival = day + int(delay[day])
                    pipeline.append((arrival, qty, arrival + int(shelf[day])))
                    placed += qty
        closing = sum(b[0] for b in batches)
        in_transit = sum(x[1] for x in pipeline)
        assert opening + placed == fulfilled + expired + closing + in_transit
        return {
            "fill_rate_pct": 100 * fulfilled / int(demand.sum()) if demand.sum() else None,
            "shortage_days": shortage_days,
            "unmet_units": int(demand.sum()) - fulfilled,
            "expired_units": expired,
            "average_inventory_units": holding / days,
            "closing_units": closing,
            "in_transit_units": in_transit,
            "conservation_ok": True,
        }

    results = {
        safety: replay(safety)
        for safety in sorted(set(FRONTIER_SAFETY_DAYS) | {proposed_safety_days})
    }
    baseline, proposed = results[BASELINE_SAFETY_DAYS], results[proposed_safety_days]
    # Preserve service, shortage frequency and expiry outcomes when comparing stock.
    comparable = [
        safety for safety, metrics in results.items()
        if metrics["unmet_units"] <= baseline["unmet_units"]
        and metrics["shortage_days"] <= baseline["shortage_days"]
        and metrics["expired_units"] <= baseline["expired_units"]
        and metrics["average_inventory_units"] < baseline["average_inventory_units"]
    ]
    lower_inventory = min(comparable, key=lambda safety: results[safety]["average_inventory_units"]) if comparable else None
    return {
        "evidence_type": "synthetic_policy_simulation",
        "measured_grd_impact": False,
        "baseline": baseline,
        "proposed": proposed,
        "safety_stock_options": [
            {"safety_days": safety, **metrics} for safety, metrics in results.items()
        ],
        "lower_inventory_at_baseline_service_days": lower_inventory,
        "change": {
            k: {
                "absolute": proposed[k] - baseline[k],
                "relative_pct": 100 * (proposed[k] - baseline[k]) / baseline[k] if baseline[k] else None,
            }
            for k in ["shortage_days", "unmet_units", "expired_units", "average_inventory_units"]
        },
        "configuration": {
            "seed": seed,
            "days": days,
            "mean_daily_demand": mean,
            "lead_days": lead_days,
            "baseline_safety_days": BASELINE_SAFETY_DAYS,
            "proposed_safety_days": proposed_safety_days,
        },
        "assumptions": [
            "Every policy uses the same demand, delays, arrival shelf life and opening stock",
            "Synthetic single-lane results assume unbounded external supply",
            "Real excess-stock reduction and costs require a distributor pilot",
        ],
        "service_change_percentage_points": proposed["fill_rate_pct"] - baseline["fill_rate_pct"]
        if demand.sum()
        else None,
    }
