"""Compatibility adapters for the team's CSV experiments; operational APIs live separately."""

import json
import math
import os
from pathlib import Path
import runpy

import pandas as pd

from .forecasting import forecast


def run(source, output, as_of):
    source, output = Path(source).resolve(), Path(output).resolve()
    output.mkdir(parents=True, exist_ok=True)
    data = pd.read_csv(source)
    cols = ["M01AB", "M01AE", "N02BA", "N02BE", "N05B", "N05C", "R03", "R06"]
    data["datum"] = pd.to_datetime(data["datum"], format="mixed", errors="raise")
    if data.datum.duplicated().any() or (data[cols] < 0).any().any():
        raise ValueError("Duplicate date or negative sales")
    data["all_zero_sales"] = data[cols].eq(0).all(axis=1)
    data = data.rename(columns={"datum": "date"}).sort_values("date")
    data.to_csv(output / "salesdaily_cleaned.csv", index=False)
    original = Path.cwd()
    os.environ["GRD_AS_OF"] = as_of
    root = Path(__file__).resolve().parents[1]
    try:
        os.chdir(output)
        for script in [
            "02_build_demand.py",
            "03_build_network.py",
            "04_simulate.py",
            "05_forecast.py",
            "06_projection.py",
            "07_recommend.py",
            "08_transfer.py",
        ]:
            runpy.run_path(str(root / script), run_name="__main__")
    finally:
        os.chdir(original)


def forecast_csv():
    logs = pd.read_csv("daily_log.csv", parse_dates=["date"])
    as_of = logs.date.max().date()
    results = []
    future = []
    for (sku, loc), g in logs.groupby(["sku_id", "location_id"]):
        rows = [{"date": str(x.date.date()), "quantity": x.requested_qty} for x in g.itertuples()]
        result = forecast(rows, as_of, [1, 2, 3, 4])
        results.append({"sku_id": sku, "location_id": loc, **result})
        for item in result.get("forecast", []):
            future.append({"sku_id": sku, "location_id": loc, **item})
    Path("forecast_evaluation.json").write_text(json.dumps(results, indent=2))
    pd.DataFrame(future).to_csv("future_forecast.csv", index=False)
    print("Saved horizon-specific forecast evaluation and intervals; operational network is synthetic")


def projection_csv():
    today = pd.Timestamp(os.getenv("GRD_AS_OF", "2019-09-05"))
    horizon = 21
    batch = pd.read_csv("inventory_batches.csv", parse_dates=["snapshot_date", "expiry_date"])
    demand = pd.read_csv("daily_log.csv", parse_dates=["date"])
    ships = pd.read_csv("shipments.csv", parse_dates=["dispatch_date", "expected_arrival", "actual_arrival"])
    snap = batch.loc[batch.snapshot_date <= today, "snapshot_date"].max()
    if pd.isna(snap):
        raise ValueError("No stock snapshot at or before cutoff")
    if snap != today:
        raise ValueError(
            "Scenario requires a reconciled snapshot on the exact as-of date; stale snapshots cannot silently become current"
        )
    batch = batch[batch.snapshot_date == snap]
    routes = pd.read_csv("supply_routes.csv").query("route_type == 'replenishment'").set_index("destination")
    products = pd.read_csv("products.csv").set_index("sku_id")
    result = []
    for (loc, sku), history in demand[demand.date <= today].groupby(["location_id", "sku_id"]):
        observation = [
            {"date": str(x.date.date()), "quantity": x.requested_qty} for x in history.itertuples()
        ]
        prediction = forecast(observation, today.date(), [1])
        if prediction["status"] != "ready":
            raise ValueError(f"Missing forecast for {loc}/{sku}: {prediction['status']}")
        rate = prediction["forecast"][0]["quantity"] / 7
        g = batch[(batch.location_id == loc) & (batch.sku_id == sku)]
        stock = [[x.available_qty, x.expiry_date] for x in g.itertuples()]
        on_hand = sum(x[0] for x in stock)
        incoming = ships[
            (ships.destination == loc)
            & (ships.sku_id == sku)
            & (ships.dispatch_date <= today)
            & (ships.actual_arrival > today)
        ]
        arrivals = []
        for shipment in incoming.itertuples():
            rt = routes.loc[loc]
            lead = (
                rt.lead_days_monsoon if shipment.dispatch_date.month in [6, 7, 8, 9] else rt.lead_days_normal
            )
            arrivals.append(
                (
                    max(shipment.dispatch_date + pd.Timedelta(days=int(lead)), today + pd.Timedelta(days=1)),
                    shipment.qty,
                )
            )
        shortage = None
        for n in range(1, horizon + 1):
            day = today + pd.Timedelta(days=n)
            for arrival, qty in arrivals:
                if arrival == day:
                    stock.append(
                        [qty, day + pd.Timedelta(days=int(products.loc[sku, "shelf_life_days"] * 0.75))]
                    )
            stock = [x for x in stock if x[1] > day and x[0] > 0]
            need = rate
            for b in sorted(stock, key=lambda x: x[1]):
                take = min(need, b[0])
                b[0] -= take
                need -= take
            if need > 1e-8 and shortage is None:
                shortage = day
        result.append(
            (
                loc,
                sku,
                on_hand,
                rate,
                on_hand / rate if rate else None,
                int(incoming.qty.sum()),
                str(shortage.date()) if shortage is not None else None,
            )
        )
    pd.DataFrame(
        result,
        columns=[
            "location_id",
            "sku_id",
            "on_hand",
            "daily_demand",
            "days_of_cover",
            "inbound_qty",
            "shortage_date",
        ],
    ).to_csv("shortage_warnings.csv", index=False)


