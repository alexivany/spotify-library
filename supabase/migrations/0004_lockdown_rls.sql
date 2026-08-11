-- Production lockdown: deny the public PostgREST API.
--
-- Hosted Supabase exposes an auto-generated REST API reachable with the public
-- `anon` key. This app never touches Supabase from the client — every query
-- runs server-side with the `service_role` key (see lib/supabase/server.ts),
-- and `service_role` bypasses RLS via its role attribute. So the correct
-- posture for this single-user tool is: no one reaches data through the public
-- API at all.
--
-- Two layers, belt-and-suspenders:
--   1. Enable RLS on every base table with NO policies -> anon/authenticated
--      are denied every row.
--   2. Revoke table/view privileges from anon/authenticated. This also closes
--      the two views (album_genres, track_genres): a Postgres view runs with
--      its owner's rights by default (security definer semantics), so RLS on
--      the underlying tables would NOT protect them — revoking access does.
--
-- This migration is idempotent-friendly and re-applies locally too, keeping
-- dev and prod identical.

-- 1. Enable RLS on all base tables (no policies == deny all for anon/authenticated).
alter table artists         enable row level security;
alter table albums          enable row level security;
alter table tracks          enable row level security;
alter table album_artists   enable row level security;
alter table track_artists   enable row level security;
alter table folders         enable row level security;
alter table folder_items    enable row level security;
alter table tags            enable row level security;
alter table item_tags       enable row level security;
alter table sync_runs       enable row level security;
alter table enrichment_runs enable row level security;

-- 2. Revoke all privileges (covers tables AND the two views) from the public
--    API roles. service_role is unaffected — it has its own grants and bypasses
--    RLS — so all server-side queries keep working.
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

-- Future objects created in this schema by the migration role stay locked down
-- too, so a later `create table` can't silently re-open the API.
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
