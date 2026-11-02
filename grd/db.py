import os
from contextlib import contextmanager

from sqlalchemy import create_engine, event, select
from sqlalchemy.orm import sessionmaker

from .models import Organisation


def database(url=None):
    url = url or os.getenv("DATABASE_URL", "sqlite:///./grd.db")
    engine = create_engine(
        url,
        connect_args={"check_same_thread": False, "timeout": 30} if url.startswith("sqlite") else {},
        pool_pre_ping=True,
    )
    if url.startswith("sqlite"):

        @event.listens_for(engine, "connect")
        def configure(conn, _):
            conn.isolation_level = None
            conn.execute("PRAGMA foreign_keys=ON")
            conn.execute("PRAGMA busy_timeout=30000")

        @event.listens_for(engine, "begin")
        def begin(conn):
            # Serialize local read/write transactions; PostgreSQL uses the per-org row lock below.
            conn.exec_driver_sql("BEGIN IMMEDIATE")

    return engine, sessionmaker(engine, expire_on_commit=False)


@contextmanager
def transaction(factory):
    with factory() as session, session.begin():
        yield session


def lock_org(session, org_id):
    return session.scalar(
        select(Organisation)
        .where(Organisation.id == org_id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
