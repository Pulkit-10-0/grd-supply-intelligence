"""Supervise one API and worker in a free demo container; SQL lives in managed Postgres.

Production should use independently supervised API and worker services. Do not use
this entrypoint with real operating data or treat free compute as an availability SLA.
"""

import os
from pathlib import Path
import signal
import subprocess
import sys
import time

from sqlalchemy import select
from sqlalchemy.engine import make_url

from grd.db import database, transaction
from grd.models import Organisation, User
from grd.security import secret


def configure():
    url = make_url(os.environ["DATABASE_URL"])
    if url.get_backend_name() not in ("postgres", "postgresql"):
        raise ValueError("Cloud demo requires persistent managed PostgreSQL, never local SQLite")
    if url.host not in ("localhost", "127.0.0.1", "::1") and url.query.get("sslmode") not in (
        "require",
        "verify-ca",
        "verify-full",
    ):
        raise ValueError("Remote cloud PostgreSQL requires TLS: keep sslmode=require in the provider URL")
    os.environ["DATABASE_URL"] = url.set(drivername="postgresql+psycopg").render_as_string(
        hide_password=False
    )
    secret()


def initialise():
    subprocess.run([sys.executable, "-m", "grd.cli", "migrate"], check=True)
    if os.getenv("GRD_SEED_CLOUD_DEMO", "false").lower() != "true":
        return
    email = os.environ.get("GRD_DEMO_EMAIL", "demo@grd.local").lower()
    password = os.environ.get("GRD_ADMIN_PASSWORD", "")
    if len(password) < 12:
        raise ValueError("Set a new cloud demo password of at least 12 characters")
    engine, factory = database()
    try:
        with transaction(factory) as session:
            existing = session.scalar(select(User).where(User.email == email))
            if existing:
                return  # Never reset a demonstration on restart or replace a password.
            if session.scalar(select(Organisation.id).limit(1)):
                raise ValueError("Automatic demo seed only allowed in an empty database")
            from grd.demo import seed_demo

            seed_demo(session, email, password)
    finally:
        engine.dispose()


def main(project_root=None):
    root = Path(project_root or os.getenv("GRD_PROJECT_ROOT", Path.cwd())).resolve()
    if not (root / "alembic.ini").is_file():
        raise ValueError("Start the cloud launcher from the deployment root containing alembic.ini")
    os.chdir(root)
    configure()
    initialise()
    port = str(int(os.getenv("PORT", "8000")))
    processes = []

    def stop(_signum=None, _frame=None):
        for child in processes:
            if child.poll() is None:
                child.terminate()

    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)
    try:
        processes.append(subprocess.Popen([sys.executable, "-m", "grd.cli", "worker"]))
        processes.append(
            subprocess.Popen(
                [
                    sys.executable,
                    "-m",
                    "uvicorn",
                    "grd.api:create_app",
                    "--factory",
                    "--host",
                    "0.0.0.0",
                    "--port",
                    port,
                    "--proxy-headers",
                ]
            )
        )
        while all(child.poll() is None for child in processes):
            time.sleep(0.5)
        # A crashed worker must bring the service down so the platform restarts both.
        return 1
    finally:
        stop()
        for child in processes:
            try:
                child.wait(timeout=15)
            except subprocess.TimeoutExpired:
                child.kill()
                child.wait()


if __name__ == "__main__":
    sys.exit(main())
