-- 0003 Orders, delivery plans, payments, refunds and shipments.
-- Every order records the channel it came from and the channel's own order id; (tenant, channel, channel_order_id)
-- is unique, so an order delivered twice by a webhook or a poll is stored once.

CREATE TABLE delivery_plans (                                -- weekly and monthly plans (subscriptions)
    id              text PRIMARY KEY CHECK (id ~ '^pln_[a-z0-9]+$'),
    tenant_id       text NOT NULL,
    customer_id     text NOT NULL,
    location_id     text NOT NULL,                           -- store that fulfils the plan
    address_id      text NOT NULL,
    cadence         text NOT NULL CHECK (cadence IN ('weekly', 'monthly')),
    delivery_day    smallint NOT NULL,                       -- weekly: 1 (Mon) .. 7 (Sun); monthly: 1 .. 28
    slot            text NOT NULL CHECK (slot IN ('morning', 'afternoon', 'evening')),
    status          text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'cancelled')),
    next_delivery   date,
    started_on      date NOT NULL,
    created_at      timestamptz NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, id),
    FOREIGN KEY (tenant_id, customer_id) REFERENCES customers (tenant_id, id),
    FOREIGN KEY (tenant_id, location_id) REFERENCES locations (tenant_id, id),
    FOREIGN KEY (tenant_id, address_id) REFERENCES customer_addresses (tenant_id, id),
    CHECK ((cadence = 'weekly' AND delivery_day BETWEEN 1 AND 7) OR (cadence = 'monthly' AND delivery_day BETWEEN 1 AND 28)),
    CHECK (status <> 'cancelled' OR next_delivery IS NULL)
);

CREATE TABLE delivery_plan_items (
    tenant_id       text NOT NULL,
    plan_id         text NOT NULL,
    sku             text NOT NULL,
    qty             integer NOT NULL CHECK (qty > 0),
    PRIMARY KEY (plan_id, sku),
    FOREIGN KEY (tenant_id, plan_id) REFERENCES delivery_plans (tenant_id, id),
    FOREIGN KEY (tenant_id, sku) REFERENCES products (tenant_id, sku)
);

CREATE TABLE orders (
    id                  text PRIMARY KEY CHECK (id ~ '^ord_[a-z0-9]+$'),
    tenant_id           text NOT NULL,
    channel             text NOT NULL CHECK (channel IN ('pos', 'web', 'mobile_app', 'whatsapp', 'facebook',
                                                         'amazon', 'flipkart', 'ondc')),
    connection_id       text,                                -- channel_connections.id for connector channels
    channel_order_id    text NOT NULL,                       -- the channel's own reference, e.g. AFM-WA-8821
    customer_id         text,                                -- NULL for walk-in sales and masked marketplace buyers
    location_id         text NOT NULL,                       -- fulfilling store or warehouse
    fulfilment          text NOT NULL CHECK (fulfilment IN ('immediate', 'weekly', 'monthly')),
    plan_id             text,                                -- set for weekly and monthly plan deliveries
    status              text NOT NULL DEFAULT 'received' CHECK (status IN ('received', 'partially_unavailable',
                            'confirmed', 'packed', 'shipped', 'delivered', 'cancelled', 'returned')),
    subtotal_paise      bigint NOT NULL CHECK (subtotal_paise >= 0),
    discount_paise      bigint NOT NULL DEFAULT 0 CHECK (discount_paise >= 0),
    delivery_fee_paise  bigint NOT NULL DEFAULT 0 CHECK (delivery_fee_paise >= 0),
    tax_paise           bigint NOT NULL DEFAULT 0 CHECK (tax_paise >= 0),   -- GST included in the prices
    total_paise         bigint NOT NULL CHECK (total_paise >= 0),
    placed_at           timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, id),
    UNIQUE (tenant_id, channel, channel_order_id),
    FOREIGN KEY (tenant_id, customer_id) REFERENCES customers (tenant_id, id),
    FOREIGN KEY (tenant_id, location_id) REFERENCES locations (tenant_id, id),
    FOREIGN KEY (tenant_id, plan_id) REFERENCES delivery_plans (tenant_id, id),
    CHECK (total_paise = subtotal_paise - discount_paise + delivery_fee_paise),
    CHECK ((fulfilment = 'immediate') = (plan_id IS NULL)),
    CHECK (channel NOT IN ('amazon', 'flipkart', 'ondc', 'whatsapp', 'mobile_app', 'facebook') OR connection_id IS NOT NULL)
);
CREATE INDEX orders_tenant_placed ON orders (tenant_id, placed_at DESC);
CREATE INDEX orders_customer ON orders (tenant_id, customer_id, placed_at DESC) WHERE customer_id IS NOT NULL;
CREATE INDEX orders_open ON orders (tenant_id, location_id, status) WHERE status IN ('received', 'confirmed', 'packed');

