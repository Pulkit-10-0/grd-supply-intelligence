"""Local-only server. Does not echo credentials or provision external services."""

import os
from pathlib import Path
import uvicorn

root = Path(__file__).resolve().parents[1]
os.chdir(root)
if (root / ".env").exists():
    for line in (root / ".env").read_text().splitlines():
        if line.strip() and not line.startswith("#"):
            key, _, value = line.partition("=")
            os.environ.setdefault(key, value)
uvicorn.run("grd.api:create_app", factory=True, host="127.0.0.1", port=8011)
