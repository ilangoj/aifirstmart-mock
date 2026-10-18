-- 0004 Integration: channel connections, what is listed where, incoming webhooks, and the job queue the worker runs.
-- The queue lives in PostgreSQL (no extra service): workers claim jobs with claim_jobs(), which uses
-- FOR UPDATE SKIP LOCKED so several workers never take the same job.

CREATE TABLE channel_connections (
    id              text PRIMARY KEY CHECK (id ~ '^con_[a-z0-9]+$'),
    tenant_id       text NOT NULL REFERENCES tenants (id),
    channel         text NOT NULL CHECK (channel IN ('mobile_app', 'whatsapp', 'facebook', 'amazon', 'flipkart', 'ondc', 'generic')),
    display_name    text NOT NULL,
    mode            text NOT NULL DEFAULT 'sandbox' CHECK (mode IN ('sandbox', 'live')),
    status          text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sandbox', 'certified', 'live', 'suspended', 'retired')),
    credentials_ref text,                                    -- key of the encrypted entry in channel_credentials
    settings        jsonb NOT NULL DEFAULT '{}'::jsonb,       -- seller_id, catalog_id, phone_number_id, location_map ...
    rate_limit_per_min integer NOT NULL DEFAULT 60 CHECK (rate_limit_per_min > 0),
    last_success_at timestamptz,
    last_error      text,
    created_at      timestamptz NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, id),
    CHECK (mode = 'sandbox' OR status IN ('live', 'suspended')),
    CHECK (mode = 'sandbox' OR credentials_ref IS NOT NULL)
);
CREATE UNIQUE INDEX channel_connections_one_active ON channel_connections (tenant_id, channel) WHERE status <> 'retired';

ALTER TABLE orders
    ADD FOREIGN KEY (tenant_id, connection_id) REFERENCES channel_connections (tenant_id, id);

-- Channel credentials, encrypted with the tenant's data key (which is itself encrypted by the key service).
-- The database never holds a credential in plain text.
CREATE TABLE channel_credentials (
    ref             text PRIMARY KEY CHECK (ref ~ '^crd_[a-z0-9]+$'),
    tenant_id       text NOT NULL REFERENCES tenants (id),
    connection_id   text NOT NULL,
    ciphertext      bytea NOT NULL,
    key_version     integer NOT NULL DEFAULT 1,
    fields_present  text[] NOT NULL DEFAULT '{}',            -- names only, for the masked display
    rotated_at      timestamptz NOT NULL DEFAULT now(),
    FOREIGN KEY (tenant_id, connection_id) REFERENCES channel_connections (tenant_id, id)
);

CREATE TABLE tenant_data_keys (
    tenant_id       text NOT NULL REFERENCES tenants (id),
    key_version     integer NOT NULL,
    wrapped_key     bytea NOT NULL,                          -- encrypted by the managed key service
    created_at      timestamptz NOT NULL DEFAULT now(),
    retired_at      timestamptz,
    PRIMARY KEY (tenant_id, key_version)
);

-- One row per product per connection: the channel's own id and whether the last sync worked.
CREATE TABLE channel_listings (
    tenant_id       text NOT NULL,
    connection_id   text NOT NULL,
    sku             text NOT NULL,
    channel_item_id text,                                    -- ASIN, FSN, Meta retailer id, ONDC item id
    listing_status  text NOT NULL DEFAULT 'pending' CHECK (listing_status IN ('pending', 'listed', 'rejected', 'delisted')),
    last_price_paise bigint,
    last_qty_sent   integer,
    last_synced_at  timestamptz,
    last_error      text,
    PRIMARY KEY (connection_id, sku),
    FOREIGN KEY (tenant_id, connection_id) REFERENCES channel_connections (tenant_id, id),
    FOREIGN KEY (tenant_id, sku) REFERENCES products (tenant_id, sku)
);
CREATE INDEX channel_listings_errors ON channel_listings (tenant_id, connection_id) WHERE last_error IS NOT NULL;