CREATE TABLE order_lines (
    tenant_id       text NOT NULL,
    order_id        text NOT NULL,
    line_no         smallint NOT NULL CHECK (line_no > 0),
    sku             text NOT NULL,
    qty             integer NOT NULL CHECK (qty > 0),
    unit_price_paise bigint NOT NULL CHECK (unit_price_paise > 0),
    line_total_paise bigint NOT NULL CHECK (line_total_paise >= 0),
    qty_unavailable integer NOT NULL DEFAULT 0 CHECK (qty_unavailable >= 0),
    PRIMARY KEY (order_id, line_no),
    FOREIGN KEY (tenant_id, order_id) REFERENCES orders (tenant_id, id),
    FOREIGN KEY (tenant_id, sku) REFERENCES products (tenant_id, sku),
    CHECK (line_total_paise = qty * unit_price_paise),
    CHECK (qty_unavailable <= qty)
);
CREATE INDEX order_lines_sku ON order_lines (tenant_id, sku);

-- Stock held for an order until it ships or is cancelled (sums to stock_levels.reserved).
CREATE TABLE stock_reservations (
    tenant_id       text NOT NULL,
    order_id        text NOT NULL,
    location_id     text NOT NULL,
    sku             text NOT NULL,
    qty             integer NOT NULL CHECK (qty > 0),
    created_at      timestamptz NOT NULL DEFAULT now(),
    released_at     timestamptz,
    PRIMARY KEY (order_id, location_id, sku),
    FOREIGN KEY (tenant_id, order_id) REFERENCES orders (tenant_id, id),
    FOREIGN KEY (tenant_id, location_id, sku) REFERENCES stock_levels (tenant_id, location_id, sku)
);

CREATE TABLE payments (
    id              text PRIMARY KEY CHECK (id ~ '^pay_[a-z0-9]+$'),
    tenant_id       text NOT NULL,
    order_id        text NOT NULL,
    method          text NOT NULL CHECK (method IN ('upi', 'card', 'cash', 'netbanking', 'cod', 'marketplace')),
    status          text NOT NULL CHECK (status IN ('pending', 'captured', 'failed', 'refunded', 'partially_refunded')),
    amount_paise    bigint NOT NULL CHECK (amount_paise > 0),
    provider_ref    text,                                    -- gateway or marketplace settlement reference
    captured_at     timestamptz,
    UNIQUE (tenant_id, id),
    FOREIGN KEY (tenant_id, order_id) REFERENCES orders (tenant_id, id)
);
CREATE INDEX payments_order ON payments (tenant_id, order_id);

-- Refunds follow the access policy: a Payment approver up to their limit (default ₹10,000);
-- above ₹25,000 the owner needs a second approver (refund_approvals step 2).
CREATE TABLE refunds (
    id              text PRIMARY KEY CHECK (id ~ '^rfd_[a-z0-9]+$'),
    tenant_id       text NOT NULL,
    order_id        text NOT NULL,
    payment_id      text NOT NULL,
    amount_paise    bigint NOT NULL CHECK (amount_paise > 0),
    reason          text NOT NULL CHECK (reason IN ('damaged', 'missing_item', 'late_delivery', 'wrong_item',
                                                     'quality', 'cancelled_by_customer', 'other')),
    status          text NOT NULL DEFAULT 'requested' CHECK (status IN ('requested', 'approved', 'rejected', 'paid')),
    requested_by    text NOT NULL REFERENCES staff_users (id),
    requested_at    timestamptz NOT NULL DEFAULT now(),
    paid_at         timestamptz,
    UNIQUE (tenant_id, id),
    FOREIGN KEY (tenant_id, order_id) REFERENCES orders (tenant_id, id),
    FOREIGN KEY (tenant_id, payment_id) REFERENCES payments (tenant_id, id)
);

CREATE TABLE refund_approvals (
    tenant_id       text NOT NULL,
    refund_id       text NOT NULL,
    step            smallint NOT NULL CHECK (step IN (1, 2)),
    approver_id     text NOT NULL REFERENCES staff_users (id),
    decision        text NOT NULL CHECK (decision IN ('approved', 'rejected')),
    note            text,
    decided_at      timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (refund_id, step),
    FOREIGN KEY (tenant_id, refund_id) REFERENCES refunds (tenant_id, id)
);

CREATE TABLE shipments (
    id              text PRIMARY KEY CHECK (id ~ '^shp_[a-z0-9]+$'),
    tenant_id       text NOT NULL,
    order_id        text NOT NULL,
    location_id     text NOT NULL,
    method          text NOT NULL CHECK (method IN ('store_pickup', 'own_rider', 'courier', 'marketplace')),
    rider_id        text REFERENCES staff_users (id),
    carrier         text,
    tracking_ref    text,
    status          text NOT NULL CHECK (status IN ('ready', 'out_for_delivery', 'delivered', 'failed', 'returned')),
    slot_date       date,
    slot            text CHECK (slot IN ('morning', 'afternoon', 'evening')),
    dispatched_at   timestamptz,
    delivered_at    timestamptz,
    FOREIGN KEY (tenant_id, order_id) REFERENCES orders (tenant_id, id),
    FOREIGN KEY (tenant_id, location_id) REFERENCES locations (tenant_id, id),
    CHECK (delivered_at IS NULL OR dispatched_at IS NULL OR delivered_at >= dispatched_at)
);
CREATE INDEX shipments_order ON shipments (tenant_id, order_id);
