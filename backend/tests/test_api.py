import json
import pytest
from fastapi.testclient import TestClient
from aifirstmart_connect.api import Platform, create_app
from aifirstmart_connect.config import settings
from aifirstmart_connect.connectors.base import hmac_sha256_hex


SMS = {}


@pytest.fixture()
def env():
    SMS.clear()
    P = Platform(otp_sender=lambda dest, code: SMS.__setitem__(dest, code))
    return TestClient(create_app(P)), P, SMS


def login(c, email, password):
    r = c.post("/v1/auth/staff/login", json={"email": email, "password": password})
    assert r.status_code == 200, r.text
    j = r.json()
    if j.get("mfa_required"):                                    # owner, administrator, managers, finance
        j = c.post("/v1/auth/staff/mfa", json={"mfa_token": j["mfa_token"], "code": SMS[email]}).json()
    return {"Authorization": "Bearer " + j["access_token"]}


def onboard(c, name="AIFirstMart Retail", owner="owner@retail.example"):
    admin = login(c, settings.platform_admin_email, settings.platform_admin_password)
    r = c.post("/v1/platform/tenants", headers=admin, json={"name": name, "type": "retailer",
               "owner_email": owner, "owner_password": "owner-password-1", "legal": {"gstin": "33AAECA1234A1Z5"}})
    assert r.status_code == 201, r.text
    return r.json()["tenant_id"], login(c, owner, "owner-password-1")


def test_full_retailer_flow_with_whatsapp_order(env):
    c, P, _ = env
    tid, owner = onboard(c)
    loc = c.post(f"/v1/tenants/{tid}/locations", headers=owner, json={"name": "Ulundurpet Main Store"}).json()["location_id"]
    r = c.post(f"/v1/tenants/{tid}/users", headers=owner, json={"email": "raj@retail.example", "password": "manager-pass-1",
               "roles": ["store_manager"], "stores": [loc], "limits": {"discount_pct": 20}})
    assert r.status_code == 201
    mgr = login(c, "raj@retail.example", "manager-pass-1")
    assert c.post(f"/v1/tenants/{tid}/products", headers=owner, json={"sku": "AAVIN-500", "name": "Aavin Milk 500ml",
                  "price_paise": 2600, "gtin": "8901002"}).status_code == 201
    r = c.post(f"/v1/tenants/{tid}/inventory", headers=mgr, json={"location_id": loc, "sku": "AAVIN-500", "on_hand": 32, "buffer": 2})
    assert r.json()["available"] == 30
    r = c.post(f"/v1/tenants/{tid}/connections", headers=owner, json={"channel": "whatsapp",
               "credentials": {"app_secret": "wa-secret", "verify_token": "vt-1"}, "settings": {"catalog_id": "CAT1"}})
    con = r.json()["connection_id"]
    assert "wa-secret" not in json.dumps(c.get(f"/v1/tenants/{tid}/connections", headers=owner).json())
    assert c.post(f"/v1/tenants/{tid}/connections/{con}/publish", headers=mgr).status_code == 403            # merchandising, not the store
    assert c.post(f"/v1/tenants/{tid}/connections/{con}/publish", headers=owner).json()["published"] == 1
    assert c.post(f"/v1/tenants/{tid}/connections/{con}/sync-inventory", headers=mgr).json()["updated"] == 1
    assert P.hub.inventory[con][("AAVIN-500", loc)] == 30

    # Meta subscription check, then a signed order
    assert c.get(f"/v1/webhooks/whatsapp/{con}", params={"hub.mode": "subscribe", "hub.verify_token": "vt-1", "hub.challenge": "42"}).text == "42"
    body = json.dumps({"entry": [{"changes": [{"value": {"messages": [{"id": "wamid.77", "from": "919876543210", "type": "order",
            "order": {"product_items": [{"product_retailer_id": "AAVIN-500", "quantity": "2", "item_price": 26}]}}]}}]}]}).encode()
    sig = {"X-Hub-Signature-256": "sha256=" + hmac_sha256_hex("wa-secret", body), "content-type": "application/json"}
    assert len(c.post(f"/v1/webhooks/whatsapp/{con}", content=body, headers=sig).json()["created"]) == 1
    assert c.post(f"/v1/webhooks/whatsapp/{con}", content=body, headers=sig).json()["created"] == []      # duplicate ignored
    assert c.post(f"/v1/webhooks/whatsapp/{con}", content=body, headers={"X-Hub-Signature-256": "sha256=00"}).status_code == 401
    orders = c.get(f"/v1/tenants/{tid}/orders", headers=mgr).json()
    assert len(orders) == 1 and orders[0]["lines"][0]["location_id"] == loc
    assert P.catalog.stock[(tid, loc, "AAVIN-500")].available == 28                                        # reserved
    assert P.hub.messages[con][0]["template"] == "order_received"                                          # customer told


def test_mobile_customer_otp_login_and_own_orders(env):
    c, P, sms = env
    tid, _ = onboard(c)
    assert c.post("/v1/auth/otp/request", json={"tenant_id": tid, "phone": "98765 43210"}).status_code == 202
    r = c.post("/v1/auth/otp/verify", json={"tenant_id": tid, "phone": "9876543210", "code": sms["+919876543210"]})
    assert r.status_code == 200
    cust = {"Authorization": "Bearer " + r.json()["access_token"]}
    assert c.get("/v1/me/orders", headers=cust).json() == []
    assert c.get(f"/v1/tenants/{tid}/orders", headers=cust).status_code == 403        # customers can't see store orders
    new = c.post("/v1/auth/token/refresh", json={"refresh_token": r.json()["refresh_token"]})
    assert new.status_code == 200
    assert c.post("/v1/auth/token/refresh", json={"refresh_token": r.json()["refresh_token"]}).status_code == 401


