"""Authorization by persona category.

Six categories give each persona a baseline; each persona adds its own permissions, a default scope
(assigned stores or the whole business) and amount limits. Separation of duties is enforced twice:
when roles are assigned (conflicting pairs are refused) and on every decision (nobody approves their
own request). The server always decides; the user interface only hides what a role cannot do."""
from __future__ import annotations
from dataclasses import dataclass, field
from .identity import Principal

# ---------------------------------------------------------------- permission catalogue (resource:action)
PERMISSIONS: dict[str, str] = {
    # selling and the counter
    "sales:write": "Ring up sales and take payment", "discount:apply": "Apply discounts within the role's limit",
    "returns:write": "Process returns against a receipt", "shift:close": "Count and close a till shift",
    # orders and fulfilment
    "orders:read": "View orders", "orders:write": "Create, assign and update orders",
    "sourcing:write": "Allocate orders to stores or the warehouse", "shipments:write": "Pick, pack and hand over shipments",
    "delivery:write": "Assign riders, update tracking, resolve failed deliveries", "riders:manage": "Manage riders and their collections",
    # stock and supply
    "stock:read": "View stock", "inventory:write": "Count and adjust stock", "inventory:sync": "Push stock to channels",
    "transfers:write": "Move stock between locations", "purchase_orders:write": "Raise purchase orders",
    "suppliers:manage": "Maintain supplier records",
    # merchandising
    "catalog:write": "Create and edit products", "catalog:import": "Upload and commit catalogue files",
    "catalog:publish": "Publish the catalogue to channels", "pricing:write": "Change prices", "promotions:write": "Create offers and promotions",
    # money and customers
    "refunds:request": "Raise a refund", "refunds:approve": "Approve refunds and payments within the role's limit",
    "settlements:reconcile": "Reconcile payments, COD and marketplace settlements", "customers:read": "View customer records (masked)",
    "cases:manage": "Handle customer support cases",
    # decisions and oversight
    "approvals:decide": "Approve or reject requests within limits", "channels:suspend": "Suspend a sales channel",
    "audit:read": "Read the full audit trail", "audit:area": "Read the audit trail for one's own area",
    "activity:own": "View one's own activity", "observability:read": "Read integration health",
    # platform control
    "users:manage": "Invite, change and disable users", "settings:manage": "Change stores, devices, payment and rule settings",
    "connectors:manage": "Connect, configure and resume channels", "signin:manage": "Change customer sign-in settings",
    "integrations:replay": "Replay failed integration events",
    # customers and the platform itself
    "cart:own": "Own cart", "orders:own": "Own orders", "profile:own": "Own profile", "tenants:manage": "Create and suspend business customers",
}

# ---------------------------------------------------------------- categories (baseline permissions and default scope)
CATEGORIES: dict[str, dict] = {
    "leadership": {"label": "Leadership and governance", "scope": "business",
                   "base": {"orders:read", "stock:read", "audit:read", "observability:read", "approvals:decide", "channels:suspend", "customers:read", "activity:own"}},
    "store_frontline": {"label": "Store front line", "scope": "stores",
                        "base": {"sales:write", "discount:apply", "returns:write", "orders:read", "refunds:request", "activity:own"}},
    "fulfilment": {"label": "Fulfilment and supply chain", "scope": "business",
                   "base": {"orders:read", "stock:read", "audit:area", "activity:own"}},
    "merchandising": {"label": "Merchandising", "scope": "business",
                      "base": {"catalog:write", "stock:read", "audit:area", "activity:own"}},
    "back_office": {"label": "Back office and customer care", "scope": "business",
                    "base": {"orders:read", "customers:read", "audit:area", "activity:own"}},
    "platform_control": {"label": "Platform control", "scope": "business",
                         "base": {"users:manage", "settings:manage", "connectors:manage", "signin:manage", "audit:read", "observability:read", "activity:own"}},
}


@dataclass(frozen=True)
class RoleDef:
    label: str
    category: str | None
    extra: frozenset = frozenset()
    limits: dict = field(default_factory=dict)      # defaults; a user's own limits may be lower, never higher
    scope: str | None = None                        # overrides the category scope


