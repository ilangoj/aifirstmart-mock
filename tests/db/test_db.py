"""Database schema, synthetic data and the job queue (db/, pipeline/db.py).

Needs AFM_TEST_DATABASE_URL pointing at a database these tests may empty, e.g.
    AFM_TEST_DATABASE_URL=postgresql://afm:password@127.0.0.1:5432/afm_test python -m pytest tests/db
Skipped when it is not set. The generator tests at the top need no database.
"""
import hashlib
import json
import os
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
from db.synthetic.checks import CHECKS, run_checks  # noqa: E402
from db.synthetic.generate import COLUMNS, generate  # noqa: E402


def digest(data):
    return hashlib.sha256(json.dumps(data, default=str, sort_keys=True).encode()).hexdigest()


def test_same_seed_gives_identical_data():
    assert digest(generate('small', 7)) == digest(generate('small', 7))


def test_different_seed_gives_different_data():
    assert digest(generate('small', 7)) != digest(generate('small', 8))


def test_every_table_has_rows_and_only_known_columns():
    data = generate('small', 42)
    for table, cols in COLUMNS.items():
        assert data[table], f'{table} is empty'
        assert set(data[table][0]) == set(cols)


def test_all_tenants_are_marked_synthetic_and_emails_cannot_be_real():
    data = generate('small', 42)
    assert all(t['synthetic'] for t in data['tenants'])
    emails = [u['email'] for u in data['staff_users']] + [c['email'] for c in data['customers'] if c['email']]
    assert all(e.endswith('.example') for e in emails)


TEST_URL = os.environ.get('AFM_TEST_DATABASE_URL')
needs_db = pytest.mark.skipif(not TEST_URL, reason='set AFM_TEST_DATABASE_URL to run database tests')


@pytest.fixture(scope='module')
def db():
    import psycopg
    os.environ['AFM_DATABASE_URL'] = TEST_URL
    from pipeline import db as dbstep
    dbstep.reset(yes=True)
    dbstep.migrate()
    dbstep.seed('small', 42)
    with psycopg.connect(TEST_URL) as conn:
        yield conn


@pytest.fixture
def tx(db):
    """A transaction that is always rolled back, so a test can break rules without affecting others."""
    yield db
    db.rollback()


@needs_db
def test_all_data_quality_checks_pass(db):
    assert run_checks(db) == 0


@needs_db
@pytest.mark.parametrize('name,breakage', [
    ('Stock on hand equals the sum of its movements', "UPDATE stock_levels SET on_hand = on_hand + 1 WHERE ctid = (SELECT ctid FROM stock_levels LIMIT 1)"),
    ('Order subtotal equals the sum of its lines',
     "UPDATE order_lines SET qty = qty + 1, line_total_paise = (qty + 1) * unit_price_paise WHERE ctid = (SELECT ctid FROM order_lines LIMIT 1)"),
    ('Refunds above Rs 25,000 have a second, different approver',
     "DELETE FROM refund_approvals WHERE step = 2 AND refund_id = (SELECT refund_id FROM refund_approvals WHERE step = 2 LIMIT 1)"),
])
def test_checks_catch_a_broken_row(tx, name, breakage):
    sql = dict(CHECKS)[name]
    with tx.cursor() as cur:
        cur.execute(breakage)
        cur.execute(f'SELECT count(*) FROM ({sql}) t')
        assert cur.fetchone()[0] >= 1


@needs_db
@pytest.mark.parametrize('statement', [
    "UPDATE products SET price_paise = mrp_paise + 100 WHERE ctid = (SELECT ctid FROM products LIMIT 1)",            # above MRP
    "UPDATE stock_levels SET reserved = on_hand + 1 WHERE ctid = (SELECT ctid FROM stock_levels LIMIT 1)",           # over-reserved
    "INSERT INTO orders SELECT * FROM orders LIMIT 1",                                                               # duplicate order
    "UPDATE orders SET total_paise = total_paise + 1 WHERE ctid = (SELECT ctid FROM orders LIMIT 1)",                # wrong total
    "INSERT INTO webhook_events (tenant_id, connection_id, external_event_id, event_type, signature_valid, payload) "
    "SELECT tenant_id, connection_id, external_event_id, event_type, true, '{}' FROM webhook_events LIMIT 1",        # repeated webhook
    "UPDATE order_lines SET sku = 'XX9999' WHERE ctid = (SELECT ctid FROM order_lines LIMIT 1)",                     # unknown product
    "UPDATE orders SET customer_id = (SELECT id FROM customers WHERE tenant_id <> orders.tenant_id LIMIT 1) "
    "WHERE id = (SELECT id FROM orders WHERE customer_id IS NOT NULL LIMIT 1)",                                       # other tenant's customer
])
def test_schema_rejects_invalid_data(tx, statement):
    import psycopg
    with pytest.raises(psycopg.errors.IntegrityError):
        with tx.cursor() as cur:
            cur.execute(statement)


