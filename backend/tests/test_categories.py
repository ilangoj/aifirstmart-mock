"""Authorization by persona category: baselines, additions, scope, limits and separation of duties."""
import pytest
from fastapi.testclient import TestClient
from aifirstmart_connect.api import Platform, create_app
from aifirstmart_connect.authz import CATEGORIES, ROLES, PolicyEngine, permissions_for, role_conflicts
from aifirstmart_connect.config import settings
from aifirstmart_connect.identity import Principal

pe = PolicyEngine()
T = "ten_a"
def staff(role, stores=None, limits=None, sub=None):
    return Principal(sub or f"usr_{role}", T, "staff", [role], stores or [], [], limits or {})


def test_every_tenant_role_belongs_to_one_of_six_categories():
    assert len(CATEGORIES) == 6
    for r, d in ROLES.items():
        assert d.category in CATEGORIES or r in ("customer", "platform_admin")
    for cat in CATEGORIES:
        assert any(d.category == cat for d in ROLES.values()), cat


def test_personas_inherit_their_category_baseline():
    for r, d in ROLES.items():
        if d.category:
            assert CATEGORIES[d.category]["base"] <= permissions_for(r), r


@pytest.mark.parametrize("role,allowed,denied", [
    ("cashier", ["sales:write", "returns:write", "activity:own"], ["approvals:decide", "inventory:write", "users:manage", "audit:read", "audit:area"]),
    ("store_manager", ["approvals:decide", "shift:close", "inventory:sync"], ["catalog:publish", "users:manage", "pricing:write"]),
    ("oms_supervisor", ["sourcing:write", "approvals:decide"], ["sales:write", "refunds:approve"]),
    ("warehouse_supervisor", ["shipments:write", "transfers:write"], ["delivery:write", "approvals:decide"]),
    ("logistics_supervisor", ["delivery:write", "riders:manage"], ["settlements:reconcile", "inventory:write"]),
    ("inventory_manager", ["inventory:write", "transfers:write"], ["purchase_orders:write", "pricing:write"]),
    ("procurement", ["purchase_orders:write", "suppliers:manage"], ["refunds:approve", "settlements:reconcile"]),
    ("catalog_manager", ["catalog:write", "catalog:import", "catalog:publish"], ["pricing:write", "users:manage"]),
    ("pricing_manager", ["pricing:write", "promotions:write"], ["catalog:import", "approvals:decide"]),
    ("finance", ["settlements:reconcile", "audit:area"], ["refunds:approve", "sales:write", "users:manage", "audit:read"]),
    ("payment_approver", ["refunds:approve"], ["settlements:reconcile", "users:manage"]),
    ("customer_support", ["cases:manage", "refunds:request", "customers:read"], ["refunds:approve", "orders:write"]),
    ("tenant_admin", ["users:manage", "connectors:manage", "signin:manage", "audit:read", "integrations:replay"], ["approvals:decide", "refunds:approve", "sales:write", "catalog:import", "catalog:publish", "inventory:sync"]),
    ("tenant_owner", ["approvals:decide", "channels:suspend", "users:manage"], ["tenants:manage", "cart:own"]),
])
def test_role_permissions(role, allowed, denied):
    stores = ["loc_ulu"] if role in ("cashier", "store_manager") else []
    for a in allowed:
        assert pe.check(staff(role, stores), a, {"tenant_id": T, "owner_id": f"usr_{role}"}).allowed, (role, a)
    for a in denied:
        assert not pe.check(staff(role, stores), a, {"tenant_id": T}).allowed, (role, a)


def test_configure_and_decide_are_separate():
    """The administrator configures the system but cannot approve exceptions or release refunds."""
    admin = staff("tenant_admin")
    assert pe.check(admin, "settings:manage", {"tenant_id": T}).allowed
    assert not pe.check(admin, "approvals:decide", {"tenant_id": T}).allowed
    assert not pe.check(admin, "refunds:approve", {"tenant_id": T, "amount_paise": 100}).allowed


