# AIFirstMart Connector and Identity Framework

Reference implementation of the *AIFirstMart Connector and Identity Framework* specification:
multi-tenant sign-in and permissions, plus connectors that let each business customer (retailer or brand)
sell through its mobile app, WhatsApp, Facebook/Instagram, Amazon, Flipkart, ONDC and other marketplaces.

## Run

```bash
pip install -r requirements.txt
export AFM_JWT_SECRET="$(python -c 'import secrets;print(secrets.token_urlsafe(48))')"
export AFM_VAULT_MASTER_KEY="$(python -c 'from cryptography.fernet import Fernet;print(Fernet.generate_key().decode())')"
export AFM_PLATFORM_ADMIN_EMAIL=you@yourcompany.com AFM_PLATFORM_ADMIN_PASSWORD='a-long-password'
export AFM_DB_PATH=./afm.sqlite                       # catalogue saved in SQLite (omit to keep it in memory)
uvicorn aifirstmart_connect.api:app --reload      # API docs at http://127.0.0.1:8000/docs
pytest -q                                          # 89 tests
```

## Structure

| Module | Contents |
|---|---|
| `identity.py` | Phone and email normalisation, password hashing, one-time codes, access tokens, rotating refresh tokens |
| `authz.py` | Six persona categories, 15 roles, permission catalogue, conflicting role pairs, and the policy engine (tenant, store, limit, ownership, separation of duties) |
| `tenancy.py` | Tenants, locations, staff, customers, service clients |
| `catalog.py` | Products and stock; channels only see `on hand − buffer − reserved` |
| `orders.py` | Order intake from any channel, de-duplication, reservation |
| `vault.py` | Per-tenant encrypted channel credentials |
| `connectors/` | Common interface, sandbox marketplace, and the mobile app, WhatsApp, Facebook, Amazon, Flipkart, ONDC and generic connectors |
| `api.py` | FastAPI routes |

## Who signs in how

| Identity | Endpoint |
|---|---|
| Platform administrator, business staff | `POST /v1/auth/staff/login` (email + password) |
| Customer on web or apps (email) | `POST /v1/auth/customers/email/register`, `/login` |
| Customer on the mobile app (phone) | `POST /v1/auth/otp/request`, `/verify` |
| Customer on WhatsApp | Identified from Meta's signed webhook; linked to the same phone-based account |
| Customer or staff with a Google account | `POST /v1/auth/google/customer`, `POST /v1/auth/google/staff` (set `AFM_GOOGLE_CLIENT_IDS`; staff must already be invited) |
| Connector or partner app | `POST /v1/auth/clients/token` (client credentials, scoped) |

## Saving catalogue changes

`POST /v1/tenants/{tenant}/catalog/changes` saves the catalogue page's unsaved changes together:
`{"prices": {"8901008": 17200}, "images": [{"sku": "8901008", "role": "Front", "content_type": "image/png", "data_base64": "..."}]}`.
Everything is checked first (prices above 0, known products, real JPG/PNG/WebP images of at least 500 × 500 px and at most 5 MB,
no more than 6 images per product) and then written in one database transaction, so nothing is half-saved.
Prices need `pricing:write`; images need `catalog:write`.

## Persona categories

| Category | Roles |
|---|---|
| Leadership and governance | `tenant_owner` |
| Store front line | `cashier`, `store_manager` |
| Fulfilment and supply chain | `oms_supervisor`, `warehouse_supervisor`, `logistics_supervisor`, `inventory_manager`, `procurement` |
| Merchandising | `catalog_manager`, `pricing_manager` |
| Back office and customer care | `finance`, `payment_approver`, `customer_support` |
| Platform control | `tenant_admin` |

`GET /v1/authz/roles` lists every role with its category, scope, permissions and limits.
Creating a user refuses conflicting roles (for example Procurement with Finance), store-level roles without a store,
and limits above the role's ceiling.

## Access governance

- Multi-factor sign-in for the owner, administrator, store managers, Finance and Payment approvers (`POST /v1/auth/staff/mfa`).
- Accounts with no sign-in for 90 days are disabled at the next attempt.
- Temporary roles for up to 30 days with a reason (`POST /v1/tenants/{tenant}/users/{user}/temporary-roles`); they end automatically.
- Nobody can change their own roles or access (`PUT /v1/tenants/{tenant}/users/{user}/roles`).
- The owner needs a second approver for refunds above ₹25,000.
- The full audit trail is for the owner and administrator; other roles read their own area.

## Sandbox and live

Every connection starts in **sandbox** mode, which talks to the in-memory `SandboxHub` instead of a marketplace.
Switching a connection to **live** uses the tenant's own credentials from the vault.

### Before switching any connection to live
1. Obtain access: Amazon Selling Partner developer registration and the seller's Login with Amazon consent;
   Flipkart seller API application; Meta app with catalogue and WhatsApp permissions; ONDC seller app API key.
2. Confirm every endpoint path and API version in `config.py` against the channel's **current official documentation**.
   The live adapters follow each channel's published request shapes, and tests check them against a mock server,
   but they have **not** been run against the real marketplaces.
3. Run a test publish, stock push and order on the channel's sandbox or test account.

### Known gaps to close for production
- Replace the in-memory stores with a database, and the vault's local master key with a managed key service.
- Switch tokens to asymmetric signing (RS256/ES256) with key rotation when several services verify them.
- Add an SMS provider with TRAI DLT-registered templates as the `OtpService` sender.
- Amazon order polling returns order headers; add the order-items call to fill order lines.
- Flipkart and Amazon status updates and Flipkart order polling run in sandbox only; add live calls once their exact current endpoints are confirmed.
- Add the cart, checkout and payment-intent APIs from the Channel Integration document for the mobile app and WhatsApp checkout.
