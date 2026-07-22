# Spotify Library Manager — Implementation Plan

## Context

A personal web app to browse, filter, search, organize, and export your **entire Spotify library** (saved songs + saved albums, where singles/EPs are just albums with `album_type` of `single`/`compilation`). Spotify's public API can't filter by genre or record label live at library scale — genre lives on **artist** objects, label lives only on the **full album** object, and several enrichment endpoints (audio-features, recommendations, related-artists) were deprecated in Nov 2024. So the design **mirrors the library into a self-hosted Supabase (Postgres)**, enriches it with artist genres + album labels during sync, and runs all filtering/search/export against fast local SQL.

### Decisions (confirmed)
- **Personal, single-user** — one Spotify account, no app login screen, no per-user isolation.
- **Sync + cache into Supabase** — the only way to filter by genre/label.
- **One-time OAuth, stored refresh token** — silent refresh for all future syncs.
- **New standalone repo** at `~/Dev/spotify-library`, run locally against self-hosted Supabase.
- **Flat, many-to-many folders** — an album or song can live in multiple folders.
- **Scope v1:** saved songs + saved albums only (no followed artists / playlists as first-class objects; artists are still fetched for genre data).
- **Sync:** manual "Sync now" button + optional scheduled cron.

## Tech Stack
- Next.js 16 (App Router, server components; client islands for filter controls), React 19, TypeScript strict
- Tailwind CSS 4 + shadcn/ui
- `@supabase/supabase-js` against self-hosted Supabase (service key, server-side only)
- **bun** as package manager
- Spotify Web API — Authorization Code flow, `user-library-read` scope

## Spotify App Setup (one time, done by user)
1. Create an app in the Spotify Developer Dashboard → get **Client ID** + **Client Secret**.
2. Add redirect URI **`http://127.0.0.1:3000/api/spotify/callback`** (Spotify no longer accepts `http://localhost`; loopback IP is required for http).
3. Keep the app in Development mode (fine for personal use — no quota-extension review needed).
4. Put `SPOTIFY_CLIENT_ID` / `SPOTIFY_CLIENT_SECRET` in `.env.local`. User completes the browser sign-in; tokens are never handled by the assistant.

## Auth Flow
- `GET /api/spotify/login` → redirect to Spotify authorize URL (state param, `user-library-read` scope).
- `GET /api/spotify/callback` → exchange code for tokens → **store the long-lived `refresh_token`** and print it once to paste into `.env.local` as `SPOTIFY_REFRESH_TOKEN` (simplest for a local single-user tool; no encryption-at-rest needed).
- `lib/spotify/token.ts` — `getAccessToken()` refreshes from the stored refresh token and caches the access token in memory until `expires_at`.

## Database Schema (Supabase migration)
Core library (keyed by Spotify IDs; `raw jsonb` keeps the full payload for future needs):
- `artists(id, name, genres text[], popularity, followers, image_url, raw)`
- `albums(id, name, album_type, release_date, release_date_precision, label, total_tracks, upc, popularity, image_url, saved_at, raw)`
- `tracks(id, name, album_id, duration_ms, explicit, popularity, disc_number, track_number, isrc, preview_url, saved_at, raw)`
- `album_artists(album_id, artist_id)` and `track_artists(track_id, artist_id)` — many-to-many

User organization:
- `folders(id uuid, name, created_at)`
- `folder_items(folder_id, item_type text check in ('album','track'), item_id text)` — flat many-to-many, unique `(folder_id, item_type, item_id)`
- `tags(id uuid, name, color)`
- `item_tags(tag_id, item_type, item_id)` — unique `(tag_id, item_type, item_id)`

Ops:
- `sync_runs(id, started_at, finished_at, status, counts jsonb, error)`

Indexes: GIN on `artists.genres`; btree on `albums.label`, `albums.release_date`, `albums.album_type`; text-search (`pg_trgm`) on `tracks.name` / `albums.name` / `artists.name`.

**Genre resolution:** a track's/album's genres = union of its artists' genres. Expose via SQL views `track_genres` / `album_genres` (join through the artist link tables), used by filters and export.

