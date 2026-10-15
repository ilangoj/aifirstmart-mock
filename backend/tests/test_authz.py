from aifirstmart_connect.authz import PolicyEngine
from aifirstmart_connect.identity import Principal

pe = PolicyEngine()
manager = Principal("usr_raj", "ten_a", "staff", ["store_manager"], ["loc_ulu"], [], {"discount_pct": 20})
cashier = Principal("usr_kavya", "ten_a", "staff", ["cashier"], ["loc_ulu"], [], {"discount_pct": 10})
admin = Principal("usr_plat", None, "platform", ["platform_admin"])
customer = Principal("cus_1", "ten_a", "customer", ["customer"])


def test_tenant_isolation():
    assert pe.check(manager, "orders:read", {"tenant_id": "ten_a"}).allowed
    assert not pe.check(manager, "orders:read", {"tenant_id": "ten_b"}).allowed


def test_store_scope():
    assert pe.check(manager, "inventory:write", {"tenant_id": "ten_a", "store_id": "loc_ulu"}).allowed
    assert not pe.check(manager, "inventory:write", {"tenant_id": "ten_a", "store_id": "loc_kal"}).allowed


def test_discount_limit():
    assert pe.check(cashier, "discount:apply", {"tenant_id": "ten_a", "discount_pct": 9.5}).allowed
    d = pe.check(cashier, "discount:apply", {"tenant_id": "ten_a", "discount_pct": 12})
    assert not d.allowed and "10%" in d.reason


def test_separation_of_duties():
    assert not pe.check(cashier, "approvals:decide", {"tenant_id": "ten_a"}).allowed          # role lacks it
    assert not pe.check(manager, "approvals:decide", {"tenant_id": "ten_a", "requested_by": "usr_raj"}).allowed
    assert pe.check(manager, "approvals:decide", {"tenant_id": "ten_a", "requested_by": "usr_kavya"}).allowed


def test_customer_ownership():
    assert pe.check(customer, "orders:own", {"tenant_id": "ten_a", "owner_id": "cus_1"}).allowed
    assert not pe.check(customer, "orders:own", {"tenant_id": "ten_a", "owner_id": "cus_2"}).allowed
    assert not pe.check(customer, "orders:read", {"tenant_id": "ten_a"}).allowed


def test_platform_admin_cannot_read_tenant_data():
    assert pe.check(admin, "tenants:manage", {"tenant_id": None}).allowed
    assert not pe.check(admin, "orders:read", {"tenant_id": "ten_a"}).allowed


def test_every_decision_is_audited():
    n = len(pe.audit)
    pe.check(cashier, "users:manage", {"tenant_id": "ten_a"})
    assert len(pe.audit) == n + 1 and pe.audit[-1]["allowed"] is False
