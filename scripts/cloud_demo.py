"""Cloud container entrypoint; implementation is part of the installed GRD package."""

from pathlib import Path
import sys

from grd.cloud_demo import main

if __name__ == "__main__":
    sys.exit(main(Path(__file__).resolve().parents[1]))
