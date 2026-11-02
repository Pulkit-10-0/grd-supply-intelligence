import math
import numpy as np
import pandas as pd
rng = np.random.default_rng(7)          # fixed seed = same output every run

demand   = pd.read_csv("daily_demand.csv", parse_dates=["date"])
products = pd.read_csv("products.csv").set_index("sku_id")
routes   = pd.read_csv("supply_routes.csv")
routes   = routes[routes.route_type == "replenishment"].set_index("destination")

D = {(r.date, r.location_id, r.sku_id): r.demand_qty for r in demand.itertuples()}
dates = sorted(demand["date"].unique())
pairs = sorted(demand[["location_id", "sku_id"]].drop_duplicates().itertuples(index=False, name=None))

# ---- starting state: 14 days of stock in one batch ----
state, bid = {}, 0
for loc, sku in pairs:
    avg0 = demand[(demand.location_id == loc) & (demand.sku_id == sku)].demand_qty.head(60).mean()
    bid += 1
    state[(loc, sku)] = {
        "batches": [{"batch_id": f"B{bid:06d}", "qty": int(math.ceil(avg0 * 14)),
                     "expiry": dates[0] + pd.Timedelta(days=365)}],
        "pipe": [], "hist": [],
    }

daily, shipments, snapshots, writeoffs = [], [], [], []
ship_id = 0

for i, day in enumerate(dates):
    day = pd.Timestamp(day)
    for loc, sku in pairs:
        s = state[(loc, sku)]
        shelf = products.loc[sku, "shelf_life_days"]

        # 1) deliveries arriving today become new batches
        still = []
        for p in s["pipe"]:
            if p["arrive"] <= day:
                bid += 1
                left = int(shelf * rng.uniform(0.6, 0.95))      # shelf life left on arrival
                s["batches"].append({"batch_id": f"B{bid:06d}", "qty": p["qty"],
                                     "expiry": day + pd.Timedelta(days=left)})
            else:
                still.append(p)
        s["pipe"] = still

        # 2) expired batches are written off
        for b in s["batches"]:
            if b["expiry"] <= day and b["qty"] > 0:
                writeoffs.append((day, loc, sku, b["batch_id"], b["qty"]))
        s["batches"] = [b for b in s["batches"] if b["expiry"] > day and b["qty"] > 0]

        # 3) demand is served, earliest expiry first (FEFO)
        req = int(D[(day, loc, sku)])
        need = req
        for b in sorted(s["batches"], key=lambda b: b["expiry"]):
            take = min(b["qty"], need)
            b["qty"] -= take
            need -= take
        fulfilled = req - need
        s["hist"].append(fulfilled)          # planner only sees what was SOLD
        on_hand = sum(b["qty"] for b in s["batches"])
        daily.append((day, loc, sku, req, fulfilled, on_hand))

        # 4) weekly review: baseline "order-up-to" policy
        if i % 7 == 0:
            r = routes.loc[loc]
            avg = np.mean(s["hist"][-28:])
            planned_lead = r.lead_days_normal                   # planner assumes normal lead time
            target = avg * (planned_lead + 7 + 2)               # lead + review + 2 safety days
            position = on_hand + sum(p["qty"] for p in s["pipe"])
            gap = target - position
            if gap > 0:
                pack = int(products.loc[sku, "pack_size"])
                qty = int(math.ceil(gap / pack) * pack)
                mean_lead = r.lead_days_monsoon if day.month in (6, 7, 8, 9) else r.lead_days_normal
                actual = max(1, int(round(rng.normal(mean_lead, r.lead_sd))))
                ship_id += 1
                s["pipe"].append({"arrive": day + pd.Timedelta(days=actual), "qty": qty})
                shipments.append((f"S{ship_id:06d}", "WH_GHY", loc, sku, qty, day,
                                  day + pd.Timedelta(days=int(planned_lead)),
                                  day + pd.Timedelta(days=actual)))
            for b in s["batches"]:
                snapshots.append((day, loc, sku, b["batch_id"], b["qty"], b["expiry"]))

# ---- save tables ----
log = pd.DataFrame(daily, columns=["date", "location_id", "sku_id", "requested_qty",
                                   "fulfilled_qty", "on_hand_end"])
log.to_csv("daily_log.csv", index=False)

orders = log[log.requested_qty > 0].copy()
orders.insert(0, "order_id", [f"O{n:07d}" for n in range(1, len(orders) + 1)])
orders = orders.rename(columns={"date": "order_date"}).drop(columns="on_hand_end")
orders.to_csv("orders.csv", index=False)

pd.DataFrame(shipments, columns=["shipment_id", "origin", "destination", "sku_id", "qty",
            "dispatch_date", "expected_arrival", "actual_arrival"]).to_csv("shipments.csv", index=False)
pd.DataFrame(snapshots, columns=["snapshot_date", "location_id", "sku_id", "batch_id",
            "available_qty", "expiry_date"]).to_csv("inventory_batches.csv", index=False)
pd.DataFrame(writeoffs, columns=["date", "location_id", "sku_id", "batch_id",
            "expired_qty"]).to_csv("expiry_writeoffs.csv", index=False)

# ---- stockout events: runs of consecutive short days ----
log["short"] = log.requested_qty > log.fulfilled_qty
events = []
for (loc, sku), g in log.sort_values("date").groupby(["location_id", "sku_id"]):
    run = (g.short != g.short.shift()).cumsum()
    for _, r in g[g.short].groupby(run[g.short]):
        events.append((sku, loc, r.date.min(), r.date.max(), len(r),
                       int((r.requested_qty - r.fulfilled_qty).sum())))
pd.DataFrame(events, columns=["sku_id", "location_id", "start_date", "end_date",
            "days", "unmet_qty"]).to_csv("stockout_events.csv", index=False)

# ---- quick health check ----
g = log.groupby("location_id")
print("Fill rate % by distributor:\n", (100 * g.fulfilled_qty.sum() / g.requested_qty.sum()).round(1))
print("\nStockout days by distributor:\n", log[log.short].groupby("location_id").size())
print("\nExpired units:", sum(w[4] for w in writeoffs), "| shipments:", len(shipments))