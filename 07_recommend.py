import math
import os
import pandas as pd

W = pd.read_csv("shortage_warnings.csv", parse_dates=["shortage_date"])
routes = pd.read_csv("supply_routes.csv")
routes = routes[routes.route_type == "replenishment"].set_index("destination")
products = pd.read_csv("products.csv").set_index("sku_id")

TODAY = pd.Timestamp(os.getenv("GRD_AS_OF", "2019-09-05"))      # same snapshot date that the projection printed
REVIEW_DAYS = 7

rows = []
for r in W.itertuples():
    rt = routes.loc[r.location_id]
    lead = int(rt.lead_days_monsoon if TODAY.month in (6, 7, 8, 9) else rt.lead_days_normal)
    safety_days = math.ceil(1.65 * rt.lead_sd)                       # more uncertain route = more safety stock
    target = r.daily_demand * (lead + REVIEW_DAYS + safety_days)     # order-up-to level
    position = r.on_hand + r.inbound_qty
    pack = int(products.loc[r.sku_id, "pack_size"])
    qty = max(0, math.ceil((target - position) / pack) * pack)

    if pd.isna(r.shortage_date):
        status, deadline = "OK", None
    else:
        days_left = (r.shortage_date - TODAY).days
        slack = days_left - lead
        deadline = (r.shortage_date - pd.Timedelta(days=lead)).date()
        if slack < 0:
            status = "TOO LATE - check transfer"
        elif qty == 0:
            status = "COVERED"
        else:
            status = "ORDER NOW" if slack <= 3 else "ORDER SOON"
    rows.append((r.location_id, r.sku_id, r.days_of_cover, lead,
                 r.shortage_date.date() if pd.notna(r.shortage_date) else None,
                 deadline, qty, status))

rec = pd.DataFrame(rows, columns=["location_id", "sku_id", "days_of_cover", "lead_days",
                                  "shortage_date", "order_by", "order_qty", "status"])
order = {"TOO LATE - check transfer": 0, "ORDER NOW": 1, "ORDER SOON": 2, "COVERED": 3, "OK": 4}
rec = rec.sort_values(by="status", key=lambda s: s.map(order)).reset_index(drop=True)
rec.to_csv("recommendations.csv", index=False)
print(rec.to_string(index=False))
print(rec.status.value_counts())