@needs_db
def test_job_queue_claims_each_job_once_and_backs_off(tx):
    import psycopg
    with tx.cursor() as cur:
        cur.execute("UPDATE jobs SET status = 'succeeded' WHERE status = 'queued'")
        cur.execute("""INSERT INTO jobs (tenant_id, kind, idempotency_key, max_attempts)
                       SELECT 'ten_demoretail', 'push_inventory', 'test-' || g, 2 FROM generate_series(1, 6) g""")
        cur.execute("SELECT id FROM claim_jobs('worker-a', 4)")
        a = {r[0] for r in cur.fetchall()}
        cur.execute("SELECT id FROM claim_jobs('worker-b', 4)")
        b = {r[0] for r in cur.fetchall()}
        assert len(a) == 4 and len(b) == 2 and not a & b
        job = min(a)
        cur.execute("SELECT status, attempts, run_after > now() FROM finish_job(%s, false, 'HTTP 429')", (job,))
        assert cur.fetchone() == ('queued', 1, True)                    # retried later
        cur.execute("UPDATE jobs SET run_after = now() - interval '1 second' WHERE id = %s", (job,))
        cur.execute("SELECT id FROM claim_jobs('worker-a', 10)")
        assert job in {r[0] for r in cur.fetchall()}
        cur.execute("SELECT status, attempts FROM finish_job(%s, false, 'HTTP 401')", (job,))
        assert cur.fetchone() == ('dead', 2)                            # gave up after max_attempts
        with pytest.raises(psycopg.errors.UniqueViolation):
            cur.execute("INSERT INTO jobs (tenant_id, kind, idempotency_key) VALUES ('ten_demoretail', 'push_inventory', 'test-1')")


@needs_db
def test_tenant_isolation_for_the_app_role(tx):
    import psycopg
    with tx.cursor() as cur:
        cur.execute("SELECT 1 FROM pg_roles WHERE rolname = 'afm_app' AND pg_has_role(current_user, oid, 'MEMBER')")
        if not cur.fetchone():
            pytest.skip('role afm_app missing or not granted to this user (see db/migrations/0005)')
        cur.execute('SET LOCAL ROLE afm_app')
        cur.execute('SELECT count(*) FROM orders')
        assert cur.fetchone()[0] == 0                                   # no tenant set: nothing visible
        cur.execute("SELECT set_config('afm.tenant_id', 'ten_thendral', true)")
        cur.execute("SELECT count(*), count(*) FILTER (WHERE tenant_id <> 'ten_thendral') FROM orders")
        visible, others = cur.fetchone()
        assert visible > 0 and others == 0
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            cur.execute("INSERT INTO categories (tenant_id, id, name) VALUES ('ten_demoretail', 'x', 'X')")


@needs_db
def test_migrate_refuses_an_edited_migration(db):
    from pipeline import db as dbstep
    with db.cursor() as cur:
        cur.execute("UPDATE schema_migrations SET sha256 = 'edited' WHERE filename LIKE '0001%'")
    db.commit()
    try:
        with pytest.raises(SystemExit, match='edited'):
            dbstep.migrate()
    finally:
        with db.cursor() as cur:
            cur.execute("UPDATE schema_migrations SET sha256 = %s WHERE filename LIKE '0001%%'",
                        (hashlib.sha256((ROOT / 'db/migrations/0001_tenancy_identity.sql').read_bytes()).hexdigest(),))
        db.commit()
