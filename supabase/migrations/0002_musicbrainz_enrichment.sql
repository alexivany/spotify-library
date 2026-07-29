-- MusicBrainz enrichment for saved albums
-- Spotify has deprecated reliable genre/label data on albums; this adds
-- MusicBrainz as a second enrichment source, resolved alongside the existing
-- Spotify-derived data rather than replacing it outright.

alter table albums
  add column musicbrainz_release_id text,
  add column musicbrainz_release_group_id text,
  add column musicbrainz_label text,
  add column musicbrainz_genres text[] not null default '{}',
  add column musicbrainz_match_status text
    check (musicbrainz_match_status in ('matched', 'ambiguous', 'unmatched')),
  add column musicbrainz_match_score int,
  add column musicbrainz_checked_at timestamptz;

-- Spotify's `label` is often missing/stale on newer saves; MusicBrainz's is
-- preferred when present. A generated column means every existing label
-- filter/facet/select becomes a one-word column swap instead of a coalesce()
-- at every call site.
alter table albums
  add column resolved_label text generated always as (coalesce(musicbrainz_label, label)) stored;

create index albums_resolved_label_idx on albums (resolved_label);

-- "Needs enrichment" candidates: never checked, or non-matched and past the
-- 7-day retry cooldown. Matched rows fall outside both branches forever.
create index albums_musicbrainz_recheck_idx on albums (musicbrainz_checked_at)
  where musicbrainz_match_status is distinct from 'matched';

create table enrichment_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running' check (status in ('running', 'success', 'error')),
  counts jsonb not null default '{}',
  error text
);

-- Genre resolution now unions artist genres AND album-level MusicBrainz
-- genres. Rewritten FROM albums with left joins (was FROM album_artists with
-- inner joins) so an album with MusicBrainz genres but no genre-tagged
-- artists still surfaces. Column list unchanged, so this is a safe replace.
create or replace view album_genres as
select
  alb.id as album_id,
  array_agg(distinct g order by g) filter (where g is not null) as genres
from albums alb
left join album_artists aa on aa.album_id = alb.id
left join artists ar on ar.id = aa.artist_id
left join lateral unnest(coalesce(ar.genres, '{}') || coalesce(alb.musicbrainz_genres, '{}')) as g on true
group by alb.id;

create or replace view track_genres as
select
  t.id as track_id,
  array_agg(distinct g order by g) filter (where g is not null) as genres
from tracks t
left join track_artists ta on ta.track_id = t.id
left join artists ar on ar.id = ta.artist_id
left join albums alb on alb.id = t.album_id
left join lateral unnest(coalesce(ar.genres, '{}') || coalesce(alb.musicbrainz_genres, '{}')) as g on true
group by t.id;
