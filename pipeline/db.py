"""Step: create and fill the PostgreSQL database (schema migrations and synthetic data).

    python afm.py db migrate                       apply new files from db/migrations/, in number order
    python afm.py db status                        which migrations are applied, and row counts
    python afm.py db seed [--scale small|medium|large] [--seed 42] [--if-empty]   synthetic data (empty database only;
                                                   --if-empty skips quietly when data exists)
    python afm.py db check                         data-quality checks (totals, stock, refunds, isolation)
    python afm.py db reset --yes                   drop everything and start again (never in production)
    python afm.py db export --out data/            synthetic data as CSV files, one per table (no database needed)

The database address comes from AFM_DATABASE_URL, e.g. postgresql://afm:password@127.0.0.1:5432/afm
(STANDARD.md section 7). Needs: pip install "psycopg[binary]>=3.1".

Schema conventions (db/migrations/*.sql):
  * ids are text with a type prefix (ten_, loc_, usr_, cus_, ord_ ...), the same ids the backend returns
  * every tenant-owned row has tenant_id; child tables reference (tenant_id, id), so rows cannot cross tenants;
    row-level security (0005) enforces the same for the API's database role afm_app
  * money is bigint paise; times are timestamptz; status columns are text with a CHECK list
  * a migration is never edited once applied anywhere: add a new numbered file instead. migrate refuses to run
    if an applied file's checksum has changed.
"""
from __future__ import annotations

import hashlib
import os

from pipeline.common import ROOT

MIGRATIONS = ROOT / 'db' / 'migrations'


def _url() -> str:
    url = os.environ.get('AFM_DATABASE_URL', '').strip()
    if not url:
        raise SystemExit('Set AFM_DATABASE_URL, e.g. postgresql://afm:password@127.0.0.1:5432/afm')
    return url


def connect(autocommit: bool = False):
    try:
        import psycopg
    except ImportError:
        raise SystemExit('Install the PostgreSQL driver: pip install "psycopg[binary]>=3.1"')
    return psycopg.connect(_url(), autocommit=autocommit)


def _files() -> list:
    return sorted(MIGRATIONS.glob('[0-9][0-9][0-9][0-9]_*.sql'))


def _sha(path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _ensure_table(cur) -> None:
    cur.execute("""CREATE TABLE IF NOT EXISTS schema_migrations (
        filename text PRIMARY KEY, sha256 text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())""")


def migrate() -> int:
    with connect() as conn, conn.cursor() as cur:
        _ensure_table(cur)
        cur.execute('SELECT filename, sha256 FROM schema_migrations')
        applied = dict(cur.fetchall())
        conn.commit()
        changed = [f.name for f in _files() if f.name in applied and applied[f.name] != _sha(f)]
        if changed:
            raise SystemExit('Applied migrations were edited: ' + ', '.join(changed) +
                             '. Restore them and add a new numbered migration instead.')
        todo = [f for f in _files() if f.name not in applied]
        for f in todo:
            cur.execute(f.read_text(encoding='utf-8'))
            cur.execute('INSERT INTO schema_migrations (filename, sha256) VALUES (%s, %s)', (f.name, _sha(f)))
            conn.commit()                       # one transaction per file: a failing file leaves the earlier ones applied
            print(f'applied {f.name}')
        print('Up to date.' if not todo else f'{len(todo)} migration(s) applied.')
    return 0


TABLES = ['tenants', 'locations', 'staff_users', 'staff_role_assignments', 'staff_store_access', 'staff_limits',
          'customers', 'customer_addresses', 'service_clients', 'categories', 'products', 'product_images',
          'price_history', 'stock_levels', 'stock_movements', 'delivery_plans', 'delivery_plan_items', 'orders',
          'order_lines', 'stock_reservations', 'payments', 'refunds', 'refund_approvals', 'shipments',
          'channel_connections', 'channel_credentials', 'tenant_data_keys', 'channel_listings', 'webhook_events',
          'jobs', 'audit_log', 'refresh_tokens']


def status() -> int:
    with connect() as conn, conn.cursor() as cur:
        _ensure_table(cur)
        cur.execute('SELECT filename, applied_at FROM schema_migrations ORDER BY filename')
        applied = dict(cur.fetchall())
        for f in _files():
            print(f'{"applied " + applied[f.name].strftime("%Y-%m-%d %H:%M") if f.name in applied else "pending         "}  {f.name}')
        if len(applied) == len(_files()):
            print()
            for t in TABLES:
                cur.execute(f'SELECT count(*) FROM {t}')
                print(f'{t:26s} {cur.fetchone()[0]:>9,}')
    return 0


def reset(yes: bool) -> int:
    if os.environ.get('AFM_ENV', '').lower() == 'production':
        raise SystemExit('Refusing to reset with AFM_ENV=production.')
    if not yes:
        raise SystemExit('This deletes every table and row. Run again with --yes to confirm.')
    with connect(autocommit=True) as conn:
        conn.execute('DROP SCHEMA public CASCADE')
        conn.execute('CREATE SCHEMA public')
    print('Database emptied. Next: python afm.py db migrate')
    return 0


def seed(scale: str, seed_value: int, if_empty: bool = False) -> int:
    from psycopg.types.json import Jsonb
    from db.synthetic.generate import COLUMNS, SYNTHETIC_PASSWORD, generate
    data = generate(scale=scale, seed=seed_value)
    wrap = lambda v: Jsonb(v) if isinstance(v, dict) else v      # noqa: E731 - jsonb columns
    with connect() as conn, conn.cursor() as cur:
        cur.execute('SELECT count(*) FROM tenants')
        if cur.fetchone()[0]:
            if if_empty:
                print('The database already has data; not seeding (--if-empty).')
                return 0
            raise SystemExit('The database already has data. Seed only an empty database (db reset --yes, db migrate).')
        for table in COLUMNS:                     # parents before children
            rows = data[table]
            cols = COLUMNS[table]
            with cur.copy(f'COPY {table} ({", ".join(cols)}) FROM STDIN') as cp:
                for r in rows:
                    cp.write_row([wrap(r.get(c)) for c in cols])
            print(f'{table:26s} {len(rows):>9,}')
        conn.commit()
    print(f'Loaded synthetic data: scale {scale}, seed {seed_value}. Synthetic staff sign in with the password {SYNTHETIC_PASSWORD!r}.')
    return 0


def export(scale: str, seed_value: int, out: str) -> int:
    import csv
    import json
    from db.synthetic.generate import generate, COLUMNS
    data = generate(scale=scale, seed=seed_value)
    d = (ROOT / out).resolve()
    d.mkdir(parents=True, exist_ok=True)
    for table, cols in COLUMNS.items():
        with open(d / f'{table}.csv', 'w', newline='', encoding='utf-8') as fh:
            w = csv.writer(fh)
            w.writerow(cols)
            for r in data[table]:
                w.writerow([json.dumps(v, ensure_ascii=False) if isinstance(v, (dict, list)) else
                            ('' if v is None else v) for v in (r.get(c) for c in cols)])
    print(f'Wrote {len(COLUMNS)} CSV files to {d}')
    return 0


def check() -> int:
    from db.synthetic.checks import run_checks
    with connect() as conn:
        return run_checks(conn)
