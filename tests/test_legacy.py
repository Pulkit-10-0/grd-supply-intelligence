import pandas as pd
from grd.legacy import transfer_csv, projection_csv


def table(name, rows, columns):
    pd.DataFrame(rows, columns=columns).to_csv(name, index=False)


def test_legacy_transfer_adapter_does_not_double_allocate(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    monkeypatch.setenv("GRD_AS_OF", "2019-09-05")
    table(
        "recommendations.csv",
        [(x, "X", "2019-09-07", "TOO LATE - check transfer", 10, 30) for x in ["DIB", "SIL"]],
        ["location_id", "sku_id", "shortage_date", "status", "lead_days", "order_qty"],
    )
    table(
        "shortage_warnings.csv",
        [("GHY", "X", 50, 1, 0), ("DIB", "X", 0, 3, 0), ("SIL", "X", 0, 3, 0)],
        ["location_id", "sku_id", "on_hand", "daily_demand", "inbound_qty"],
    )
    routes = [
        ("WH", loc, "replenishment", 1 if loc == "GHY" else 10, 1 if loc == "GHY" else 10, 0.1, 1)
        for loc in ["GHY", "DIB", "SIL"]
    ]
    routes += [("GHY", loc, "transfer", 1, 1, 0.1, 1) for loc in ["DIB", "SIL"]]
    table(
        "supply_routes.csv",
        routes,
        [
            "origin",
            "destination",
            "route_type",
            "lead_days_normal",
            "lead_days_monsoon",
            "lead_sd",
            "permitted",
        ],
    )
    table("products.csv", [("X", 10, 1)], ["sku_id", "pack_size", "transfer_allowed"])
    table(
        "inventory_batches.csv",
        [("2019-09-05", "GHY", "X", "B1", 50, "2020-09-01")],
        ["snapshot_date", "location_id", "sku_id", "batch_id", "available_qty", "expiry_date"],
    )
    transfer_csv()
    out = pd.read_csv("urgent_actions.csv")
    assert out[out.action.str.startswith("TRANSFER")].qty.sum() == 30


def test_legacy_projection_keeps_empty_location(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    monkeypatch.setenv("GRD_AS_OF", "2019-09-05")
    table(
        "inventory_batches.csv",
        [("2019-09-05", "GHY", "X", "B1", 10, "2020-09-01")],
        ["snapshot_date", "location_id", "sku_id", "batch_id", "available_qty", "expiry_date"],
    )
    table(
        "daily_log.csv",
        [
            (str(day.date()), loc, "X", 10)
            for day in pd.date_range("2019-01-01", "2019-09-05")
            for loc in ["GHY", "EMPTY"]
        ],
        ["date", "location_id", "sku_id", "requested_qty"],
    )
    table(
        "shipments.csv",
        [],
        ["dispatch_date", "expected_arrival", "actual_arrival", "destination", "sku_id", "qty"],
    )
    table(
        "supply_routes.csv",
        [("GHY", "replenishment", 1, 1), ("EMPTY", "replenishment", 1, 1)],
        ["destination", "route_type", "lead_days_normal", "lead_days_monsoon"],
    )
    table("products.csv", [("X", 365)], ["sku_id", "shelf_life_days"])
    projection_csv()
    out = pd.read_csv("shortage_warnings.csv")
    assert len(out) == 2
    assert out[out.location_id == "EMPTY"].iloc[0].shortage_date == "2019-09-06"
