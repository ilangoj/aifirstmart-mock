"""PostgreSQL storage for the platform: the same methods as the in-memory store, catalogue, orders, vault, connections
and refresh tokens, backed by the schema in db/migrations/. Chosen when AFM_DATABASE_URL is set (api.Platform).

How it keeps tenants apart:
  * every transaction switches to the restricted role afm_app (AFM_DB_APP_ROLE), so row-level security applies;
  * work for a known tenant sets afm.tenant_id, so only that tenant's rows are visible or writable;
  * a few lookups happen before the tenant is known (sign-in by email, the MFA step, a client's token request, a
    webhook routed by connection id, refresh-token rotation). They run with afm.platform = 'on', and the API checks
    the tenant of what they return before using it, exactly as with the in-memory store.

Changes are explicit: the API calls save_staff / save_customer, or assigns into a mapping (store.tenants[id] = t),
after it changes a record. Reading a record gives a detached copy.
"""
from __future__ import annotations

import json
import re
import secrets
import time
from contextlib import contextmanager
from dataclasses import asdict
from datetime import datetime, timezone

from cryptography.fernet import Fernet
from psycopg import errors, sql
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb
from psycopg_pool import ConnectionPool

from .catalog import CatalogError, Product, StockLevel, prepare_changes
from .connectors import Connection
from .identity import AuthError, Principal, _h
from .orders import Order, OrderLine
from .tenancy import Customer, Location, ServiceClient, StaffUser, Tenant, new_id

CHANNEL_NAMES = {'mobile_app': 'Mobile app', 'whatsapp': 'WhatsApp', 'facebook': 'Facebook and Instagram',
                 'amazon': 'Amazon', 'flipkart': 'Flipkart', 'ondc': 'ONDC', 'generic': 'Marketplace'}
GSTIN = re.compile(r'^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]$')


def _ts(epoch: float | None) -> datetime | None:
    return None if epoch is None else datetime.fromtimestamp(epoch, timezone.utc)


def _epoch(dt: datetime | None) -> float | None:
    return None if dt is None else dt.timestamp()


def _slug(text: str) -> str:
    return re.sub(r'[^a-z0-9]+', '_', (text or 'other').lower()).strip('_') or 'other'


class Database:
    """A connection pool and the transaction rules above."""

    def __init__(self, url: str, app_role: str | None = 'afm_app', max_size: int = 8):
        self.pool = ConnectionPool(url, min_size=1, max_size=max_size, open=True, kwargs={'autocommit': False})
        self.app_role = None
        if app_role:
            with self.pool.connection() as conn:
                ok = conn.execute("SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = %s) AND pg_has_role(current_user, %s, 'MEMBER')",
                                  (app_role, app_role)).fetchone()[0]
            if not ok:
                raise RuntimeError(f'The database role {app_role} is missing or not granted to this user. Create it once as an '
                                   f'administrator (STANDARD.md step 12), or set AFM_DB_APP_ROLE= to run without it (development only).')
            self.app_role = app_role

    @contextmanager
    def tx(self, tenant: str | None = None, platform: bool = False):
        """One transaction: committed when the block ends, rolled back if it raises."""
        with self.pool.connection() as conn:
            with conn.cursor(row_factory=dict_row) as cur:
                if self.app_role:
                    cur.execute(sql.SQL('SET LOCAL ROLE {}').format(sql.Identifier(self.app_role)))
                if platform:
                    cur.execute("SELECT set_config('afm.platform', 'on', true)")
                elif tenant:
                    cur.execute("SELECT set_config('afm.tenant_id', %s, true)", (tenant,))
                yield cur

    def close(self) -> None:
        self.pool.close()


class _View:
    """Dict-like access by id, as the API uses the in-memory dicts: get, [], [] =, in, values()."""

    def __init__(self, load, save, load_all):
        self._load, self._save, self._load_all = load, save, load_all

    def get(self, key, default=None):
        v = self._load(key)
        return default if v is None else v

    def __getitem__(self, key):
        v = self._load(key)
        if v is None:
            raise KeyError(key)
        return v

    def __setitem__(self, key, value):
        self._save(value)

    def __contains__(self, key):
        return self._load(key) is not None

    def values(self):
        return self._load_all()


