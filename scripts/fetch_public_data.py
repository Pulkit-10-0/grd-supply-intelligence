"""Download originals without relabelling geography or executing third-party SQL."""

import argparse
import hashlib
import json
from pathlib import Path
from urllib.request import urlopen, Request

parser = argparse.ArgumentParser()
parser.add_argument("kind", choices=["pharma-benchmark", "weather"])
args = parser.parse_args()
root = Path(__file__).resolve().parents[1] / "data"
root.mkdir(exist_ok=True)


def download(url, path):
    with urlopen(Request(url, headers={"User-Agent": "GRD-research/0.1"}), timeout=60) as response:
        raw = response.read(20_000_001)
    if len(raw) > 20_000_000:
        raise ValueError("Download exceeds 20 MB review limit")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(raw)
    return hashlib.sha256(raw).hexdigest()


if args.kind == "pharma-benchmark":
    url = "https://www.kaggle.com/api/v1/datasets/download/milanzdravkovic/pharma-sales-data"
    digest = download(url, root / "external" / "pharma-sales-data.zip")
    manifest = {
        "source_url": "https://www.kaggle.com/datasets/milanzdravkovic/pharma-sales-data",
        "sha256": digest,
        "evidence_type": "observed_source_with_preprocessing",
        "geography": "Original pharmacy; no Assam locations inferred",
        "licence": "CC BY-NC 4.0 per original catalogue; recheck before commercial use",
        "limitations": [
            "Eight ATC category series, not individual product transactions",
            "Publisher preprocessed outliers and missing values",
            "Redistributed Assam demand is synthetic",
        ],
    }
    (root / "external" / "manifest.json").write_text(json.dumps(manifest, indent=2))
else:
    entries = []
    for town, lat, lon in [
        ("guwahati", 26.145, 91.736),
        ("dibrugarh", 27.4728, 94.912),
        ("silchar", 24.833, 92.779),
    ]:
        url = f"https://power.larc.nasa.gov/api/temporal/daily/point?parameters=T2M,RH2M,PRECTOTCORR&community=AG&latitude={lat}&longitude={lon}&start=20240101&end=20261031&format=JSON"
        digest = download(url, root / "context" / (town + "-nasa-power.json"))
        entries.append({"town": town, "url": url, "sha256": digest, "latitude": lat, "longitude": lon})
    (root / "context" / "manifest.json").write_text(
        json.dumps(
            {
                "source": "NASA POWER",
                "evidence_type": "real gridded weather context",
                "reference": "https://power.larc.nasa.gov/docs/services/api/temporal/daily/",
                "entries": entries,
                "limitations": [
                    "Town-centre grid data, not site sensors",
                    "Missing values such as -999 must be retained as missing",
                    "Not medicine demand or proof weather improves forecasts",
                    "Not joined to foreign pharmacy data as though observed in Assam",
                ],
            },
            indent=2,
        )
    )
print("Downloaded original files and provenance manifests under data/; no company data was assumed")
