# Set up your own Spotify Library Manager

Use the wizard for the repetitive work and this guide for account signup and
hosting decisions. It does not buy plans, create accounts, accept terms, deploy
code, or change an existing cloud database on your behalf.

## 1. Choose where it runs

| Option | App | Database | Accounts/tools you need |
| --- | --- | --- | --- |
| Local | Your computer | Docker on your computer | Spotify, Git, Node.js, Bun, Docker, Supabase CLI |
| Local with hosted DB | Your computer | Your Supabase project | Spotify, Supabase, Git, Node.js, Bun |
| Private Vercel | Vercel | Your Supabase project | Spotify, Supabase, GitHub, Vercel; Git, Node.js and Bun for setup |

Every option needs a Spotify developer app. **Check this first:** sign in at the
[Developer Dashboard](https://developer.spotify.com/dashboard). The app owner
must currently have Spotify Premium for development mode; users must be allowed
in the app's Users Management. Check the current
[Spotify eligibility rules](https://developer.spotify.com/documentation/web-api/concepts/quota-modes)
before spending money. If the dashboard will not let you create/use an app, setup
cannot work around that restriction.

Each person should use their **own Spotify app and dedicated database**. There
is one library per instance, not a separate library for each visitor. A private
GitHub repository alone does not make the deployed website private.

Cloud services have their own plan limits, quotas and billing. Start with the
plan appropriate for your personal usage and check the provider's current terms
and limits during signup. Local Docker needs no Supabase cloud account.

## 2. Install and clone

Install [Git](https://git-scm.com/downloads), [Node.js 22.13 or later](https://nodejs.org/en/download)
and [Bun](https://bun.com/docs/installation). Open a new terminal and check:

```bash
git --version
node --version
bun --version

git clone https://github.com/alexivany/spotify-library-release.git spotify-library
cd spotify-library
bun install --frozen-lockfile
bun run setup
```

Use a terminal you control, not a shared CI log. The wizard requires an
interactive terminal for hidden prompts. macOS/Linux and Windows with WSL2 are
the recommended setup environments; Docker Desktop on Windows must enable WSL
integration for the distribution where you run the commands.

The wizard saves progress after each step. **Enter keeps an existing value**;
typing a replacement changes it. Ctrl+C stops the wizard. Rerun the same target
to resume. Modified files get dated, gitignored backups with owner-only
permissions on Unix. Backups still contain secrets: keep them private and delete
unneeded copies when you have verified your setup.

Passwords/key values entered through the wizard must be single-line, without
quotes, backslashes or dollar signs, to avoid dotenv interpolation differences.
A long unique passphrase is suitable. The script does not display saved values.

## 3. Create your Spotify app and connect it

1. [Create a Spotify account](https://www.spotify.com/signup) if needed and
   verify development-mode eligibility above.
2. Open the [Developer Dashboard](https://developer.spotify.com/dashboard),
   create or select your app, and select **Web API** if asked which APIs it uses.
   A name such as “My Spotify Library” and a personal-use description are fine.
   Review and accept Spotify's terms yourself.
3. In **Settings**, add and save these redirect URIs **exactly**:

   ```text
   http://127.0.0.1:43821/api/spotify/callback
   http://127.0.0.1:3000/api/spotify/callback
   ```

   The first is the wizard's temporary callback. The second is for the local
   app's optional in-app reconnect flow. For Vercel, also register your stable
   HTTPS production URL followed by `/api/spotify/callback`. Do not use a unique
   preview deployment URL. Spotify requires explicit loopback IPs for HTTP;
   `localhost` is not an accepted callback. See
   [Spotify's redirect rules](https://developer.spotify.com/documentation/web-api/concepts/redirect_uri).
4. Under **Users Management**, add/allow the Spotify account whose saved library
   you want to sync. Successful Spotify login alone does not prove API access.
5. Copy **Client ID** and **Client Secret** from app settings into the wizard's
   hidden terminal prompts. These are not your Spotify password. See
   [Spotify's app settings guide](https://developer.spotify.com/documentation/web-api/concepts/apps).
6. When the wizard says it is ready to connect, open its authorization link on
   **the same computer**. Sign in to the intended Spotify account and approve
   the requested `user-library-read` access. The browser returns to a temporary
   loopback listener on port 43821; it saves the refresh token directly to your
   selected environment file and closes. Neither the app nor the DB needs to be
   running. The token is not shown on screen.

You can reconnect later with:

```bash
bun run setup:spotify
# Or, for the separate Vercel profile:
bun run setup:spotify --target vercel
```

The connection is tied to the Spotify client ID/secret. Changing apps requires
reconnecting. Changing secrets in the wizard clears the saved refresh token.
When reconfiguring Vercel, upload the changed values and redeploy as described
below. Do not post authorization URLs, codes, tokens, or screenshots of keys in
issues or AI chats.

## 4A. Local app and local database

Install and open [Docker Desktop](https://www.docker.com/products/docker-desktop/)
(or a compatible running Docker engine). Install the
[Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started)
using the platform's supported method. For example, with Homebrew on macOS:

```bash
brew install supabase/tap/supabase
docker info
supabase --version
bun run setup --target local
```

The wizard runs `supabase start`, applies pending migrations with
`supabase migration up --local`, reads the project's local URL and service key,
and saves them to `.env.local`. The first image download can take several minutes.
It does **not** reset the DB, delete volumes, stop other projects, or regenerate
tracked TypeScript files. You do not need to sign in to Supabase to run Docker.

Then run:

```bash
bun run dev
```

Open **http://127.0.0.1:3000/login**, enter the app password you chose, and click
**Sync now**. An empty library before the first sync is normal. Use the same
`127.0.0.1` hostname throughout login and OAuth so cookies stay on one host.
Supabase Studio is normally at http://127.0.0.1:54323.

## 4B. Local app and hosted database

1. [Sign up/sign in to Supabase](https://supabase.com/dashboard).
2. Create an organization if prompted, then a **new project for this app**.
   Choose a region near you, generate a strong database password, and store it
   in your password manager. Wait for provisioning to finish.
3. From **Connect** / **Settings → API Keys**, collect:
   - **Project URL**, usually `https://your-project-ref.supabase.co`.
   - A **secret key** beginning `sb_secret_` (recommended), or the legacy
     `service_role` JWT. The variable is named `SUPABASE_SERVICE_ROLE_KEY` for
     either format. Do not use the publishable/`anon` key or database password.
     See [Supabase's key guide](https://supabase.com/docs/guides/getting-started/api-keys).
4. Keep the **Data API enabled**, with the `public` schema exposed. This app
   makes server-side Data API requests; the migrations restrict table access
   to the server role. You do not need to configure Supabase Auth, OAuth
   providers, a Supabase user account inside the project, or an OpenAI key.
5. Run `bun run setup --target hosted` and enter the project URL/key.
6. The wizard generates `tmp/setup-schema.sql`. Open that file in your editor,
   copy the **entire file**, open **SQL Editor → New query** in the **new project**,
   and run it. It applies all repository migrations in a single transaction,
   including service-role grants, RLS restrictions and resumable sync columns.
   It refuses any project that already contains public tables. Confirm the
   project name before running SQL. This is a schema install, not a data import.
7. Return to the terminal, finish Spotify connection, and review the doctor's
   results. Then `bun run dev` and open http://127.0.0.1:3000/login.

No Docker, database password, Supabase personal access token, or Supabase CLI
login is needed for this dashboard-based hosted path. Your library starts empty;
**Sync now** imports it. Existing folders/tags are not copied from another DB.

**CLI alternative:** experienced users can apply the migrations using the
[Supabase migration workflow](https://supabase.com/docs/guides/deployment/database-migrations)
instead of the SQL Editor. Use a scoped `SUPABASE_ACCESS_TOKEN` per command,
verify `supabase projects list`, link the exact project, inspect
`supabase db push --dry-run`, and then `supabase db push`. Keep the prompted DB
password out of shell history. Do not use both installation methods on the same
new database. Never run a remote reset as part of setup.

## 5. Deploy privately to Vercel

### Prepare your copy and accounts

1. Create/sign in to [GitHub](https://github.com/signup) and
   [Vercel](https://vercel.com/signup). A Vercel account is separate from the app
   password. Finish signup and accept terms yourself.
2. Make your own repository copy. Fork for a public source copy, or use
   [GitHub Import](https://github.com/new/import) to create a **private** copy.
   Clone your copy and run `bun install --frozen-lockfile` there. Never commit
   `.env` files, exports, refresh tokens or backups.
3. Create your own hosted Supabase project and install its schema as in 4B.
   Vercel cannot connect to a database running at `127.0.0.1` on your laptop.
4. Open [Vercel New Project](https://vercel.com/new), authorize access only to
   the intended repository, select it, and choose a project name. Leave the
   import screen open while preparing environment variables. Note the intended
   production domain (normally `<project-name>.vercel.app`); if Vercel assigns a
   different domain, correct the callback after deployment as explained below.

### Prepare and import settings

```bash
bun run setup --target vercel
bun run setup:doctor --target vercel
```

Enter the intended production callback, e.g.
`https://my-library.vercel.app/api/spotify/callback`, and register that exact URI
in Spotify. The wizard still obtains the refresh token through the temporary
**local** callback on port 43821; this also works before the first deployment.

The wizard writes **`.env.vercel`**, leaving `.env.local` untouched. It generates
separate session/cron secrets. Choose a strong app password. You may use the same
hosted DB for local and Vercel, but both instances then read and write the **same**
library. Avoid running two syncs at once. Use a separate project if you want an
independent test library.

In Vercel's import screen / project **Settings → Environment Variables**, import
or paste the entries from `.env.vercel` into **Production** only. If the dashboard
file picker hides dotfiles, use its import/paste text option or enable hidden
files in the picker. Keep the file's contents out of AI chat. Mark secret values
sensitive where supported. No variable should have a `NEXT_PUBLIC_` prefix.
Do not put production credentials into Preview deployments from untrusted branches.
[Environment changes require a new deployment](https://vercel.com/docs/environment-variables).

Use **Next.js** as the framework, the repository root as the root directory,
`bun install --frozen-lockfile` as the install command and `bun run build` as the
build command. Use a supported Node.js version, 22.13 or later. There is no custom
output directory and no static export. Deploy after the environment is configured.

### Make the deployment private and verify it

1. In the Vercel project, open **Security → Deployment Protection**, enable
   **Vercel Authentication** and select **All Deployments**, including production.
   Vercel made this option available on all plans; see its
   [production protection announcement](https://vercel.com/changelog/protect-production-deployments-for-free-on-every-plan).
   Check the production domain is covered, not just preview URLs. Keep the app's
   password gate enabled as well. Avoid public bypass/share links.
2. Open the stable production URL. If the assigned domain differs from the
   intended name, add the actual callback URI in Spotify, update
   `SPOTIFY_REDIRECT_URI` in Vercel Production and your `.env.vercel`, then
   **redeploy**. The locally obtained refresh token does not need to change
   merely because the deployment domain changed.
3. In a private browser window, verify an unauthenticated visitor meets Vercel
   Authentication. After authenticating with Vercel, verify `/library` redirects
   to the app's `/login`. Sign in with your app password.
4. Click **Sync now** and keep the tab open. Confirm tracks/albums appear and a
   filtered CSV downloads. If enrichment is enabled, try **Enrich now**.
5. Verify an unauthenticated request to a protected app API such as `/api/export`
   is denied (Vercel protection, or HTTP 401 from the app after passing Vercel).
   `/api/cron/sync` and `/api/cron/musicbrainz` must reject a missing/wrong bearer
   secret. Do not expose those routes to test with a real sync accidentally.

The Vercel dashboard path needs no Vercel access token. If using the CLI instead,
check `vercel --help` and `vercel env add --help`; select accounts per command
with a token, verify `vercel --token "$VERCEL_TOKEN" whoami`, link the intended
project and upload Production variables from stdin. Do not change shared global
logins or paste secrets into command arguments/history. Check tests, lint and
build before deploying.

### Schedules and backups

`vercel.json` schedules sync daily at **07:00 UTC** and MusicBrainz enrichment at
**08:00 UTC**. Vercel sends `CRON_SECRET` as a bearer token. Keep that generated
secret in Production. On Hobby, daily cron timing is approximate; see
[Vercel cron limits](https://vercel.com/docs/cron-jobs/usage-and-pricing).

Each invocation does a bounded chunk; a large initial library or enrichment
backfill may take many invocations. For first setup, use the buttons and leave
the browser open so the UI keeps requesting subsequent chunks. A daily schedule
alone does not guarantee a large backlog finishes that day. Check Cron logs;
Vercel's own cron requests have a documented Deployment Protection bypass, but
external schedulers need their own protection configuration as well as the
app's bearer secret. See [cron management](https://vercel.com/docs/cron-jobs/manage-cron-jobs).

If you skip MusicBrainz, remove its entry from `vercel.json` in your copy before
deploying; otherwise its scheduled invocation will report missing contact info.
Remove both cron entries if you want manual-only sync. Don't raise cron frequency
without checking your plan and Spotify/MusicBrainz quotas.

Vercel does not persist the local `backups/` directory. Configure backups for
your hosted Supabase plan and keep downloaded exports. Never assume local CSV
snapshots are being stored durably by a Vercel deployment.

## Environment reference

| Variable | Source / purpose |
| --- | --- |
| `APP_PASSWORD` | Your unique 16+ character app login password; chosen in wizard |
| `AUTH_SECRET` | Random session-signing secret; wizard generates 32 bytes |
| `CRON_SECRET` | Separate random cron bearer secret; wizard generates 32 bytes |
| `SPOTIFY_CLIENT_ID` | Spotify app settings, not your account name |
| `SPOTIFY_CLIENT_SECRET` | Spotify app settings, hidden terminal input |
| `SPOTIFY_REDIRECT_URI` | Exact local or stable production app callback |
| `SPOTIFY_REFRESH_TOKEN` | Wizard's browser authorization saves it automatically |
| `SUPABASE_URL` | Local CLI status or hosted project Connect dialog |
| `SUPABASE_SERVICE_ROLE_KEY` | Local CLI key, hosted `sb_secret_…`, or legacy `service_role` JWT; server only |
| `MUSICBRAINZ_CONTACT_EMAIL` | Optional enrichment operator contact; sent to MusicBrainz |
| `MUSICBRAINZ_MIN_REQUEST_INTERVAL_MS` | Default 1100; keep at least 1000 |

MusicBrainz lookups need [no API key](https://musicbrainz.org/doc/MusicBrainz_API/FAQ),
but require an identifying User-Agent. No OpenAI/Anthropic key, Spotify access
token, Supabase anon key, or Vercel API key is required by the application.

## Manual fallback

Copy `.env.local.example` to `.env.local`, fill the values above, and generate two
**different** random secrets with `openssl rand -hex 32`. Apply all migrations via
the local CLI or generated SQL bundle. Run `bun run dev:next`, sign in first at
http://127.0.0.1:3000/login, then visit `/api/spotify/login` on that **same host**.
The callback page shows a refresh token once: save it locally as
`SPOTIFY_REFRESH_TOKEN`, restart the app and close that tab. Prefer the wizard's
`setup:spotify` command to avoid exposing a token on screen.

## Troubleshooting

| Symptom | Next step |
| --- | --- |
| Setup says it needs a terminal | Run it yourself in Terminal/PowerShell/WSL, not a non-interactive AI tool or CI pipe. AI can guide you using the companion doc. |
| `bun`, `node`, `docker` or `supabase` not found | Install the tool linked above, reopen the terminal, check its version. Hosted mode needs neither Docker nor the Supabase CLI. |
| Docker daemon unavailable | Start Docker Desktop and wait until `docker info` works. |
| Supabase startup/port conflict | Run `supabase start` yourself to inspect local diagnostics. Check ports 54320–54329 and available memory. Stop the conflicting project only if you choose; setup will not stop it or delete data. Docker Hub throttling may require signing in to Docker. |
| Setup callback port is busy | Close another setup listener on 43821; retry `setup:spotify`. Normal Next.js on 3000 can remain running. |
| Spotify invalid redirect/state | Save the exact 43821 callback in the dashboard. Use the current wizard link on the same machine; don't reuse an old link. For in-app OAuth use the same host for login and callback. |
| Spotify 401 / token exchange failed | Recheck the app's ID/secret, then reconnect. Do not mix a token from one Spotify app with another app's credentials. |
| Spotify 403 | Check Premium eligibility, intended Spotify account and app Users Management. Doctor checks actual library access, not just successful login. |
| Spotify 429 | Wait for the provider's rate limit/quota reset; don't repeatedly restart sync. |
| Missing table, permission denied, missing cursor column | Run `setup:doctor`; verify project URL, secret key, Data API and that **all** migrations were applied, not only `0001_init.sql`. |
| SQL bundle refuses existing tables | Don't remove the guard. Use a new empty project, or follow the upgrade path for an existing instance. |
| Vercel login never succeeds / app error | Ensure `APP_PASSWORD` and a 32+ character `AUTH_SECRET` are set in Production, then redeploy. Check logs without posting secret values. |
| Changed env variable has no effect | Restart local Next.js; redeploy Vercel. Check you edited `.env.local` versus `.env.vercel` and the correct Vercel environment. |
| Vercel cannot reach DB | A local URL will not work; use the hosted project URL, enable Data API and check the Supabase project is running. |
| Enrichment is slow or no matches | Set contact email, keep the request interval at least 1000 ms, and leave the tab open. Unmatched albums are normal; rate limits make initial backfills slow. |

## Updating an existing instance

Back up the database first. Update your code, run `bun install --frozen-lockfile`,
then apply **only new migrations**, in filename order. Local startup does this
with `supabase migration up --local`. A CLI-installed hosted project uses
`supabase db push --dry-run` then `supabase db push`, after verifying its account
and project.

The SQL Editor installation does **not** populate Supabase CLI migration history.
For that path, retain the list of filenames from the generated bundle you applied
and apply only subsequent migration files once through the SQL Editor. Do not
rerun the full bundle, use `db reset`, or run `db push` over a manual install.
Switching to CLI migration management requires deliberately reconciling its
migration history first; follow Supabase's migration docs rather than guessing.

Run tests, lint, build and `setup:doctor`, then restart locally or redeploy. Review
new environment requirements before importing any changed Production variables.
Rotate `AUTH_SECRET` to invalidate all app sessions when changing a compromised
password; update/redeploy every instance that shares that configuration.

Provider documentation checked October 29, 2026. Dashboard labels, eligibility
and quotas can change; use the official links when the UI differs.