# ---------------------------------------------------------------- tenants, locations, staff, customers, clients
class PgStore:
    def __init__(self, db: Database):
        self.db = db
        self.tenants = _View(self._tenant, self._save_tenant, lambda: self._all('tenants', self._tenant_from))
        self.locations = _View(self._location, self._save_location, lambda: self._all('locations', self._location_from))
        self.staff = _View(self._staff, self.save_staff, lambda: [self._staff(r['id']) for r in self._rows('SELECT id FROM staff_users')])
        self.customers = _View(self._customer, self.save_customer, lambda: self._all('customers', self._customer_from))
        self.clients = _View(self._client, self._save_client, lambda: self._all('service_clients', self._client_from))

    def _rows(self, query, args=()):
        with self.db.tx(platform=True) as cur:
            return cur.execute(query, args).fetchall()

    def _all(self, table, conv):
        return [conv(r) for r in self._rows(sql.SQL('SELECT * FROM {}').format(sql.Identifier(table)))]

    # tenants
    @staticmethod
    def _tenant_from(r) -> Tenant:
        return Tenant(r['id'], r['name'], r['type'], r['status'], r['legal'] or {})

    def _tenant(self, tid):
        r = self._rows('SELECT * FROM tenants WHERE id = %s', (tid,))
        return self._tenant_from(r[0]) if r else None

    def _save_tenant(self, t: Tenant) -> None:
        gstin = (t.legal or {}).get('gstin')
        with self.db.tx(platform=True) as cur:
            cur.execute("""INSERT INTO tenants (id, name, type, status, legal, gstin) VALUES (%s, %s, %s, %s, %s, %s)
                           ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, type = EXCLUDED.type, status = EXCLUDED.status,
                               legal = EXCLUDED.legal, gstin = EXCLUDED.gstin, updated_at = now()""",
                        (t.id, t.name, t.type, t.status, Jsonb(t.legal or {}), gstin if gstin and GSTIN.match(gstin) else None))

    # locations
    @staticmethod
    def _location_from(r) -> Location:
        return Location(r['id'], r['tenant_id'], r['name'], r['kind'])

    def _location(self, lid):
        r = self._rows('SELECT * FROM locations WHERE id = %s', (lid,))
        return self._location_from(r[0]) if r else None

    def _save_location(self, loc: Location) -> None:
        with self.db.tx(tenant=loc.tenant_id) as cur:
            cur.execute("""INSERT INTO locations (id, tenant_id, name, kind, code) VALUES (%s, %s, %s, %s, %s)
                           ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, kind = EXCLUDED.kind""",
                        (loc.id, loc.tenant_id, loc.name, loc.kind, loc.id.split('_', 1)[-1].upper()))

    # staff
    def _staff_where(self, where: str, arg) -> StaffUser | None:
        with self.db.tx(platform=True) as cur:
            r = cur.execute(f'SELECT * FROM staff_users WHERE {where}', (arg,)).fetchone()
            if not r:
                return None
            roles = cur.execute('SELECT role, valid_until, reason FROM staff_role_assignments WHERE user_id = %s ORDER BY granted_at, role',
                                (r['id'],)).fetchall()
            stores = [x['location_id'] for x in cur.execute('SELECT location_id FROM staff_store_access WHERE user_id = %s ORDER BY location_id',
                                                            (r['id'],)).fetchall()]
            limits = {x['limit_name']: int(x['value']) for x in cur.execute('SELECT limit_name, value FROM staff_limits WHERE user_id = %s',
                                                                             (r['id'],)).fetchall()}
        permanent = [x['role'] for x in roles if x['valid_until'] is None]
        if r['tenant_id'] is None:
            permanent = ['platform_admin']                         # the platform administrator has no tenant
        return StaffUser(r['id'], r['tenant_id'], r['email'], r['password_hash'], permanent, stores, limits, r['active'],
                         r['failed_logins'], [(x['role'], _epoch(x['valid_until']), x['reason']) for x in roles if x['valid_until']],
                         r['google_sub'], _epoch(r['last_login_at']))

    def _staff(self, uid):
        return self._staff_where('id = %s', uid)

    def staff_by_email(self, email: str) -> StaffUser | None:
        return self._staff_where('lower(email) = lower(%s)', email)

    def save_staff(self, u: StaffUser) -> None:
        scope = {'tenant': u.tenant_id} if u.tenant_id else {'platform': True}
        with self.db.tx(**scope) as cur:
            cur.execute("""INSERT INTO staff_users (id, tenant_id, email, display_name, password_hash, google_sub, active, failed_logins, last_login_at)
                           VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                           ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, password_hash = EXCLUDED.password_hash,
                               google_sub = EXCLUDED.google_sub, active = EXCLUDED.active, failed_logins = EXCLUDED.failed_logins,
                               last_login_at = EXCLUDED.last_login_at""",
                        (u.id, u.tenant_id, u.email, u.email.split('@')[0], u.password_hash, u.google_sub, u.active, u.failed_logins,
                         _ts(u.last_login)))
            if not u.tenant_id:
                return
            cur.execute('DELETE FROM staff_role_assignments WHERE user_id = %s', (u.id,))
            for role in dict.fromkeys(u.roles):
                cur.execute('INSERT INTO staff_role_assignments (tenant_id, user_id, role) VALUES (%s, %s, %s)', (u.tenant_id, u.id, role))
            for role, until, reason in u.temp_roles:
                if role not in u.roles:
                    cur.execute("""INSERT INTO staff_role_assignments (tenant_id, user_id, role, valid_until, reason) VALUES (%s, %s, %s, %s, %s)
                                   ON CONFLICT (user_id, role) DO UPDATE SET valid_until = EXCLUDED.valid_until, reason = EXCLUDED.reason""",
                                (u.tenant_id, u.id, role, _ts(until), reason))
            cur.execute('DELETE FROM staff_store_access WHERE user_id = %s', (u.id,))
            for loc in dict.fromkeys(u.stores):
                cur.execute('INSERT INTO staff_store_access (tenant_id, user_id, location_id) VALUES (%s, %s, %s)', (u.tenant_id, u.id, loc))
            cur.execute('DELETE FROM staff_limits WHERE user_id = %s', (u.id,))
            for name, value in u.limits.items():
                cur.execute('INSERT INTO staff_limits (tenant_id, user_id, limit_name, value) VALUES (%s, %s, %s, %s)',
                            (u.tenant_id, u.id, name, int(value)))

    # customers
    @staticmethod
    def _customer_from(r) -> Customer:
        return Customer(r['id'], r['tenant_id'], r['email'], r['phone_e164'], r['password_hash'], r['google_sub'])

    def _customer(self, cid):
        r = self._rows('SELECT * FROM customers WHERE id = %s', (cid,))
        return self._customer_from(r[0]) if r else None

    def customer_by(self, tenant_id: str, *, email: str | None = None, phone: str | None = None,
                    google_sub: str | None = None) -> Customer | None:
        conds, args = [], []
        if email:
            conds.append('lower(email) = lower(%s)'); args.append(email)
        if phone:
            conds.append('phone_e164 = %s'); args.append(phone)
        if google_sub:
            conds.append('google_sub = %s'); args.append(google_sub)
        if not conds:
            return None
        with self.db.tx(tenant=tenant_id) as cur:
            r = cur.execute(f'SELECT * FROM customers WHERE tenant_id = %s AND ({" OR ".join(conds)}) ORDER BY created_at LIMIT 1',
                            (tenant_id, *args)).fetchone()
        return self._customer_from(r) if r else None

    def save_customer(self, c: Customer) -> None:
        with self.db.tx(tenant=c.tenant_id) as cur:
            cur.execute("""INSERT INTO customers (id, tenant_id, display_name, email, phone_e164, password_hash, google_sub)
                           VALUES (%s, %s, %s, %s, %s, %s, %s)
                           ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, phone_e164 = EXCLUDED.phone_e164,
                               password_hash = EXCLUDED.password_hash, google_sub = EXCLUDED.google_sub""",
                        (c.id, c.tenant_id, c.email or c.phone or c.id, c.email, c.phone, c.password_hash, c.google_sub))

    # service clients
    @staticmethod
    def _client_from(r) -> ServiceClient:
        return ServiceClient(r['id'], r['tenant_id'], r['secret_hash'], list(r['scopes']), r['active'])

    def _client(self, cid):
        r = self._rows('SELECT * FROM service_clients WHERE id = %s', (cid,))
        return self._client_from(r[0]) if r else None

    def _save_client(self, c: ServiceClient) -> None:
        with self.db.tx(tenant=c.tenant_id) as cur:
            cur.execute("""INSERT INTO service_clients (id, tenant_id, name, secret_hash, scopes, active) VALUES (%s, %s, %s, %s, %s, %s)
                           ON CONFLICT (id) DO UPDATE SET secret_hash = EXCLUDED.secret_hash, scopes = EXCLUDED.scopes, active = EXCLUDED.active""",
                        (c.id, c.tenant_id, 'Service client', c.secret_hash, list(c.scopes), c.active))


