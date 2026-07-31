-- Grant the API role explicit access to the public schema.
--
-- The app talks to Postgres exclusively as `service_role` (server-side, via
-- PostgREST, with RLS bypassed). Tables here are created by migrations running
-- as the `postgres` role, and a Supabase stack can configure that role's
-- DEFAULT PRIVILEGES to withhold DML from the API roles — granting only
-- TRUNCATE/REFERENCES/TRIGGER, not SELECT/INSERT/UPDATE/DELETE. When that
-- happens every query fails with `permission denied for table <x>`.
--
-- Rather than depend on the ambient default-privilege configuration (which
-- differs between the local CLI stack and hosted projects), grant what the app
-- needs explicitly so every environment behaves identically.

grant usage on schema public to service_role;

-- Existing objects (tables + views).
grant select, insert, update, delete on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;

-- Objects created by future migrations (which also run as `postgres`).
alter default privileges in schema public
  grant select, insert, update, delete on tables to service_role;
alter default privileges in schema public
  grant usage, select on sequences to service_role;
