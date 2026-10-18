-- 0001 Tenancy and identity: who the business customers are, where they operate, and who signs in.
-- Conventions (also in pipeline/db.py):
--   * ids are text with a type prefix (ten_, loc_, usr_, cus_ ...), the same ids the backend API returns
--   * every row owned by a tenant carries tenant_id; child tables reference (tenant_id, id) so a row can never
--     point at another tenant's data
--   * money is bigint paise; times are timestamptz; status columns are text with a CHECK list
--   * no secrets in plain text: passwords and client secrets are hashes, channel credentials live in the vault

CREATE TABLE tenants (
    id              text PRIMARY KEY CHECK (id ~ '^ten_[a-z0-9]+$'),
    name            text NOT NULL,
    type            text NOT NULL CHECK (type IN ('retailer', 'brand')),
    status          text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
    gstin           text CHECK (gstin ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]$'),
    pan             text CHECK (pan ~ '^[A-Z]{5}[0-9]{4}[A-Z]$'),
    fssai_licence   text CHECK (fssai_licence ~ '^[0-9]{14}$'),
    legal_address   jsonb NOT NULL DEFAULT '{}'::jsonb,
    synthetic       boolean NOT NULL DEFAULT false,          -- true for generated demo data (afm.py db seed)
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE locations (
    id              text PRIMARY KEY CHECK (id ~ '^loc_[a-z0-9]+$'),
    tenant_id       text NOT NULL REFERENCES tenants (id),
    name            text NOT NULL,
    kind            text NOT NULL CHECK (kind IN ('store', 'warehouse', 'dark_store')),
    code            text NOT NULL,                           -- short code shown on screens, e.g. ULP-01
    address         jsonb NOT NULL DEFAULT '{}'::jsonb,       -- line1, town, district, state, pincode
    pincode         text CHECK (pincode ~ '^[1-9][0-9]{5}$'),
    latitude        numeric(9, 6),
    longitude       numeric(9, 6),
    active          boolean NOT NULL DEFAULT true,
    created_at      timestamptz NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, id),
    UNIQUE (tenant_id, code)
);

-- Staff of a tenant, and the platform administrator (tenant_id NULL).
CREATE TABLE staff_users (
    id              text PRIMARY KEY CHECK (id ~ '^usr_[a-z0-9]+$'),
    tenant_id       text REFERENCES tenants (id),
    email           text NOT NULL,
    display_name    text NOT NULL,
    password_hash   text,                                    -- pbkdf2_sha256$...; NULL for Google-only accounts
    google_sub      text UNIQUE,
    mfa_enabled     boolean NOT NULL DEFAULT false,
    active          boolean NOT NULL DEFAULT true,
    failed_logins   integer NOT NULL DEFAULT 0 CHECK (failed_logins >= 0),
    last_login_at   timestamptz,
    created_at      timestamptz NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, id)
);
CREATE UNIQUE INDEX staff_users_email_uq ON staff_users (lower(email));

-- The 15 roles and their permissions are defined in code (backend authz.py); the database stores assignments.
CREATE TABLE staff_role_assignments (
    tenant_id       text NOT NULL,
    user_id         text NOT NULL,
    role            text NOT NULL CHECK (role IN (
                        'tenant_owner', 'cashier', 'store_manager', 'oms_supervisor', 'warehouse_supervisor',
                        'logistics_supervisor', 'inventory_manager', 'procurement', 'catalog_manager',
                        'pricing_manager', 'finance', 'payment_approver', 'customer_support', 'tenant_admin')),
    valid_until     timestamptz,                             -- set for temporary roles (at most 30 days)
    reason          text,                                    -- required for temporary roles
    granted_by      text REFERENCES staff_users (id),
    granted_at      timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, role),
    FOREIGN KEY (tenant_id, user_id) REFERENCES staff_users (tenant_id, id),
    CHECK (valid_until IS NULL OR reason IS NOT NULL)
);

-- Store-level roles (cashier, store manager) are limited to these locations.
CREATE TABLE staff_store_access (
    tenant_id       text NOT NULL,
    user_id         text NOT NULL,
    location_id     text NOT NULL,
    PRIMARY KEY (user_id, location_id),
    FOREIGN KEY (tenant_id, user_id) REFERENCES staff_users (tenant_id, id),
    FOREIGN KEY (tenant_id, location_id) REFERENCES locations (tenant_id, id)
);