ROLES: dict[str, RoleDef] = {
    # 1 leadership
    "tenant_owner": RoleDef("Business owner", "leadership", frozenset(PERMISSIONS) - {"cart:own", "orders:own", "profile:own", "tenants:manage"},
                            {"discount_pct": 100, "refund_paise": 10**9}),
    # 2 store front line
    "cashier": RoleDef("Cashier", "store_frontline", frozenset(), {"discount_pct": 10}),
    "store_manager": RoleDef("Store manager", "store_frontline", frozenset({"shift:close", "orders:write", "approvals:decide", "inventory:write",
                             "inventory:sync", "delivery:write", "stock:read", "audit:area", "refunds:approve"}), {"discount_pct": 20, "refund_paise": 200_000}),
    # 3 fulfilment and supply chain
    "oms_supervisor": RoleDef("OMS supervisor", "fulfilment", frozenset({"orders:write", "sourcing:write", "approvals:decide"})),
    "warehouse_supervisor": RoleDef("Warehouse supervisor", "fulfilment", frozenset({"shipments:write", "transfers:write", "inventory:write"})),
    "logistics_supervisor": RoleDef("Logistics supervisor", "fulfilment", frozenset({"delivery:write", "riders:manage", "observability:read"})),
    "inventory_manager": RoleDef("Inventory manager", "fulfilment", frozenset({"inventory:write", "inventory:sync", "transfers:write", "approvals:decide"})),
    "procurement": RoleDef("Procurement", "fulfilment", frozenset({"purchase_orders:write", "suppliers:manage"})),
    # 4 merchandising
    "catalog_manager": RoleDef("Catalogue manager", "merchandising", frozenset({"catalog:import", "catalog:publish"})),
    "pricing_manager": RoleDef("Pricing and promotions", "merchandising", frozenset({"pricing:write", "promotions:write"})),
    # 5 back office and customer care
    "finance": RoleDef("Finance and accounts", "back_office", frozenset({"settlements:reconcile", "observability:read"})),
    "payment_approver": RoleDef("Payment approver", "back_office", frozenset({"refunds:approve"}), {"refund_paise": 1_000_000}),
    "customer_support": RoleDef("Customer support", "back_office", frozenset({"cases:manage", "refunds:request"})),
    # 6 platform control
    # Privileged platform work only: business work (catalogue, stock, channel suspension) belongs to business roles.
    "tenant_admin": RoleDef("Retail administrator", "platform_control", frozenset({"integrations:replay"})),
    # outside the business's staff
    "customer": RoleDef("Customer", None, frozenset({"cart:own", "orders:own", "profile:own"}), scope="own"),
    "platform_admin": RoleDef("AIFirstMart platform administrator", None, frozenset({"tenants:manage"}), scope="platform"),
}
TENANT_ROLES = {r for r, d in ROLES.items() if d.category}

# Pairs one person must not hold together (classic separation of duties). The business owner is exempt.
CONFLICTS: list[tuple[str, str, str]] = [
    ("procurement", "payment_approver", "the same person would raise purchase orders and pay suppliers"),
    ("tenant_admin", "payment_approver", "the same person would create users and release money"),
    ("finance", "payment_approver", "the same person would approve payments and reconcile them"),
    ("procurement", "finance", "the same person would raise purchase orders and reconcile their payment"),
    ("tenant_admin", "finance", "the same person would create users and handle money"),
    ("pricing_manager", "finance", "the same person would set prices and reconcile the takings"),
    ("cashier", "store_manager", "a cashier would approve their own counter's exceptions"),
]


# Permission pairs no single role may combine (checked whenever role definitions change).
ROLE_RULES: list[tuple[set, set, str]] = [
    ({"users:manage", "settings:manage"}, {"approvals:decide", "refunds:approve"}, "configures the system and approves exceptions or payments"),
    ({"purchase_orders:write"}, {"settlements:reconcile", "refunds:approve"}, "raises purchase orders and reconciles or releases payments"),
    ({"pricing:write"}, {"settlements:reconcile"}, "sets prices and reconciles the takings"),
    ({"refunds:approve"}, {"settlements:reconcile"}, "approves payments and reconciles them"),
]
MFA_ROLES = {"tenant_owner", "tenant_admin", "store_manager", "finance", "payment_approver"}
OWNER_SECOND_APPROVER_ABOVE_PAISE = 2_500_000          # compensating control for the owner's unlimited rights
TEMP_ROLE_MAX_DAYS = 30
INACTIVE_DISABLE_DAYS = 90
ACCESS_REVIEW_DAYS = 182


def requires_mfa(roles: list[str]) -> bool:
    return any(r in MFA_ROLES for r in roles)


def permissions_for(role: str) -> set[str]:
    d = ROLES.get(role)
    if not d:
        return set()
    base = CATEGORIES[d.category]["base"] if d.category else set()
    return set(base) | set(d.extra)


ROLE_PERMISSIONS: dict[str, set[str]] = {r: permissions_for(r) for r in ROLES}


def role_definition_conflicts() -> list[str]:
    """Roles whose own permissions combine conflicting duties (the owner is exempt)."""
    out = []
    for r, perms in ROLE_PERMISSIONS.items():
        if r == "tenant_owner":
            continue
        for a, b, why in ROLE_RULES:
            if perms & a and perms & b:
                out.append(f"{ROLES[r].label} {why}")
    return out


