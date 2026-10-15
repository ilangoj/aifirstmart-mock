import base64, json
import httpx, pytest
from aifirstmart_connect.catalog import Catalog, Product
from aifirstmart_connect.connectors import Connection, ConnectorError, SandboxHub, build_connector
from aifirstmart_connect.connectors.base import hmac_sha256_hex
from aifirstmart_connect.vault import Vault

MILK = Product("AAVIN-500", "ten_a", "Aavin Milk 500ml", 2600, "8901002")


def make(channel, mode="sandbox", creds=None, settings=None, http=None, status=None):
    vault, hub = Vault(), SandboxHub()
    ref = vault.put("ten_a", creds) if creds else None
    conn = Connection("con_1", "ten_a", channel, mode, status or ("live" if mode == "live" else "sandbox"), ref, settings or {})
    return build_connector(conn, vault, hub, http), hub


def test_availability_never_negative_and_respects_buffer_and_reservations():
    cat = Catalog()
    lvl = cat.set_stock("ten_a", "loc_ulu", "AAVIN-500", on_hand=10, buffer=3)
    assert lvl.available == 7
    assert cat.reserve("ten_a", "AAVIN-500", 5) == "loc_ulu" and lvl.available == 2
    assert cat.reserve("ten_a", "AAVIN-500", 3) is None             # cannot oversell
    cat.set_stock("ten_a", "loc_ulu", "AAVIN-500", on_hand=1, buffer=3)
    assert lvl.available == 0


@pytest.mark.parametrize("channel", ["whatsapp", "facebook", "amazon", "flipkart", "ondc", "generic"])
def test_sandbox_catalogue_and_inventory(channel):
    c, hub = make(channel)
    assert c.publish_catalog([MILK])["published"] == 1
    assert c.push_inventory([{"sku": "AAVIN-500", "location_id": "loc_ulu", "available": -4}])["updated"] == 1
    assert hub.listings["con_1"]["AAVIN-500"]["price_paise"] == 2600
    assert hub.inventory["con_1"][("AAVIN-500", "loc_ulu")] == 0     # negative never published


def test_capabilities_are_enforced():
    c, _ = make("facebook")
    with pytest.raises(ConnectorError, match="does not support"):
        c.fetch_orders()
    m, hub = make("mobile_app")
    m.send_message("device-token", "order_shipped", ["ord_1"])
    assert hub.messages["con_1"][0]["template"] == "order_shipped"


def test_suspended_connection_cannot_be_used():
    with pytest.raises(ConnectorError, match="suspended"):
        make("amazon", status="suspended")


def test_sandbox_order_polling_and_status():
    c, hub = make("amazon")
    hub.add_order("con_1", {"channel_order_id": "403-1", "lines": [{"sku": "AAVIN-500", "qty": 2}]})
    assert c.fetch_orders()[0]["channel_order_id"] == "403-1" and c.fetch_orders() == []
    c.update_order_status("403-1", "shipped")
    assert hub.statuses["con_1"]["403-1"] == "shipped"


def _wa_body():
    return json.dumps({"entry": [{"changes": [{"value": {"messages": [{"id": "wamid.1", "from": "919876543210", "type": "order",
             "order": {"product_items": [{"product_retailer_id": "AAVIN-500", "quantity": "2", "item_price": 26, "currency": "INR"}]}}]}}]}]}).encode()


def test_whatsapp_webhook_signature_and_order_parsing():
    c, _ = make("whatsapp", creds={"app_secret": "s3cret", "verify_token": "vt"})
    body = _wa_body()
    events = c.handle_webhook({"X-Hub-Signature-256": "sha256=" + hmac_sha256_hex("s3cret", body)}, body)
    assert events == [{"channel_order_id": "wamid.1", "customer_ref": "919876543210",
                       "lines": [{"sku": "AAVIN-500", "qty": 2, "price_paise": 2600}]}]
    with pytest.raises(ConnectorError, match="signature"):
        c.handle_webhook({"X-Hub-Signature-256": "sha256=deadbeef"}, body)
    assert c.verify_subscription("subscribe", "vt", "12345") == "12345"
    with pytest.raises(ConnectorError):
        c.verify_subscription("subscribe", "wrong", "12345")