# ---------------------------------------------------------------- catalogue and stock
class PgCatalog:
    def __init__(self, db: Database):
        self.db = db
        self.products = _View(self._product, self.upsert, lambda: [])
        self.stock = _View(self._stock, lambda v: None, lambda: [])

    @staticmethod
    def _product_from(r) -> Product:
        return Product(r['sku'], r['tenant_id'], r['name'], int(r['price_paise']), r['gtin'], r['brand'], r['channel_ids'] or {},
                       r['category_name'], None if r['mrp_paise'] is None else int(r['mrp_paise']))

    _PRODUCT_SQL = """SELECT p.*, c.name AS category_name FROM products p
                      JOIN categories c ON c.tenant_id = p.tenant_id AND c.id = p.category_id"""

    def _product(self, key):
        tid, sku = key
        with self.db.tx(tenant=tid) as cur:
            r = cur.execute(self._PRODUCT_SQL + ' WHERE p.tenant_id = %s AND p.sku = %s', (tid, sku)).fetchone()
        return self._product_from(r) if r else None

    def products_of(self, tenant_id: str) -> list[Product]:
        with self.db.tx(tenant=tenant_id) as cur:
            return [self._product_from(r) for r in cur.execute(self._PRODUCT_SQL + ' WHERE p.tenant_id = %s ORDER BY p.created_at, p.sku',
                                                               (tenant_id,)).fetchall()]

    def upsert(self, p: Product) -> Product:
        with self.db.tx(tenant=p.tenant_id) as cur:
            cat = _slug(p.category)
            cur.execute('INSERT INTO categories (tenant_id, id, name) VALUES (%s, %s, %s) ON CONFLICT DO NOTHING', (p.tenant_id, cat, p.category))
            cur.execute("""INSERT INTO products (tenant_id, sku, name, brand, category_id, gtin, mrp_paise, price_paise, channel_ids)
                           VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                           ON CONFLICT (tenant_id, sku) DO UPDATE SET name = EXCLUDED.name, brand = EXCLUDED.brand,
                               category_id = EXCLUDED.category_id, gtin = EXCLUDED.gtin, mrp_paise = EXCLUDED.mrp_paise,
                               price_paise = EXCLUDED.price_paise, channel_ids = EXCLUDED.channel_ids, updated_at = now()""",
                        (p.tenant_id, p.sku, p.name, p.brand, cat, p.gtin, p.mrp_paise, p.price_paise, Jsonb(p.channel_ids or {})))
        return p

    def images_of(self, tenant_id: str, sku: str) -> list[dict]:
        with self.db.tx(tenant=tenant_id) as cur:
            rows = cur.execute("""SELECT id, role, is_main, width, height, content_type, data FROM product_images
                                  WHERE tenant_id = %s AND sku = %s ORDER BY created_at, id""", (tenant_id, sku)).fetchall()
        return [{'id': r['id'], 'role': r['role'], 'main': r['is_main'], 'width': r['width'], 'height': r['height'],
                 'content_type': r['content_type'], 'data': bytes(r['data']) if r['data'] is not None else None} for r in rows]

    def apply_changes(self, tenant_id: str, prices: dict[str, int], images: list[dict]) -> dict:
        """Validate everything first (the same rules as in memory), then write prices and pictures in one transaction."""
        prepared = prepare_changes(tenant_id, prices, images, self._product, lambda sku: len(self.images_of(tenant_id, sku)))
        with self.db.tx(tenant=tenant_id) as cur:
            for sku, paise in prices.items():
                old = cur.execute('SELECT price_paise FROM products WHERE tenant_id = %s AND sku = %s FOR UPDATE', (tenant_id, sku)).fetchone()
                if old['price_paise'] != paise:
                    cur.execute('UPDATE products SET price_paise = %s, updated_at = now() WHERE tenant_id = %s AND sku = %s', (paise, tenant_id, sku))
                    cur.execute('INSERT INTO price_history (tenant_id, sku, old_paise, new_paise, reason) VALUES (%s, %s, %s, %s, %s)',
                                (tenant_id, sku, old['price_paise'], paise, 'Catalogue page'))
            for sku, rec in prepared:
                has_main = cur.execute('SELECT 1 FROM product_images WHERE tenant_id = %s AND sku = %s AND is_main', (tenant_id, sku)).fetchone()
                rec['main'] = not has_main
                cur.execute("""INSERT INTO product_images (id, tenant_id, sku, role, is_main, storage_key, content_type, width, height, bytes, data)
                               VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)""",
                            (rec['id'], tenant_id, sku, rec['role'], rec['main'], f'db:{rec["id"]}', rec['content_type'], rec['width'],
                             rec['height'], len(rec['data']), rec['data']))
        return {'prices_changed': len(prices), 'images_added': len(prepared), 'image_ids': [r['id'] for _, r in prepared]}

    def _stock(self, key):
        tid, loc, sku = key
        with self.db.tx(tenant=tid) as cur:
            r = cur.execute('SELECT on_hand, reserved, buffer FROM stock_levels WHERE tenant_id = %s AND location_id = %s AND sku = %s',
                            (tid, loc, sku)).fetchone()
        return StockLevel(r['on_hand'], r['reserved'], r['buffer']) if r else None

    def set_stock(self, tenant_id: str, location_id: str, sku: str, on_hand: int, buffer: int = 0) -> StockLevel:
        """Set a counted quantity. The difference is written to the stock ledger as a count, so on hand always equals
        the sum of its movements."""
        with self.db.tx(tenant=tenant_id) as cur:
            cur.execute("""INSERT INTO stock_levels (tenant_id, location_id, sku) VALUES (%s, %s, %s) ON CONFLICT DO NOTHING""",
                        (tenant_id, location_id, sku))
            r = cur.execute('SELECT on_hand, reserved FROM stock_levels WHERE tenant_id = %s AND location_id = %s AND sku = %s FOR UPDATE',
                            (tenant_id, location_id, sku)).fetchone()
            if on_hand < r['reserved']:
                raise CatalogError(f"{r['reserved']} are reserved for open orders; on hand cannot be less")
            diff = on_hand - r['on_hand']
            if diff:
                cur.execute("""INSERT INTO stock_movements (tenant_id, location_id, sku, qty_change, reason, reference)
                               VALUES (%s, %s, %s, %s, 'count', 'Stock update')""", (tenant_id, location_id, sku, diff))
            cur.execute("""UPDATE stock_levels SET on_hand = %s, buffer = %s, updated_at = now()
                           WHERE tenant_id = %s AND location_id = %s AND sku = %s""", (on_hand, buffer, tenant_id, location_id, sku))
        return StockLevel(on_hand, r['reserved'], buffer)

    def availability(self, tenant_id: str, locations: list[str] | None = None) -> list[dict]:
        with self.db.tx(tenant=tenant_id) as cur:
            rows = cur.execute("""SELECT sku, location_id, available FROM channel_available_stock WHERE tenant_id = %s
                                  AND (%s::text[] IS NULL OR location_id = ANY(%s::text[])) ORDER BY location_id, sku""",
                               (tenant_id, locations or None, locations or None)).fetchall()
        return [{'sku': r['sku'], 'location_id': r['location_id'], 'available': r['available']} for r in rows]


