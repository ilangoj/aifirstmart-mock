"""FastAPI application exposing the endpoints in the specification."""
from __future__ import annotations
import hashlib, hmac, secrets, time
from dataclasses import asdict
from typing import Callable
import httpx
from fastapi import Depends, FastAPI, Header, HTTPException, Request
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel, Field
from .authz import (INACTIVE_DISABLE_DAYS, TEMP_ROLE_MAX_DAYS, TENANT_ROLES, PolicyEngine, default_limits, describe, requires_mfa,
                    role_conflicts, scope_of)
from .catalog import Catalog, CatalogError, Product
from .config import settings
from .connectors import Connection, ConnectorError, SandboxHub, build_connector
from .identity import (AuthError, GoogleVerifier, OtpService, Principal, RefreshTokens, hash_password, issue_access_token,
                       normalize_email, normalize_phone, verify_access_token, verify_password)
from .orders import OrderService
from .tenancy import Customer, Location, ServiceClient, StaffUser, Store, Tenant, new_id
from .vault import Vault


class Platform:
    """Everything the API needs. In production each part is backed by a database or managed service."""

    def __init__(self, otp_sender: Callable[[str, str], None] | None = None, http: httpx.Client | None = None, google: GoogleVerifier | None = None,
                 db_path: str | None = None):
        self.store, self.catalog, self.vault, self.hub = Store(), Catalog(db_path or settings.db_path), Vault(), SandboxHub()
        self.orders, self.policy = OrderService(self.catalog), PolicyEngine()
        self.otp, self.refresh = OtpService(otp_sender), RefreshTokens()
        self.connections: dict[str, Connection] = {}
        self.http = http
        self.mfa: dict[str, tuple[str, float]] = {}
        self.google = google
        admin = StaffUser(new_id("usr"), None, normalize_email(settings.platform_admin_email),
                          hash_password(settings.platform_admin_password), ["platform_admin"])
        self.store.staff[admin.id] = admin

    def tokens(self, p: Principal, refresh_ttl: int | None) -> dict:
        out = {"access_token": issue_access_token(p), "token_type": "bearer", "expires_in": settings.access_ttl_s}
        if refresh_ttl:
            out["refresh_token"] = self.refresh.issue(p, refresh_ttl)
        return out


# ---------- request bodies
class TenantIn(BaseModel):
    name: str
    type: str = Field(pattern="^(retailer|brand)$")
    owner_email: str
    owner_password: str
    legal: dict = {}

class LoginIn(BaseModel):
    email: str
    password: str

class GoogleCustomerIn(BaseModel):
    tenant_id: str
    id_token: str

class GoogleStaffIn(BaseModel):
    id_token: str

class MfaIn(BaseModel):
    mfa_token: str
    code: str

class RolesIn(BaseModel):
    roles: list[str]

class TempRoleIn(BaseModel):
    role: str
    days: int = Field(ge=1, le=TEMP_ROLE_MAX_DAYS)
    reason: str = Field(min_length=3)

class CustomerEmailIn(BaseModel):
    tenant_id: str
    email: str
    password: str

class OtpRequestIn(BaseModel):
    tenant_id: str
    phone: str

class OtpVerifyIn(OtpRequestIn):
    code: str

class RefreshIn(BaseModel):
    refresh_token: str

class ClientTokenIn(BaseModel):
    client_id: str
    client_secret: str

class UserIn(BaseModel):
    email: str
    password: str
    roles: list[str]
    stores: list[str] = []
    limits: dict = {}

class LocationIn(BaseModel):
    name: str
    kind: str = "store"

class ProductIn(BaseModel):
    sku: str
    name: str
    price_paise: int = Field(ge=0)
    gtin: str | None = None
    brand: str | None = None
    channel_ids: dict = {}
    category: str = "Grocery"

class ImageIn(BaseModel):
    sku: str
    role: str = "Other"
    content_type: str
    data_base64: str

