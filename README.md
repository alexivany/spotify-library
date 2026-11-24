# Spotify Library Manager

Browse, search, sort, organize and export your saved Spotify tracks and albums.
The app mirrors one Spotify library into your own Supabase database and can add
album labels and genres from MusicBrainz. Your instance is protected by a password.
This is a **single-user app**: everyone with access sees the same library.

Licensed under [GNU GPL v3.0 only](LICENSE). Copyright (C) 2026 Alex Ivany and
contributors. Bundled [fonts](app/fonts/README.md) retain their SIL OFL licenses;
see [third-party notices](THIRD_PARTY_NOTICES.md) for copied components and assets.
Dependencies retain their own licenses. This project is not affiliated with
Spotify, and the software license does not grant rights to Spotify content.
See [contributing](CONTRIBUTING.md) and [security and privacy](SECURITY.md).

## Start here

You can run everything on your computer, use a hosted database without Docker,
or deploy your own private instance to Vercel.

1. Check that you can create/access an app in the
   [Spotify Developer Dashboard](https://developer.spotify.com/dashboard).
   Spotify currently requires **Premium for development-mode app owners**.
2. Install [Git](https://git-scm.com/downloads), [Node.js 22+](https://nodejs.org/en/download)
   and [Bun](https://bun.com/docs/installation).
3. Clone and run the guided setup:

```bash
git clone https://github.com/alexivany/spotify-library-release.git spotify-library
cd spotify-library
bun install --frozen-lockfile
bun run setup
```

The wizard explains where to create accounts and find keys, hides secret input,
generates session/cron secrets, saves your Spotify connection automatically, and
checks the configuration. You can stop and resume it. Local settings go in
`.env.local`; Vercel settings go in `.env.vercel`. Both are gitignored.

**[Complete setup walkthrough →](docs/SETUP.md)** — account signup, API keys,
local startup, private Vercel deployment, troubleshooting and upgrades.

**[AI-guided companion →](docs/AI_SETUP.md)** — a ready-to-paste prompt for an AI
coding assistant to guide the process without collecting your secrets in chat.
No AI subscription or API key is needed to run the app or setup wizard.

After local setup:

```bash
bun run dev
```

Open **http://127.0.0.1:3000/login**, enter your chosen app password, and click
**Sync now**. Keep the tab open while the initial sync runs. On subsequent starts,
`bun run dev` preserves your chosen local or hosted database.

## Useful commands

| Command | Purpose |
| --- | --- |
| `bun run setup` | Configure or resume setup interactively |
| `bun run setup --target vercel` | Prepare a separate `.env.vercel` profile |
| `bun run setup:spotify` | Connect/reconnect Spotify without copying tokens |
| `bun run setup:doctor` | Check configuration, schema and Spotify library access |
| `bun run setup:doctor --target vercel` | Check the Vercel profile |
| `bun run setup:sql` | Generate the schema for a **new, empty** hosted project |
| `bun run dev` | Start the chosen database (if local) and the app |
| `bun run dev:next` | Start only Next.js; leave database startup to you |
| `bun run db:setup` | Start local Supabase and apply pending local migrations |
| `bun run test` / `bun run lint` / `bun run build` | Verify changes, in that order |
| `bun run typecheck:setup` | Type-check the setup and startup scripts |
| `bun run check` | Run tests, lint and the production build; stop on the first failure |
| `bun run hooks:install` | Install/reinstall this checkout's pre-commit hook |

`bun run dev:fresh` **deletes the local database and recreates it**. It is a
recovery/development command, not a normal setup step. Normal setup never resets
volumes or stops another project's Supabase containers.

## Before committing

`bun install` installs the tracked `.githooks/pre-commit` hook in this checkout.
Every commit runs **tests → lint → production build**, in that order, and any
failure blocks the commit. Run `bun run check` before pushing as well. Fix failures
instead of bypassing the hook. Dependencies must be installed before committing.

If install scripts were disabled, run `bun run hooks:install` once. The installer
skips CI/Vercel and source archives, and never changes global Git settings. If you
already use a custom `core.hooksPath`, it preserves that configuration and asks
you to add `bun run check` to your existing pre-commit hook.

## Using the app

- **Library:** switch tracks/albums and grid/list views; search and filter by
  genre, label, date, content type, popularity, duration, explicit content,
  folders and tags. Click list headers to toggle ascending/descending order.
- **Folders and tags:** organize items from their row actions or context menus.
- **CSV export:** download the filtered view or the whole library.
- **Sync now:** import additions and removals from Spotify. Large libraries run
  in resumable chunks; the UI requests the next chunk while the tab stays open.
- **Enrich now:** optionally add MusicBrainz labels/genres. Set your contact
  email first. The service is rate limited, so large backfills take time.

Local sync attempts CSV backups under the ignored `backups/` directory. Vercel's
filesystem is not durable backup storage; use Supabase backups and downloaded
exports for hosted instances. See the walkthrough for scheduling and recovery.

## Stack and layout

Next.js 16 App Router, React 19, TypeScript, Tailwind CSS 4, shadcn/ui, Bun,
Supabase/Postgres, Spotify Authorization Code flow (`user-library-read`). All
Supabase access uses a server-only secret/service role key. The password gate
protects pages and API routes; cron routes use their own bearer secret.

```text
app/(app)/library/          browsing, filters, results, sorting and export links
app/(app)/folders/, tags/   personal organization
app/api/                   OAuth, auth, sync, enrichment, export and CRUD
lib/spotify/               Spotify API client and resumable sync
lib/musicbrainz/           album matching and resumable enrichment
lib/library/               SQL queries, filters and URL state
lib/supabase/              server client and generated database types
scripts/setup.ts           setup wizard and diagnostic commands
scripts/setup/             configuration, local DB, OAuth and prompts
supabase/migrations/       complete schema, permissions and cursor migrations
docs/SETUP.md              human setup guide
docs/AI_SETUP.md           AI-guided setup instructions
```