def test_generic_webhook_signature():
    c, _ = make("ondc", creds={"api_key": "k", "webhook_secret": "w"})
    body = json.dumps({"order_id": "ONDC-9", "lines": [{"sku": "AAVIN-500", "qty": 1, "price": 26}]}).encode()
    assert c.handle_webhook({"X-Signature": hmac_sha256_hex("w", body)}, body)[0]["channel_order_id"] == "ONDC-9"
    with pytest.raises(ConnectorError):
        c.handle_webhook({"X-Signature": "bad"}, body)


# ---- live request formats, checked against a mock server (no real marketplace is called)
def recorder():
    calls = []
    def handler(req: httpx.Request):
        calls.append(req)
        if "auth/o2/token" in str(req.url) or "oauth-service" in str(req.url):
            return httpx.Response(200, json={"access_token": "tok-123", "expires_in": 3600})
        return httpx.Response(200, json={"ok": True, "payload": {"Orders": [{"AmazonOrderId": "403-7", "OrderStatus": "Unshipped"}]}})
    return calls, httpx.Client(transport=httpx.MockTransport(handler))


def test_amazon_live_requests():
    calls, http = recorder()
    c, _ = make("amazon", "live", {"refresh_token": "r", "client_id": "id", "client_secret": "sec"}, {"seller_id": "A1SELLER"}, http)
    c.push_inventory([{"sku": "AAVIN-500", "location_id": "loc_ulu", "available": 5}, {"sku": "AAVIN-500", "location_id": "loc_kal", "available": 3}])
    token_req, patch_req = calls[0], calls[1]
    assert b"grant_type=refresh_token" in token_req.content
    assert patch_req.method == "PATCH" and "/listings/2021-08-01/items/A1SELLER/AAVIN-500" in str(patch_req.url)
    assert patch_req.headers["x-amz-access-token"] == "tok-123"
    body = json.loads(patch_req.content)
    assert body["patches"][0]["value"][0]["quantity"] == 8              # summed across locations
    assert c.fetch_orders()[0]["channel_order_id"] == "403-7"
    assert len([r for r in calls if "auth/o2/token" in str(r.url)]) == 1  # token cached


def test_flipkart_live_inventory_per_location():
    calls, http = recorder()
    c, _ = make("flipkart", "live", {"app_id": "app", "app_secret": "sec"},
                {"location_map": {"loc_ulu": "LOC-FK-1"}, "product_map": {"AAVIN-500": "FSN123"}}, http)
    c.push_inventory([{"sku": "AAVIN-500", "location_id": "loc_ulu", "available": 4},
                      {"sku": "AAVIN-500", "location_id": "loc_unmapped", "available": 9}])
    tok, inv = calls
    assert tok.headers["authorization"] == "Basic " + base64.b64encode(b"app:sec").decode()
    assert json.loads(inv.content) == {"AAVIN-500": {"product_id": "FSN123", "locations": [{"id": "LOC-FK-1", "inventory": 4}]}}


def test_meta_live_catalogue_and_whatsapp_message():
    calls, http = recorder()
    c, _ = make("whatsapp", "live", {"access_token": "EAAG", "app_secret": "s"}, {"catalog_id": "CAT1", "phone_number_id": "PN1"}, http)
    c.publish_catalog([MILK])
    c.send_message("+919876543210", "order_received", ["ord_1"])
    batch, msg = calls
    assert str(batch.url).endswith("/CAT1/items_batch") and json.loads(batch.content)["requests"][0]["data"]["price"] == "26.00 INR"
    m = json.loads(msg.content)
    assert str(msg.url).endswith("/PN1/messages") and m["to"] == "919876543210" and m["template"]["name"] == "order_received"


def test_vault_isolation():
    v = Vault()
    ref = v.put("ten_a", {"api_key": "x"})
    assert v.get_for_connector("ten_a", ref) == {"api_key": "x"}
    with pytest.raises(PermissionError):
        v.get_for_connector("ten_b", ref)
    assert "api_key" not in json.dumps(v.describe(ref))
