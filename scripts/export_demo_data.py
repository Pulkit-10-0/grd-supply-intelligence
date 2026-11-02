"""Export one synthetic organisation for inspection; never export users or credentials."""

import argparse
import csv
import json
from pathlib import Path
from sqlalchemy import select
from grd.db import database, transaction
from grd.models import Organisation, Product, Location, Route, Batch, Demand, Dataset

p = argparse.ArgumentParser()
p.add_argument("--organisation", required=True)
p.add_argument("--output", default="data/assam-demo")
args = p.parse_args()
_, factory = database()
out = Path(args.output)
out.mkdir(parents=True, exist_ok=True)
with transaction(factory) as s:
    org = s.get(Organisation, args.organisation)
    if not org or org.mode != "synthetic":
        raise ValueError("Exporter is restricted to synthetic organisations")
    for cls in [Product, Location, Route, Batch, Demand, Dataset]:
        rows = list(s.scalars(select(cls).where(cls.org_id == org.id)))
        path = out / (cls.__tablename__ + ".csv")
        if path.exists():
            raise ValueError("Refusing to overwrite existing export")
        fields = [c.name for c in cls.__table__.columns]
        with path.open("w", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=fields)
            writer.writeheader()
            for row in rows:
                writer.writerow(
                    {
                        k: json.dumps(getattr(row, k))
                        if isinstance(getattr(row, k), (dict, list))
                        else getattr(row, k)
                        for k in fields
                    }
                )
print("Synthetic-only exports written; each dataset includes its generation assumptions")