def transfer_csv():
    today = pd.Timestamp(os.getenv("GRD_AS_OF", "2019-09-05"))
    rec = pd.read_csv("recommendations.csv", parse_dates=["shortage_date"])
    warnings = pd.read_csv("shortage_warnings.csv").set_index(["location_id", "sku_id"])
    routes = pd.read_csv("supply_routes.csv")
    replenishment = routes[routes.route_type == "replenishment"].set_index("destination")
    products = pd.read_csv("products.csv").set_index("sku_id")
    batches = pd.read_csv("inventory_batches.csv", parse_dates=["snapshot_date", "expiry_date"])
    snap = batches.loc[batches.snapshot_date <= today, "snapshot_date"].max()
    batches = batches[batches.snapshot_date == snap]
    used = {}
    candidates = []
    actions = []

    def lead(rt):
        return int(rt.lead_days_monsoon if today.month in [6, 7, 8, 9] else rt.lead_days_normal)

    for r in rec[rec.status == "TOO LATE - check transfer"].itertuples():
        target = warnings.loc[(r.location_id, r.sku_id)]
        pack = int(products.loc[r.sku_id, "pack_size"])
        need = max(
            pack,
            math.ceil(
                target.daily_demand
                * (
                    r.lead_days
                    - (r.shortage_date - today).days
                    + math.ceil(1.65 * replenishment.loc[r.location_id].lead_sd)
                )
                / pack
            )
            * pack,
        )
        chosen = None
        reasons = []
        for rt in routes[
            (routes.route_type == "transfer") & (routes.destination == r.location_id)
        ].itertuples():
            reason = None
            qty = 0
            mode = "-"
            if not rt.permitted:
                reason = "route not permitted"
            elif not products.loc[r.sku_id, "transfer_allowed"]:
                reason = "controlled category, transfer not allowed"
            elif (rt.origin, r.sku_id) not in warnings.index:
                reason = "donor balance unknown"
            else:
                donor = warnings.loc[(rt.origin, r.sku_id)]
                keep = donor.daily_demand * (
                    lead(replenishment.loc[rt.origin])
                    + 7
                    + math.ceil(1.65 * replenishment.loc[rt.origin].lead_sd)
                )
                spare = donor.on_hand - keep - used.get((rt.origin, r.sku_id), 0)
                days = lead(rt)
                if today + pd.Timedelta(days=days) > r.shortage_date - pd.Timedelta(days=1):
                    days = max(1, math.ceil(days / 2))
                    mode = "express (assumed)"
                else:
                    mode = "road"
                arrival = today + pd.Timedelta(days=days)
                eligible = batches[
                    (batches.location_id == rt.origin)
                    & (batches.sku_id == r.sku_id)
                    & (batches.expiry_date >= arrival + pd.Timedelta(days=90))
                ].available_qty.sum() - used.get((rt.origin, r.sku_id), 0)
                if arrival > r.shortage_date - pd.Timedelta(days=1):
                    reason = "arrives too late"
                else:
                    qty = max(0, int(min(need, spare, eligible) // pack * pack))
                    reason = (
                        "no eligible uncommitted surplus"
                        if qty < need
                        else "eligible with donor protection and shared allocation"
                    )
            feasible = qty >= need
            candidates.append(
                (
                    r.location_id,
                    r.sku_id,
                    rt.origin,
                    mode,
                    qty,
                    "RECOMMEND" if feasible else "REJECTED",
                    reason,
                )
            )
            if feasible:
                used[(rt.origin, r.sku_id)] = used.get((rt.origin, r.sku_id), 0) + qty
                chosen = (rt.origin, mode, qty)
                break
            reasons.append(reason)
        if chosen:
            donor, mode, qty = chosen
            actions.append(
                (
                    r.location_id,
                    r.sku_id,
                    f"TRANSFER from {donor} ({mode})",
                    qty,
                    "reserved within this CSV plan; API approval still required",
                    "not needed",
                )
            )
        else:
            arrival = today + pd.Timedelta(days=max(1, math.ceil(lead(replenishment.loc[r.location_id]) / 2)))
            action = (
                "EXPEDITE warehouse shipment (assumed; verify source stock)"
                if arrival <= r.shortage_date
                else "ESCALATE - no timely supply"
            )
            actions.append(
                (
                    r.location_id,
                    r.sku_id,
                    action,
                    max(int(r.order_qty), need) if arrival <= r.shortage_date else 0,
                    "; ".join(reasons),
                    str(arrival.date()),
                )
            )
    pd.DataFrame(
        candidates, columns=["to_location", "sku_id", "from_location", "mode", "qty", "decision", "reason"]
    ).to_csv("transfer_candidates.csv", index=False)
    pd.DataFrame(
        actions,
        columns=["location_id", "sku_id", "action", "qty", "borrow_from_distributor", "warehouse_express"],
    ).to_csv("urgent_actions.csv", index=False)
