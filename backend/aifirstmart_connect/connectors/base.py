"""Connector interface, connection record and the simulated marketplace used in sandbox mode."""
from __future__ import annotations
import hashlib, hmac, time
from abc import ABC
from dataclasses import dataclass, field
import httpx
from ..catalog import Product
from ..config import settings


class ConnectorError(Exception):
    pass


@dataclass
class Connection:
    id: str
    tenant_id: str
    channel: str
    mode: str = "sandbox"                 # sandbox | live
    status: str = "draft"                 # draft | sandbox | certified | live | suspended | retired
    credentials_ref: str | None = None
    settings: dict = field(default_factory=dict)   # seller_id, catalog_id, phone_number_id, location_map, ...


class SandboxHub:
    """In-memory stand-in for every marketplace: records what connectors send, and lets tests inject orders."""

    def __init__(self):
        self.listings: dict[str, dict[str, dict]] = {}          # connection -> sku -> listing
        self.inventory: dict[str, dict[tuple, int]] = {}        # connection -> (sku, location) -> qty
        self.pending_orders: dict[str, list[dict]] = {}
        self.statuses: dict[str, dict[str, str]] = {}
        self.messages: dict[str, list[dict]] = {}

    def add_order(self, connection_id: str, order: dict) -> None:
        self.pending_orders.setdefault(connection_id, []).append(order)


class Connector(ABC):
    channel: str = ""
    capabilities: set[str] = set()       # catalog, inventory, orders_poll, orders_webhook, status, messages

    def __init__(self, conn: Connection, credentials: dict, hub: SandboxHub, http: httpx.Client | None = None):
        self.conn, self.creds, self.hub = conn, credentials or {}, hub
        self.http = http or httpx.Client(timeout=20)
        self.ep = settings.endpoints

    @property
    def live(self) -> bool:
        return self.conn.mode == "live"

    def _require(self, cap: str) -> None:
        if cap not in self.capabilities:
            raise ConnectorError(f"{self.channel} does not support {cap}")

    def _check(self, r: httpx.Response) -> httpx.Response:
        if r.status_code >= 400:
            raise ConnectorError(f"{self.channel} returned {r.status_code}: {r.text[:300]}")
        return r

    # ---- the common interface (sandbox behaviour by default; live adapters override _live_* methods)
    def publish_catalog(self, products: list[Product]) -> dict:
        self._require("catalog")
        if self.live:
            return self._live_publish(products)
        book = self.hub.listings.setdefault(self.conn.id, {})
        for p in products:
            book[p.sku] = {"title": p.name, "price_paise": p.price_paise, "gtin": p.gtin}
        return {"published": len(products), "mode": "sandbox"}

    def push_inventory(self, levels: list[dict]) -> dict:
        self._require("inventory")
        if self.live:
            return self._live_inventory(levels)
        inv = self.hub.inventory.setdefault(self.conn.id, {})
        for l in levels:
            inv[(l["sku"], l["location_id"])] = max(0, int(l["available"]))
        return {"updated": len(levels), "mode": "sandbox"}

    def fetch_orders(self, since: float | None = None) -> list[dict]:
        self._require("orders_poll")
        if self.live:
            return self._live_fetch_orders(since)
        return self.hub.pending_orders.pop(self.conn.id, [])

    def handle_webhook(self, headers: dict, body: bytes) -> list[dict]:
        self._require("orders_webhook")
        raise NotImplementedError

    def update_order_status(self, channel_order_id: str, status: str) -> dict:
        self._require("status")
        if self.live:
            return self._live_status(channel_order_id, status)
        self.hub.statuses.setdefault(self.conn.id, {})[channel_order_id] = status
        return {"order": channel_order_id, "status": status, "mode": "sandbox"}

    def send_message(self, to: str, template: str, params: list[str] | None = None) -> dict:
        self._require("messages")
        if self.live:
            return self._live_message(to, template, params or [])
        self.hub.messages.setdefault(self.conn.id, []).append({"to": to, "template": template, "params": params or []})
        return {"sent": True, "mode": "sandbox"}

    # live hooks
    def _live_publish(self, products): raise ConnectorError(f"{self.channel}: live catalogue not available")
    def _live_inventory(self, levels): raise ConnectorError(f"{self.channel}: live inventory not available")
    def _live_fetch_orders(self, since): raise ConnectorError(f"{self.channel}: live order polling not available")
    def _live_status(self, oid, status): raise ConnectorError(f"{self.channel}: live status not available")
    def _live_message(self, to, t, p): raise ConnectorError(f"{self.channel}: live messaging not available")


def hmac_sha256_hex(secret: str, body: bytes) -> str:
    return hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()


def verify_signature(expected_hex: str, provided: str | None) -> bool:
    return bool(provided) and hmac.compare_digest(expected_hex, provided)


def now() -> float:
    return time.time()
