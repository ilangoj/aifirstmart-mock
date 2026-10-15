from __future__ import annotations
import httpx
from ..vault import Vault
from .base import Connection, Connector, ConnectorError, SandboxHub
from .channels import (AmazonConnector, FacebookConnector, FlipkartConnector, GenericMarketplaceConnector,
                       MobileAppConnector, OndcSellerAppConnector, WhatsAppConnector)

CONNECTOR_TYPES: dict[str, type[Connector]] = {c.channel: c for c in (
    MobileAppConnector, WhatsAppConnector, FacebookConnector, AmazonConnector, FlipkartConnector,
    OndcSellerAppConnector, GenericMarketplaceConnector)}


def build_connector(conn: Connection, vault: Vault, hub: SandboxHub, http: httpx.Client | None = None) -> Connector:
    if conn.channel not in CONNECTOR_TYPES:
        raise ConnectorError(f"unknown channel {conn.channel}")
    if conn.status in ("suspended", "retired"):
        raise ConnectorError(f"connection {conn.id} is {conn.status}")
    creds = vault.get_for_connector(conn.tenant_id, conn.credentials_ref) if conn.credentials_ref else {}
    return CONNECTOR_TYPES[conn.channel](conn, creds, hub, http)
