-- Runs once, when the PostgreSQL container first creates its data folder (docker-entrypoint-initdb.d).
-- The role the API will use; row-level security in db/migrations/0005 is granted to it. Needs an administrator,
-- which is why it is here and not in a migration. On a managed database, run these two lines once as the admin.
CREATE ROLE afm_app NOLOGIN;
GRANT afm_app TO CURRENT_USER;
