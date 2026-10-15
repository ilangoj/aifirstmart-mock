"""Controls added after the standards review (ISO/IEC 27001 Annex A, PCI DSS v4.0, NIST RBAC)."""
import time
import pytest
from fastapi.testclient import TestClient
from aifirstmart_connect.api import Platform, create_app
from aifirstmart_connect.authz import PolicyEngine, permissions_for, role_definition_conflicts, requires_mfa
from aifirstmart_connect.config import settings
from aifirstmart_connect.identity import Principal

pe = PolicyEngine()
T = "ten_a"


def test_default_roles_combine_no_conflicting_duties():
    assert role_definition_conflicts() == []


def test_administrator_keeps_platform_work_only():
    admin = permissions_for("tenant_admin")
    assert {"users:manage", "settings:manage", "connectors:manage", "integrations:replay"} <= admin
    assert not admin & {"catalog:write", "catalog:import", "catalog:publish", "inventory:sync", "channels:suspend", "approvals:decide", "refunds:approve"}


def test_full_audit_trail_only_for_owner_and_administrator():
    readers = {r for r in ["tenant_owner", "tenant_admin", "cashier", "store_manager", "finance", "procurement", "catalog_manager"] if "audit:read" in permissions_for(r)}
    assert readers == {"tenant_owner", "tenant_admin"}
    fin = Principal("u_f", T, "staff", ["finance"])
    assert pe.check(fin, "audit:area", {"tenant_id": T, "area": "finance"}).allowed
    assert not pe.check(fin, "audit:area", {"tenant_id": T, "area": "catalogue"}).allowed


def test_owner_needs_a_second_approver_for_large_refunds():
    owner = Principal("u_o", T, "staff", ["tenant_owner"])
    assert pe.check(owner, "refunds:approve", {"tenant_id": T, "amount_paise": 2_000_000}).allowed
    assert not pe.check(owner, "refunds:approve", {"tenant_id": T, "amount_paise": 3_000_000}).allowed
    assert not pe.check(owner, "refunds:approve", {"tenant_id": T, "amount_paise": 3_000_000, "second_approver": "u_o"}).allowed
    assert pe.check(owner, "refunds:approve", {"tenant_id": T, "amount_paise": 3_000_000, "second_approver": "u_fin"}).allowed


def test_mfa_roles():
    assert requires_mfa(["store_manager"]) and requires_mfa(["payment_approver"]) and requires_mfa(["tenant_admin"])
    assert not requires_mfa(["cashier"])


@pytest.fixture()
def api():
    sms = {}
    P = Platform(otp_sender=lambda d, code: sms.__setitem__(d, code))
    c = TestClient(create_app(P))
    def tok(e, pw):
        j = c.post("/v1/auth/staff/login", json={"email": e, "password": pw}).json()
        if j.get("mfa_required"):
            j = c.post("/v1/auth/staff/mfa", json={"mfa_token": j["mfa_token"], "code": sms[e]}).json()
        return {"Authorization": "Bearer " + j["access_token"]}
    admin = tok(settings.platform_admin_email, settings.platform_admin_password)
    tid = c.post("/v1/platform/tenants", headers=admin, json={"name": "R", "type": "retailer", "owner_email": "o@r.example", "owner_password": "owner-password-1"}).json()["tenant_id"]
    owner = tok("o@r.example", "owner-password-1")
    loc = c.post(f"/v1/tenants/{tid}/locations", headers=owner, json={"name": "Ulundurpet"}).json()["location_id"]
    return c, P, sms, tid, owner, loc, tok


def test_multi_factor_sign_in_for_sensitive_roles(api):
    c, P, sms, tid, owner, loc, tok = api
    c.post(f"/v1/tenants/{tid}/users", headers=owner, json={"email": "raj@r.example", "password": "manager-pass-1", "roles": ["store_manager"], "stores": [loc]})
    c.post(f"/v1/tenants/{tid}/users", headers=owner, json={"email": "kavya@r.example", "password": "cashier-pass-1", "roles": ["cashier"], "stores": [loc]})
    r = c.post("/v1/auth/staff/login", json={"email": "raj@r.example", "password": "manager-pass-1"}).json()
    assert r == {"mfa_required": True, "mfa_token": r["mfa_token"]}                         # no token before the second step
    wrong = "000000" if sms["raj@r.example"] != "000000" else "111111"
    assert c.post("/v1/auth/staff/mfa", json={"mfa_token": r["mfa_token"], "code": wrong}).status_code == 401
    assert "access_token" in c.post("/v1/auth/staff/mfa", json={"mfa_token": r["mfa_token"], "code": sms["raj@r.example"]}).json()
    assert "access_token" in c.post("/v1/auth/staff/login", json={"email": "kavya@r.example", "password": "cashier-pass-1"}).json()   # cashier: one step


def test_nobody_changes_their_own_access(api):
    c, P, sms, tid, owner, loc, tok = api
    lid = c.post(f"/v1/tenants/{tid}/users", headers=owner, json={"email": "lakshmi@r.example", "password": "admin-pass-12", "roles": ["tenant_admin"]}).json()["user_id"]
    lak = tok("lakshmi@r.example", "admin-pass-12")
    r = c.put(f"/v1/tenants/{tid}/users/{lid}/roles", headers=lak, json={"roles": ["tenant_admin", "catalog_manager"]})
    assert r.status_code == 403 and "own access" in r.text
    assert c.put(f"/v1/tenants/{tid}/users/{lid}/roles", headers=owner, json={"roles": ["tenant_admin", "catalog_manager"]}).status_code == 200


def test_temporary_roles_expire_and_respect_conflicts(api):
    c, P, sms, tid, owner, loc, tok = api
    fid = c.post(f"/v1/tenants/{tid}/users", headers=owner, json={"email": "anitha@r.example", "password": "finance-pass-1", "roles": ["finance"]}).json()["user_id"]
    bid = c.post(f"/v1/tenants/{tid}/users", headers=owner, json={"email": "meena@r.example", "password": "stock-pass-12", "roles": ["inventory_manager"]}).json()["user_id"]
    r = c.post(f"/v1/tenants/{tid}/users/{fid}/temporary-roles", headers=owner, json={"role": "procurement", "days": 7, "reason": "covering leave"})
    assert r.status_code == 400 and "even temporarily" in r.text
    assert c.post(f"/v1/tenants/{tid}/users/{bid}/temporary-roles", headers=owner, json={"role": "procurement", "days": 31, "reason": "too long"}).status_code == 422
    assert c.post(f"/v1/tenants/{tid}/users/{bid}/temporary-roles", headers=owner, json={"role": "procurement", "days": 7, "reason": "covering leave"}).status_code == 201
    u = P.store.staff[bid]
    assert "procurement" in u.effective_roles(time.time())
    assert "procurement" not in u.effective_roles(time.time() + 8 * 86400)               # ends automatically


def test_inactive_accounts_are_disabled(api):
    c, P, sms, tid, owner, loc, tok = api
    uid = c.post(f"/v1/tenants/{tid}/users", headers=owner, json={"email": "bala@r.example", "password": "procure-pass-1", "roles": ["procurement"]}).json()["user_id"]
    tok("bala@r.example", "procure-pass-1")
    P.store.staff[uid].last_login = time.time() - 91 * 86400
    r = c.post("/v1/auth/staff/login", json={"email": "bala@r.example", "password": "procure-pass-1"})
    assert r.status_code == 423 and "90 days" in r.text and not P.store.staff[uid].active