-- Every webhook as received. (connection, external_event_id) is unique, so a repeated delivery is ignored.
CREATE TABLE webhook_events (
    id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    tenant_id       text NOT NULL,
    connection_id   text NOT NULL,
    external_event_id text NOT NULL,
    event_type      text NOT NULL,                           -- order.created, message.received, order.cancelled ...
    signature_valid boolean NOT NULL,
    payload         jsonb NOT NULL,
    received_at     timestamptz NOT NULL DEFAULT now(),
    processed_at    timestamptz,
    result          text CHECK (result IN ('processed', 'ignored', 'failed')),
    error           text,
    FOREIGN KEY (tenant_id, connection_id) REFERENCES channel_connections (tenant_id, id),
    UNIQUE (connection_id, external_event_id)
);
CREATE INDEX webhook_events_unprocessed ON webhook_events (received_at) WHERE processed_at IS NULL;

CREATE TABLE jobs (
    id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    tenant_id       text NOT NULL REFERENCES tenants (id),
    connection_id   text,
    kind            text NOT NULL CHECK (kind IN ('publish_catalog', 'push_inventory', 'fetch_orders', 'process_webhook',
                                                  'update_order_status', 'send_message')),
    payload         jsonb NOT NULL DEFAULT '{}'::jsonb,
    idempotency_key text NOT NULL,                           -- same key = same job; enqueue is a no-op the second time
    status          text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'succeeded', 'failed', 'dead')),
    attempts        integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    max_attempts    integer NOT NULL DEFAULT 8 CHECK (max_attempts > 0),
    run_after       timestamptz NOT NULL DEFAULT now(),
    locked_by       text,
    locked_at       timestamptz,
    last_error      text,
    created_at      timestamptz NOT NULL DEFAULT now(),
    finished_at     timestamptz,
    FOREIGN KEY (tenant_id, connection_id) REFERENCES channel_connections (tenant_id, id),
    UNIQUE (tenant_id, idempotency_key),
    CHECK (attempts <= max_attempts),
    CHECK (status <> 'dead' OR attempts = max_attempts)
);
CREATE INDEX jobs_ready ON jobs (run_after) WHERE status = 'queued';
CREATE INDEX jobs_dead ON jobs (tenant_id, created_at DESC) WHERE status = 'dead';

-- Claim up to n ready jobs for one worker. Concurrent workers get different jobs.
CREATE FUNCTION claim_jobs(worker text, n integer) RETURNS SETOF jobs
LANGUAGE sql AS $$
    UPDATE jobs SET status = 'running', locked_by = worker, locked_at = now(), attempts = attempts + 1
    WHERE id IN (
        SELECT id FROM jobs
        WHERE status = 'queued' AND run_after <= now()
        ORDER BY run_after, id
        LIMIT n
        FOR UPDATE SKIP LOCKED)
    RETURNING *;
$$;

-- Finish a claimed job. On failure it is retried after 30 s, 1, 2, 4 ... minutes (capped at 1 hour),
-- and marked dead after max_attempts, where an administrator can replay it (permission integrations:replay).
CREATE FUNCTION finish_job(job_id bigint, ok boolean, error text DEFAULT NULL) RETURNS jobs
LANGUAGE sql AS $$
    UPDATE jobs SET
        status      = CASE WHEN ok THEN 'succeeded' WHEN attempts >= max_attempts THEN 'dead' ELSE 'queued' END,
        run_after   = CASE WHEN ok THEN run_after
                           ELSE now() + least(interval '30 seconds' * power(2, attempts - 1), interval '1 hour') END,
        last_error  = CASE WHEN ok THEN NULL ELSE error END,
        finished_at = CASE WHEN ok OR attempts >= max_attempts THEN now() ELSE NULL END,
        locked_by   = NULL,
        locked_at   = NULL
    WHERE id = job_id AND status = 'running'
    RETURNING *;
$$;

-- Health of each connection for the Channels screen and alerts.
CREATE VIEW connection_health AS
SELECT c.tenant_id, c.id AS connection_id, c.channel, c.mode, c.status,
       count(*) FILTER (WHERE j.status = 'queued')                                    AS jobs_waiting,
       count(*) FILTER (WHERE j.status = 'dead')                                      AS jobs_dead,
       count(*) FILTER (WHERE j.status = 'failed' OR (j.status = 'queued' AND j.attempts > 0)) AS jobs_retrying,
       (SELECT count(*) FROM channel_listings l WHERE l.connection_id = c.id AND l.last_error IS NOT NULL) AS listings_with_errors,
       c.last_success_at
FROM channel_connections c
LEFT JOIN jobs j ON j.connection_id = c.id
GROUP BY c.tenant_id, c.id, c.channel, c.mode, c.status, c.last_success_at;
