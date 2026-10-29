import { chmodSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));

// Deployments and source archives do not need developer Git hooks.
if (process.env.CI || process.env.VERCEL || !existsSync(new URL("../.git", import.meta.url))) {
  process.exit(0);
}

const git = (...args) => spawnSync("git", args, { cwd: root, encoding: "utf8" });
const current = git("config", "--get", "core.hooksPath");
if (current.error || (current.status !== 0 && current.status !== 1)) {
  console.error("Could not read Git hook settings. Install Git, then run bun run hooks:install.");
  process.exit(1);
}

if (current.status === 0 && current.stdout.trim() !== ".githooks") {
  console.error("An existing core.hooksPath is configured. It was left unchanged.");
  console.error("Add 'bun run check' to that pre-commit hook before committing here.");
  process.exit(1);
}

chmodSync(new URL("../.githooks/pre-commit", import.meta.url), 0o755);
const installed = git("config", "--local", "core.hooksPath", ".githooks");
if (installed.status !== 0) {
  console.error("Could not install Git hooks. Run bun run hooks:install from a writable checkout.");
  process.exit(1);
}
console.log("Pre-commit hook installed: tests → lint → build. Any failure blocks the commit.");