def test_email_customer_register_and_login(env):
    c, _, _ = env
    tid, _ = onboard(c)
    assert c.post("/v1/auth/customers/email/register", json={"tenant_id": tid, "email": "priya@example.com", "password": "priya-pass-12"}).status_code == 201
    assert c.post("/v1/auth/customers/email/register", json={"tenant_id": tid, "email": "PRIYA@example.com", "password": "priya-pass-12"}).status_code == 409
    assert c.post("/v1/auth/customers/email/login", json={"tenant_id": tid, "email": "priya@example.com", "password": "priya-pass-12"}).status_code == 200
    assert c.post("/v1/auth/customers/email/login", json={"tenant_id": tid, "email": "priya@example.com", "password": "nope-nope-nope"}).status_code == 401


def test_tenant_isolation_brand_cannot_touch_retailer(env):
    c, _, _ = env
    tid_a, owner_a = onboard(c, "Retailer A", "a@a.example")
    tid_b, owner_b = onboard(c, "Spice Brand B", "b@b.example")
    assert c.post(f"/v1/tenants/{tid_a}/products", headers=owner_b, json={"sku": "X", "name": "X", "price_paise": 1}).status_code == 403
    assert c.get(f"/v1/tenants/{tid_a}/connections", headers=owner_b).status_code == 403
    admin = login(c, settings.platform_admin_email, settings.platform_admin_password)
    assert c.get(f"/v1/tenants/{tid_a}/orders", headers=admin).status_code == 403          # platform admin: no tenant data


def test_role_and_store_limits(env):
    c, _, _ = env
    tid, owner = onboard(c)
    ulu = c.post(f"/v1/tenants/{tid}/locations", headers=owner, json={"name": "Ulundurpet"}).json()["location_id"]
    kal = c.post(f"/v1/tenants/{tid}/locations", headers=owner, json={"name": "Kallakurichi"}).json()["location_id"]
    c.post(f"/v1/tenants/{tid}/users", headers=owner, json={"email": "kavya@r.example", "password": "cashier-pass-1", "roles": ["cashier"], "stores": [ulu]})
    c.post(f"/v1/tenants/{tid}/users", headers=owner, json={"email": "raj@r.example", "password": "manager-pass-1", "roles": ["store_manager"], "stores": [ulu]})
    kavya, raj = login(c, "kavya@r.example", "cashier-pass-1"), login(c, "raj@r.example", "manager-pass-1")
    assert c.post(f"/v1/tenants/{tid}/users", headers=kavya, json={"email": "x@r.example", "password": "xxxxxxxxxxx", "roles": ["cashier"], "stores": [ulu]}).status_code == 403
    assert c.post(f"/v1/tenants/{tid}/users", headers=owner, json={"email": "x@r.example", "password": "xxxxxxxxxxx", "roles": ["platform_admin"]}).status_code == 400
    assert c.post(f"/v1/tenants/{tid}/inventory", headers=raj, json={"location_id": ulu, "sku": "S", "on_hand": 1}).status_code == 200
    assert c.post(f"/v1/tenants/{tid}/inventory", headers=raj, json={"location_id": kal, "sku": "S", "on_hand": 1}).status_code == 403


def test_lockout_and_disable_user(env):
    c, _, _ = env
    tid, owner = onboard(c)
    loc = c.post(f"/v1/tenants/{tid}/locations", headers=owner, json={"name": "Ulundurpet"}).json()["location_id"]
    r = c.post(f"/v1/tenants/{tid}/users", headers=owner, json={"email": "suresh@r.example", "password": "cashier-pass-1", "roles": ["cashier"], "stores": [loc]})
    uid = r.json()["user_id"]
    for _ in range(5):
        assert c.post("/v1/auth/staff/login", json={"email": "suresh@r.example", "password": "wrong-password"}).status_code == 401
    assert c.post("/v1/auth/staff/login", json={"email": "suresh@r.example", "password": "cashier-pass-1"}).status_code == 423
    c.post(f"/v1/tenants/{tid}/users/{uid}/disable", headers=owner)
    assert c.post("/v1/auth/staff/login", json={"email": "suresh@r.example", "password": "cashier-pass-1"}).status_code in (401, 423)


def test_service_client_and_suspended_connection(env):
    c, _, _ = env
    tid, owner = onboard(c)
    cl = c.post(f"/v1/tenants/{tid}/service-clients", headers=owner, json=["catalog:publish"]).json()
    tok = c.post("/v1/auth/clients/token", json={"client_id": cl["client_id"], "client_secret": cl["client_secret"]})
    svc = {"Authorization": "Bearer " + tok.json()["access_token"]}
    con = c.post(f"/v1/tenants/{tid}/connections", headers=owner, json={"channel": "flipkart"}).json()["connection_id"]
    assert c.post(f"/v1/tenants/{tid}/connections/{con}/publish", headers=svc).status_code == 200
    assert c.post(f"/v1/tenants/{tid}/connections/{con}/sync-inventory", headers=svc).status_code == 403   # scope not granted
    c.post(f"/v1/tenants/{tid}/connections/{con}/suspend", headers=owner)
    assert c.post(f"/v1/tenants/{tid}/connections/{con}/publish", headers=svc).status_code == 409
    assert c.post("/v1/auth/clients/token", json={"client_id": cl["client_id"], "client_secret": "wrong"}).status_code == 401
