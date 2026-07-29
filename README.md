# Spotify Library Manager

A personal web app to browse, filter, search, organize, and export your entire
Spotify library (saved songs + saved albums). It mirrors your library into a
self-hosted Supabase (Postgres) database, enriches it with artist genres and
album labels during sync, and runs all filtering/search/export against fast
local SQL — since Spotify's public API can't filter by genre or label at
library scale. It also cross-references [MusicBrainz](https://musicbrainz.org/doc/MusicBrainz_API)
to fill in album genre/label data now that Spotify's own fields are often
missing or stale.

Single-user, local-first tool: one Spotify account, no login screen, no
per-user isolation.

## Tech stack

- Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4, shadcn/ui
- Self-hosted Supabase (Postgres) via the Supabase CLI + Docker
- `@supabase/supabase-js` (service role key, server-side only)
- bun as package manager
- Spotify Web API (Authorization Code flow, `user-library-read` scope)

## Prerequisites

- [bun](https://bun.sh)
- [Docker](https://www.docker.com/products/docker-desktop/) (for self-hosted Supabase)
- [Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started)
- A Spotify account and a [Spotify Developer](https://developer.spotify.com/dashboard) app

## Setup

### 1. Install dependencies

```bash
bun install
```

### 2. Start self-hosted Supabase and apply the schema

```bash
supabase start
```

This prints local API/DB URLs and keys, including a **Secret** key (the local
service-role equivalent). The migration in `supabase/migrations/0001_init.sql`
is applied automatically on `supabase start`; to (re-)apply it manually:

```bash
supabase db reset   # re-applies all migrations from scratch
```

### 3. Create a Spotify app

1. Go to the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard) → create an app.
2. Add the redirect URI **`http://127.0.0.1:3000/api/spotify/callback`** exactly
   (Spotify requires the loopback IP, not `localhost`, for `http`).
3. Leave the app in Development mode — fine for personal use.
4. Copy the **Client ID** and **Client Secret**.

### 4. Configure environment variables

Copy the example file and fill it in:

```bash
cp .env.local.example .env.local
```

| Variable | Where it comes from |
| --- | --- |
| `SPOTIFY_CLIENT_ID` / `SPOTIFY_CLIENT_SECRET` | Spotify Developer Dashboard |
| `SPOTIFY_REDIRECT_URI` | `http://127.0.0.1:3000/api/spotify/callback` |
| `SPOTIFY_REFRESH_TOKEN` | Obtained in step 5 below |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | Output of `supabase start` (`API URL` / `Secret` key) |
| `CRON_SECRET` | Any random string you choose, only needed for scheduled sync/enrichment |
| `MUSICBRAINZ_CONTACT_EMAIL` | Your email — MusicBrainz requires a contact identifier in every request's User-Agent |
| `MUSICBRAINZ_MIN_REQUEST_INTERVAL_MS` | Optional, defaults to `1100`. Don't lower below `1000` — MusicBrainz enforces 1 req/sec for anonymous use |

### 5. First-run OAuth (once)

Start the dev server:

```bash
bun run dev
```

Visit **http://127.0.0.1:3000/api/spotify/login** in your browser and complete
the Spotify sign-in. You'll land on a page showing a **refresh token** —
copy it into `.env.local` as `SPOTIFY_REFRESH_TOKEN`, then restart the dev
server. This token is shown once and isn't stored or logged anywhere by the
app; all future syncs silently refresh the access token from it.

### 6. Sync your library

Click **Sync now** in the header (or `POST /api/spotify/sync`). This pages
through `/me/tracks` and `/me/albums`, enriches artists/albums with genres and
labels, and upserts everything into Postgres. Sync history is recorded in the
`sync_runs` table and summarized in the header.

### 7. Enrich albums with MusicBrainz data (optional, but recommended)

Click **Enrich now** in the header (or `POST /api/musicbrainz/enrich`). This
looks up each saved album on MusicBrainz — first via its Spotify URL
relationship, falling back to a fuzzy artist/title search — and fills in
`musicbrainz_label`/`musicbrainz_genres` where a confident match is found.
The label filter and genre facets automatically prefer this data over
Spotify's when present (via the `resolved_label` column and the
`album_genres`/`track_genres` views).

MusicBrainz enforces **1 request/second** for anonymous use with no path to a
higher quota, so a first-time backfill of a large library is slow — roughly
35–90 minutes for 1000 albums, depending on how many need the fuzzy-search
fallback. This is expected, not a hang. Subsequent runs only touch new albums
and ones past the 7-day retry cooldown (for albums MusicBrainz couldn't
confidently match), so they're fast. Progress and match results are recorded
in `enrichment_runs` and summarized in the header.

## Using the app

- **`/library`** — browse saved tracks or albums, filter by content type,
  genre, release date, label, saved date, popularity, duration, explicit,
  folder, or tag, full-text search across track/album/artist names, sort, and
  paginate. Every filter is reflected in the URL, so views are shareable.
- **Folders/Tags row actions** — each row has "Folders" and "Tags" popovers to
  assign/unassign the item to your own folders and tags (optimistic UI).
- **`/folders`, `/folders/[id]`** — create/rename/delete folders and manage
  their contents.
- **`/tags`** — create/rename/delete tags (with color).
- **Export CSV** — on `/library`, "Export filtered CSV" exports the current
  filtered view; "Export all CSV" exports the whole library regardless of
  filters. Columns include resolved genres and joined folder/tag names.

## Scheduled sync (optional)

Manual sync via the button always works; scheduled sync is optional. It's
guarded by a bearer token so it can be safely triggered from outside the app:

```bash
curl -X POST http://127.0.0.1:3000/api/cron/sync \
  -H "Authorization: Bearer $CRON_SECRET"
```

To trigger it nightly from your self-hosted Supabase via `pg_cron` + `pg_net`,
run this once against your database (e.g. in Supabase Studio's SQL editor):

```sql
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'nightly-spotify-sync',
  '0 3 * * *', -- 3am daily
  $$
  select net.http_post(
    url := 'http://host.docker.internal:3000/api/cron/sync',
    headers := jsonb_build_object(
      'Authorization', 'Bearer YOUR_CRON_SECRET',
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);
```

Notes:
- `host.docker.internal` lets the Postgres container (run by the Supabase CLI
  under Docker) reach the Next.js dev server running on your host machine.
  This works on Docker Desktop for Mac/Windows; on Linux you may need the
  container's host-gateway address instead.
- Replace `YOUR_CRON_SECRET` with the same value as `CRON_SECRET` in
  `.env.local`.
- To remove the schedule: `select cron.unschedule('nightly-spotify-sync');`
- If you deploy the app somewhere with a stable URL, point `url` there instead.

Scheduled MusicBrainz enrichment works the same way, against its own route —
kept separate from the sync schedule since it's much slower:

```sql
select cron.schedule(
  'nightly-musicbrainz-enrich',
  '0 4 * * *', -- 4am daily, after the sync above
  $$
  select net.http_post(
    url := 'http://host.docker.internal:3000/api/cron/musicbrainz',
    headers := jsonb_build_object(
      'Authorization', 'Bearer YOUR_CRON_SECRET',
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);
```

## Verification checklist

1. `bun install`, `supabase start` — confirm the migration applied cleanly.
2. Visit `/api/spotify/login` → confirm you land on the refresh-token page →
   paste it into `.env.local` → restart the dev server.
3. Click **Sync now** → confirm `sync_runs` completes with `status: success`
   and `tracks`/`albums`/`artists` populate with genres and labels present.
4. Exercise each filter (genre, label, release-date range, content type,
   search, explicit, popularity, duration, saved date) on `/library`.
5. Create a folder and a tag, assign them to a few items via the row actions,
   then filter `/library` by that folder/tag and confirm the results.
6. Export a filtered CSV and an "export all" CSV; open in a spreadsheet and
   confirm columns, escaping, and joined genres/folders/tags.
7. (Optional) Trigger `/api/cron/sync` with the bearer token; confirm a new
   `sync_runs` row.
8. Click **Enrich now** → confirm `enrichment_runs` completes with
   `status: success` and `musicbrainz_label`/`musicbrainz_genres` populate on
   matched albums; re-run and confirm already-matched albums are skipped.
9. Confirm the label filter/facet and genre filter/facet on `/library`
   reflect MusicBrainz data, and that CSV export columns match.

## Project structure

```
app/library/                  filter sidebar, results table, pagination, export
app/folders/, app/tags/       folder & tag management pages
app/api/spotify/{login,callback,sync}/   Spotify OAuth + manual sync
app/api/cron/sync/            scheduled sync (CRON_SECRET-guarded)
app/api/musicbrainz/enrich/   manual MusicBrainz enrichment trigger
app/api/cron/musicbrainz/     scheduled enrichment (CRON_SECRET-guarded)
app/api/{folders,tags,items,export}/     folder/tag CRUD + CSV export
lib/spotify/{client,token,sync}.ts       Spotify API client + sync pipeline
lib/musicbrainz/{client,match,enrich}.ts MusicBrainz client + matching + enrichment pipeline
lib/library/{query,types,url,format}.ts  filter/search query builder
lib/export/csv.ts              RFC-4180 CSV encoder
lib/supabase/server.ts          Supabase service-role client
supabase/migrations/0001_init.sql   schema, indexes, genre views
supabase/migrations/0002_musicbrainz_enrichment.sql   MusicBrainz columns, resolved_label, enrichment_runs
```
