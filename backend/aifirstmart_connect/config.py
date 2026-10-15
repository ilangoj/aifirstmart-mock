"""Settings. Production values come from environment variables or a secrets service."""
from __future__ import annotations
import os
from dataclasses import dataclass, field


@dataclass
class Settings:
    jwt_secret: str = field(default_factory=lambda: os.environ.get("AFM_JWT_SECRET", "dev-only-change-me-32-bytes-minimum!"))
    jwt_issuer: str = "aifirstmart"
    access_ttl_s: int = 15 * 60
    staff_refresh_ttl_s: int = 8 * 3600
    customer_refresh_ttl_s: int = 30 * 24 * 3600
    otp_ttl_s: int = 5 * 60
    otp_max_attempts: int = 5
    otp_max_requests: int = 3            # per number per window
    otp_window_s: int = 10 * 60
    login_max_failures: int = 5
    password_min_length: int = 10
    vault_master_key: str | None = field(default_factory=lambda: os.environ.get("AFM_VAULT_MASTER_KEY"))
    platform_admin_email: str = field(default_factory=lambda: os.environ.get("AFM_PLATFORM_ADMIN_EMAIL", "admin@aifirstmart.example"))
    platform_admin_password: str = field(default_factory=lambda: os.environ.get("AFM_PLATFORM_ADMIN_PASSWORD", "change-this-password"))
    # Live channel endpoints are configuration, not code: confirm each against the
    # channel's current official documentation before switching a connection to live.
    # Google sign-in: the OAuth client IDs created in Google Cloud Console for the web shop, Android and iOS apps.
    google_client_ids: list = field(default_factory=lambda: [x for x in os.environ.get("AFM_GOOGLE_CLIENT_IDS", "").split(",") if x])
    google_jwks_url: str = "https://www.googleapis.com/oauth2/v3/certs"
    db_path: str | None = field(default_factory=lambda: os.environ.get("AFM_DB_PATH"))   # SQLite file; None keeps data in memory
    endpoints: dict = field(default_factory=lambda: {
        "amazon": {"token_url": "https://api.amazon.com/auth/o2/token",
                   "api_base": "https://sellingpartnerapi-eu.amazon.com",
                   "listings_path": "/listings/2021-08-01/items/{seller_id}/{sku}",
                   "orders_path": "/orders/v0/orders",
                   "marketplace_id": "A21TJRUUN4KGV"},
        "flipkart": {"token_url": "https://api.flipkart.net/oauth-service/oauth/token",
                     "api_base": "https://api.flipkart.net",
                     "inventory_path": "/sellers/listings/v3/update/inventory"},
        "meta": {"graph_base": "https://graph.facebook.com", "graph_version": "v21.0"},
        "fcm": {"api_base": "https://fcm.googleapis.com"},
    })


settings = Settings()
