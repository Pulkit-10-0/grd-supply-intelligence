"""Paired synthetic lane experiment; immutable shared external randomness."""

import numpy as np


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

    baseline, proposed = replay(2), replay(proposed_safety_days)
    return {
        "evidence_type": "synthetic_policy_simulation",
        "measured_grd_impact": False,
        "baseline": baseline,
        "proposed": proposed,
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
            "baseline_safety_days": 2,
            "proposed_safety_days": proposed_safety_days,
        },
        "assumptions": [
            "Same demand, calendar-indexed delays, arrival shelf life and opening stock for both policies",
            "Single lane with unbounded external supply; this does not validate multi-site transfer feasibility",
            "No measured transport costs; cost savings not claimed",
        ],
        "service_change_percentage_points": proposed["fill_rate_pct"] - baseline["fill_rate_pct"]
        if demand.sum()
        else None,
    }