# ---------------------------------------------------------------- orders
class PgOrderService:
    """Order intake: de-duplication by the channel's order id, and stock reserved in the same transaction."""

    def __init__(self, db: Database, catalog: PgCatalog):
        self.db, self.catalog = db, catalog
        self.events: list[dict] = []

    def ingest(self, tenant_id: str, channel: str, connection_id: str, channel_order_id: str,
               lines: list[dict], customer_ref: str | None = None) -> tuple[Order, bool]:
        try:
            with self.db.tx(tenant=tenant_id) as cur:
                existing = cur.execute('SELECT id FROM orders WHERE tenant_id = %s AND channel = %s AND channel_order_id = %s',
                                       (tenant_id, channel, channel_order_id)).fetchone()
                if existing:
                    return self._load(cur, existing['id']), False
                oid, decided, unmatched, subtotal = new_id('ord'), [], [], 0
                for n, line in enumerate(lines, 1):
                    sku, qty = line['sku'], int(line['qty'])
                    prod = cur.execute('SELECT price_paise FROM products WHERE tenant_id = %s AND sku = %s', (tenant_id, sku)).fetchone()
                    if not prod:
                        unmatched.append({'line_no': n, 'sku': sku, 'qty': qty, 'price_paise': int(line.get('price_paise', 0))})
                        continue
                    price = int(line.get('price_paise') or prod['price_paise'])
                    loc = cur.execute("""SELECT location_id FROM stock_levels WHERE tenant_id = %s AND sku = %s
                                         AND on_hand - buffer - reserved >= %s ORDER BY location_id LIMIT 1 FOR UPDATE""",
                                      (tenant_id, sku, qty)).fetchone()
                    loc = loc['location_id'] if loc else None
                    if loc:
                        cur.execute('UPDATE stock_levels SET reserved = reserved + %s WHERE tenant_id = %s AND location_id = %s AND sku = %s',
                                    (qty, tenant_id, loc, sku))
                    decided.append((n, sku, qty, price, loc))
                    subtotal += qty * price
                short = bool(unmatched) or any(loc is None for *_, loc in decided)
                first_loc = next((loc for *_, loc in decided if loc), None)
                cust = cur.execute('SELECT id FROM customers WHERE tenant_id = %s AND id = %s', (tenant_id, customer_ref)).fetchone() if customer_ref else None
                cur.execute("""INSERT INTO orders (id, tenant_id, channel, connection_id, channel_order_id, customer_id, customer_ref,
                                   location_id, fulfilment, status, subtotal_paise, total_paise, unmatched_lines)
                               VALUES (%s, %s, %s, %s, %s, %s, %s, %s, 'immediate', %s, %s, %s, %s)""",
                            (oid, tenant_id, channel, connection_id, channel_order_id, cust['id'] if cust else None, customer_ref,
                             first_loc, 'partially_unavailable' if short else 'received', subtotal, subtotal, Jsonb(unmatched)))
                for n, sku, qty, price, loc in decided:
                    cur.execute("""INSERT INTO order_lines (tenant_id, order_id, line_no, sku, qty, unit_price_paise, line_total_paise, qty_unavailable)
                                   VALUES (%s, %s, %s, %s, %s, %s, %s, %s)""", (tenant_id, oid, n, sku, qty, price, qty * price, 0 if loc else qty))
                    if loc:
                        cur.execute("""INSERT INTO stock_reservations (tenant_id, order_id, location_id, sku, qty) VALUES (%s, %s, %s, %s, %s)
                                       ON CONFLICT (order_id, location_id, sku) DO UPDATE SET qty = stock_reservations.qty + EXCLUDED.qty""",
                                    (tenant_id, oid, loc, sku, qty))
                cur.execute("""INSERT INTO audit_log (tenant_id, actor_kind, actor_label, action, entity_type, entity_id, detail)
                               VALUES (%s, 'system', %s, 'order.received', 'order', %s, %s)""",
                            (tenant_id, CHANNEL_NAMES.get(channel, channel), oid, Jsonb({'channel_order_id': channel_order_id})))
                order = self._load(cur, oid)
        except errors.UniqueViolation:                     # the same order arrived twice at the same moment
            with self.db.tx(tenant=tenant_id) as cur:
                r = cur.execute('SELECT id FROM orders WHERE tenant_id = %s AND channel = %s AND channel_order_id = %s',
                                (tenant_id, channel, channel_order_id)).fetchone()
                return self._load(cur, r['id']), False
        self.events.append({'type': 'order.received', 'order_id': oid, 'tenant_id': tenant_id, 'channel': channel})
        return order, True

    @staticmethod
    def _load_many(cur, where: str, args: tuple) -> list[Order]:
        """Orders with their lines in three queries, whatever the number of orders."""
        orders = cur.execute(f'SELECT * FROM orders WHERE {where} ORDER BY placed_at, id', args).fetchall()
        ids = [o['id'] for o in orders]
        if not ids:
            return []
        res: dict = {}
        for r in cur.execute('SELECT order_id, sku, location_id FROM stock_reservations WHERE order_id = ANY(%s)', (ids,)):
            res[(r['order_id'], r['sku'])] = r['location_id']
        lines: dict = {}
        for r in cur.execute('SELECT * FROM order_lines WHERE order_id = ANY(%s)', (ids,)):
            loc = res.get((r['order_id'], r['sku'])) if r['qty_unavailable'] == 0 else None
            lines.setdefault(r['order_id'], []).append((r['line_no'], OrderLine(r['sku'], r['qty'], int(r['unit_price_paise']), loc)))
        out = []
        for o in orders:
            ls = lines.get(o['id'], []) + [(u['line_no'], OrderLine(u['sku'], u['qty'], u['price_paise'], None)) for u in o['unmatched_lines']]
            out.append(Order(o['id'], o['tenant_id'], o['channel'], o['connection_id'], o['channel_order_id'],
                             [x for _, x in sorted(ls, key=lambda t: t[0])], o['customer_ref'], o['status'], o['placed_at'].timestamp()))
        return out

    def _load(self, cur, oid: str) -> Order:
        return self._load_many(cur, 'id = %s', (oid,))[0]

    def of_tenant(self, tenant_id: str) -> list[Order]:
        with self.db.tx(tenant=tenant_id) as cur:
            return self._load_many(cur, 'tenant_id = %s', (tenant_id,))


