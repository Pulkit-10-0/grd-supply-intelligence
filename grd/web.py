"""Serve the compiled browser client without changing API authentication."""

import os
from pathlib import Path

from fastapi.staticfiles import StaticFiles


def mount_workspace(app):
    root = Path(os.getenv("GRD_WEB_DIST", Path(__file__).resolve().parents[1] / "web" / "dist"))
    if (root / "index.html").is_file():
        # Registered after the API: unknown API paths remain 404, never a login page.
        app.mount("/", StaticFiles(directory=root, html=True), name="workspace")
