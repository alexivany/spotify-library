import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";

const temporary: string[] = [];
after(async () => { await Promise.all(temporary.map(dir => rm(dir, { recursive: true, force: true }))); });

async function fixture() {
  const dir = await mkdtemp(path.join(os.tmpdir(), "spotify-git-hooks-"));
  temporary.push(dir);
  // A test can itself run inside a hook. Do not inherit its index or Git directory.
  const env = {
    ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_"))),
    NODE_ENV: process.env.NODE_ENV ?? "test",
  };
  Object.assign(env, {
    CI: "", VERCEL: "", GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null",
    GIT_AUTHOR_NAME: "Hook Test", GIT_AUTHOR_EMAIL: "hook@example.test",
    GIT_COMMITTER_NAME: "Hook Test", GIT_COMMITTER_EMAIL: "hook@example.test",
  });
  const run = (command: string, args: string[], extraEnv = {}) =>
    spawnSync(command, args, { cwd: dir, env: { ...env, ...extraEnv }, encoding: "utf8" });
  assert.equal(run("git", ["init", "--quiet"]).status, 0);
  await mkdir(path.join(dir, "scripts"));
  await cp(new URL("../scripts/install-git-hooks.mjs", import.meta.url), path.join(dir, "scripts/install-git-hooks.mjs"));
  await cp(new URL("../.githooks", import.meta.url), path.join(dir, ".githooks"), { recursive: true });
  const { scripts } = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  await writeFile(path.join(dir, "package.json"), JSON.stringify({ scripts: {
    check: scripts.check, test: "node gate.mjs test", lint: "node gate.mjs lint", build: "node gate.mjs build",
  } }));
  await writeFile(path.join(dir, "gate.mjs"), `
import { appendFileSync } from "node:fs";
const stage = process.argv[2];
appendFileSync("checks.log", stage + "\\n");
if (process.env.FAIL_STAGE === stage) process.exit(1);
`);
  assert.equal(run("git", ["add", "."]).status, 0);
  return { dir, run };
}

describe("pre-commit gate", () => {
  for (const fail of ["test", "lint", "build", ""] as const) {
    it(fail ? `blocks a commit when ${fail} fails` : "allows a commit only after all checks pass in order", async () => {
      const { dir, run } = await fixture();
      const installed = run("node", ["scripts/install-git-hooks.mjs"]);
      assert.equal(installed.status, 0, installed.stderr);
      assert.equal(run("git", ["config", "--local", "--get", "core.hooksPath"]).stdout.trim(), ".githooks");
      const commit = run("git", ["commit", "-m", "Verify hook"], { FAIL_STAGE: fail });
      assert.equal(commit.status === 0, !fail, commit.stderr);
      const stages = (await readFile(path.join(dir, "checks.log"), "utf8")).trim().split("\n");
      const expected = ["test", "lint", "build"];
      assert.deepEqual(stages, fail ? expected.slice(0, expected.indexOf(fail) + 1) : expected);
      assert.equal(run("git", ["rev-parse", "--verify", "HEAD"]).status === 0, !fail);
    });
  }

  it("preserves existing hook configuration", async () => {
    const { run } = await fixture();
    assert.equal(run("git", ["config", "--local", "core.hooksPath", ".custom-hooks"]).status, 0);
    assert.notEqual(run("node", ["scripts/install-git-hooks.mjs"]).status, 0);
    assert.equal(run("git", ["config", "--get", "core.hooksPath"]).stdout.trim(), ".custom-hooks");
  });

  it("does not configure hooks in CI or Vercel", async () => {
    const { run } = await fixture();
    for (const extraEnv of [{ CI: "true" }, { VERCEL: "1" }]) {
      assert.equal(run("node", ["scripts/install-git-hooks.mjs"], extraEnv).status, 0);
      assert.equal(run("git", ["config", "--local", "--get", "core.hooksPath"]).status, 1);
    }
  });
});
