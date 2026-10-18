"""Test set-up. The same tests run against both storages:

    python -m pytest -q                                              in memory (default)
    AFM_TEST_STORAGE=postgres AFM_TEST_DATABASE_URL=postgresql://... python -m pytest -q
                                                                     against PostgreSQL; the database is emptied
                                                                     before each test, so never point it at real data
Tests build the platform with make_platform(...), never Platform(...) directly.
"""
import os
import pathlib
import sys

import pytest

BACKEND = pathlib.Path(__file__).resolve().parents[1]
ROOT = BACKEND.parent
sys.path.insert(0, str(BACKEND))

os.environ.pop("AFM_DATABASE_URL", None)            # tests never use the developer's own database
MODE = os.environ.get("AFM_TEST_STORAGE", "memory")
TEST_URL = os.environ.get("AFM_TEST_DATABASE_URL")
if MODE == "postgres":
    if not TEST_URL:
        raise SystemExit("AFM_TEST_STORAGE=postgres needs AFM_TEST_DATABASE_URL (a database the tests may empty)")
    from cryptography.fernet import Fernet
    os.environ.setdefault("AFM_VAULT_MASTER_KEY", Fernet.generate_key().decode())

_platforms = []


def make_platform(**kw):
    from aifirstmart_connect.api import Platform
    kw["database_url"] = TEST_URL if MODE == "postgres" else ""
    p = Platform(**kw)
    _platforms.append(p)
    return p


@pytest.fixture(scope="session", autouse=True)
def _schema():
    if MODE == "postgres":
        sys.path.insert(0, str(ROOT))
        from pipeline import db as dbstep
        os.environ["AFM_DATABASE_URL"] = TEST_URL
        try:
            dbstep.reset(yes=True)
            dbstep.migrate()
        finally:
            os.environ.pop("AFM_DATABASE_URL", None)
    yield


@pytest.fixture(autouse=True)
def _clean_storage():
    if MODE == "postgres":
        import psycopg
        with psycopg.connect(TEST_URL, autocommit=True) as conn:
            tables = [r[0] for r in conn.execute("SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> 'schema_migrations'")]
            conn.execute("TRUNCATE " + ", ".join(f'"{t}"' for t in tables) + " RESTART IDENTITY CASCADE")
    yield
    while _platforms:
        _platforms.pop().close()