# ---------------------------------------------------------------- vault, connections, refresh tokens
class PgVault:
    """Channel credentials encrypted with the tenant's data key, which is itself encrypted with the master key
    (AFM_VAULT_MASTER_KEY). The database only ever holds ciphertext."""

    def __init__(self, db: Database, master_key: str | None):
        if not master_key:
            raise RuntimeError('AFM_VAULT_MASTER_KEY must be set when using PostgreSQL, or stored credentials could not be read after a restart.')
        self.db, self._master = db, Fernet(master_key)

    def _tenant_fernet(self, cur, tenant_id: str) -> Fernet:
        r = cur.execute('SELECT wrapped_key FROM tenant_data_keys WHERE tenant_id = %s AND retired_at IS NULL ORDER BY key_version DESC LIMIT 1',
                        (tenant_id,)).fetchone()
        if not r:
            wrapped = self._master.encrypt(Fernet.generate_key())
            cur.execute('INSERT INTO tenant_data_keys (tenant_id, key_version, wrapped_key) VALUES (%s, 1, %s)', (tenant_id, wrapped))
            return Fernet(self._master.decrypt(wrapped))
        return Fernet(self._master.decrypt(bytes(r['wrapped_key'])))

    def put(self, tenant_id: str, secret: dict) -> str:
        ref = f'crd_{secrets.token_hex(8)}'
        with self.db.tx(tenant=tenant_id) as cur:
            blob = self._tenant_fernet(cur, tenant_id).encrypt(json.dumps(secret).encode())
            cur.execute('INSERT INTO channel_credentials (ref, tenant_id, ciphertext, fields_present) VALUES (%s, %s, %s, %s)',
                        (ref, tenant_id, blob, sorted(secret)))
        return ref

    def get_for_connector(self, tenant_id: str, ref: str) -> dict:
        with self.db.tx(tenant=tenant_id) as cur:
            r = cur.execute('SELECT ciphertext FROM channel_credentials WHERE ref = %s', (ref,)).fetchone()
            if r:
                return json.loads(self._tenant_fernet(cur, tenant_id).decrypt(bytes(r['ciphertext'])))
        if self.describe(ref)['stored']:
            raise PermissionError('credential belongs to another tenant')
        raise KeyError(ref)

    def revoke(self, ref: str) -> None:
        with self.db.tx(platform=True) as cur:
            cur.execute('DELETE FROM channel_credentials WHERE ref = %s', (ref,))

    def describe(self, ref: str) -> dict:
        """Safe metadata only: existence and owner, never the secret."""
        with self.db.tx(platform=True) as cur:
            r = cur.execute('SELECT tenant_id FROM channel_credentials WHERE ref = %s', (ref,)).fetchone()
        return {'ref': ref, 'tenant_id': r['tenant_id'], 'stored': True} if r else {'ref': ref, 'stored': False}


