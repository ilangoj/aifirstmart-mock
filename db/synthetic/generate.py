"""Synthetic data for the AIFirstMart database: deterministic, consistent, and clearly marked as synthetic.

    python afm.py db seed --scale small --seed 42        load into AFM_DATABASE_URL
    python afm.py db export --out data/                  write CSV files instead

The same scale and seed always give exactly the same rows (no use of the clock or of global randomness), so tests
and demos are repeatable. The data follows the platform's rules, and db check verifies them:
  * order totals = lines - discount + delivery fee; GST is included in prices
  * weekly and monthly plan orders follow each plan's schedule; immediate orders are everything else
  * stock_levels.on_hand = the sum of its stock_movements; reserved = open reservations; reserved <= on_hand
  * refunds: a Payment approver approves up to their limit; above that the owner; above Rs 25,000 a second approver
  * one active connection per channel; live connections have credentials; jobs retry and some end up dead
Phone numbers and e-mail addresses are invented (e-mail on .example domains, which can never be real).
"""
from __future__ import annotations

import hashlib
import random
from datetime import datetime, timedelta, timezone

from db.synthetic import reference as R

IST = timezone(timedelta(hours=5, minutes=30))
AS_OF = datetime(2026, 10, 15, 21, 0, tzinfo=IST)          # fixed, so output does not depend on the day it runs
HISTORY_DAYS = 180
SCALES = {'small': 1, 'medium': 5, 'large': 20}
SYNTHETIC_PASSWORD = 'Synthetic-Staff-2026'               # every synthetic staff account; never use in production
REFUND_APPROVER_LIMIT = 1_000_000                          # Rs 10,000 in paise (backend authz.py)
OWNER_SECOND_APPROVER_ABOVE = 2_500_000                    # Rs 25,000

# Parents before children: the order rows are loaded in.
COLUMNS = {
    'tenants': ['id', 'name', 'type', 'status', 'gstin', 'pan', 'fssai_licence', 'legal_address', 'synthetic', 'created_at', 'updated_at'],
    'locations': ['id', 'tenant_id', 'name', 'kind', 'code', 'address', 'pincode', 'latitude', 'longitude', 'active', 'created_at'],
    'staff_users': ['id', 'tenant_id', 'email', 'display_name', 'password_hash', 'mfa_enabled', 'active', 'failed_logins', 'last_login_at', 'created_at'],
    'staff_role_assignments': ['tenant_id', 'user_id', 'role', 'valid_until', 'reason', 'granted_by', 'granted_at'],
    'staff_store_access': ['tenant_id', 'user_id', 'location_id'],
    'staff_limits': ['tenant_id', 'user_id', 'limit_name', 'value'],
    'customers': ['id', 'tenant_id', 'display_name', 'email', 'phone_e164', 'preferred_lang', 'whatsapp_opt_in', 'created_at'],
    'customer_addresses': ['id', 'tenant_id', 'customer_id', 'label', 'line1', 'town', 'district', 'state', 'pincode', 'is_default'],
    'service_clients': ['id', 'tenant_id', 'name', 'secret_hash', 'scopes', 'active', 'created_at'],
    'categories': ['tenant_id', 'id', 'name', 'name_ta', 'parent_id', 'gst_rate_pct'],
    'products': ['tenant_id', 'sku', 'name', 'name_ta', 'brand', 'category_id', 'gtin', 'hsn_code', 'unit', 'pack_size',
                 'mrp_paise', 'price_paise', 'status', 'perishable', 'plan_eligible', 'created_at', 'updated_at'],
    'product_images': ['id', 'tenant_id', 'sku', 'role', 'is_main', 'storage_key', 'content_type', 'width', 'height', 'bytes', 'created_at'],
    'price_history': ['tenant_id', 'sku', 'old_paise', 'new_paise', 'changed_by', 'reason', 'changed_at'],
    'stock_levels': ['tenant_id', 'location_id', 'sku', 'on_hand', 'reserved', 'buffer', 'reorder_point', 'updated_at'],
    'stock_movements': ['tenant_id', 'location_id', 'sku', 'qty_change', 'reason', 'reference', 'actor_id', 'at'],
    'channel_connections': ['id', 'tenant_id', 'channel', 'display_name', 'mode', 'status', 'credentials_ref', 'settings',
                            'rate_limit_per_min', 'last_success_at', 'last_error', 'created_at'],
    'tenant_data_keys': ['tenant_id', 'key_version', 'wrapped_key', 'created_at', 'retired_at'],
    'channel_credentials': ['ref', 'tenant_id', 'connection_id', 'ciphertext', 'key_version', 'fields_present', 'rotated_at'],
    'delivery_plans': ['id', 'tenant_id', 'customer_id', 'location_id', 'address_id', 'cadence', 'delivery_day', 'slot',
                       'status', 'next_delivery', 'started_on', 'created_at'],
    'delivery_plan_items': ['tenant_id', 'plan_id', 'sku', 'qty'],
    'orders': ['id', 'tenant_id', 'channel', 'connection_id', 'channel_order_id', 'customer_id', 'location_id', 'fulfilment',
               'plan_id', 'status', 'subtotal_paise', 'discount_paise', 'delivery_fee_paise', 'tax_paise', 'total_paise',
               'placed_at', 'updated_at'],
    'order_lines': ['tenant_id', 'order_id', 'line_no', 'sku', 'qty', 'unit_price_paise', 'line_total_paise', 'qty_unavailable'],
    'stock_reservations': ['tenant_id', 'order_id', 'location_id', 'sku', 'qty', 'created_at', 'released_at'],
    'payments': ['id', 'tenant_id', 'order_id', 'method', 'status', 'amount_paise', 'provider_ref', 'captured_at'],
    'refunds': ['id', 'tenant_id', 'order_id', 'payment_id', 'amount_paise', 'reason', 'status', 'requested_by', 'requested_at', 'paid_at'],
    'refund_approvals': ['tenant_id', 'refund_id', 'step', 'approver_id', 'decision', 'note', 'decided_at'],
    'shipments': ['id', 'tenant_id', 'order_id', 'location_id', 'method', 'rider_id', 'carrier', 'tracking_ref', 'status',
                  'slot_date', 'slot', 'dispatched_at', 'delivered_at'],
    'channel_listings': ['tenant_id', 'connection_id', 'sku', 'channel_item_id', 'listing_status', 'last_price_paise',
                         'last_qty_sent', 'last_synced_at', 'last_error'],
    'webhook_events': ['tenant_id', 'connection_id', 'external_event_id', 'event_type', 'signature_valid', 'payload',
                       'received_at', 'processed_at', 'result', 'error'],
    'jobs': ['tenant_id', 'connection_id', 'kind', 'payload', 'idempotency_key', 'status', 'attempts', 'max_attempts',
             'run_after', 'locked_by', 'locked_at', 'last_error', 'created_at', 'finished_at'],
    'audit_log': ['tenant_id', 'at', 'actor_kind', 'actor_id', 'actor_label', 'action', 'entity_type', 'entity_id', 'location_id', 'detail'],
}

