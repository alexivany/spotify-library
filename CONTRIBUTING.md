# Contributing

Use the [setup guide](docs/SETUP.md) to create your own local instance. This is a
single-user application; contributors must use their own credentials and data.

Before each commit and push, run these commands in order:

```bash
bun run test
bun run lint
bun run build
```

Also run `bun run typecheck:setup` when changing setup scripts, and `bun audit`
when updating dependencies. The lockfile is committed; use
`bun install --frozen-lockfile` when reproducing a checkout.

The `ts-morph` override keeps the shadcn CLI on a release using patched
`minimatch` (GHSA-g3hv-75wg-m249). Remove it when shadcn updates its own range;
verify `bun audit`, the app checks, and `bunx --no-install shadcn info` afterward.

Exercise affected behavior in a real browser using `bun run dev`. Describe the
checks in your pull request, and attach before/after screenshots for visual
changes. Use synthetic library data in screenshots and test fixtures.

Never commit credentials, filled environment files, library exports, database
dumps, deployment account identifiers, or local assistant configuration. Review
the entire staged diff and use a GitHub noreply address for commit attribution
if you want to keep your email private. Scan history with
`gitleaks git . --log-opts="--all --full-history" --redact` before release.

Report ordinary bugs through GitHub issues with reproduction steps and redacted
logs. Follow [SECURITY.md](SECURITY.md) for security issues.

Contributions are licensed under GPL-3.0-only, the same license as this project.
Keep third-party license notices with any bundled assets.
