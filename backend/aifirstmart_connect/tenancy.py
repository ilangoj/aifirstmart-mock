"""Tenants (business customers), locations, staff, customers and service clients (in-memory store)."""
from __future__ import annotations
import secrets
from dataclasses import dataclass, field


def new_id(prefix: str) -> str:
    return f"{prefix}_{secrets.token_hex(6)}"


@dataclass
class Tenant:
    id: str
    name: str
    type: str                  # retailer | brand
    status: str = "active"     # active | suspended
    legal: dict = field(default_factory=dict)   # GSTIN, PAN, FSSAI, address for channel compliance


@dataclass
class Location:
    id: str
    tenant_id: str
    name: str
    kind: str = "store"        # store | warehouse


@dataclass
class StaffUser:
    id: str
    tenant_id: str | None
    email: str
    password_hash: str
    roles: list[str]
    stores: list[str] = field(default_factory=list)
    limits: dict = field(default_factory=dict)
    active: bool = True
    failed_logins: int = 0
    temp_roles: list = field(default_factory=list)     # [(role, until_epoch, reason)]
    google_sub: str | None = None
    last_login: float | None = None

    def effective_roles(self, now: float) -> list[str]:
        return list(dict.fromkeys(self.roles + [r for r, until, _ in self.temp_roles if until > now]))


@dataclass
class Customer:
    id: str
    tenant_id: str
    email: str | None = None
    phone: str | None = None
    password_hash: str | None = None
    google_sub: str | None = None


@dataclass
class ServiceClient:
    id: str
    tenant_id: str
    secret_hash: str
    scopes: list[str]
    active: bool = True


class Store:
    def __init__(self):
        self.tenants: dict[str, Tenant] = {}
        self.locations: dict[str, Location] = {}
        self.staff: dict[str, StaffUser] = {}
        self.customers: dict[str, Customer] = {}
        self.clients: dict[str, ServiceClient] = {}

    def staff_by_email(self, email: str) -> StaffUser | None:
        return next((u for u in self.staff.values() if u.email == email), None)

    def customer_by(self, tenant_id: str, *, email: str | None = None, phone: str | None = None) -> Customer | None:
        for c in self.customers.values():
            if c.tenant_id == tenant_id and ((email and c.email == email) or (phone and c.phone == phone)):
                return c
        return None
