# Spotify Library Manager — Task Tracking

Status legend: `[ ]` todo · `[~]` in progress · `[x]` done

## Phase 0 — Scaffold & tooling
- [x] Scaffold Next.js 16 app (App Router, TS strict, Tailwind 4, bun) at repo root
- [x] Init shadcn/ui; add base components (button, input, table, popover, badge, select, dialog, checkbox)
- [x] Add `@supabase/supabase-js`; create `lib/supabase/server.ts` (service-key server client)
- [x] Write `.env.local.example` (Spotify + Supabase + CRON_SECRET vars)
- [x] `git init`, `.gitignore`, initial commit

## Phase 1 — Database
- [x] `supabase/migrations/0001_init.sql`: core tables (artists, albums, tracks, link tables)
- [x] Organization tables (folders, folder_items, tags, item_tags) + uniqueness constraints
- [x] Ops table (sync_runs)
- [x] Indexes (GIN on artists.genres; btree label/release_date/album_type; pg_trgm on names)
- [x] Views `track_genres` / `album_genres` (union of artist genres)
- [x] Apply locally against self-hosted Supabase; generate TS types

## Phase 2 — Spotify auth
- [x] `lib/spotify/client.ts` (fetch wrapper: base URL, 429 Retry-After backoff, batching helpers)
- [x] `lib/spotify/token.ts` (`getAccessToken()` — refresh from stored refresh token, in-memory cache)
- [x] `GET /api/spotify/login` (authorize redirect + state)
- [x] `GET /api/spotify/callback` (code→token exchange; surface refresh token to paste into env)

## Phase 3 — Sync pipeline
- [ ] `lib/spotify/sync.ts`: page /me/tracks + /me/albums
- [ ] Enrich: batch /artists (genres) + /albums (label, upc)
- [ ] Upsert artists → albums → tracks → link tables (idempotent)
- [ ] Reconcile un-saves; write sync_runs counts + status
- [ ] `POST /api/spotify/sync` route (manual trigger)

## Phase 4 — Library browse / filter / search
- [ ] `lib/library/query.ts` — searchParams-driven query builder (all filter params)
- [ ] `/library` server page: tracks/albums toggle + results table/grid
- [ ] Filter sidebar client island (content type, genre, release date, label, search, explicit, popularity, duration, saved date, folder, tag)
- [ ] Sorting + pagination

## Phase 5 — Folders & tags
- [ ] Route handlers: `/api/folders`, `/api/tags`, `/api/items/*` (assign/unassign)
- [ ] `/folders` + `/folders/[id]` pages
- [ ] `/tags` page (name + color)
- [ ] Row actions: add-to-folder popover, add/remove tags — optimistic UI

## Phase 6 — CSV export
- [ ] `lib/export/csv.ts` — RFC-4180 encoder
- [ ] `GET /api/export` — filtered view + export-all; joined genres/folders/tags columns

## Phase 7 — Scheduled sync (optional)
- [ ] `POST /api/cron/sync` guarded by CRON_SECRET
- [ ] Document pg_cron + pg_net nightly trigger in README

## Phase 8 — Docs & verification
- [ ] `README.md`: Spotify app setup, first-run OAuth, sync, cron
- [ ] Run full verification checklist from PLAN.md