class PgConnections(_View):
    def __init__(self, db: Database):
        self.db = db
        super().__init__(self._one, self._save, lambda: self._many('SELECT * FROM channel_connections ORDER BY created_at, id', (), platform=True))

    @staticmethod
    def _from(r) -> Connection:
        return Connection(r['id'], r['tenant_id'], r['channel'], r['mode'], r['status'], r['credentials_ref'], r['settings'] or {})

    def _many(self, query, args, **scope):
        with self.db.tx(**scope) as cur:
            return [self._from(r) for r in cur.execute(query, args).fetchall()]

    def _one(self, cid):
        rows = self._many('SELECT * FROM channel_connections WHERE id = %s', (cid,), platform=True)    # webhooks route by id
        return rows[0] if rows else None

    def of_tenant(self, tenant_id: str) -> list[Connection]:
        return self._many('SELECT * FROM channel_connections WHERE tenant_id = %s ORDER BY created_at, id', (tenant_id,), tenant=tenant_id)

    def _save(self, c: Connection) -> None:
        with self.db.tx(tenant=c.tenant_id) as cur:
            cur.execute("""INSERT INTO channel_connections (id, tenant_id, channel, display_name, mode, status, credentials_ref, settings)
                           VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                           ON CONFLICT (id) DO UPDATE SET mode = EXCLUDED.mode, status = EXCLUDED.status,
                               credentials_ref = EXCLUDED.credentials_ref, settings = EXCLUDED.settings""",
                        (c.id, c.tenant_id, c.channel, CHANNEL_NAMES.get(c.channel, c.channel), c.mode, c.status, c.credentials_ref,
                         Jsonb(c.settings or {})))
            if c.credentials_ref:
                cur.execute('UPDATE channel_credentials SET connection_id = %s WHERE ref = %s AND connection_id IS NULL', (c.id, c.credentials_ref))


