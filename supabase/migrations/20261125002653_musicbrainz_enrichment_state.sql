-- One service-only coordination row across cron, browser sessions and instances.
-- Leases expire after a killed invocation; paused runs retain their cursor.
create table public.musicbrainz_enrichment_state (
  id boolean primary key default true check (id),
  lease_token uuid,
  lease_expires_at timestamptz not null default '1970-01-01T00:00:00Z',
  heartbeat_at timestamptz not null default now(),
  retry_after timestamptz not null default '1970-01-01T00:00:00Z',
  no_progress_chunks integer not null default 0 check (no_progress_chunks >= 0)
);

insert into public.musicbrainz_enrichment_state (id) values (true);
alter table public.musicbrainz_enrichment_state enable row level security;
revoke all on public.musicbrainz_enrichment_state from public, anon, authenticated, service_role;
grant select, update on public.musicbrainz_enrichment_state to service_role;
