-- 0006 Backend alignment: what the backend API stores that 0001-0005 did not have room for.

-- Legal details as the API receives them (GSTIN, PAN, FSSAI, address ...). gstin/pan/fssai_licence stay for
-- validated, searchable values.
ALTER TABLE tenants ADD COLUMN legal jsonb NOT NULL DEFAULT '{}'::jsonb;

-- The channels' own ids for a product, e.g. {"amazon": "B0...", "flipkart": "FSN..."}, set before a connection exists.
ALTER TABLE products ADD COLUMN channel_ids jsonb NOT NULL DEFAULT '{}'::jsonb;
-- MRP may be unknown when a product is created through the API; when it is known, price may not exceed it.
ALTER TABLE products ALTER COLUMN mrp_paise DROP NOT NULL;

-- Picture bytes, until pictures move to object storage (then storage_key points there and data is NULL).
ALTER TABLE product_images ADD COLUMN data bytea;

-- Orders as the channels send them:
--   customer_ref     the channel's reference for the buyer when it is not a customer of ours
--   unmatched_lines  lines whose SKU is not in the catalogue: kept, not dropped, and the order needs attention
--   location_id      empty when nothing could be reserved anywhere
--   channel          the generic marketplace connector
ALTER TABLE orders ADD COLUMN customer_ref text;
ALTER TABLE orders ADD COLUMN unmatched_lines jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE orders ALTER COLUMN location_id DROP NOT NULL;
ALTER TABLE orders DROP CONSTRAINT orders_channel_check;
ALTER TABLE orders ADD CONSTRAINT orders_channel_check CHECK (channel IN ('pos', 'web', 'mobile_app', 'whatsapp', 'facebook',
                                                                          'amazon', 'flipkart', 'ondc', 'generic'));
ALTER TABLE orders DROP CONSTRAINT orders_check2;
ALTER TABLE orders ADD CONSTRAINT orders_connector_channel_has_connection CHECK (
    channel NOT IN ('amazon', 'flipkart', 'ondc', 'whatsapp', 'mobile_app', 'facebook', 'generic') OR connection_id IS NOT NULL);

-- Credentials are stored before their connection is created.
ALTER TABLE channel_credentials ALTER COLUMN connection_id DROP NOT NULL;

-- The signed-in identity a refresh token stands for, so any copy of the API can rotate it.
ALTER TABLE refresh_tokens ADD COLUMN principal jsonb NOT NULL DEFAULT '{}'::jsonb;
