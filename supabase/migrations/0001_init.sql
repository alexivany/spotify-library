-- Spotify Library Manager — core schema
-- Mirrors the Spotify library (saved tracks + saved albums) locally, enriched
-- with artist genres and album labels, plus user-defined folders/tags.

create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

-- ---------------------------------------------------------------------------
-- Core library
-- ---------------------------------------------------------------------------

create table artists (
  id text primary key,
  name text not null,
  genres text[] not null default '{}',
  popularity int,
  followers int,
  image_url text,
  raw jsonb not null default '{}',
  updated_at timestamptz not null default now()
);

create table albums (
  id text primary key,
  name text not null,
  album_type text not null check (album_type in ('album', 'single', 'compilation')),
  release_date date,
  release_date_precision text check (release_date_precision in ('year', 'month', 'day')),
  label text,
  total_tracks int,
  upc text,
  popularity int,
  image_url text,
  saved_at timestamptz,
  raw jsonb not null default '{}',
  updated_at timestamptz not null default now()
);

create table tracks (
  id text primary key,
  name text not null,
  album_id text references albums (id) on delete cascade,
  duration_ms int,
  explicit boolean not null default false,
  popularity int,
  disc_number int,
  track_number int,
  isrc text,
  preview_url text,
  saved_at timestamptz,
  raw jsonb not null default '{}',
  updated_at timestamptz not null default now()
);

create table album_artists (
  album_id text not null references albums (id) on delete cascade,
  artist_id text not null references artists (id) on delete cascade,
  position int not null default 0,
  primary key (album_id, artist_id)
);

create table track_artists (
  track_id text not null references tracks (id) on delete cascade,
  artist_id text not null references artists (id) on delete cascade,
  position int not null default 0,
  primary key (track_id, artist_id)
);

-- ---------------------------------------------------------------------------
-- User organization
-- ---------------------------------------------------------------------------

create table folders (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table folder_items (
  folder_id uuid not null references folders (id) on delete cascade,
  item_type text not null check (item_type in ('album', 'track')),
  item_id text not null,
  created_at timestamptz not null default now(),
  unique (folder_id, item_type, item_id)
);

create table tags (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  color text,
  created_at timestamptz not null default now()
);

create table item_tags (
  tag_id uuid not null references tags (id) on delete cascade,
  item_type text not null check (item_type in ('album', 'track')),
  item_id text not null,
  created_at timestamptz not null default now(),
  unique (tag_id, item_type, item_id)
);

-- ---------------------------------------------------------------------------
-- Ops
-- ---------------------------------------------------------------------------

create table sync_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running' check (status in ('running', 'success', 'error')),
  counts jsonb not null default '{}',
  error text
);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

create index artists_genres_gin_idx on artists using gin (genres);

create index albums_label_idx on albums (label);
create index albums_release_date_idx on albums (release_date);
create index albums_album_type_idx on albums (album_type);
create index albums_saved_at_idx on albums (saved_at);

create index tracks_saved_at_idx on tracks (saved_at);
create index tracks_album_id_idx on tracks (album_id);

create index tracks_name_trgm_idx on tracks using gin (name gin_trgm_ops);
create index albums_name_trgm_idx on albums using gin (name gin_trgm_ops);
create index artists_name_trgm_idx on artists using gin (name gin_trgm_ops);

create index album_artists_artist_id_idx on album_artists (artist_id);
create index track_artists_artist_id_idx on track_artists (artist_id);
create index track_artists_track_id_idx on track_artists (track_id);

create index folder_items_item_idx on folder_items (item_type, item_id);
create index item_tags_item_idx on item_tags (item_type, item_id);

-- ---------------------------------------------------------------------------
-- Genre resolution views
-- A track's/album's resolved genres = union of its artists' genres.
-- ---------------------------------------------------------------------------

create view album_genres as
select
  aa.album_id,
  array_agg(distinct g order by g) filter (where g is not null) as genres
from album_artists aa
join artists ar on ar.id = aa.artist_id
left join lateral unnest(ar.genres) as g on true
group by aa.album_id;

create view track_genres as
select
  ta.track_id,
  array_agg(distinct g order by g) filter (where g is not null) as genres
from track_artists ta
join artists ar on ar.id = ta.artist_id
left join lateral unnest(ar.genres) as g on true
group by ta.track_id;
