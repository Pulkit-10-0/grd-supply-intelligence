import argparse
from datetime import date, timedelta
import getpass
import json
import os
from pathlib import Path
import time

from sqlalchemy import select

from .db import database, transaction


def main():
    project_root = (
        Path.cwd() if (Path.cwd() / "alembic.ini").exists() else Path(__file__).resolve().parents[1]
    )
    local_env = project_root / ".env"
    if local_env.exists():
        for line in local_env.read_text().splitlines():
            if line.strip() and not line.startswith("#"):
                key, _, value = line.partition("=")
                os.environ.setdefault(key, value)
    parser = argparse.ArgumentParser(description="GRD backend administration")
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("migrate")
    seed = commands.add_parser("seed-demo")
    seed.add_argument("--email", required=True)
    seed.add_argument("--as-of", type=date.fromisoformat, default=date(2026, 11, 1))
    commands.add_parser("worker")
    commands.add_parser("worker-once")
    commands.add_parser("openapi")
    commands.add_parser("recover-jobs")
    commands.add_parser("serve")
    boot = commands.add_parser("bootstrap")
    boot.add_argument("--name", required=True)
    boot.add_argument("--email", required=True)
    backup = commands.add_parser("backup-sqlite")
    backup.add_argument("destination")
    legacy = commands.add_parser("legacy-run")
    legacy.add_argument("--source", required=True)
    legacy.add_argument("--output", default="data/legacy-run")
    legacy.add_argument("--as-of", default="2019-09-05")
    args = parser.parse_args()
    if args.command == "migrate":
        from alembic.config import Config
        from alembic import command

        root = project_root
        config = Config(str(root / "alembic.ini"))
        config.set_main_option("script_location", str(root / "migrations"))
        command.upgrade(config, "head")
        return
    engine, factory = database()
    if args.command == "serve":
        import uvicorn

        uvicorn.run("grd.api:create_app", factory=True, host="127.0.0.1", port=8011)
    elif args.command == "bootstrap":
        from .models import Organisation, User
        from .security import passwords

        password = os.getenv("GRD_ADMIN_PASSWORD") or getpass.getpass("Admin password (12+ characters): ")
        if len(password) < 12:
            parser.error("Password must be at least 12 characters")
        with transaction(factory) as s:
            if s.scalar(select(User).where(User.email == args.email.lower())):
                raise ValueError("User already exists")
            org = Organisation(name=args.name, mode="shadow")
            s.add(org)
            s.flush()
            user = User(
                org_id=org.id,
                email=args.email.lower(),
                role="admin",
                location_ids=[],
                password_hash=passwords.hash(password),
            )
            s.add(user)
            s.flush()
            print(
                json.dumps(
                    {
                        "organisation_id": org.id,
                        "admin_email": user.email,
                        "mode": "shadow",
                        "note": "No company data or approved operating policies assumed",
                    }
                )
            )
    elif args.command == "seed-demo":
        from .demo import seed_demo

        password = os.getenv("GRD_ADMIN_PASSWORD") or getpass.getpass(
            "Demo admin password (12+ characters): "
        )
        if len(password) < 12:
            parser.error("Password must be at least 12 characters")
        with transaction(factory) as s:
            result = seed_demo(s, args.email, password, args.as_of)
        print(json.dumps(result, indent=2))
    elif args.command in ["worker", "worker-once"]:
        from .worker import run_once

        while True:
            ran = run_once(factory)
            if args.command == "worker-once":
                break
            if not ran:
                time.sleep(max(1, float(os.getenv("GRD_WORKER_POLL_SECONDS", "1"))))
    elif args.command == "recover-jobs":
        from .models import Job, now

        with transaction(factory) as s:
            count = 0
            for job in s.scalars(
                select(Job).where(Job.status == "running", Job.started_at < now() - timedelta(minutes=30))
            ):
                job.status = "queued"
                job.progress = 0
                count += 1
        print(
            json.dumps(
                {
                    "requeued": count,
                    "note": "Only jobs with a 30-minute expired lease; computational jobs have no stock side effects",
                }
            )
        )
    elif args.command == "openapi":
        from .api import create_app

        print(json.dumps(create_app().openapi(), indent=2))
    elif args.command == "backup-sqlite":
        import sqlite3

        url = os.getenv("DATABASE_URL", "sqlite:///./grd.db")
        if not url.startswith("sqlite:///"):
            parser.error("Use pg_dump for PostgreSQL")
        dest = Path(args.destination)
        if dest.exists():
            parser.error("Backup destination already exists")
        with sqlite3.connect(url.removeprefix("sqlite:///")) as source, sqlite3.connect(dest) as target:
            source.backup(target)
        print(
            "Backup written; restore only into a stopped disposable test instance before replacing any live data"
        )
    elif args.command == "legacy-run":
        from .legacy import run

        run(args.source, args.output, args.as_of)


if __name__ == "__main__":
    main()
