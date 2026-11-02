"""Original public pharmacy benchmark; never written into Assam operational demand."""

import csv
from datetime import datetime
from pathlib import Path
import hashlib
import json


ASSETS = Path(__file__).with_name("assets")
CATEGORIES = ["M01AB", "M01AE", "N02BA", "N02BE", "N05B", "N05C", "R03", "R06"]


def source():
    manifest = json.loads((ASSETS / "pharma-manifest.json").read_text())
    return {
        **manifest,
        "categories": CATEGORIES,
        "name": "Original public pharmacy sales benchmark",
        "sha256": hashlib.sha256((ASSETS / "pharma-salesdaily.csv").read_bytes()).hexdigest(),
        "attribution": "Milan Zdravkovic, Pharma Sales Data, Kaggle; non-commercial research/demo attribution",
        "units": "Publisher's category-sales quantities; fractional values retained, unit definition not independently verified",
        "operational_use": False,
    }


def run(category):
    # Keep metadata/source reads lightweight in the API process. Only the
    # calculation worker should load the ML stack on the 512 MB demo host.
    from .forecasting import forecast

    if category not in CATEGORIES:
        raise ValueError("Unknown public benchmark category")
    with (ASSETS / "pharma-salesdaily.csv").open(newline="") as handle:
        values = [
            {"date": str(datetime.strptime(r["datum"], "%m/%d/%Y").date()), "quantity": float(r[category])}
            for r in csv.DictReader(handle)
        ]
    cutoff = datetime.fromisoformat(values[-1]["date"]).date()
    return {
        **forecast(values, cutoff),
        "source": source(),
        "category": category,
        "evidence_type": "observed_public_benchmark",
        "units": source()["units"],
        "date_start": values[0]["date"],
        "date_end": values[-1]["date"],
        "daily_rows": len(values),
        "note": "Source pharmacy categories, not Assam products. Final held-out results are not business impact estimates.",
    }
