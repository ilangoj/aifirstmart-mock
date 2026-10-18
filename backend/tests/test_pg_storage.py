"""What PostgreSQL storage adds over memory: isolation enforced by the database, data and sessions shared by several
copies of the API, and safe handling of the same order arriving twice at once. Runs only with AFM_TEST_STORAGE=postgres."""
import threading

import pytest
from fastapi.testclient import TestClient

from aifirstmart_connect.api import create_app
from conftest import MODE, make_platform

pytestmark = pytest.mark.skipif(MODE != "postgres", reason="PostgreSQL storage only (AFM_TEST_STORAGE=postgres)")


def boot():
    sms = {}
    P = make_platform(otp_sender=lambda d, code: sms.__setitem__(d, code))
    return TestClient(create_app(P)), P, sms


def sign_in(c, sms, email, pw):
    j = c.post("/v1/auth/staff/login", json={"email": email, "password": pw}).json()
    if j.get("mfa_required"):
        j = c.post("/v1/auth/staff/mfa", json={"mfa_token": j["mfa_token"], "code": sms[email]}).json()
    return j


def tenant_with_product(c, sms, name, email):
    from aifirstmart_connect.config import settings
    admin = sign_in(c, sms, settings.platform_admin_email, settings.platform_admin_password)
    tid = c.post("/v1/platform/tenants", headers={"Authorization": "Bearer " + admin["access_token"]},
                 json={"name": name, "type": "retailer", "owner_email": email, "owner_password": "owner-password-1"}).json()["tenant_id"]
    owner = {"Authorization": "Bearer " + sign_in(c, sms, email, "owner-password-1")["access_token"]}
    assert c.post(f"/v1/tenants/{tid}/products", headers=owner, json={"sku": "8901002", "name": "Aavin Milk 500ml", "price_paise": 2600}).status_code == 201
    loc = c.post(f"/v1/tenants/{tid}/locations", headers=owner, json={"name": "Ulundurpet"}).json()["location_id"]
    assert c.post(f"/v1/tenants/{tid}/inventory", headers=owner, json={"location_id": loc, "sku": "8901002", "on_hand": 10}).status_code == 200
    return tid, owner, loc


def test_api_works_as_the_restricted_role():
    c, P, sms = boot()
    with P.backend.db.tx() as cur:
        assert cur.execute("SELECT current_user AS u").fetchone()["u"] == "afm_app"


def test_database_hides_other_tenants_rows():
    c, P, sms = boot()
    a, _, _ = tenant_with_product(c, sms, "Shop A", "a@shop-a.example")
    b, _, _ = tenant_with_product(c, sms, "Shop B", "b@shop-b.example")
    with P.backend.db.tx(tenant=a) as cur:
        assert cur.execute("SELECT count(*) AS n FROM products WHERE tenant_id = %s", (b,)).fetchone()["n"] == 0
        assert cur.execute("SELECT count(*) AS n FROM products").fetchone()["n"] == 1
    with P.backend.db.tx() as cur:                                      # no tenant set: nothing at all
        assert cur.execute("SELECT count(*) AS n FROM products").fetchone()["n"] == 0
    assert P.catalog.products.get((a, "8901002")) is not None and P.catalog.products_of(b)[0].tenant_id == b


def test_everything_survives_a_restart_and_sessions_work_on_another_copy():
    c1, P1, sms = boot()
    tid, owner, loc = tenant_with_product(c1, sms, "Shop A", "a@shop-a.example")
    tokens = sign_in(c1, sms, "a@shop-a.example", "owner-password-1")
    c2, P2, _ = boot()                                                  # a second copy of the API on the same database
    r = c2.post("/v1/auth/token/refresh", json={"refresh_token": tokens["refresh_token"]})
    assert r.status_code == 200                                         # copy 2 rotates copy 1's session
    assert c1.post("/v1/auth/token/refresh", json={"refresh_token": tokens["refresh_token"]}).status_code == 401   # replay
    assert c2.post("/v1/auth/token/refresh", json={"refresh_token": r.json()["refresh_token"]}).status_code == 401  # family ended
    assert P2.catalog.stock[(tid, loc, "8901002")].on_hand == 10
    assert P2.store.staff_by_email("a@shop-a.example").roles == ["tenant_owner"]


def test_the_same_order_arriving_twice_at_once_is_stored_once():
    c, P, sms = boot()
    tid, owner, loc = tenant_with_product(c, sms, "Shop A", "a@shop-a.example")
    con = c.post(f"/v1/tenants/{tid}/connections", headers=owner, json={"channel": "ondc"}).json()["connection_id"]
    results, start = [], threading.Barrier(4)

    def deliver():
        start.wait()
        results.append(P.orders.ingest(tid, "ondc", con, "ONDC-77", [{"sku": "8901002", "qty": 3}]))

    threads = [threading.Thread(target=deliver) for _ in range(4)]
    [t.start() for t in threads]
    [t.join() for t in threads]
    assert sum(created for _, created in results) == 1
    assert len({o.id for o, _ in results}) == 1
    assert P.catalog.stock[(tid, loc, "8901002")].reserved == 3          # reserved once, not four times


def test_order_for_unknown_product_is_kept_and_flagged():
    c, P, sms = boot()
    tid, owner, loc = tenant_with_product(c, sms, "Shop A", "a@shop-a.example")
    con = c.post(f"/v1/tenants/{tid}/connections", headers=owner, json={"channel": "ondc"}).json()["connection_id"]
    order, created = P.orders.ingest(tid, "ondc", con, "ONDC-78", [{"sku": "8901002", "qty": 1}, {"sku": "NOT-IN-CATALOGUE", "qty": 2}])
    assert created and order.status == "partially_unavailable"
    assert [(line.sku, line.location_id) for line in order.lines] == [("8901002", loc), ("NOT-IN-CATALOGUE", None)]


def test_stock_changes_are_written_to_the_ledger():
    c, P, sms = boot()
    tid, owner, loc = tenant_with_product(c, sms, "Shop A", "a@shop-a.example")
    assert c.post(f"/v1/tenants/{tid}/inventory", headers=owner, json={"location_id": loc, "sku": "8901002", "on_hand": 7}).status_code == 200
    with P.backend.db.tx(tenant=tid) as cur:
        moves = [r["qty_change"] for r in cur.execute("SELECT qty_change FROM stock_movements ORDER BY id").fetchall()]
    assert moves == [10, -3] and sum(moves) == 7