class CatalogChangesIn(BaseModel):
    prices: dict[str, int] = {}           # sku -> new price in paise
    images: list[ImageIn] = []

class StockIn(BaseModel):
    location_id: str
    sku: str
    on_hand: int = Field(ge=0)
    buffer: int = Field(default=0, ge=0)

class ConnectionIn(BaseModel):
    channel: str
    mode: str = Field(default="sandbox", pattern="^(sandbox|live)$")
    credentials: dict = {}
    settings: dict = {}


def create_app(platform: Platform | None = None) -> FastAPI:
    P = platform or Platform()
    app = FastAPI(title="AIFirstMart Connector and Identity API", version="0.1.0")
    app.state.platform = P

    def principal(authorization: str = Header(default="")) -> Principal:
        if not authorization.lower().startswith("bearer "):
            raise HTTPException(401, "Sign in required")
        try:
            return verify_access_token(authorization[7:])
        except AuthError as e:
            raise HTTPException(401, str(e))

    def allow(p: Principal, action: str, **resource) -> None:
        d = P.policy.check(p, action, resource)
        if not d.allowed:
            raise HTTPException(403, d.reason)

    def tenant_or_404(tid: str) -> Tenant:
        t = P.store.tenants.get(tid)
        if not t:
            raise HTTPException(404, "Tenant not found")
        if t.status != "active":
            raise HTTPException(403, "Tenant is suspended")
        return t

    def connection_or_404(tid: str, cid: str) -> Connection:
        c = P.connections.get(cid)
        if not c or c.tenant_id != tid:
            raise HTTPException(404, "Connection not found")
        return c

    def connector(c: Connection):
        try:
            return build_connector(c, P.vault, P.hub, P.http)
        except ConnectorError as e:
            raise HTTPException(409, str(e))

    # ---------------- platform
    @app.post("/v1/platform/tenants", status_code=201)
    def create_tenant(body: TenantIn, p: Principal = Depends(principal)):
        allow(p, "tenants:manage", tenant_id=None)
        t = Tenant(new_id("ten"), body.name, body.type, legal=body.legal)
        P.store.tenants[t.id] = t
        try:
            owner = StaffUser(new_id("usr"), t.id, normalize_email(body.owner_email), hash_password(body.owner_password), ["tenant_owner"])
        except AuthError as e:
            raise HTTPException(400, str(e))
        P.store.staff[owner.id] = owner
        return {"tenant_id": t.id, "owner_user_id": owner.id}

    # ---------------- authentication
    @app.post("/v1/auth/staff/login")
    def staff_login(body: LoginIn):
        try:
            u = P.store.staff_by_email(normalize_email(body.email))
        except AuthError:
            u = None
        if u and u.failed_logins >= settings.login_max_failures:
            raise HTTPException(423, "Account locked after repeated failed sign-ins. Contact your administrator")
        if not u or not u.active or not verify_password(body.password, u.password_hash):
            if u:
                u.failed_logins += 1
            raise HTTPException(401, "Incorrect email or password")
        if u.tenant_id:
            tenant_or_404(u.tenant_id)
        now = time.time()
        if u.last_login and now - u.last_login > INACTIVE_DISABLE_DAYS * 86400:
            u.active = False
            raise HTTPException(423, f"Account disabled after {INACTIVE_DISABLE_DAYS} days without sign-in. Ask your administrator")
        u.failed_logins = 0
        if requires_mfa(u.effective_roles(now)):
            token = secrets.token_urlsafe(16)
            P.mfa[token] = (u.id, now + settings.otp_ttl_s)
            P.otp.request(u.tenant_id or "platform", u.email)
            return {"mfa_required": True, "mfa_token": token}
        return _staff_tokens(u)

    def _staff_tokens(u: StaffUser) -> dict:
        now = time.time()
        u.last_login = now
        kind = "platform" if "platform_admin" in u.roles else "staff"
        pr = Principal(u.id, u.tenant_id, kind, u.effective_roles(now), u.stores, [], u.limits)
        return P.tokens(pr, settings.staff_refresh_ttl_s)

    def _google(token: str):
        try:
            return (P.google or GoogleVerifier()).verify(token)
        except AuthError as e:
            raise HTTPException(401, str(e))

    @app.post("/v1/auth/google/customer")
    def google_customer(body: GoogleCustomerIn):
        tenant_or_404(body.tenant_id)
        g = _google(body.id_token)
        c = next((x for x in P.store.customers.values() if x.tenant_id == body.tenant_id and x.google_sub == g.sub), None)
        if not c:
            c = P.store.customer_by(body.tenant_id, email=g.email)          # link to an account registered with the same email
            if c and c.google_sub and c.google_sub != g.sub:
                raise HTTPException(409, "This email is linked to a different Google account")
            if not c:
                c = Customer(new_id("cus"), body.tenant_id, email=g.email)
                P.store.customers[c.id] = c
            c.google_sub = g.sub
        return P.tokens(Principal(c.id, c.tenant_id, "customer", ["customer"]), settings.customer_refresh_ttl_s)

    @app.post("/v1/auth/google/staff")
    def google_staff(body: GoogleStaffIn):
        g = _google(body.id_token)
        u = P.store.staff_by_email(g.email)
        if not u or not u.active or not u.tenant_id:                         # Google never creates staff accounts
            raise HTTPException(403, "No active staff account uses this Google email. Ask your administrator to invite you")
        if u.google_sub and u.google_sub != g.sub:
            raise HTTPException(409, "This staff account is linked to a different Google account")
        tenant_or_404(u.tenant_id)
        now = time.time()
        if u.last_login and now - u.last_login > INACTIVE_DISABLE_DAYS * 86400:
            u.active = False
            raise HTTPException(423, f"Account disabled after {INACTIVE_DISABLE_DAYS} days without sign-in. Ask your administrator")
        u.google_sub = g.sub
        if requires_mfa(u.effective_roles(now)):
            token = secrets.token_urlsafe(16)
            P.mfa[token] = (u.id, now + settings.otp_ttl_s)
            P.otp.request(u.tenant_id, u.email)
            return {"mfa_required": True, "mfa_token": token}
        return _staff_tokens(u)

    @app.post("/v1/auth/staff/mfa")
    def staff_mfa(body: MfaIn):
        rec = P.mfa.get(body.mfa_token)
        if not rec or rec[1] < time.time():
            P.mfa.pop(body.mfa_token, None)
            raise HTTPException(401, "Sign-in expired. Start again")
        u = P.store.staff.get(rec[0])
        try:
            P.otp.verify(u.tenant_id or "platform", u.email, body.code)
        except AuthError as e:
            raise HTTPException(401, str(e))
        P.mfa.pop(body.mfa_token, None)
        return _staff_tokens(u)

    @app.post("/v1/auth/customers/email/register", status_code=201)
    def customer_register(body: CustomerEmailIn):
        tenant_or_404(body.tenant_id)
        try:
            email = normalize_email(body.email)
            if P.store.customer_by(body.tenant_id, email=email):
                raise HTTPException(409, "An account with this email already exists")
            c = Customer(new_id("cus"), body.tenant_id, email=email, password_hash=hash_password(body.password))
        except AuthError as e:
            raise HTTPException(400, str(e))
        P.store.customers[c.id] = c
        return {"customer_id": c.id}

    @app.post("/v1/auth/customers/email/login")
    def customer_login(body: CustomerEmailIn):
        tenant_or_404(body.tenant_id)
        try:
            c = P.store.customer_by(body.tenant_id, email=normalize_email(body.email))
        except AuthError:
            c = None
        if not c or not verify_password(body.password, c.password_hash):
            raise HTTPException(401, "Incorrect email or password")
        return P.tokens(Principal(c.id, c.tenant_id, "customer", ["customer"]), settings.customer_refresh_ttl_s)

    @app.post("/v1/auth/otp/request", status_code=202)
    def otp_request(body: OtpRequestIn):
        tenant_or_404(body.tenant_id)
        try:
            P.otp.request(body.tenant_id, normalize_phone(body.phone))
        except AuthError as e:
            raise HTTPException(429 if "Too many" in str(e) else 400, str(e))
        return {"sent": True}

    @app.post("/v1/auth/otp/verify")
    def otp_verify(body: OtpVerifyIn):
        tenant_or_404(body.tenant_id)
        try:
            phone = normalize_phone(body.phone)
            P.otp.verify(body.tenant_id, phone, body.code)
        except AuthError as e:
            raise HTTPException(401, str(e))
        c = P.store.customer_by(body.tenant_id, phone=phone)
        if not c:
            c = Customer(new_id("cus"), body.tenant_id, phone=phone)
            P.store.customers[c.id] = c
        return P.tokens(Principal(c.id, c.tenant_id, "customer", ["customer"]), settings.customer_refresh_ttl_s)

    @app.post("/v1/auth/token/refresh")
    def refresh(body: RefreshIn):
        try:
            pr, new_refresh = P.refresh.rotate(body.refresh_token, settings.customer_refresh_ttl_s)
        except AuthError as e:
            raise HTTPException(401, str(e))
        return {"access_token": issue_access_token(pr), "token_type": "bearer", "refresh_token": new_refresh}

    @app.post("/v1/auth/clients/token")
    def client_token(body: ClientTokenIn):
        c = P.store.clients.get(body.client_id)
        ok = c and c.active and hmac.compare_digest(c.secret_hash, hashlib.sha256(body.client_secret.encode()).hexdigest())
        if not ok:
            raise HTTPException(401, "Invalid client credentials")
        tenant_or_404(c.tenant_id)
        return P.tokens(Principal(c.id, c.tenant_id, "service", [], [], c.scopes), None)

    # ---------------- tenant administration
    @app.post("/v1/tenants/{tid}/users", status_code=201)
    def create_user(tid: str, body: UserIn, p: Principal = Depends(principal)):
        tenant_or_404(tid)
        allow(p, "users:manage", tenant_id=tid)
        bad = set(body.roles) - TENANT_ROLES
        if bad or not body.roles:
            raise HTTPException(400, f"Roles not allowed for tenant users: {sorted(bad) or 'none given'}")
        if "tenant_owner" in body.roles and "tenant_owner" not in p.roles:
            raise HTTPException(403, "Only an owner can create another owner")
        unknown = [s for s in body.stores if P.store.locations.get(s, Location('', '', '')).tenant_id != tid]
        if unknown:
            raise HTTPException(400, f"Unknown stores: {unknown}")
        conflicts = role_conflicts(body.roles)
        if conflicts:
            raise HTTPException(400, "Separation of duties: " + "; ".join(conflicts))
        if scope_of(body.roles) == "stores" and not body.stores:
            raise HTTPException(400, "Store-level roles need at least one assigned store")
        ceiling = default_limits(body.roles)
        over = [k for k, v in body.limits.items() if k in ceiling and v > ceiling[k]]
        if over:
            raise HTTPException(400, f"Limits above the role's ceiling: {over}")
        body.limits = {**ceiling, **body.limits}
        try:
            u = StaffUser(new_id("usr"), tid, normalize_email(body.email), hash_password(body.password), body.roles, body.stores, body.limits)
        except AuthError as e:
            raise HTTPException(400, str(e))
        if P.store.staff_by_email(u.email):
            raise HTTPException(409, "A user with this email already exists")
        P.store.staff[u.id] = u
        return {"user_id": u.id}

    @app.get("/v1/authz/roles")
    def roles_catalogue(p: Principal = Depends(principal)):
        return describe()

    def _target(tid: str, uid: str, p: Principal) -> StaffUser:
        tenant_or_404(tid)
        allow(p, "users:manage", tenant_id=tid)
        u = P.store.staff.get(uid)
        if not u or u.tenant_id != tid:
            raise HTTPException(404, "User not found")
        if uid == p.sub:
            raise HTTPException(403, "You cannot change your own access. Ask the owner")
        return u

    @app.put("/v1/tenants/{tid}/users/{uid}/roles")
    def set_roles(tid: str, uid: str, body: RolesIn, p: Principal = Depends(principal)):
        u = _target(tid, uid, p)
        bad = set(body.roles) - TENANT_ROLES
        if bad:
            raise HTTPException(400, f"Roles not allowed for tenant users: {sorted(bad)}")
        if "tenant_owner" in body.roles and "tenant_owner" not in p.roles:
            raise HTTPException(403, "Only an owner can make someone an owner")
        conflicts = role_conflicts(body.roles + [r for r, until, _ in u.temp_roles if until > time.time()])
        if conflicts:
            raise HTTPException(400, "Separation of duties: " + "; ".join(conflicts))
        if scope_of(body.roles) == "stores" and not u.stores:
            raise HTTPException(400, "Store-level roles need at least one assigned store")
        u.roles = body.roles
        ceiling = default_limits(body.roles)
        u.limits = {k: min(v, ceiling[k]) for k, v in u.limits.items() if k in ceiling} | {k: v for k, v in ceiling.items() if k not in u.limits}
        P.refresh.revoke_subject(uid)                       # new roles take effect at next sign-in
        return {"user_id": uid, "roles": u.roles, "limits": u.limits}

    @app.post("/v1/tenants/{tid}/users/{uid}/temporary-roles", status_code=201)
    def grant_temporary(tid: str, uid: str, body: TempRoleIn, p: Principal = Depends(principal)):
        u = _target(tid, uid, p)
        if body.role not in TENANT_ROLES or body.role == "tenant_owner":
            raise HTTPException(400, "That role cannot be granted temporarily")
        now = time.time()
        conflicts = role_conflicts(u.effective_roles(now) + [body.role])
        if conflicts:
            raise HTTPException(400, "Separation of duties, even temporarily: " + "; ".join(conflicts))
        if scope_of([body.role]) == "stores" and not u.stores:
            raise HTTPException(400, "Store-level roles need at least one assigned store")
        until = now + body.days * 86400
        u.temp_roles.append((body.role, until, body.reason))
        return {"user_id": uid, "role": body.role, "until": until}

    @app.post("/v1/tenants/{tid}/users/{uid}/disable")
    def disable_user(tid: str, uid: str, p: Principal = Depends(principal)):
        u = _target(tid, uid, p)
        u.active = False
        P.refresh.revoke_subject(uid)
        return {"disabled": uid}

    @app.post("/v1/tenants/{tid}/locations", status_code=201)
    def create_location(tid: str, body: LocationIn, p: Principal = Depends(principal)):
        tenant_or_404(tid)
        allow(p, "settings:manage", tenant_id=tid)
        loc = Location(new_id("loc"), tid, body.name, body.kind)
        P.store.locations[loc.id] = loc
        return {"location_id": loc.id}

    @app.post("/v1/tenants/{tid}/service-clients", status_code=201)
    def create_client(tid: str, scopes: list[str], p: Principal = Depends(principal)):
        tenant_or_404(tid)
        allow(p, "connectors:manage", tenant_id=tid)
        secret = secrets.token_urlsafe(32)
        c = ServiceClient(new_id("cli"), tid, hashlib.sha256(secret.encode()).hexdigest(), scopes)
        P.store.clients[c.id] = c
        return {"client_id": c.id, "client_secret": secret, "note": "Shown once. Store it securely."}

    # ---------------- catalogue and stock
    @app.post("/v1/tenants/{tid}/products", status_code=201)
    def upsert_product(tid: str, body: ProductIn, p: Principal = Depends(principal)):
        tenant_or_404(tid)
        allow(p, "catalog:write", tenant_id=tid)
        P.catalog.upsert(Product(body.sku, tid, body.name, body.price_paise, body.gtin, body.brand, body.channel_ids, body.category))
        return {"sku": body.sku}

    @app.post("/v1/tenants/{tid}/catalog/changes")
    def save_catalog_changes(tid: str, body: CatalogChangesIn, p: Principal = Depends(principal)):
        """Save the catalogue page's unsaved changes together: prices need pricing:write, images catalog:write."""
        tenant_or_404(tid)
        if body.prices:
            allow(p, "pricing:write", tenant_id=tid)
        if body.images:
            allow(p, "catalog:write", tenant_id=tid)
        try:
            return P.catalog.apply_changes(tid, body.prices, [i.model_dump() for i in body.images])
        except CatalogError as e:
            raise HTTPException(422, str(e))

    @app.get("/v1/tenants/{tid}/products/{sku}")
    def get_product(tid: str, sku: str, p: Principal = Depends(principal)):
        tenant_or_404(tid)
        perms = P.policy.permissions_of(p)
        allow(p, "catalog:write" if "catalog:write" in perms else "stock:read", tenant_id=tid)
        prod = P.catalog.products.get((tid, sku))
        if not prod:
            raise HTTPException(404, "Product not found")
        return {"sku": prod.sku, "name": prod.name, "price_paise": prod.price_paise, "category": prod.category,
                "images": [{k: v for k, v in i.items() if k != "data"} for i in P.catalog.images_of(tid, sku)]}

    @app.post("/v1/tenants/{tid}/inventory")
    def set_stock(tid: str, body: StockIn, p: Principal = Depends(principal)):
        tenant_or_404(tid)
        loc = P.store.locations.get(body.location_id)
        if not loc or loc.tenant_id != tid:
            raise HTTPException(404, "Location not found")
        allow(p, "inventory:write", tenant_id=tid, store_id=body.location_id)
        lvl = P.catalog.set_stock(tid, body.location_id, body.sku, body.on_hand, body.buffer)
        return {"sku": body.sku, "available": lvl.available}

    # ---------------- connections
    @app.post("/v1/tenants/{tid}/connections", status_code=201)
    def create_connection(tid: str, body: ConnectionIn, p: Principal = Depends(principal)):
        tenant_or_404(tid)
        allow(p, "connectors:manage", tenant_id=tid)
        from .connectors import CONNECTOR_TYPES
        if body.channel not in CONNECTOR_TYPES:
            raise HTTPException(400, f"Unknown channel. Available: {sorted(CONNECTOR_TYPES)}")
        ref = P.vault.put(tid, body.credentials) if body.credentials else None
        c = Connection(new_id("con"), tid, body.channel, body.mode, "live" if body.mode == "live" else "sandbox", ref, body.settings)
        P.connections[c.id] = c
        return {"connection_id": c.id, "status": c.status, "webhook_url": f"/v1/webhooks/{c.channel}/{c.id}"}

    @app.get("/v1/tenants/{tid}/connections")
    def list_connections(tid: str, p: Principal = Depends(principal)):
        tenant_or_404(tid)
        allow(p, "connectors:manage", tenant_id=tid)
        return [{"connection_id": c.id, "channel": c.channel, "mode": c.mode, "status": c.status,
                 "credentials": P.vault.describe(c.credentials_ref) if c.credentials_ref else None}
                for c in P.connections.values() if c.tenant_id == tid]

    @app.post("/v1/tenants/{tid}/connections/{cid}/suspend")
    def suspend_connection(tid: str, cid: str, p: Principal = Depends(principal)):
        tenant_or_404(tid)
        allow(p, "connectors:manage", tenant_id=tid)
        c = connection_or_404(tid, cid)
        c.status = "suspended"
        return {"connection_id": cid, "status": c.status}

    @app.post("/v1/tenants/{tid}/connections/{cid}/publish")
    def publish(tid: str, cid: str, p: Principal = Depends(principal)):
        tenant_or_404(tid)
        allow(p, "catalog:publish", tenant_id=tid)
        c = connection_or_404(tid, cid)
        try:
            return connector(c).publish_catalog(P.catalog.products_of(tid))
        except ConnectorError as e:
            raise HTTPException(422, str(e))

    @app.post("/v1/tenants/{tid}/connections/{cid}/sync-inventory")
    def sync_inventory(tid: str, cid: str, p: Principal = Depends(principal)):
        tenant_or_404(tid)
        allow(p, "inventory:sync", tenant_id=tid)
        c = connection_or_404(tid, cid)
        locs = c.settings.get("locations")                     # limit a channel to some locations
        try:
            return connector(c).push_inventory(P.catalog.availability(tid, locs))
        except ConnectorError as e:
            raise HTTPException(422, str(e))

    @app.post("/v1/tenants/{tid}/connections/{cid}/poll-orders")
    def poll_orders(tid: str, cid: str, p: Principal = Depends(principal)):
        tenant_or_404(tid)
        allow(p, "orders:write", tenant_id=tid)
        c = connection_or_404(tid, cid)
        try:
            events = connector(c).fetch_orders()
        except ConnectorError as e:
            raise HTTPException(422, str(e))
        return _ingest(c, events)

    def _ingest(c: Connection, events: list[dict]) -> dict:
        created = []
        for e in events:
            cust_id = None
            if c.channel == "whatsapp" and e.get("customer_ref"):
                phone = normalize_phone("+" + e["customer_ref"].lstrip("+"))
                cust = P.store.customer_by(c.tenant_id, phone=phone)
                if not cust:
                    cust = Customer(new_id("cus"), c.tenant_id, phone=phone)
                    P.store.customers[cust.id] = cust
                cust_id = cust.id
            order, new = P.orders.ingest(c.tenant_id, c.channel, c.id, e["channel_order_id"], e["lines"], cust_id)
            if new:
                created.append(order.id)
                if c.channel == "whatsapp" and e.get("customer_ref"):
                    connector(c).send_message("+" + e["customer_ref"].lstrip("+"), "order_received", [order.id])
        return {"received": len(events), "created": created}

    @app.get("/v1/tenants/{tid}/orders")
    def list_orders(tid: str, p: Principal = Depends(principal)):
        tenant_or_404(tid)
        allow(p, "orders:read", tenant_id=tid)
        return [asdict(o) for o in P.orders.of_tenant(tid)]

    @app.get("/v1/me/orders")
    def my_orders(p: Principal = Depends(principal)):
        allow(p, "orders:own", tenant_id=p.tenant_id, owner_id=p.sub)
        return [asdict(o) for o in P.orders.of_tenant(p.tenant_id) if o.customer_ref == p.sub]

    # ---------------- channel webhooks (authenticated by the channel's signature, not a user token)
    @app.get("/v1/webhooks/{channel}/{cid}", response_class=PlainTextResponse)
    def webhook_verify(channel: str, cid: str, request: Request):
        c = P.connections.get(cid)
        if not c or c.channel != channel or channel != "whatsapp":
            raise HTTPException(404, "Not found")
        q = request.query_params
        try:
            return connector(c).verify_subscription(q.get("hub.mode", ""), q.get("hub.verify_token", ""), q.get("hub.challenge", ""))
        except ConnectorError as e:
            raise HTTPException(403, str(e))

    @app.post("/v1/webhooks/{channel}/{cid}")
    async def webhook(channel: str, cid: str, request: Request):
        c = P.connections.get(cid)
        if not c or c.channel != channel:
            raise HTTPException(404, "Not found")
        if P.store.tenants.get(c.tenant_id) is None or P.store.tenants[c.tenant_id].status != "active":
            raise HTTPException(403, "Tenant is suspended")
        body = await request.body()
        try:
            events = connector(c).handle_webhook(dict(request.headers), body)
        except ConnectorError as e:
            raise HTTPException(401 if "signature" in str(e) else 422, str(e))
        return _ingest(c, events)

    return app


app = create_app()