class PgRefreshTokens:
    """Rotating refresh tokens in the database, so any copy of the API can rotate or revoke them. Only hashes are stored."""

    def __init__(self, db: Database, clock=time.time):
        self.db, self.clock = db, clock

    def issue(self, p: Principal, ttl_s: int, family: str | None = None, cur=None) -> str:
        tok = secrets.token_urlsafe(32)
        args = (_h(tok), family or secrets.token_hex(8), p.kind, p.sub, p.tenant_id, _ts(self.clock() + ttl_s), Jsonb(asdict(p)))
        q = """INSERT INTO refresh_tokens (token_hash, family_id, subject_kind, subject_id, tenant_id, expires_at, principal)
               VALUES (%s, %s, %s, %s, %s, %s, %s)"""
        if cur is not None:
            cur.execute(q, args)
        else:
            with self.db.tx(platform=True) as c:
                c.execute(q, args)
        return tok

    def rotate(self, token: str, ttl_s: int) -> tuple[Principal, str]:
        error = None
        with self.db.tx(platform=True) as cur:
            r = cur.execute('SELECT * FROM refresh_tokens WHERE token_hash = %s FOR UPDATE', (_h(token or ''),)).fetchone()
            revoked = r and cur.execute('SELECT 1 FROM refresh_tokens WHERE family_id = %s AND revoked_at IS NOT NULL LIMIT 1',
                                        (r['family_id'],)).fetchone()
            if not r or revoked:
                error = 'Session expired. Sign in again'
            elif r['used_at'] is not None:                 # replay: end the session everywhere (kept: the block commits)
                cur.execute('UPDATE refresh_tokens SET revoked_at = now() WHERE family_id = %s', (r['family_id'],))
                error = 'Session revoked. Sign in again'
            elif self.clock() > r['expires_at'].timestamp():
                error = 'Session expired. Sign in again'
            else:
                cur.execute('UPDATE refresh_tokens SET used_at = now() WHERE token_hash = %s', (r['token_hash'],))
                p = Principal(**r['principal'])
                new = self.issue(p, ttl_s, r['family_id'], cur=cur)
        if error:
            raise AuthError(error)
        return p, new

    def revoke_subject(self, sub: str) -> None:
        with self.db.tx(platform=True) as cur:
            cur.execute('UPDATE refresh_tokens SET revoked_at = now() WHERE subject_id = %s AND revoked_at IS NULL', (sub,))


class PgBackend:
    """Everything Platform needs, on one database."""

    def __init__(self, url: str, app_role: str | None, master_key: str | None):
        self.db = Database(url, app_role)
        self.store = PgStore(self.db)
        self.catalog = PgCatalog(self.db)
        self.orders = PgOrderService(self.db, self.catalog)
        self.vault = PgVault(self.db, master_key)
        self.connections = PgConnections(self.db)
        self.refresh = PgRefreshTokens(self.db)

    def ensure_platform_admin(self, admin: StaffUser) -> None:
        """Create the platform administrator once; an existing one keeps its password."""
        if self.store.staff_by_email(admin.email) is None:
            self.store.save_staff(admin)

    def close(self) -> None:
        self.db.close()