def test_store_scope_for_front_line_and_business_scope_for_central_roles():
    assert not pe.check(staff("store_manager", ["loc_ulu"]), "inventory:write", {"tenant_id": T, "store_id": "loc_kal"}).allowed
    assert not pe.check(staff("cashier"), "sales:write", {"tenant_id": T, "store_id": "loc_ulu"}).allowed     # no store assigned
    assert pe.check(staff("inventory_manager"), "inventory:write", {"tenant_id": T, "store_id": "loc_kal"}).allowed


def test_limits_cannot_exceed_the_role_ceiling():
    assert not pe.check(staff("cashier", ["loc_ulu"], {"discount_pct": 50}), "discount:apply", {"tenant_id": T, "discount_pct": 15}).allowed
    assert pe.check(staff("store_manager", ["loc_ulu"], {"discount_pct": 20}), "discount:apply", {"tenant_id": T, "discount_pct": 15}).allowed
    fin = staff("payment_approver")
    assert pe.check(fin, "refunds:approve", {"tenant_id": T, "amount_paise": 9_00_000}).allowed
    d = pe.check(fin, "refunds:approve", {"tenant_id": T, "amount_paise": 12_00_000})
    assert not d.allowed and "10,000.00" in d.reason
    assert not pe.check(staff("store_manager", ["loc_ulu"]), "refunds:approve", {"tenant_id": T, "amount_paise": 3_00_000}).allowed


def test_nobody_approves_their_own_refund_or_request():
    fin = staff("payment_approver", sub="usr_f")
    assert not pe.check(fin, "refunds:approve", {"tenant_id": T, "amount_paise": 100, "requested_by": "usr_f"}).allowed
    assert not pe.check(staff("oms_supervisor", sub="usr_o"), "approvals:decide", {"tenant_id": T, "requested_by": "usr_o"}).allowed


def test_conflicting_role_pairs():
    assert role_conflicts(["procurement", "finance"])
    assert role_conflicts(["procurement", "payment_approver"])
    assert role_conflicts(["finance", "payment_approver"])
    assert role_conflicts(["tenant_admin", "finance"])
    assert role_conflicts(["cashier", "store_manager"])
    assert role_conflicts(["procurement", "inventory_manager"]) == []
    assert role_conflicts(["tenant_owner", "finance", "procurement"]) == []        # the owner is exempt


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
    return c, tid, tok("o@r.example", "owner-password-1"), tok


def test_api_refuses_conflicts_missing_stores_and_raised_limits(api):
    c, tid, owner, _ = api
    loc = c.post(f"/v1/tenants/{tid}/locations", headers=owner, json={"name": "Ulundurpet"}).json()["location_id"]
    u = lambda **kw: c.post(f"/v1/tenants/{tid}/users", headers=owner, json={"email": kw.pop("email"), "password": "a-long-password", **kw})
    r = u(email="p@r.example", roles=["procurement", "payment_approver"])
    assert r.status_code == 400 and "Separation of duties" in r.text
    assert u(email="c@r.example", roles=["cashier"]).status_code == 400                                 # no store
    assert u(email="c@r.example", roles=["cashier"], stores=[loc], limits={"discount_pct": 30}).status_code == 400
    assert u(email="c@r.example", roles=["cashier"], stores=[loc], limits={"discount_pct": 5}).status_code == 201
    assert u(email="f@r.example", roles=["finance"]).status_code == 201                                 # business-wide, no store needed


def test_role_catalogue_endpoint(api):
    c, _, owner, _ = api
    cat = c.get("/v1/authz/roles", headers=owner).json()
    labels = {x["label"]: x for x in cat}
    assert labels["Finance and accounts"]["category_label"] == "Back office and customer care"
    assert labels["Payment approver"]["category_label"] == "Back office and customer care"
    assert labels["Cashier"]["scope"] == "stores" and labels["Procurement"]["scope"] == "business"
