-- 0005 Tenant isolation in the database: row-level security on every table that has a tenant_id.
-- The API connects as the role afm_app and, at the start of each request's transaction, runs
--     SELECT set_config('afm.tenant_id', '<tenant id from the access token>', true);
-- afm_app then sees and changes only that tenant's rows, even if application code forgets a WHERE clause.
-- The platform administrator's requests set afm.platform = 'on' instead.
-- The table owner (migrations, afm.py db seed) is not restricted, because RLS is enabled but not forced.
-- Limits: this guards against a missing tenant filter in application code. It does not guard against code that
-- sets afm.platform itself, so only the platform-administrator path in the API may set it.

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'afm_app') THEN
        BEGIN
            CREATE ROLE afm_app NOLOGIN;
        EXCEPTION WHEN insufficient_privilege THEN
            RAISE NOTICE 'Cannot create role afm_app here; create it as an administrator, then rerun the grants below.';
        END;
    END IF;
END $$;

CREATE FUNCTION current_tenant() RETURNS text
LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('afm.tenant_id', true), '') $$;

CREATE FUNCTION platform_scope() RETURNS boolean
LANGUAGE sql STABLE AS $$ SELECT coalesce(current_setting('afm.platform', true), '') = 'on' $$;

DO $$
DECLARE t record;
BEGIN
    FOR t IN
        SELECT c.table_name FROM information_schema.columns c
        JOIN information_schema.tables tb ON tb.table_name = c.table_name AND tb.table_schema = c.table_schema
        WHERE c.table_schema = current_schema() AND c.column_name = 'tenant_id' AND tb.table_type = 'BASE TABLE'
    LOOP
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t.table_name);
        EXECUTE format($p$CREATE POLICY tenant_isolation ON %I
                          USING (platform_scope() OR tenant_id = current_tenant())
                          WITH CHECK (platform_scope() OR tenant_id = current_tenant())$p$, t.table_name);
    END LOOP;
    -- tenants has no tenant_id column: a tenant sees its own row
    ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
    CREATE POLICY tenant_isolation ON tenants USING (platform_scope() OR id = current_tenant())
        WITH CHECK (platform_scope());
END $$;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'afm_app') THEN
        EXECUTE format('GRANT USAGE ON SCHEMA %I TO afm_app', current_schema());
        GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO afm_app;
        GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO afm_app;
        GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO afm_app;
        REVOKE UPDATE, DELETE ON audit_log, stock_movements, price_history, webhook_events FROM afm_app;   -- append-only
        REVOKE ALL ON schema_migrations FROM afm_app;
    END IF;
END $$;

-- Sign-in happens before the tenant is known: this one function may look across tenants, and returns only what the
-- password check needs. Webhook routing (finding the connection for an incoming event) runs with afm.platform = 'on'
-- and sets afm.tenant_id before touching tenant data.
CREATE FUNCTION staff_for_login(login_email text)
RETURNS TABLE (id text, tenant_id text, password_hash text, active boolean, failed_logins integer, mfa_enabled boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT id, tenant_id, password_hash, active, failed_logins, mfa_enabled
    FROM staff_users WHERE lower(email) = lower(login_email)
$$;
REVOKE ALL ON FUNCTION staff_for_login(text) FROM PUBLIC;
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'afm_app') THEN
        GRANT EXECUTE ON FUNCTION staff_for_login(text) TO afm_app;
    END IF;
END $$;
