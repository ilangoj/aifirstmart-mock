"""Channel connectors. Live request shapes follow each channel's published API; endpoint paths and
versions come from configuration and must be confirmed against current documentation before go-live."""
from __future__ import annotations
import base64, json, time
from datetime import datetime, timezone
from ..catalog import Product
from .base import Connector, ConnectorError, hmac_sha256_hex, verify_signature


# ---------------------------------------------------------------- Mobile app
class MobileAppConnector(Connector):
    """Catalogue, stock and orders are served by the platform API itself; the connector sends push messages."""
    channel = "mobile_app"
    capabilities = {"messages"}

    def _live_message(self, to, template, params):
        fcm = self.ep["fcm"]
        url = f"{fcm['api_base']}/v1/projects/{self.conn.settings['fcm_project']}/messages:send"
        body = {"message": {"token": to, "data": {"template": template, "params": json.dumps(params)}}}
        r = self._check(self.http.post(url, json=body, headers={"Authorization": f"Bearer {self.creds['fcm_access_token']}"}))
        return {"sent": True, "id": r.json().get("name")}


# ---------------------------------------------------------------- Meta (Facebook, Instagram, WhatsApp)
class _MetaCatalog(Connector):
    def _graph(self, path: str) -> str:
        m = self.ep["meta"]
        return f"{m['graph_base']}/{m['graph_version']}/{path}"

    def _batch(self, requests: list[dict]) -> dict:
        url = self._graph(f"{self.conn.settings['catalog_id']}/items_batch")
        r = self._check(self.http.post(url, json={"item_type": "PRODUCT_ITEM", "requests": requests},
                                       headers={"Authorization": f"Bearer {self.creds['access_token']}"}))
        return r.json()

    def _live_publish(self, products: list[Product]):
        reqs = [{"method": "UPDATE", "data": {"id": p.sku, "title": p.name, "price": f"{p.price_paise / 100:.2f} INR",
                                              "brand": p.brand or "", "gtin": p.gtin or "", "availability": "in stock"}}
                for p in products]
        return {"published": len(products), "response": self._batch(reqs)}

    def _live_inventory(self, levels: list[dict]):
        # One catalogue per business account: publish the total sellable quantity per SKU.
        totals: dict[str, int] = {}
        for l in levels:
            totals[l["sku"]] = totals.get(l["sku"], 0) + max(0, int(l["available"]))
        reqs = [{"method": "UPDATE", "data": {"id": sku, "inventory": q, "availability": "in stock" if q else "out of stock"}}
                for sku, q in totals.items()]
        return {"updated": len(reqs), "response": self._batch(reqs)}


class FacebookConnector(_MetaCatalog):
    channel = "facebook"
    capabilities = {"catalog", "inventory"}


class WhatsAppConnector(_MetaCatalog):
    channel = "whatsapp"
    capabilities = {"catalog", "inventory", "orders_webhook", "messages"}

    def verify_subscription(self, mode: str, token: str, challenge: str) -> str:
        if mode == "subscribe" and token and token == self.creds.get("verify_token"):
            return challenge
        raise ConnectorError("webhook verification failed")

    def handle_webhook(self, headers: dict, body: bytes) -> list[dict]:
        sig = {k.lower(): v for k, v in headers.items()}.get("x-hub-signature-256", "")
        expected = "sha256=" + hmac_sha256_hex(self.creds["app_secret"], body)
        if not verify_signature(expected, sig):
            raise ConnectorError("invalid webhook signature")
        events = []
        payload = json.loads(body)
        for entry in payload.get("entry", []):
            for change in entry.get("changes", []):
                for msg in change.get("value", {}).get("messages", []):
                    if msg.get("type") != "order":
                        continue
                    items = msg["order"].get("product_items", [])
                    events.append({"channel_order_id": msg["id"], "customer_ref": msg.get("from"),
                                   "lines": [{"sku": i["product_retailer_id"], "qty": int(i["quantity"]),
                                              "price_paise": round(float(i.get("item_price", 0)) * 100)} for i in items]})
        return events

    def _live_message(self, to, template, params):
        url = self._graph(f"{self.conn.settings['phone_number_id']}/messages")
        body = {"messaging_product": "whatsapp", "to": to.lstrip("+"), "type": "template",
                "template": {"name": template, "language": {"code": self.conn.settings.get("language", "en")},
                             "components": [{"type": "body", "parameters": [{"type": "text", "text": p} for p in params]}] if params else []}}
        r = self._check(self.http.post(url, json=body, headers={"Authorization": f"Bearer {self.creds['access_token']}"}))
        return {"sent": True, "response": r.json()}