## Sync Pipeline (`lib/spotify/sync.ts`, called by API route)
1. Refresh access token; open a `sync_runs` row.
2. Page `GET /me/tracks` (limit 50) and `GET /me/albums` (limit 50) until exhausted.
3. Collect unique artist IDs → batch `GET /artists?ids=` (50/call) → genres, popularity, image.
4. Collect album IDs → batch `GET /albums?ids=` (20/call) → **label**, album genres, upc.
5. Upsert artists → albums → tracks → link tables (idempotent `on conflict do update`).
6. Reconcile un-saves (rows present locally but no longer in library → clear `saved_at` / delete).
7. Close `sync_runs` with counts. Handle **429 Retry-After** with backoff throughout.

## Filtering & Search
Single server-side query builder (`lib/library/query.ts`) driven by URL `searchParams` so filters are shareable/bookmarkable. Supported params:
- **Item type** — tracks vs albums view toggle
- **Content type** — `album_type` (album / single / compilation)
- **Genre** — array overlap against resolved genres (multi-select)
- **Release date** — year or full-date range (`min`/`max`)
- **Record label** — exact + fuzzy (`ilike`)
- **Text search** — track/album/artist name (trigram)
- **Also:** explicit, popularity range, duration range, saved-date range, **folder** membership, **tag** membership
- Sorting + keyset/offset pagination

## UI (App Router)
- `/library` — filter sidebar (client island updating `searchParams`) + results table/grid (server component). Tracks/albums toggle. Row actions: **add to folders** (multi-select popover), **add/remove tags**. All mutations optimistic.
- `/folders` and `/folders/[id]` — manage folders, view contents.
- `/tags` — manage tags (name + color).
- Header **sync widget** — "Sync now" button + last-sync time + row counts (from `sync_runs`).
- Mutations via Route Handlers under `/api/folders`, `/api/tags`, `/api/items/*`.

## CSV Export
- `GET /api/export?type=tracks|albums&<same filter params>` → streams CSV of the **current filtered view** (and an "export all" option).
- Columns include resolved genres, folders, and tags (comma-joined), with proper RFC-4180 escaping (quotes/commas/newlines). Shared CSV encoder in `lib/export/csv.ts`.

## Scheduled Sync (optional)
- `POST /api/cron/sync` guarded by a `CRON_SECRET` bearer token.
- Trigger it nightly via Supabase **pg_cron + pg_net** (hits the route) — documented in README; off by default, manual button always works.

## Files (new repo `~/Dev/spotify-library`)
- `app/library/`, `app/folders/`, `app/tags/` — pages + client filter/action islands
- `app/api/spotify/{login,callback,sync}/route.ts`, `app/api/cron/sync/route.ts`
- `app/api/{folders,tags,items,export}/…/route.ts`
- `lib/spotify/{client,token,sync}.ts`, `lib/library/query.ts`, `lib/export/csv.ts`, `lib/supabase/server.ts`
- `supabase/migrations/0001_init.sql` (schema + views + indexes)
- `.env.local.example`, `README.md` (Spotify app setup, first-run OAuth, sync, cron)

## Verification
1. `bun install`, start self-hosted Supabase, apply `0001_init.sql`.
2. Run OAuth once (`/api/spotify/login`) → confirm refresh token obtained → paste into `.env.local`.
3. Click **Sync now** → confirm `sync_runs` completes and `tracks`/`albums`/`artists` populate with genres + labels present.
4. Exercise each filter (genre, label, release-date range, content type, search) + folder/tag membership; confirm SQL results.
5. Create folders/tags, assign items, verify many-to-many and optimistic UI.
6. Export CSV for a filtered view; open in a spreadsheet and confirm columns, escaping, and joined genres/folders/tags.
7. (Optional) Trigger `/api/cron/sync` with the bearer token; confirm a new `sync_runs` row.

## Notes / Out of Scope (v1)
- **No audio-features/tempo/energy** — deprecated for new apps.
- Playlists and followed artists are not first-class objects in v1 (artists fetched only for genres).
- Single-user only; no app authentication layer.
