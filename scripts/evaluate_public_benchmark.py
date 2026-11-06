"""Reproduce all public-category results with the same evaluator as the website."""

import argparse
import json
from pathlib import Path

import numpy as np
import pandas as pd
import sklearn

from grd.benchmark import CATEGORIES, run
from grd.forecasting import NOMINAL_COVERAGE, VERSION


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()

    report = {
        "evidence_type": "observed_public_pharmacy_categories",
        "algorithm": VERSION,
        "runtime": {"numpy": np.__version__, "pandas": pd.__version__, "scikit-learn": sklearn.__version__},
        "nominal_interval_coverage_pct": 100 * NOMINAL_COVERAGE,
        "categories": {},
    }
    for category in CATEGORIES:
        result = run(category)
        windows = result["evaluation_windows"]
        if windows["test"]["origins"] != 52 or len(result["validation_mae"]) != 5:
            raise ValueError("The benchmark must have 52 test origins and all five candidates")
        report.update(
            sha256=result["source"]["sha256"],
            complete_weeks=result["complete_weeks"],
            windows=windows,
        )
        report["categories"][category] = {
            "selected": result["selected_model"],
            "validation_baseline": result["validation_baseline"],
            "validation_mae": result["validation_mae"],
            "test": result["test_metrics_by_horizon"],
        }
        print(f"Evaluated {category}", flush=True)
    args.output.write_text(json.dumps(report, indent=2, allow_nan=False) + "\n")


if __name__ == "__main__":
    main()