-- Per-user limits below the role's ceiling, e.g. discount_pct = 5, refund_paise = 500000.
CREATE TABLE staff_limits (
    tenant_id       text NOT NULL,
    user_id         text NOT NULL,
    limit_name      text NOT NULL CHECK (limit_name IN ('discount_pct', 'refund_paise', 'price_change_pct')),
    value           bigint NOT NULL CHECK (value >= 0),
    PRIMARY KEY (user_id, limit_name),
    FOREIGN KEY (tenant_id, user_id) REFERENCES staff_users (tenant_id, id)
);

CREATE TABLE customers (
    id              text PRIMARY KEY CHECK (id ~ '^cus_[a-z0-9]+$'),
    tenant_id       text NOT NULL REFERENCES tenants (id),
    display_name    text NOT NULL,
    email           text,
    phone_e164      text CHECK (phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
    password_hash   text,
    google_sub      text,
    preferred_lang  text NOT NULL DEFAULT 'en' CHECK (preferred_lang IN ('en', 'ta')),
    whatsapp_opt_in boolean NOT NULL DEFAULT false,
    created_at      timestamptz NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, id),
    CHECK (email IS NOT NULL OR phone_e164 IS NOT NULL)
);
CREATE UNIQUE INDEX customers_phone_uq ON customers (tenant_id, phone_e164) WHERE phone_e164 IS NOT NULL;
CREATE UNIQUE INDEX customers_email_uq ON customers (tenant_id, lower(email)) WHERE email IS NOT NULL;

CREATE TABLE customer_addresses (
    id              text PRIMARY KEY CHECK (id ~ '^adr_[a-z0-9]+$'),
    tenant_id       text NOT NULL,
    customer_id     text NOT NULL,
    label           text NOT NULL DEFAULT 'Home',
    line1           text NOT NULL,
    town            text NOT NULL,
    district        text NOT NULL,
    state           text NOT NULL DEFAULT 'Tamil Nadu',
    pincode         text NOT NULL CHECK (pincode ~ '^[1-9][0-9]{5}$'),
    is_default      boolean NOT NULL DEFAULT false,
    UNIQUE (tenant_id, id),
    FOREIGN KEY (tenant_id, customer_id) REFERENCES customers (tenant_id, id)
);
CREATE UNIQUE INDEX customer_addresses_one_default ON customer_addresses (customer_id) WHERE is_default;

-- Partner apps and connectors that sign in with client credentials.
CREATE TABLE service_clients (
    id              text PRIMARY KEY CHECK (id ~ '^cli_[a-z0-9]+$'),
    tenant_id       text NOT NULL REFERENCES tenants (id),
    name            text NOT NULL,
    secret_hash     text NOT NULL,
    scopes          text[] NOT NULL DEFAULT '{}',
    active          boolean NOT NULL DEFAULT true,
    created_at      timestamptz NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, id)
);

-- Rotating refresh tokens: only the hash is kept; reuse of a used token revokes its whole family.
CREATE TABLE refresh_tokens (
    token_hash      text PRIMARY KEY,
    family_id       text NOT NULL,
    subject_kind    text NOT NULL CHECK (subject_kind IN ('staff', 'customer', 'service', 'platform')),
    subject_id      text NOT NULL,
    tenant_id       text REFERENCES tenants (id),
    expires_at      timestamptz NOT NULL,
    used_at         timestamptz,
    revoked_at      timestamptz,
    created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX refresh_tokens_family ON refresh_tokens (family_id);

-- Every change anyone makes, for the owner and administrator (append-only; the app role cannot update or delete).
CREATE TABLE audit_log (
    id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    tenant_id       text REFERENCES tenants (id),
    at              timestamptz NOT NULL DEFAULT now(),
    actor_kind      text NOT NULL CHECK (actor_kind IN ('staff', 'customer', 'service', 'platform', 'system')),
    actor_id        text,
    actor_label     text NOT NULL,                           -- name as shown in the audit screen
    action          text NOT NULL,                           -- e.g. price.change, refund.approve, connection.go_live
    entity_type     text NOT NULL,
    entity_id       text,
    location_id     text,
    detail          jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX audit_log_tenant_at ON audit_log (tenant_id, at DESC);
CREATE INDEX audit_log_entity ON audit_log (tenant_id, entity_type, entity_id);
