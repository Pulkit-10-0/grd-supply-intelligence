import os

import pytest
from sqlalchemy.engine import make_url

from grd.cloud_demo import configure


def test_cloud_demo_requires_persistent_postgres(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "sqlite:///ephemeral.db")
    with pytest.raises(ValueError, match="persistent managed PostgreSQL"):
        configure()


def test_cloud_demo_preserves_tls_and_password_while_selecting_driver(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "postgresql://demo:p%40ss@db.example.com/grd?sslmode=require")
    monkeypatch.setenv("GRD_TOKEN_SECRET", "test-only-secret-that-is-longer-than-32-characters")
    configure()
    url = make_url(os.environ["DATABASE_URL"])
    assert url.drivername == "postgresql+psycopg"
    assert url.password == "p@ss"
    assert url.query["sslmode"] == "require"


def test_cloud_demo_refuses_weak_token_secret(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "postgresql://demo:pass@db.example.com/grd?sslmode=require")
    monkeypatch.setenv("GRD_TOKEN_SECRET", "weak")
    with pytest.raises(RuntimeError, match="32 random characters"):
        configure()


def test_cloud_demo_refuses_unencrypted_remote_database(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "postgresql://demo:pass@db.example.com/grd?sslmode=disable")
    with pytest.raises(ValueError, match="requires TLS"):
        configure()
