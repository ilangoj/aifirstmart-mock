"""Order intake from any channel: de-duplication by channel order id and stock reservation."""
from __future__ import annotations
import time
from dataclasses import dataclass, field
from .catalog import Catalog
from .tenancy import new_id


@dataclass
class OrderLine:
    sku: str
    qty: int
    price_paise: int
    location_id: str | None = None


@dataclass
class Order:
    id: str
    tenant_id: str
    channel: str
    connection_id: str
    channel_order_id: str
    lines: list[OrderLine]
    customer_ref: str | None = None
    status: str = "received"            # received | partially_unavailable | confirmed | shipped | cancelled
    created_at: float = field(default_factory=time.time)


class OrderService:
    def __init__(self, catalog: Catalog):
        self.catalog = catalog
        self.orders: dict[str, Order] = {}
        self._by_channel: dict[tuple[str, str], str] = {}
        self.events: list[dict] = []

    def ingest(self, tenant_id: str, channel: str, connection_id: str, channel_order_id: str,
               lines: list[dict], customer_ref: str | None = None) -> tuple[Order, bool]:
        """Returns (order, created). A repeated notification returns the existing order unchanged."""
        key = (connection_id, channel_order_id)
        if key in self._by_channel:
            return self.orders[self._by_channel[key]], False
        order_lines, short = [], False
        for l in lines:
            loc = self.catalog.reserve(tenant_id, l["sku"], int(l["qty"]))
            short |= loc is None
            order_lines.append(OrderLine(l["sku"], int(l["qty"]), int(l.get("price_paise", 0)), loc))
        o = Order(new_id("ord"), tenant_id, channel, connection_id, channel_order_id, order_lines, customer_ref,
                  "partially_unavailable" if short else "received")
        self.orders[o.id] = o
        self._by_channel[key] = o.id
        self.events.append({"type": "order.received", "order_id": o.id, "tenant_id": tenant_id, "channel": channel})
        return o, True

    def of_tenant(self, tenant_id: str) -> list[Order]:
        return [o for o in self.orders.values() if o.tenant_id == tenant_id]
