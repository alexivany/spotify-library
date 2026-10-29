# AI-guided setup companion

Paste the prompt below into your coding assistant after opening your own clone.
The assistant guides you through account setup and verification. **Enter secrets
only in the wizard's hidden terminal prompts or the provider's dashboard**, never
in chat. You do not need an AI API key for the application.

```text
Help me set up this Spotify Library Manager repo for my own use.

Read AGENTS.md, README.md, docs/SETUP.md, .env.local.example and the setup
scripts first. Follow the repo's documented setup workflow. Ask me whether I
want local Docker, a local app with hosted Supabase, or private Vercel (possibly
alongside local). Explain only the next useful step at each checkpoint.

First verify Spotify developer-app eligibility. Link the official Spotify
signup/dashboard and current requirements. Help me create/reuse my app,
register the exact callback URIs and allow my own Spotify account. I will
complete account signups, password entry, terms, billing choices and OAuth
consent myself. Do not create paid resources without my explicit approval.

Check required tools and install dependencies. Prefer `bun run setup` in a
terminal I control. If your terminal is non-interactive, tell me which command
to run rather than piping answers or reading secret files. Keep a checklist of
completed steps using only nonsensitive facts, so we can resume.

Never ask me to paste API keys, passwords, OAuth codes or tokens into chat.
Don't print/cat .env files, copy provider credentials into prompts, take
screenshots of secrets, source .env as a shell script, or put secrets into shell
arguments. The setup wizard masks input and saves the Spotify refresh token
directly after browser OAuth. Use that instead of copying tokens yourself.
Never commit .env files, backups or exports.

For local Docker: start only this repo's Supabase stack, apply pending local
migrations, and don't reset/delete volumes or stop another project's stack.
For hosted Supabase: use MY new dedicated project, explain exactly where the
URL and secret key are, and use the generated tmp/setup-schema.sql in its SQL
Editor. Confirm project identity before any remote write. Do not reuse the
original author's database or keys. If using CLI instead, use scoped credentials
per command and follow the repo's account-selection rules; do not change global
logins. Do not apply both SQL Editor and CLI initial-install workflows.

For Vercel: use a separate .env.vercel profile; keep .env.local intact. Guide me
through my own GitHub repo copy, Vercel account/project, Production-only env
import, Next.js build settings and hosted Supabase. Before deploying, show me
the exact project, account, commit and domain to approve. Enable Vercel
Authentication for All Deployments and retain the app password gate. Verify the
actual stable domain matches Spotify and SPOTIFY_REDIRECT_URI; redeploy after
changing environment settings. Do not weaken protection to get tests passing.

Run setup:doctor for the selected profile and diagnose only redacted results.
Explain that it makes read requests to the configured DB and Spotify, without
syncing the library. Check the local app in a real browser using 127.0.0.1.
For a deployment, verify anonymous access is blocked before the app login and
APIs are private. Let me enter my password and authorize Spotify. Once I approve
initial sync, verify saved tracks/albums appear, sorting/search work and a CSV
exports. Don't declare setup complete just because a build or OAuth redirect
succeeded. If external signup/OAuth/deployment cannot be exercised, say exactly
what remains for me to do.

Explain optional MusicBrainz contact-email setup, slow first enrichment,
resumable sync, daily cron limits and durable hosted backups. Give a concise
handoff: local/start command and/or stable private URL, how to reconnect
Spotify, how to rerun diagnostics, and what is still pending. Never include
secret values in the handoff.
```

## Checkpoints

- [ ] Spotify developer app can access your account's library.
- [ ] Target chosen; only its required tools/accounts installed.
- [ ] Unique app password and generated session/cron secrets saved privately.
- [ ] Local stack or dedicated hosted DB ready; all migrations applied.
- [ ] Spotify browser authorization completed; token saved in the correct profile.
- [ ] `setup:doctor` passes (with `--target vercel` for that profile).
- [ ] Local login works and/or private Vercel access is verified.
- [ ] First sync, library browsing and CSV export work.
- [ ] Optional enrichment, schedules and backups understood.