def role_conflicts(roles: list[str]) -> list[str]:
    """Reasons why this combination of roles cannot be given to one person (empty list = allowed)."""
    rs = set(roles)
    if "tenant_owner" in rs:
        return []
    return [f"{ROLES[a].label} with {ROLES[b].label}: {why}" for a, b, why in CONFLICTS if a in rs and b in rs]


def scope_of(roles: list[str]) -> str:
    """'business' if any role is business-wide, otherwise 'stores' (or own/platform)."""
    scopes = {ROLES[r].scope or (CATEGORIES[ROLES[r].category]["scope"] if ROLES[r].category else None) for r in roles if r in ROLES}
    for s in ("platform", "business", "stores", "own"):
        if s in scopes:
            return s
    return "stores"


def default_limits(roles: list[str]) -> dict:
    out: dict = {}
    for r in roles:
        for k, v in (ROLES[r].limits if r in ROLES else {}).items():
            out[k] = max(out.get(k, 0), v)
    return out


def describe() -> list[dict]:
    """Role catalogue for screens and documentation."""
    return [{"role": r, "label": d.label, "category": d.category, "category_label": CATEGORIES[d.category]["label"] if d.category else None,
             "scope": scope_of([r]), "permissions": sorted(permissions_for(r)), "limits": d.limits} for r, d in ROLES.items()]


@dataclass
class Decision:
    allowed: bool
    reason: str


class PolicyEngine:
    def __init__(self):
        self.audit: list[dict] = []

    def permissions_of(self, p: Principal) -> set[str]:
        perms = set(p.scopes)
        for r in p.roles:
            perms |= ROLE_PERMISSIONS.get(r, set())
        return perms

    def check(self, p: Principal, action: str, resource: dict | None = None) -> Decision:
        d = self._decide(p, action, resource or {})
        self.audit.append({"sub": p.sub, "tenant": p.tenant_id, "action": action, "resource": dict(resource or {}),
                           "allowed": d.allowed, "reason": d.reason})
        return d

    @staticmethod
    def _areas(p: Principal) -> set[str]:
        """Audit areas a role may read with audit:area."""
        AREA = {"store_frontline": {"store", "sales", "returns"}, "fulfilment": {"orders", "stock", "delivery", "purchasing"},
                "merchandising": {"catalogue", "pricing"}, "back_office": {"finance", "support", "refunds"}}
        out: set[str] = set()
        for r in p.roles:
            d = ROLES.get(r)
            if d and d.category in AREA:
                out |= AREA[d.category]
        return out

    def _limit(self, p: Principal, key: str) -> float:
        cap = default_limits(p.roles).get(key, 0)                 # a role's ceiling
        own = p.limits.get(key)
        return cap if own is None else min(own, cap) if cap else own

    def _decide(self, p: Principal, action: str, r: dict) -> Decision:
        if action not in self.permissions_of(p):
            return Decision(False, f"role does not allow {action}")
        if p.kind == "platform":
            return Decision(action == "tenants:manage", "platform scope only")
        if r.get("tenant_id") is None or r.get("tenant_id") != p.tenant_id:
            return Decision(False, "resource belongs to another tenant")
        store = r.get("store_id")
        if store and p.stores and store not in p.stores:
            return Decision(False, "store not in your scope")
        if store and not p.stores and scope_of(p.roles) == "stores" and p.kind == "staff":
            return Decision(False, "no stores assigned to you")
        if action.endswith(":own") and r.get("owner_id") != p.sub:
            return Decision(False, "not your record")
        if action == "discount:apply" and "discount_pct" in r:
            lim = self._limit(p, "discount_pct")
            if r["discount_pct"] > lim:
                return Decision(False, f"above your limit of {lim:g}%")
        if action == "refunds:approve" and "amount_paise" in r:
            lim = self._limit(p, "refund_paise")
            if r["amount_paise"] > lim:
                return Decision(False, f"above your refund limit of ₹{lim / 100:,.2f}")
        if action in ("approvals:decide", "refunds:approve") and r.get("requested_by") == p.sub:
            return Decision(False, "you cannot approve your own request")
        if action == "refunds:approve" and "tenant_owner" in p.roles and r.get("amount_paise", 0) > OWNER_SECOND_APPROVER_ABOVE_PAISE:
            second = r.get("second_approver")
            if not second or second == p.sub:
                return Decision(False, f"above ₹{OWNER_SECOND_APPROVER_ABOVE_PAISE / 100:,.0f} a second approver is required")
        if action in ("audit:read", "audit:area") and r.get("area") and action == "audit:area" and r.get("area") not in self._areas(p):
            return Decision(False, "audit records outside your area")
        return Decision(True, "allowed")
