"""Sign in with Google: ID token checks, customer linking and staff rules (with a local test key instead of Google's)."""
import time
import jwt, pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi.testclient import TestClient
from aifirstmart_connect.api import Platform, create_app
from aifirstmart_connect.config import settings
from aifirstmart_connect.identity import AuthError, GoogleVerifier

KEY = rsa.generate_private_key(public_exponent=65537, key_size=2048)
OTHER = rsa.generate_private_key(public_exponent=65537, key_size=2048)
CLIENT = "1234-web.apps.googleusercontent.com"


def google_token(email="priya@gmail.com", sub="g-111", aud=CLIENT, iss="https://accounts.google.com", verified=True, exp_in=600, key=KEY, **extra):
    now = int(time.time())
    claims = {"iss": iss, "aud": aud, "sub": sub, "email": email, "email_verified": verified, "iat": now, "exp": now + exp_in, "name": "Priya", **extra}
    return jwt.encode(claims, key, algorithm="RS256")


verifier = GoogleVerifier([CLIENT], key_resolver=lambda token: KEY.public_key())


def test_valid_token():
    g = verifier.verify(google_token(email="Priya@Gmail.com"))
    assert (g.sub, g.email, g.name) == ("g-111", "priya@gmail.com", "Priya")


@pytest.mark.parametrize("kw", [{"key": OTHER}, {"aud": "someone-elses-app"}, {"iss": "https://evil.example"}, {"exp_in": -60}, {"verified": False}])
def test_rejected_tokens(kw):
    with pytest.raises(AuthError):
        verifier.verify(google_token(**kw))


def test_not_configured():
    with pytest.raises(AuthError, match="not configured"):
        GoogleVerifier([], key_resolver=lambda t: KEY.public_key()).verify(google_token())


@pytest.fixture()
def api():
    sms = {}
    P = Platform(otp_sender=lambda d, code: sms.__setitem__(d, code), google=verifier)
    c = TestClient(create_app(P))
    def tok(e, pw):
        j = c.post("/v1/auth/staff/login", json={"email": e, "password": pw}).json()
        if j.get("mfa_required"):
            j = c.post("/v1/auth/staff/mfa", json={"mfa_token": j["mfa_token"], "code": sms[e]}).json()
        return {"Authorization": "Bearer " + j["access_token"]}
    admin = tok(settings.platform_admin_email, settings.platform_admin_password)
    tid = c.post("/v1/platform/tenants", headers=admin, json={"name": "R", "type": "retailer", "owner_email": "owner@r.example", "owner_password": "owner-password-1"}).json()["tenant_id"]
    return c, P, sms, tid, tok("owner@r.example", "owner-password-1")


def test_customer_google_sign_in_creates_then_reuses_the_account(api):
    c, P, sms, tid, owner = api
    r1 = c.post("/v1/auth/google/customer", json={"tenant_id": tid, "id_token": google_token()})
    r2 = c.post("/v1/auth/google/customer", json={"tenant_id": tid, "id_token": google_token()})
    assert r1.status_code == 200 and r2.status_code == 200
    assert len([x for x in P.store.customers.values() if x.email == "priya@gmail.com"]) == 1
    me = {"Authorization": "Bearer " + r1.json()["access_token"]}
    assert c.get("/v1/me/orders", headers=me).status_code == 200


def test_google_links_to_an_existing_email_account_once(api):
    c, P, sms, tid, owner = api
    c.post("/v1/auth/customers/email/register", json={"tenant_id": tid, "email": "meena@gmail.com", "password": "meena-pass-123"})
    assert c.post("/v1/auth/google/customer", json={"tenant_id": tid, "id_token": google_token(email="meena@gmail.com", sub="g-222")}).status_code == 200
    assert len([x for x in P.store.customers.values() if x.email == "meena@gmail.com"]) == 1
    r = c.post("/v1/auth/google/customer", json={"tenant_id": tid, "id_token": google_token(email="meena@gmail.com", sub="g-999")})
    assert r.status_code == 409                                              # same email, different Google account


def test_forged_token_is_refused_by_the_api(api):
    c, P, sms, tid, owner = api
    assert c.post("/v1/auth/google/customer", json={"tenant_id": tid, "id_token": google_token(key=OTHER)}).status_code == 401


def test_staff_google_sign_in_only_for_invited_users_and_keeps_mfa(api):
    c, P, sms, tid, owner = api
    r = c.post("/v1/auth/google/staff", json={"id_token": google_token(email="stranger@gmail.com", sub="g-x")})
    assert r.status_code == 403 and "invite" in r.text
    loc = c.post(f"/v1/tenants/{tid}/locations", headers=owner, json={"name": "Ulundurpet"}).json()["location_id"]
    c.post(f"/v1/tenants/{tid}/users", headers=owner, json={"email": "kavya@gmail.com", "password": "cashier-pass-1", "roles": ["cashier"], "stores": [loc]})
    c.post(f"/v1/tenants/{tid}/users", headers=owner, json={"email": "raj@gmail.com", "password": "manager-pass-1", "roles": ["store_manager"], "stores": [loc]})
    assert "access_token" in c.post("/v1/auth/google/staff", json={"id_token": google_token(email="kavya@gmail.com", sub="g-k")}).json()
    j = c.post("/v1/auth/google/staff", json={"id_token": google_token(email="raj@gmail.com", sub="g-r")}).json()
    assert j.get("mfa_required")                                             # Google is the first step; the code is still required
    assert "access_token" in c.post("/v1/auth/staff/mfa", json={"mfa_token": j["mfa_token"], "code": sms["raj@gmail.com"]}).json()