CONNECTOR_CHANNELS = {'mobile_app', 'whatsapp', 'facebook', 'amazon', 'flipkart', 'ondc'}
CHANNEL_NAMES = {'mobile_app': 'Mobile app', 'whatsapp': 'WhatsApp', 'facebook': 'Facebook and Instagram',
                 'amazon': 'Amazon', 'flipkart': 'Flipkart', 'ondc': 'ONDC'}
CREDENTIAL_FIELDS = {'mobile_app': ['project', 'key'], 'whatsapp': ['phoneId', 'wabaId', 'token', 'secret'],
                     'facebook': ['catalogId', 'token'], 'amazon': ['seller', 'client', 'secret', 'refresh'],
                     'flipkart': ['appId', 'secret'], 'ondc': ['subscriberId', 'signingKey']}


def ean13(rng: random.Random, prefix: str = '890') -> str:
    """A GTIN-13 with a correct check digit (890 is GS1 India's prefix)."""
    body = prefix + ''.join(str(rng.randrange(10)) for _ in range(12 - len(prefix)))
    total = sum(int(d) * (3 if i % 2 else 1) for i, d in enumerate(body))
    return body + str((10 - total % 10) % 10)


class Ids:
    def __init__(self, rng: random.Random):
        self.rng, self.seen = rng, set()

    def __call__(self, prefix: str) -> str:
        while True:
            v = f'{prefix}_{self.rng.getrandbits(48):012x}'
            if v not in self.seen:
                self.seen.add(v)
                return v


