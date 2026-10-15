"""Catalogue saved to a real database: inline price changes and pasted images saved together, all or nothing."""
import base64, io
import pytest
from PIL import Image
from fastapi.testclient import TestClient
from aifirstmart_connect.api import Platform, create_app
from aifirstmart_connect.config import settings


def png(w=900, h=900, fmt="PNG"):
    b = io.BytesIO(); Image.new("RGB", (w, h), "white").save(b, fmt); return base64.b64encode(b.getvalue()).decode()


def boot(db):
    sms = {}
    P = Platform(otp_sender=lambda d, c: sms.__setitem__(d, c), db_path=db)
    c = TestClient(create_app(P))
    def tok(e, pw):
        j = c.post("/v1/auth/staff/login", json={"email": e, "password": pw}).json()
        if j.get("mfa_required"):
            j = c.post("/v1/auth/staff/mfa", json={"mfa_token": j["mfa_token"], "code": sms[e]}).json()
        return {"Authorization": "Bearer " + j["access_token"]}
    return c, P, tok


@pytest.fixture()
def env(tmp_path):
    db = str(tmp_path / "afm.sqlite")
    c, P, tok = boot(db)
    admin = tok(settings.platform_admin_email, settings.platform_admin_password)
    tid = c.post("/v1/platform/tenants", headers=admin, json={"name": "R", "type": "retailer", "owner_email": "o@r.example", "owner_password": "owner-password-1"}).json()["tenant_id"]
    owner = tok("o@r.example", "owner-password-1")
    for sku, name, paise in [("8901008", "Toor Dal 1kg", 16800), ("8901002", "Aavin Milk 500ml", 2600)]:
        c.post(f"/v1/tenants/{tid}/products", headers=owner, json={"sku": sku, "name": name, "price_paise": paise, "category": "Grocery"})
    for email, role in [("pricing@r.example", "pricing_manager"), ("cat@r.example", "catalog_manager"), ("buy@r.example", "procurement")]:
        c.post(f"/v1/tenants/{tid}/users", headers=owner, json={"email": email, "password": "a-long-password", "roles": [role]})
    return db, c, P, tok, tid, owner


def test_changes_survive_a_restart(env):
    db, c, P, tok, tid, owner = env
    r = c.post(f"/v1/tenants/{tid}/catalog/changes", headers=owner, json={"prices": {"8901008": 17200}, "images": [{"sku": "8901008", "role": "Front", "content_type": "image/png", "data_base64": png()}]})
    assert r.status_code == 200 and r.json()["prices_changed"] == 1 and r.json()["images_added"] == 1
    c2, P2, tok2 = boot(db)                                       # a new process reading the same database
    assert P2.catalog.products[(tid, "8901008")].price_paise == 17200
    imgs = P2.catalog.images_of(tid, "8901008")
    assert len(imgs) == 1 and imgs[0]["main"] and imgs[0]["width"] == 900


def test_all_or_nothing(env):
    db, c, P, tok, tid, owner = env
    r = c.post(f"/v1/tenants/{tid}/catalog/changes", headers=owner, json={"prices": {"8901008": 17200}, "images": [{"sku": "8901008", "content_type": "image/png", "data_base64": png(300, 300)}]})
    assert r.status_code == 422 and "too small" in r.text
    assert P.catalog.products[(tid, "8901008")].price_paise == 16800 and P.catalog.images_of(tid, "8901008") == []


def test_price_and_image_permissions_are_separate(env):
    db, c, P, tok, tid, owner = env
    pricing, cat, buy = tok("pricing@r.example", "a-long-password"), tok("cat@r.example", "a-long-password"), tok("buy@r.example", "a-long-password")
    assert c.post(f"/v1/tenants/{tid}/catalog/changes", headers=cat, json={"prices": {"8901002": 2800}}).status_code == 403
    assert c.post(f"/v1/tenants/{tid}/catalog/changes", headers=pricing, json={"prices": {"8901002": 2800}}).status_code == 200
    img = {"sku": "8901002", "content_type": "image/png", "data_base64": png()}
    assert c.post(f"/v1/tenants/{tid}/catalog/changes", headers=buy, json={"images": [img]}).status_code == 403          # outside Merchandising
    assert c.post(f"/v1/tenants/{tid}/catalog/changes", headers=cat, json={"images": [img]}).status_code == 200


@pytest.mark.parametrize("image,msg", [
    ({"content_type": "image/gif", "data_base64": png()}, "JPG, PNG or WebP"),
    ({"content_type": "image/jpeg", "data_base64": png()}, "does not match"),                      # PNG bytes labelled as JPEG
    ({"content_type": "image/png", "data_base64": base64.b64encode(b"not an image").decode()}, "not a readable image"),
    ({"content_type": "image/png", "data_base64": "@@@"}, "not valid base64"),
])
def test_image_checks(env, image, msg):
    db, c, P, tok, tid, owner = env
    r = c.post(f"/v1/tenants/{tid}/catalog/changes", headers=owner, json={"images": [{"sku": "8901002", **image}]})
    assert r.status_code == 422 and msg in r.text


def test_bad_prices_and_unknown_products(env):
    db, c, P, tok, tid, owner = env
    assert c.post(f"/v1/tenants/{tid}/catalog/changes", headers=owner, json={"prices": {"8901008": 0}}).status_code == 422
    assert c.post(f"/v1/tenants/{tid}/catalog/changes", headers=owner, json={"prices": {"9999999": 100}}).status_code == 422


def test_at_most_six_images(env):
    db, c, P, tok, tid, owner = env
    imgs = [{"sku": "8901002", "content_type": "image/png", "data_base64": png()} for _ in range(7)]
    r = c.post(f"/v1/tenants/{tid}/catalog/changes", headers=owner, json={"images": imgs})
    assert r.status_code == 422 and "more than 6" in r.text and P.catalog.images_of(tid, "8901002") == []