# ---------------------------------------------------------------- Amazon (Selling Partner API)
class AmazonConnector(Connector):
    channel = "amazon"
    capabilities = {"catalog", "inventory", "orders_poll", "status"}
    _token: tuple[str, float] | None = None

    def _access_token(self) -> str:
        if self._token and self._token[1] > time.time() + 60:
            return self._token[0]
        r = self._check(self.http.post(self.ep["amazon"]["token_url"], data={
            "grant_type": "refresh_token", "refresh_token": self.creds["refresh_token"],
            "client_id": self.creds["client_id"], "client_secret": self.creds["client_secret"]}))
        j = r.json()
        self._token = (j["access_token"], time.time() + int(j.get("expires_in", 3600)))
        return self._token[0]

    def _headers(self) -> dict:
        return {"x-amz-access-token": self._access_token(), "content-type": "application/json"}

    def _listing_url(self, sku: str) -> str:
        a = self.ep["amazon"]
        return a["api_base"] + a["listings_path"].format(seller_id=self.conn.settings["seller_id"], sku=sku)

    def _patch(self, sku: str, patches: list[dict]) -> dict:
        r = self._check(self.http.patch(self._listing_url(sku), params={"marketplaceIds": self.ep["amazon"]["marketplace_id"]},
                                        headers=self._headers(),
                                        json={"productType": self.conn.settings.get("product_type", "PRODUCT"), "patches": patches}))
        return r.json()

    def _live_publish(self, products: list[Product]):
        mp = self.ep["amazon"]["marketplace_id"]
        results = [self._patch(p.sku, [{"op": "replace", "path": "/attributes/purchasable_offer", "value": [{
            "marketplace_id": mp, "currency": "INR", "our_price": [{"schedule": [{"value_with_tax": p.price_paise / 100}]}]}]}])
            for p in products]
        return {"published": len(results)}

    def _live_inventory(self, levels: list[dict]):
        totals: dict[str, int] = {}
        for l in levels:
            totals[l["sku"]] = totals.get(l["sku"], 0) + max(0, int(l["available"]))
        for sku, q in totals.items():
            self._patch(sku, [{"op": "replace", "path": "/attributes/fulfillment_availability",
                               "value": [{"fulfillment_channel_code": "DEFAULT", "quantity": q}]}])
        return {"updated": len(totals)}

    def _live_fetch_orders(self, since):
        a = self.ep["amazon"]
        after = datetime.fromtimestamp(since or time.time() - 86400, tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        r = self._check(self.http.get(a["api_base"] + a["orders_path"], headers=self._headers(),
                                      params={"MarketplaceIds": a["marketplace_id"], "CreatedAfter": after}))
        # Order lines need a separate order-items call per order; return headers for the poller to expand.
        return [{"channel_order_id": o["AmazonOrderId"], "status": o.get("OrderStatus"), "lines": []}
                for o in r.json().get("payload", {}).get("Orders", [])]


# ---------------------------------------------------------------- Flipkart (Seller API v3)
class FlipkartConnector(Connector):
    channel = "flipkart"
    capabilities = {"catalog", "inventory", "orders_poll", "status"}
    _token: tuple[str, float] | None = None

    def _access_token(self) -> str:
        if self._token and self._token[1] > time.time() + 60:
            return self._token[0]
        basic = base64.b64encode(f"{self.creds['app_id']}:{self.creds['app_secret']}".encode()).decode()
        r = self._check(self.http.get(self.ep["flipkart"]["token_url"], params={"grant_type": "client_credentials", "scope": "Seller_Api"},
                                      headers={"Authorization": f"Basic {basic}"}))
        j = r.json()
        self._token = (j["access_token"], time.time() + int(j.get("expires_in", 3600)))
        return self._token[0]

    def _live_inventory(self, levels: list[dict]):
        """Stock per Flipkart location. Flipkart has no order-acceptance step, so only buffered availability is sent."""
        loc_map = self.conn.settings.get("location_map", {})            # our location id -> Flipkart location id
        fsn = self.conn.settings.get("product_map", {})                 # sku -> Flipkart product id
        body: dict = {}
        for l in levels:
            if l["location_id"] not in loc_map:
                continue
            item = body.setdefault(l["sku"], {"product_id": fsn.get(l["sku"], l["sku"]), "locations": []})
            item["locations"].append({"id": loc_map[l["location_id"]], "inventory": max(0, int(l["available"]))})
        f = self.ep["flipkart"]
        r = self._check(self.http.post(f["api_base"] + f["inventory_path"], json=body,
                                       headers={"Authorization": f"Bearer {self._access_token()}"}))
        return {"updated": len(body), "response": r.json()}


# ---------------------------------------------------------------- ONDC through a seller app, and other marketplaces
class GenericMarketplaceConnector(Connector):
    """Configurable REST connector: endpoints, API key header and webhook secret come from connection settings."""
    channel = "generic"
    capabilities = {"catalog", "inventory", "orders_webhook", "status"}

    def _url(self, key: str) -> str:
        url = self.conn.settings.get("endpoints", {}).get(key)
        if not url:
            raise ConnectorError(f"{self.channel}: endpoint '{key}' is not configured")
        return url

    def _hdr(self) -> dict:
        return {self.conn.settings.get("api_key_header", "X-API-Key"): self.creds["api_key"]}

    def _live_publish(self, products):
        body = [{"sku": p.sku, "name": p.name, "price": p.price_paise / 100, "gtin": p.gtin} for p in products]
        return {"published": len(products), "response": self._check(self.http.post(self._url("catalog"), json=body, headers=self._hdr())).json()}

    def _live_inventory(self, levels):
        return {"updated": len(levels), "response": self._check(self.http.post(self._url("inventory"), json=levels, headers=self._hdr())).json()}

    def _live_status(self, oid, status):
        return self._check(self.http.post(self._url("status"), json={"order_id": oid, "status": status}, headers=self._hdr())).json()

    def handle_webhook(self, headers: dict, body: bytes) -> list[dict]:
        sig = {k.lower(): v for k, v in headers.items()}.get("x-signature", "")
        if not verify_signature(hmac_sha256_hex(self.creds["webhook_secret"], body), sig):
            raise ConnectorError("invalid webhook signature")
        data = json.loads(body)
        orders = data if isinstance(data, list) else [data]
        return [{"channel_order_id": o["order_id"], "customer_ref": o.get("customer"),
                 "lines": [{"sku": l["sku"], "qty": int(l["qty"]), "price_paise": round(float(l.get("price", 0)) * 100)} for l in o["lines"]]}
                for o in orders]


class OndcSellerAppConnector(GenericMarketplaceConnector):
    channel = "ondc"
