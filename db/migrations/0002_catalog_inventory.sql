-- 0002 Catalogue and inventory: what is sold, at what price, and how much is where.
-- Channels only ever see available = on_hand - buffer - reserved (view channel_available_stock).

CREATE TABLE categories (
    tenant_id       text NOT NULL REFERENCES tenants (id),
    id              text NOT NULL,                           -- e.g. staples, dairy, oils
    name            text NOT NULL,
    name_ta         text,
    parent_id       text,
    gst_rate_pct    numeric(5, 2) NOT NULL DEFAULT 5 CHECK (gst_rate_pct IN (0, 0.25, 3, 5, 12, 18, 28, 40)),
    PRIMARY KEY (tenant_id, id),
    FOREIGN KEY (tenant_id, parent_id) REFERENCES categories (tenant_id, id)
);

CREATE TABLE products (
    tenant_id       text NOT NULL REFERENCES tenants (id),
    sku             text NOT NULL,
    name            text NOT NULL,
    name_ta         text,
    brand           text,
    category_id     text NOT NULL,
    gtin            text CHECK (gtin ~ '^[0-9]{8}$|^[0-9]{12,14}$'),
    hsn_code        text CHECK (hsn_code ~ '^[0-9]{4,8}$'),
    unit            text NOT NULL DEFAULT 'each' CHECK (unit IN ('each', 'kg', 'g', 'l', 'ml', 'pack')),
    pack_size       text,                                    -- as printed, e.g. 500ml, 5kg
    mrp_paise       bigint NOT NULL CHECK (mrp_paise > 0),
    price_paise     bigint NOT NULL CHECK (price_paise > 0),
    status          text NOT NULL DEFAULT 'active' CHECK (status IN ('draft', 'active', 'discontinued')),
    perishable      boolean NOT NULL DEFAULT false,
    plan_eligible   boolean NOT NULL DEFAULT true,           -- can be in a weekly or monthly plan
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, sku),
    FOREIGN KEY (tenant_id, category_id) REFERENCES categories (tenant_id, id),
    CHECK (price_paise <= mrp_paise)                         -- selling above MRP is not allowed in India
);
CREATE UNIQUE INDEX products_gtin_uq ON products (tenant_id, gtin) WHERE gtin IS NOT NULL;
CREATE INDEX products_category ON products (tenant_id, category_id);

-- Picture files live in object storage; the database keeps the reference and the checks that passed.
CREATE TABLE product_images (
    id              text PRIMARY KEY CHECK (id ~ '^img_[a-z0-9]+$'),
    tenant_id       text NOT NULL,
    sku             text NOT NULL,
    role            text NOT NULL CHECK (role IN ('Front', 'Back', 'Ingredients', 'Nutrition', 'Other')),
    is_main         boolean NOT NULL DEFAULT false,
    storage_key     text NOT NULL,                           -- e.g. tenants/ten_x/products/8901001/img_y.webp
    content_type    text NOT NULL CHECK (content_type IN ('image/jpeg', 'image/png', 'image/webp')),
    width           integer NOT NULL CHECK (width >= 500),
    height          integer NOT NULL CHECK (height >= 500),
    bytes           integer NOT NULL CHECK (bytes > 0 AND bytes <= 5242880),
    created_at      timestamptz NOT NULL DEFAULT now(),
    FOREIGN KEY (tenant_id, sku) REFERENCES products (tenant_id, sku)
);
CREATE UNIQUE INDEX product_images_one_main ON product_images (tenant_id, sku) WHERE is_main;

-- Every price change, with who made it (price tools, promotions, approvals).
CREATE TABLE price_history (
    id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    tenant_id       text NOT NULL,
    sku             text NOT NULL,
    old_paise       bigint NOT NULL CHECK (old_paise > 0),
    new_paise       bigint NOT NULL CHECK (new_paise > 0),
    changed_by      text REFERENCES staff_users (id),
    reason          text,
    changed_at      timestamptz NOT NULL DEFAULT now(),
    FOREIGN KEY (tenant_id, sku) REFERENCES products (tenant_id, sku)
);
CREATE INDEX price_history_product ON price_history (tenant_id, sku, changed_at DESC);

CREATE TABLE stock_levels (
    tenant_id       text NOT NULL,
    location_id     text NOT NULL,
    sku             text NOT NULL,
    on_hand         integer NOT NULL DEFAULT 0 CHECK (on_hand >= 0),
    reserved        integer NOT NULL DEFAULT 0 CHECK (reserved >= 0),
    buffer          integer NOT NULL DEFAULT 0 CHECK (buffer >= 0),     -- kept back from online channels
    reorder_point   integer NOT NULL DEFAULT 0 CHECK (reorder_point >= 0),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, location_id, sku),
    FOREIGN KEY (tenant_id, location_id) REFERENCES locations (tenant_id, id),
    FOREIGN KEY (tenant_id, sku) REFERENCES products (tenant_id, sku),
    CHECK (reserved <= on_hand)
);

-- Every change to on_hand, so stock can be reconciled and drift between channels explained.
CREATE TABLE stock_movements (
    id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    tenant_id       text NOT NULL,
    location_id     text NOT NULL,
    sku             text NOT NULL,
    qty_change      integer NOT NULL CHECK (qty_change <> 0),
    reason          text NOT NULL CHECK (reason IN ('receipt', 'sale', 'return', 'transfer_in', 'transfer_out',
                                                     'adjustment', 'damage', 'count')),
    reference       text,                                    -- order id, purchase order, transfer id
    actor_id        text,
    at              timestamptz NOT NULL DEFAULT now(),
    FOREIGN KEY (tenant_id, location_id, sku) REFERENCES stock_levels (tenant_id, location_id, sku)
);
CREATE INDEX stock_movements_item ON stock_movements (tenant_id, location_id, sku, at DESC);

-- What a channel may sell: never negative.
CREATE VIEW channel_available_stock AS
SELECT tenant_id, location_id, sku, on_hand, reserved, buffer,
       GREATEST(on_hand - buffer - reserved, 0) AS available
FROM stock_levels;