def generate(scale: str = 'small', seed: int = 42) -> dict[str, list[dict]]:
    if scale not in SCALES:
        raise ValueError(f'scale must be one of {", ".join(SCALES)}')
    k = SCALES[scale]
    rng = random.Random(f'afm-synthetic-{seed}')
    new = Ids(rng)
    out: dict[str, list[dict]] = {t: [] for t in COLUMNS}
    start = AS_OF - timedelta(days=HISTORY_DAYS)

    def when(day_offset: float, hour_lo: int = 8, hour_hi: int = 21) -> datetime:
        d = start + timedelta(days=day_offset)
        return d.replace(hour=rng.randint(hour_lo, hour_hi), minute=rng.randrange(60), second=rng.randrange(60), microsecond=0)

    salt = hashlib.sha256(f'salt-{seed}'.encode()).digest()[:16]
    pw_hash = f'pbkdf2_sha256$210000${salt.hex()}${hashlib.pbkdf2_hmac("sha256", SYNTHETIC_PASSWORD.encode(), salt, 210_000).hex()}'

    def person() -> str:
        return f'{rng.choice(R.FIRST_NAMES)} {rng.choice(R.LAST_NAMES)}'

    def audit(tid, at, actor, action, etype, eid, loc=None, **detail):
        out['audit_log'].append({'tenant_id': tid, 'at': at, 'actor_kind': 'staff' if actor else 'system',
                                 'actor_id': actor['id'] if actor else None,
                                 'actor_label': f'{actor["display_name"]} ({actor["label"]})' if actor else 'AIFirstMart',
                                 'action': action, 'entity_type': etype, 'entity_id': eid, 'location_id': loc, 'detail': detail})

    out['staff_users'].append({'id': new('usr'), 'tenant_id': None, 'email': 'admin@aifirstmart.example',
                               'display_name': 'Platform administrator', 'password_hash': pw_hash, 'mfa_enabled': True,
                               'active': True, 'failed_logins': 0, 'last_login_at': AS_OF - timedelta(hours=3), 'created_at': start})

    tenants = []
    for spec in R.TENANTS:
        tid = f'ten_{spec["key"]}'
        T = {'id': tid, 'spec': spec, 'locs': [], 'stores': [], 'warehouses': [], 'staff': {}, 'riders': {},
             'customers': [], 'products': [], 'connections': {}}
        tenants.append(T)
        gstin = f'{spec["state_code"]}{spec["pan"]}1Z{rng.choice("0123456789ABCDEFGHJKLMNPQRSTUVWXYZ")}'
        out['tenants'].append({'id': tid, 'name': spec['name'], 'type': spec['type'], 'status': 'active', 'gstin': gstin,
                               'pan': spec['pan'], 'fssai_licence': ''.join(str(rng.randrange(10)) for _ in range(14)),
                               'legal_address': {'line1': f'{rng.randint(1, 120)}, {rng.choice(R.STREETS)}',
                                                 'town': spec['locations'][0][3], 'district': spec['locations'][0][4],
                                                 'state': 'Tamil Nadu', 'pincode': spec['locations'][0][5]},
                               'synthetic': True, 'created_at': start, 'updated_at': start})
        for code, name, kind, town, district, pin, lat, lon in spec['locations']:
            loc = {'id': new('loc'), 'tenant_id': tid, 'name': name, 'kind': kind, 'code': code,
                   'address': {'line1': f'{rng.randint(1, 200)}, {rng.choice(R.STREETS)}', 'town': town,
                               'district': district, 'state': 'Tamil Nadu', 'pincode': pin},
                   'pincode': pin, 'latitude': lat, 'longitude': lon, 'active': True, 'created_at': start}
            out['locations'].append(loc)
            T['locs'].append(loc)
            (T['stores'] if kind in ('store', 'dark_store') else T['warehouses']).append(loc)

        # ---- staff
        plan = R.STAFF_PLAN_RETAILER if spec['type'] == 'retailer' else R.STAFF_PLAN_BRAND
        used_emails = set()
        owner = None
        for role, count, per in plan:
            homes = T['stores'] if per is True else T['warehouses'] if per == 'warehouse' else [None]
            for home in homes:
                for _ in range(count):
                    name = person()
                    base = name.lower().replace(' ', '.')
                    email, n = f'{base}@{spec["domain"]}', 2
                    while email in used_emails:
                        email, n = f'{base}{n}@{spec["domain"]}', n + 1
                    used_emails.add(email)
                    u = {'id': new('usr'), 'tenant_id': tid, 'email': email, 'display_name': name, 'password_hash': pw_hash,
                         'mfa_enabled': role in ('tenant_owner', 'tenant_admin', 'store_manager', 'finance', 'payment_approver'),
                         'active': True, 'failed_logins': 0, 'last_login_at': AS_OF - timedelta(hours=rng.randint(1, 240)),
                         'created_at': start, 'label': R.ROLE_LABELS[role], 'home': home}
                    out['staff_users'].append(u)
                    if role is None:
                        T['riders'].setdefault(home['id'], []).append(u)
                        continue
                    T['staff'].setdefault(role, []).append(u)
                    owner = owner or (u if role == 'tenant_owner' else None)
                    out['staff_role_assignments'].append({'tenant_id': tid, 'user_id': u['id'], 'role': role, 'valid_until': None,
                                                          'reason': None, 'granted_by': owner['id'] if owner and owner is not u else None,
                                                          'granted_at': start})
                    if home is not None and role in ('cashier', 'store_manager', 'warehouse_supervisor'):
                        out['staff_store_access'].append({'tenant_id': tid, 'user_id': u['id'], 'location_id': home['id']})
                    if role == 'cashier':
                        out['staff_limits'].append({'tenant_id': tid, 'user_id': u['id'], 'limit_name': 'discount_pct',
                                                    'value': rng.choice([5, 5, 10])})
        for i, u in enumerate(T['staff'].get('payment_approver', [])):
            u['refund_limit'] = REFUND_APPROVER_LIMIT if i == 0 else REFUND_APPROVER_LIMIT // 2
            out['staff_limits'].append({'tenant_id': tid, 'user_id': u['id'], 'limit_name': 'refund_paise', 'value': u['refund_limit']})
        # A temporary role: a store manager covering inventory for two weeks, with a reason.
        if T['staff'].get('store_manager'):
            sm = T['staff']['store_manager'][0]
            out['staff_role_assignments'].append({'tenant_id': tid, 'user_id': sm['id'], 'role': 'inventory_manager',
                                                  'valid_until': AS_OF + timedelta(days=9), 'reason': 'Covering annual leave',
                                                  'granted_by': owner['id'], 'granted_at': AS_OF - timedelta(days=5)})
            audit(tid, AS_OF - timedelta(days=5), owner, 'role.grant_temporary', 'staff_user', sm['id'],
                  role='inventory_manager', days=14, reason='Covering annual leave')
        T['owner'] = owner

        # ---- catalogue
        for cid, cname, cta, gst in R.CATEGORIES:
            out['categories'].append({'tenant_id': tid, 'id': cid, 'name': cname, 'name_ta': cta, 'parent_id': None, 'gst_rate_pct': gst})
        gst_of = {c[0]: c[3] for c in R.CATEGORIES}
        items = ([(n, ta, b, c, p, u, m, per, h) for n, ta, b, c, p, u, m, per, h in R.CATALOGUE] if spec['type'] == 'retailer'
                 else [(n, ta, 'Kaveri', c, p, 'pack', m, False, h) for n, ta, c, p, m, h in R.BRAND_CATALOGUE])
        if spec['type'] == 'retailer' and k > 1:            # larger scales: more pack sizes of the same goods
            extra = []
            for mult, tag in ((2, 'Family pack'), (5, 'Bulk pack'))[:min(k - 1, 2)]:
                extra += [(f'{n} ({tag})', None, b, c, f'{p} x{mult}', 'pack', round(m * mult * 0.95), per, h)
                          for n, ta, b, c, p, u, m, per, h in R.CATALOGUE if not per]
            items += extra
        pricing = (T['staff'].get('pricing_manager') or [owner])[0]
        for i, (n, ta, b, c, p, u, mrp, per, h) in enumerate(items):
            sku = f'{8901001 + i}' if spec['key'] == 'demoretail' else f'{spec["key"][:2].upper()}{1001 + i}'
            mrp_p = mrp * 100
            price = max(100, round(mrp * rng.choice([1, 1, 0.98, 0.95, 0.92, 0.9])) * 100)
            prod = {'tenant_id': tid, 'sku': sku, 'name': n, 'name_ta': ta, 'brand': b, 'category_id': c,
                    'gtin': None if c == 'produce' else ean13(rng), 'hsn_code': h, 'unit': u, 'pack_size': p,
                    'mrp_paise': mrp_p, 'price_paise': price, 'status': 'active', 'perishable': per,
                    'plan_eligible': c != 'household' or rng.random() < 0.5, 'created_at': start, 'updated_at': start,
                    'gst': gst_of[c], 'changes': []}
            # Price history: up to three changes on distinct days, in time order, ending at today's price
            nchg = rng.choice([0, 0, 1, 1, 2, 3])
            prices = [max(100, min(mrp_p, price + rng.choice([-2, -1, 1, 2, 3]) * 100 * max(1, mrp // 100))) for _ in range(nchg)] + [price]
            days = sorted(rng.sample(range(5, HISTORY_DAYS - 1), len(prices) - 1))
            for j in range(1, len(prices)):
                if prices[j] == prices[j - 1]:
                    continue
                at = when(days[j - 1])
                prod['changes'].append((at, prices[j - 1], prices[j]))
                out['price_history'].append({'tenant_id': tid, 'sku': sku, 'old_paise': prices[j - 1], 'new_paise': prices[j],
                                             'changed_by': pricing['id'], 'reason': rng.choice(['Supplier price change', 'Weekly offer', 'Competitor price', 'Offer ended']),
                                             'changed_at': at})
                audit(tid, at, pricing, 'price.change', 'product', sku, old_paise=prices[j - 1], new_paise=prices[j])
            prod['first_price'] = prices[0] if prod['changes'] else price
            prod['updated_at'] = prod['changes'][-1][0] if prod['changes'] else start
            out['products'].append(prod)
            T['products'].append(prod)
            for r_i, role in enumerate(['Front', 'Back', 'Ingredients'][:rng.choice([1, 1, 2, 3])]):
                img = new('img')
                out['product_images'].append({'id': img, 'tenant_id': tid, 'sku': sku, 'role': role, 'is_main': r_i == 0,
                                              'storage_key': f'tenants/{tid}/products/{sku}/{img}.webp', 'content_type': 'image/webp',
                                              'width': rng.choice([800, 1000, 1200]), 'height': rng.choice([800, 1000, 1200]),
                                              'bytes': rng.randint(40_000, 400_000), 'created_at': start + timedelta(days=rng.randint(0, 30))})

        # ---- channel connections, credentials and data keys
        out['tenant_data_keys'].append({'tenant_id': tid, 'key_version': 1, 'wrapped_key': rng.randbytes(60),
                                        'created_at': start, 'retired_at': None})
        admin = (T['staff'].get('tenant_admin') or [owner])[0]
        for ch, state in spec['channels'].items():
            cid = new('con')
            live = state == 'live'
            cref = new('crd') if live or rng.random() < 0.5 else None
            con = {'id': cid, 'tenant_id': tid, 'channel': ch, 'display_name': CHANNEL_NAMES[ch], 'mode': 'live' if live else 'sandbox',
                   'status': 'live' if live else 'sandbox', 'credentials_ref': cref,
                   'settings': {'location_map': {l['code']: l['id'] for l in (T['warehouses'] if ch in ('amazon', 'flipkart') and T['warehouses'] else T['stores'] or T['warehouses'])}},
                   'rate_limit_per_min': {'amazon': 30, 'flipkart': 60, 'ondc': 120, 'whatsapp': 600}.get(ch, 120),
                   'last_success_at': AS_OF - timedelta(minutes=rng.randint(1, 50)), 'last_error': None, 'created_at': start}
            out['channel_connections'].append(con)
            T['connections'][ch] = con
            if cref:
                out['channel_credentials'].append({'ref': cref, 'tenant_id': tid, 'connection_id': cid, 'ciphertext': rng.randbytes(96),
                                                   'key_version': 1, 'fields_present': CREDENTIAL_FIELDS[ch],
                                                   'rotated_at': start + timedelta(days=rng.randint(0, 60))})
            audit(tid, start + timedelta(days=1), admin, 'connection.create', 'channel_connection', cid, channel=ch)
            if live:
                audit(tid, start + timedelta(days=rng.randint(10, 40)), owner, 'connection.go_live', 'channel_connection', cid, channel=ch)
        T['admin'] = admin

    # ---- customers and addresses (retailers only; marketplace buyers stay with the marketplace)
    n_customers = 1500 * k
    retailers = [T for T in tenants if T['spec']['type'] == 'retailer']
    phones = set()
    for T in retailers:
        for i in range(int(n_customers * T['spec']['customers_share'])):
            name = person()
            while True:
                ph = f'+91{rng.choice("6789")}{rng.randrange(10**9):09d}'
                if ph not in phones:
                    phones.add(ph)
                    break
            c = {'id': new('cus'), 'tenant_id': T['id'], 'display_name': name,
                 'email': f'{name.lower().replace(" ", ".")}.{i}@mail.example' if rng.random() < 0.6 else None,
                 'phone_e164': ph, 'preferred_lang': 'ta' if rng.random() < 0.45 else 'en',
                 'whatsapp_opt_in': rng.random() < 0.55, 'created_at': when(rng.uniform(0, HISTORY_DAYS - 1))}
            out['customers'].append(c)
            home = rng.choice(T['stores'])
            a = {'id': new('adr'), 'tenant_id': T['id'], 'customer_id': c['id'], 'label': 'Home',
                 'line1': f'{rng.randint(1, 250)}, {rng.choice(R.STREETS)}', 'town': home['address']['town'],
                 'district': home['address']['district'], 'state': 'Tamil Nadu', 'pincode': home['pincode'], 'is_default': True}
            out['customer_addresses'].append(a)
            c['address'], c['store'] = a, home
            T['customers'].append(c)
        # one wholesale buyer, whose bulk orders exercise the Rs 25,000 refund rule
        wc = T['customers'][0]
        wc['display_name'] = f'{T["stores"][0]["address"]["town"]} Wholesale Traders'
        wc['wholesale'] = True

    # ---- service clients (partner apps)
    for T in tenants:
        for ch in [c for c in T['connections'] if c in ('ondc', 'whatsapp')]:
            out['service_clients'].append({'id': new('cli'), 'tenant_id': T['id'], 'name': f'{CHANNEL_NAMES[ch]} connector',
                                           'secret_hash': hashlib.sha256(rng.randbytes(32)).hexdigest(),
                                           'scopes': ['orders:write', 'catalog:read'], 'active': True, 'created_at': start})

    # ---- delivery plans (weekly / monthly) for retail customers
    for T in retailers:
        eligible = [p for p in T['products'] if p['plan_eligible']]
        for c in rng.sample(T['customers'], min(len(T['customers']), int(len(T['customers']) * 0.17))):
            cadence = 'weekly' if rng.random() < 0.7 else 'monthly'
            started = (start + timedelta(days=rng.randint(0, HISTORY_DAYS - 20))).date()
            status = rng.choices(['active', 'paused', 'cancelled'], [0.8, 0.1, 0.1])[0]
            pl = {'id': new('pln'), 'tenant_id': T['id'], 'customer_id': c['id'], 'location_id': c['store']['id'],
                  'address_id': c['address']['id'], 'cadence': cadence,
                  'delivery_day': rng.randint(1, 7) if cadence == 'weekly' else rng.randint(1, 28),
                  'slot': rng.choice(['morning', 'morning', 'evening', 'afternoon']), 'status': status,
                  'next_delivery': None, 'started_on': started, 'created_at': datetime.combine(started, datetime.min.time(), IST),
                  'customer': c, 'channel': rng.choices(['mobile_app', 'whatsapp', 'web'], [0.5, 0.35, 0.15])[0]}
            pl['items'] = rng.sample(eligible, rng.randint(2, 6))
            pl['qty'] = {p['sku']: rng.randint(1, 3) for p in pl['items']}
            out['delivery_plans'].append(pl)
            for p in pl['items']:
                out['delivery_plan_items'].append({'tenant_id': T['id'], 'plan_id': pl['id'], 'sku': p['sku'], 'qty': pl['qty'][p['sku']]})
            # schedule: every delivery day from start; stops at cancel/pause date
            stop = AS_OF.date() if status == 'active' else (started + timedelta(days=rng.randint(15, max(16, (AS_OF.date() - started).days))))
            stop = min(stop, AS_OF.date())
            d, dates = started, []
            while d <= stop + timedelta(days=2):
                if (cadence == 'weekly' and d.isoweekday() == pl['delivery_day']) or (cadence == 'monthly' and d.day == pl['delivery_day']):
                    dates.append(d)
                d += timedelta(days=1)
            pl['dates'] = [x for x in dates if x <= AS_OF.date() + timedelta(days=2)]
            if status == 'active':
                nxt = AS_OF.date() + timedelta(days=1)
                while not ((cadence == 'weekly' and nxt.isoweekday() == pl['delivery_day']) or (cadence == 'monthly' and nxt.day == pl['delivery_day'])):
                    nxt += timedelta(days=1)
                pl['next_delivery'] = nxt
            T.setdefault('plans', []).append(pl)

    # ---- orders
    def price_at(p, t):
        cur = p['first_price']
        for at, _old, new_p in p['changes']:
            if at <= t:
                cur = new_p
        return cur

    seq: dict = {}
    refs: set = set()

    def channel_ref(T, ch, loc):
        while True:
            ref = _channel_ref(T, ch, loc)
            if (T['id'], ch, ref) not in refs:
                refs.add((T['id'], ch, ref))
                return ref

    def _channel_ref(T, ch, loc):
        seq[(T['id'], ch)] = seq.get((T['id'], ch), 9000) + 1
        n = seq[(T['id'], ch)]
        return {'pos': f'POS-{loc["code"].replace("-", "")}-{n:06d}', 'web': f'AFM-WEB-{n}', 'mobile_app': f'AFM-APP-{n}',
                'whatsapp': f'AFM-WA-{n}', 'ondc': f'ONDC-{rng.getrandbits(32):08x}-{n}',
                'amazon': f'40{rng.randint(2, 8)}-{rng.randrange(10**7):07d}-{rng.randrange(10**7):07d}',
                'flipkart': f'OD{rng.randrange(10**17):017d}'}[ch]

    def make_order(T, ch, placed, customer=None, plan=None, loc=None, lines=None, bulk=False):
        fulfilment = plan['cadence'] if plan else 'immediate'
        if loc is None:
            if ch == 'pos':
                loc = rng.choice(T['stores'])
            elif ch in ('amazon', 'flipkart'):
                loc = rng.choice(T['warehouses'] or T['stores'])
            else:
                loc = customer['store'] if customer else rng.choice(T['stores'] or T['warehouses'])
        oid = new('ord')
        if lines is None:
            n_lines = rng.choices([1, 2, 3, 4, 5, 6, 8], [20, 22, 20, 15, 10, 8, 5])[0]
            if T['spec']['type'] == 'brand':
                n_lines = rng.choice([1, 1, 2])
            if bulk:
                n_lines = rng.randint(4, 8)
            prods = rng.sample([p for p in T['products'] if not (bulk and p['perishable'])], min(n_lines, len(T['products'])))
            lines = [(p, rng.randint(40, 120) if bulk else rng.choices([1, 2, 3, 5], [60, 25, 10, 5])[0]) for p in prods]
        age_days = (AS_OF - placed).total_seconds() / 86400
        if ch == 'pos':
            status = 'delivered'
        elif age_days > 3:
            status = rng.choices(['delivered', 'cancelled', 'returned'], [95, 4, 1])[0]
        else:
            status = rng.choices(['received', 'confirmed', 'packed', 'shipped', 'delivered', 'partially_unavailable', 'cancelled'],
                                 [8, 14, 10, 18, 44, 3, 3])[0]
        ol, subtotal, tax = [], 0, 0
        for i, (p, q) in enumerate(lines, 1):
            unit = price_at(p, placed)
            unavailable = rng.randint(1, q) if status == 'partially_unavailable' and i == 1 else 0
            lt = q * unit
            subtotal += lt
            tax += round(lt * p['gst'] / (100 + p['gst']))
            ol.append({'tenant_id': T['id'], 'order_id': oid, 'line_no': i, 'sku': p['sku'], 'qty': q, 'unit_price_paise': unit,
                       'line_total_paise': lt, 'qty_unavailable': unavailable})
        discount = 0
        if ch == 'pos' and rng.random() < 0.08:
            discount = subtotal * rng.choice([2, 5]) // 100
        elif ch in ('web', 'mobile_app', 'whatsapp') and not plan and rng.random() < 0.12:
            discount = subtotal * rng.choice([5, 10]) // 100
        fee = 3000 if ch in ('web', 'mobile_app', 'whatsapp', 'ondc') and not plan and subtotal - discount < 49900 else 0
        o = {'id': oid, 'tenant_id': T['id'], 'channel': ch, 'connection_id': T['connections'][ch]['id'] if ch in CONNECTOR_CHANNELS else None,
             'channel_order_id': channel_ref(T, ch, loc), 'customer_id': customer['id'] if customer else None,
             'location_id': loc['id'], 'fulfilment': fulfilment, 'plan_id': plan['id'] if plan else None, 'status': status,
             'subtotal_paise': subtotal, 'discount_paise': discount, 'delivery_fee_paise': fee, 'tax_paise': tax,
             'total_paise': subtotal - discount + fee, 'placed_at': placed,
             'updated_at': placed + timedelta(hours=rng.randint(0, 48)) if ch != 'pos' else placed,
             'T': T, 'loc': loc, 'lines': ol, 'plan': plan, 'customer': customer}
        o['updated_at'] = min(o['updated_at'], AS_OF)
        out['orders'].append(o)
        out['order_lines'].extend(ol)
        return o

    plan_orders = 0
    for T in retailers:
        for pl in T.get('plans', []):
            for d in pl['dates']:
                placed = datetime.combine(d - timedelta(days=1), datetime.min.time(), IST).replace(hour=20, minute=rng.randrange(60))
                if placed > AS_OF:
                    continue
                make_order(T, pl['channel'], placed, customer=pl['customer'], plan=pl, loc=pl['customer']['store'],
                           lines=[(p, pl['qty'][p['sku']]) for p in pl['items']])
                plan_orders += 1
    n_immediate = max(0, 8000 * k - plan_orders)
    weights = [(T, 0.42 if T['spec']['key'] == 'demoretail' else 0.18 if T['spec']['key'] == 'thendral' else 0.10) for T in tenants]
    for _ in range(n_immediate):
        T = rng.choices([w[0] for w in weights], [w[1] for w in weights])[0]
        mix = R.BRAND_CHANNEL_MIX if T['spec']['type'] == 'brand' else R.RETAIL_CHANNEL_MIX
        mix = {c: s for c, s in mix.items() if c in ('pos', 'web') or c in T['connections']}
        ch = rng.choices(list(mix), list(mix.values()))[0]
        day = HISTORY_DAYS * (rng.random() ** 0.8)                      # gentle growth: more orders recently
        placed = when(day, 7 if ch == 'pos' else 6, 21 if ch == 'pos' else 23)
        if placed > AS_OF:
            placed = AS_OF - timedelta(minutes=rng.randint(5, 600))
        cust = None
        if ch in ('web', 'mobile_app', 'whatsapp'):
            cust = rng.choice(T['customers'])
        elif ch == 'pos' and rng.random() < 0.35:
            cust = rng.choice(T['customers'])
        make_order(T, ch, placed, customer=cust)
    for T in retailers:                                   # wholesale buyers: bulk web orders, so large refunds occur
        wc = next(c for c in T['customers'] if c.get('wholesale'))
        for _ in range(12 * k):
            placed = when(rng.uniform(0, HISTORY_DAYS - 1), 9, 18)
            make_order(T, 'web', min(placed, AS_OF - timedelta(hours=1)), customer=wc, bulk=True)
    out['orders'].sort(key=lambda o: o['placed_at'])

    # ---- payments, refunds, shipments, reservations
    open_states = ('received', 'confirmed', 'packed', 'partially_unavailable')
    reserved: dict[tuple, int] = {}
    sold: dict[tuple, list] = {}
    for o in out['orders']:
        T, loc = o['T'], o['loc']
        ch, st = o['channel'], o['status']
        for ln in o['lines']:
            key = (o['tenant_id'], loc['id'], ln['sku'])
            take = ln['qty'] - ln['qty_unavailable']
            if st in open_states and take:
                out['stock_reservations'].append({'tenant_id': o['tenant_id'], 'order_id': o['id'], 'location_id': loc['id'],
                                                  'sku': ln['sku'], 'qty': take, 'created_at': o['placed_at'], 'released_at': None})
                reserved[key] = reserved.get(key, 0) + take
            elif st in ('shipped', 'delivered', 'returned') and take:
                sold.setdefault(key, []).append((o['updated_at'] if ch != 'pos' else o['placed_at'], -take, o['channel_order_id']))
                if st == 'returned':
                    sold[key].append((o['updated_at'] + timedelta(days=2), take, o['channel_order_id']))
        if o['total_paise'] == 0:
            continue
        method = (rng.choices(['cash', 'upi', 'card'], [40, 50, 10])[0] if ch == 'pos' else 'marketplace' if ch in ('amazon', 'flipkart', 'ondc')
                  else rng.choices(['upi', 'card', 'netbanking', 'cod'], [60, 20, 5, 15])[0])
        if st == 'cancelled':
            pstatus = 'failed' if method in ('upi', 'card', 'netbanking') and rng.random() < 0.5 else 'pending' if method == 'cod' else 'captured'
        elif method == 'cod' and st != 'delivered':
            pstatus = 'pending'
        else:
            pstatus = 'captured'
        pay = {'id': new('pay'), 'tenant_id': o['tenant_id'], 'order_id': o['id'], 'method': method, 'status': pstatus,
               'amount_paise': o['total_paise'],
               'provider_ref': None if method in ('cash', 'cod') else f'{method.upper()}-{rng.getrandbits(40):010x}',
               'captured_at': (o['placed_at'] if method != 'cod' else o['updated_at']) if pstatus == 'captured' else None}
        out['payments'].append(pay)
        # refunds: cancelled-after-capture always; some delivered/returned orders
        want = (st == 'cancelled' and pstatus == 'captured' and ch not in ('amazon', 'flipkart', 'ondc')) or \
               (st == 'returned') or (st == 'delivered' and ch != 'pos' and pstatus == 'captured' and rng.random() < 0.025) or \
               (o['customer'] is not None and o['customer'].get('wholesale') and st == 'delivered' and rng.random() < 0.4)
        if want and pstatus == 'captured' and T['staff'].get('customer_support'):
            full = st in ('cancelled', 'returned') or rng.random() < 0.3
            amount = o['total_paise'] if full else max(100, o['lines'][0]['line_total_paise'])
            amount = min(amount, o['total_paise'])
            req_at = min(AS_OF - timedelta(minutes=30), o['updated_at'] + timedelta(hours=rng.randint(1, 30)))
            requester = rng.choice(T['staff']['customer_support'])
            rid = new('rfd')
            age = (AS_OF - req_at).days
            outcome = rng.choices(['paid', 'approved', 'requested', 'rejected'], [80, 8, 7, 5])[0] if age < 4 else rng.choices(['paid', 'rejected'], [94, 6])[0]
            reason = 'cancelled_by_customer' if st == 'cancelled' else 'quality' if st == 'returned' else \
                rng.choice(['damaged', 'missing_item', 'late_delivery', 'wrong_item', 'quality'])
            out['refunds'].append({'id': rid, 'tenant_id': o['tenant_id'], 'order_id': o['id'], 'payment_id': pay['id'],
                                   'amount_paise': amount, 'reason': reason, 'status': outcome, 'requested_by': requester['id'],
                                   'requested_at': req_at, 'paid_at': req_at + timedelta(hours=rng.randint(2, 30)) if outcome == 'paid' else None,
                                   'order': o})
            audit(o['tenant_id'], req_at, requester, 'refund.request', 'refund', rid, amount_paise=amount, order=o['channel_order_id'])
            if outcome != 'requested':
                approvers = [u for u in T['staff'].get('payment_approver', []) if u['refund_limit'] >= amount]
                first = rng.choice(approvers) if approvers else T['owner']
                d1 = req_at + timedelta(minutes=rng.randint(10, 600))
                dec = 'rejected' if outcome == 'rejected' else 'approved'
                out['refund_approvals'].append({'tenant_id': o['tenant_id'], 'refund_id': rid, 'step': 1, 'approver_id': first['id'],
                                                'decision': dec, 'note': None if dec == 'approved' else 'Photo does not show damage',
                                                'decided_at': d1})
                audit(o['tenant_id'], d1, first, 'refund.approve' if dec == 'approved' else 'refund.reject', 'refund', rid, step=1, amount_paise=amount)
                if amount > OWNER_SECOND_APPROVER_ABOVE and dec == 'approved':
                    second = rng.choice([u for u in T['staff'].get('finance', []) + T['staff'].get('payment_approver', []) if u is not first])
                    d2 = d1 + timedelta(minutes=rng.randint(5, 240))
                    out['refund_approvals'].append({'tenant_id': o['tenant_id'], 'refund_id': rid, 'step': 2, 'approver_id': second['id'],
                                                    'decision': 'approved', 'note': 'Second approval above Rs 25,000', 'decided_at': d2})
                    audit(o['tenant_id'], d2, second, 'refund.approve', 'refund', rid, step=2, amount_paise=amount)
            if outcome == 'paid':
                pay['status'] = 'refunded' if amount == pay['amount_paise'] else 'partially_refunded'
        # shipments for delivery orders that left the building
        if ch != 'pos' and st in ('shipped', 'delivered', 'returned'):
            marketplace = ch in ('amazon', 'flipkart')
            riders = T['riders'].get(loc['id'], [])
            method = 'marketplace' if marketplace else 'own_rider' if riders else 'courier'
            disp = min(AS_OF, o['placed_at'] + timedelta(hours=rng.randint(2, 20)))
            delivered = st in ('delivered', 'returned')
            out['shipments'].append({'id': new('shp'), 'tenant_id': o['tenant_id'], 'order_id': o['id'], 'location_id': loc['id'],
                                     'method': method, 'rider_id': rng.choice(riders)['id'] if method == 'own_rider' else None,
                                     'carrier': rng.choice(R.CARRIERS) if method == 'courier' else ('Amazon' if ch == 'amazon' else 'Ekart') if marketplace else None,
                                     'tracking_ref': None if method == 'own_rider' else f'TRK{rng.getrandbits(36):09X}',
                                     'status': 'delivered' if st == 'delivered' else 'returned' if st == 'returned' else 'out_for_delivery',
                                     'slot_date': o['placed_at'].date() + timedelta(days=1) if o['plan'] else None,
                                     'slot': o['plan']['slot'] if o['plan'] else None, 'dispatched_at': disp,
                                     'delivered_at': min(AS_OF, disp + timedelta(hours=rng.randint(1, 8))) if delivered else None})

    # ---- stock: a full ledger per item, so on_hand always equals the sum of its movements
    for T in tenants:
        receiver = (T['staff'].get('inventory_manager') or [T['owner']])[0]
        for loc in T['locs']:
            carried = T['products'] if loc['kind'] != 'store' else [p for p in T['products'] if rng.random() < 0.9 or
                                                                      (T['id'], loc['id'], p['sku']) in sold or (T['id'], loc['id'], p['sku']) in reserved]
            for p in carried:
                key = (T['id'], loc['id'], p['sku'])
                res = reserved.get(key, 0)
                moves = sorted(sold.get(key, []))
                out_qty = -sum(q for _, q, _ in moves)
                target = res + rng.randint(0, 60 if loc['kind'] == 'warehouse' else 25)
                opening = rng.randint(10, 80 if loc['kind'] == 'warehouse' else 40)
                needed = target + out_qty - opening
                ledger = [(start, opening, 'count', 'Opening count')]
                if needed > 0:                                   # receipts spread over the period, in delivery-sized lots
                    lots = max(1, min(26, needed // 20 + 1))
                    sizes = [needed // lots + (1 if i < needed % lots else 0) for i in range(lots)]
                    for i, sz in enumerate(sizes):
                        if sz:
                            ledger.append((when(HISTORY_DAYS * (i + 0.5) / lots, 6, 10), sz, 'receipt', f'PO-{rng.randrange(10**5):05d}'))
                elif needed < 0:                                 # opening was more than needed: a count correction
                    ledger.append((when(rng.uniform(1, HISTORY_DAYS - 1)), needed, 'adjustment', 'Stock count correction'))
                for at, q, ref in moves:
                    ledger.append((at, q, 'sale' if q < 0 else 'return', ref))
                on_hand = sum(q for _, q, _, _ in ledger)
                assert on_hand == target and on_hand >= res, (key, on_hand, target, res)
                for at, q, reason, ref in sorted(ledger, key=lambda x: x[0]):
                    out['stock_movements'].append({'tenant_id': T['id'], 'location_id': loc['id'], 'sku': p['sku'], 'qty_change': q,
                                                   'reason': reason, 'reference': ref,
                                                   'actor_id': receiver['id'] if reason in ('receipt', 'count', 'adjustment') else None, 'at': at})
                out['stock_levels'].append({'tenant_id': T['id'], 'location_id': loc['id'], 'sku': p['sku'], 'on_hand': on_hand,
                                            'reserved': res, 'buffer': 0 if loc['kind'] == 'warehouse' else rng.choice([0, 1, 2, 3]),
                                            'reorder_point': rng.choice([5, 10, 15, 20]), 'updated_at': max([start] + [m[0] for m in ledger])})
        T['stock'] = {(r['location_id'], r['sku']): r for r in out['stock_levels'] if r['tenant_id'] == T['id']}

    # ---- channel listings, webhooks and jobs (the integration layer)
    for T in tenants:
        for ch, con in T['connections'].items():
            if ch == 'mobile_app':
                continue                                   # the app reads the catalogue from the platform directly
            locs = set(con['settings']['location_map'].values())
            for p in T['products']:
                avail = sum(max(r['on_hand'] - r['buffer'] - r['reserved'], 0) for (lid, sku), r in T['stock'].items() if sku == p['sku'] and lid in locs)
                state = rng.choices(['listed', 'pending', 'rejected'], [92, 5, 3])[0]
                out['channel_listings'].append({
                    'tenant_id': T['id'], 'connection_id': con['id'], 'sku': p['sku'],
                    'channel_item_id': None if state == 'pending' else
                    {'amazon': f'B0{rng.getrandbits(36):09X}', 'flipkart': f'FSN{rng.getrandbits(48):012X}', 'whatsapp': p['sku'],
                     'facebook': p['sku'], 'ondc': f'{T["id"]}:{p["sku"]}'}[ch],
                    'listing_status': state, 'last_price_paise': p['price_paise'] if state == 'listed' else None,
                    'last_qty_sent': avail if state == 'listed' else None,
                    'last_synced_at': AS_OF - timedelta(minutes=rng.randint(2, 90)) if state != 'pending' else None,
                    'last_error': 'Main image rejected by the channel; upload a clearer front photo' if state == 'rejected' else None})
        for o in [o for o in out['orders'] if o['T'] is T and o['channel'] in ('whatsapp', 'ondc')]:
            con = T['connections'][o['channel']]
            out['webhook_events'].append({'tenant_id': T['id'], 'connection_id': con['id'], 'external_event_id': f'evt-{o["channel_order_id"]}',
                                          'event_type': 'order.created', 'signature_valid': True,
                                          'payload': {'order': o['channel_order_id'], 'lines': len(o['lines']), 'total_paise': o['total_paise']},
                                          'received_at': o['placed_at'], 'processed_at': o['placed_at'] + timedelta(seconds=rng.randint(1, 20)),
                                          'result': 'processed', 'error': None})
        for ch in [c for c in ('whatsapp', 'ondc') if c in T['connections']]:
            con = T['connections'][ch]
            for i in range(25 * k):
                bad = i % 10 == 0
                at = when(rng.uniform(HISTORY_DAYS - 30, HISTORY_DAYS - 0.2))
                if at > AS_OF:
                    at = AS_OF - timedelta(minutes=rng.randint(1, 300))
                out['webhook_events'].append({'tenant_id': T['id'], 'connection_id': con['id'], 'external_event_id': f'evt-{ch}-{rng.getrandbits(48):012x}',
                                              'event_type': 'message.received' if ch == 'whatsapp' else 'order.status_query',
                                              'signature_valid': not bad, 'payload': {'note': 'synthetic'}, 'received_at': at,
                                              'processed_at': at + timedelta(seconds=2), 'result': 'ignored' if bad else 'processed',
                                              'error': 'Signature check failed' if bad else None})
        # jobs: the last 7 days of work for each connection
        for ch, con in T['connections'].items():
            kinds = ['push_inventory'] + (['fetch_orders'] if ch in ('amazon', 'flipkart') else []) + (['publish_catalog'] if ch != 'mobile_app' else [])
            for kind in kinds:
                every = {'push_inventory': 60, 'fetch_orders': 30, 'publish_catalog': 1440}[kind]
                t = AS_OF - timedelta(days=7)
                while t < AS_OF + timedelta(minutes=every):
                    future = t > AS_OF
                    roll = rng.random()
                    if future:
                        status, attempts, err = 'queued', 0, None
                    elif roll < 0.004:
                        status, attempts, err = 'dead', 8, 'HTTP 401: credentials rejected by the channel'
                    elif roll < 0.03 and t > AS_OF - timedelta(hours=2):
                        status, attempts, err = 'queued', rng.randint(1, 3), 'HTTP 429: rate limit, will retry'
                    else:
                        status, attempts, err = 'succeeded', 1 if roll > 0.05 else 2, None
                    out['jobs'].append({'tenant_id': T['id'], 'connection_id': con['id'], 'kind': kind,
                                        'payload': {'connection': con['id'], 'window_start': t.isoformat()},
                                        'idempotency_key': f'{kind}:{con["id"]}:{t.strftime("%Y%m%d%H%M")}', 'status': status,
                                        'attempts': attempts, 'max_attempts': 8,
                                        'run_after': t if status != 'queued' or attempts == 0 else AS_OF + timedelta(minutes=2 ** attempts),
                                        'locked_by': None, 'locked_at': None, 'last_error': err, 'created_at': t,
                                        'finished_at': t + timedelta(seconds=rng.randint(1, 40)) if status in ('succeeded', 'dead') else None})
                    t += timedelta(minutes=every)
            if any(j['status'] == 'dead' and j['connection_id'] == con['id'] for j in out['jobs']):
                con['last_error'] = 'HTTP 401: credentials rejected by the channel'

    # ---- strip helper keys
    for tbl, cols in COLUMNS.items():
        out[tbl] = [{c: r.get(c) for c in cols} for r in out[tbl]]
    return out


def summary(data: dict) -> str:
    return '\n'.join(f'{t:26s} {len(rows):>9,}' for t, rows in data.items())
