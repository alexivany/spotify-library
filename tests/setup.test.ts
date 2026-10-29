import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { cp, mkdir, mkdtemp, readFile, readdir, rm, stat, symlink, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { generatedSecrets, isLoopback, mergeEnv, profileFor, readEnv, saveEnv, validateConfig, type Env } from "../scripts/setup/config";
import { localCredentials, schemaBundle } from "../scripts/setup/database";
import { checkSetup } from "../scripts/setup/doctor";
import { startSpotifyConnection } from "../scripts/setup/spotify";

const temporary: string[] = [];
async function folder() {
  const dir = await mkdtemp(path.join(os.tmpdir(), "spotify-setup-test-"));
  temporary.push(dir);
  return dir;
}
after(async () => { await Promise.all(temporary.map(dir => rm(dir, { recursive: true, force: true }))); });

const valid: Env = {
  APP_PASSWORD: "a-long-test-passphrase", AUTH_SECRET: "a".repeat(64), CRON_SECRET: "b".repeat(64),
  SUPABASE_URL: "https://project.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "sb_secret_test_only",
  SPOTIFY_CLIENT_ID: "test-client", SPOTIFY_CLIENT_SECRET: "test-secret",
  SPOTIFY_REDIRECT_URI: "http://127.0.0.1:3000/api/spotify/callback",
};

describe("setup profiles and secret handling", () => {
  it("keeps local and Vercel files separate and doesn't rotate saved secrets", () => {
    assert.equal(profileFor("local"), ".env.local");
    assert.equal(profileFor("hosted"), ".env.local");
    assert.equal(profileFor("vercel"), ".env.vercel");
    assert.deepEqual(generatedSecrets(valid), {});
    const secrets = generatedSecrets({});
    assert.match(secrets.AUTH_SECRET, /^[a-f0-9]{64}$/);
    assert.notEqual(secrets.AUTH_SECRET, secrets.CRON_SECRET);
  });
  it("preserves comments/unknown settings, removes duplicate assignments and roundtrips literal spaces/hash", async () => {
    const dir = await folder();
    const file = path.join(dir, ".env.local");
    const original = '# keep this\nCUSTOM="hello"\nAPP_PASSWORD=old\nAPP_PASSWORD=duplicate\n';
    await writeFile(file, original);
    await saveEnv(file, { APP_PASSWORD: "long # literal passphrase", AUTH_SECRET: "a".repeat(64) });
    const text = await readFile(file, "utf8");
    assert.ok(text.startsWith('# keep this\nCUSTOM="hello"'));
    assert.equal(text.match(/APP_PASSWORD=/g)?.length, 1);
    assert.equal((await readEnv(file)).APP_PASSWORD, "long # literal passphrase");
    assert.equal((await stat(file)).mode & 0o777, 0o600);
    const backups = (await readdir(dir)).filter(name => name.includes("backup-"));
    assert.equal(backups.length, 1);
    assert.equal(await readFile(path.join(dir, backups[0]), "utf8"), original);
    assert.equal((await stat(path.join(dir, backups[0]))).mode & 0o777, 0o600);
    await saveEnv(file, { APP_PASSWORD: "long # literal passphrase" });
    assert.equal((await readdir(dir)).length, 2, "unchanged config creates no extra backup");
  });
  it("refuses dotenv interpolation, line injection, and replacing symlinks", async () => {
    for (const password of ["$PASSWORD", 'quote"here', "line\nAUTH_SECRET=oops", "back\\slash"]) {
      assert.throws(() => mergeEnv("", { APP_PASSWORD: password }));
    }
    const dir = await folder();
    const target = path.join(dir, "target");
    const link = path.join(dir, ".env.local");
    await writeFile(target, "original");
    await symlink(target, link);
    await assert.rejects(saveEnv(link, { AUTH_SECRET: "safe" }), /symlink/);
    assert.equal(await readFile(target, "utf8"), "original");
  });
});

describe("configuration diagnostics", () => {
  it("accepts server keys but catches public keys, malformed callbacks and hosted loopback", () => {
    assert.deepEqual(validateConfig(valid), []);
    const jwt = `header.${Buffer.from(JSON.stringify({ role: "service_role" })).toString("base64url")}.signature`;
    assert.deepEqual(validateConfig({ ...valid, SUPABASE_SERVICE_ROLE_KEY: jwt }), []);
    assert.ok(validateConfig({ ...valid, SUPABASE_SERVICE_ROLE_KEY: "sb_publishable_wrong" }).some(s => s.includes("publishable")));
    assert.ok(validateConfig({ ...valid, SPOTIFY_REDIRECT_URI: "http://localhost:3000/api/spotify/callback" }).length);
    assert.ok(validateConfig({ ...valid, SUPABASE_URL: "http://127.0.0.1:54321" }, "vercel").some(s => s.includes("hosted")));
    assert.ok(validateConfig({ ...valid, SUPABASE_URL: "https://user:password@project.supabase.co" }).length);
    assert.ok(validateConfig({ ...valid, MUSICBRAINZ_MIN_REQUEST_INTERVAL_MS: "999" }).length);
    assert.equal(isLoopback("https://127.0.0.1.attacker.test"), false);
  });
  it("fails before network access for incomplete config", async () => {
    const checks = await checkSetup({});
    assert.ok(checks.length > 0 && checks.every(check => !check.ok));
    assert.ok(checks.some(check => check.message.includes("APP_PASSWORD")));
  });
  it("checks the full schema without fetching rows and explains Spotify 403 without leaking responses", async () => {
    const previous = globalThis.fetch;
    const requested: URL[] = [];
    globalThis.fetch = (async (input: string | URL | Request) => {
      const url = new URL(input instanceof Request ? input.url : input);
      requested.push(url);
      if (url.hostname === "accounts.spotify.com") return Response.json({ access_token: "do-not-display" });
      if (url.hostname === "api.spotify.com") return Response.json({ error: "do-not-display" }, { status: 403 });
      assert.equal(url.hostname, "project.supabase.co");
      assert.equal(url.searchParams.get("limit"), "0");
      return Response.json([]);
    }) as typeof fetch;
    try {
      const checks = await checkSetup({ ...valid, SPOTIFY_REFRESH_TOKEN: "never-display", MUSICBRAINZ_CONTACT_EMAIL: "test@example.test" });
      assert.equal(requested.filter(url => url.hostname === "project.supabase.co").length, 13);
      assert.ok(checks.some(check => !check.ok && check.message.includes("Premium")));
      assert.ok(!JSON.stringify(checks).includes("do-not-display"));
      assert.ok(!JSON.stringify(checks).includes("never-display"));
    } finally { globalThis.fetch = previous; }
  });
  it("supports both local key names and generates all migrations atomically with a populated-db guard", async () => {
    assert.deepEqual(localCredentials({ API_URL: "http://127.0.0.1:54321", SECRET_KEY: "sb_secret_test" }), { SUPABASE_URL: "http://127.0.0.1:54321", SUPABASE_SERVICE_ROLE_KEY: "sb_secret_test" });
    assert.throws(() => localCredentials({}), /status/);
    const sql = await schemaBundle(process.cwd());
    for (const file of await readdir("supabase/migrations")) if (file.endsWith(".sql")) assert.ok(sql.includes(`-- ${file}`));
    assert.ok(sql.indexOf("raise exception") < sql.indexOf("create table artists"));
    assert.match(sql, /begin;[\s\S]*commit;\n$/);
    assert.ok(sql.includes("revoke all on all tables"));
    assert.ok(sql.includes("alter table enrichment_runs add column cursor"));
  });
});

describe("temporary Spotify OAuth listener", () => {
  it("rejects forged state, saves a valid token once and never includes it in HTML", async () => {
    const saved: string[] = [];
    let exchanges = 0;
    const connection = await startSpotifyConnection({ clientId: "fixture-client", port: 0,
      exchange: async (code, redirect) => { exchanges++; assert.equal(code, "fixture-code"); assert.ok(redirect.startsWith("http://127.0.0.1:")); return "private-refresh-token"; },
      saveToken: async token => { saved.push(token); },
    });
    try {
      const auth = new URL(connection.authorizeUrl);
      assert.equal(auth.searchParams.get("scope"), "user-library-read");
      const callback = new URL(auth.searchParams.get("redirect_uri")!);
      callback.searchParams.set("code", "fixture-code");
      callback.searchParams.set("state", "forged-state");
      const rejected = await fetch(callback);
      assert.equal(rejected.status, 400);
      assert.equal(exchanges, 0);
      callback.searchParams.set("state", auth.searchParams.get("state")!);
      const accepted = await fetch(callback);
      assert.equal(accepted.status, 200);
      assert.equal(accepted.headers.get("cache-control"), "no-store");
      const html = await accepted.text();
      assert.ok(html.includes("Spotify connected"));
      assert.ok(!html.includes("private-refresh-token"));
      await connection.done;
      assert.deepEqual(saved, ["private-refresh-token"]);
      assert.equal(exchanges, 1);
    } finally { connection.close(); }
  });
  it("reports a save failure without claiming success or exposing exchange details", async () => {
    const connection = await startSpotifyConnection({ clientId: "fixture-client", port: 0,
      exchange: async () => "secret-token", saveToken: async () => { throw new Error("private-path-and-token"); },
    });
    try {
      const auth = new URL(connection.authorizeUrl);
      const callback = new URL(auth.searchParams.get("redirect_uri")!);
      callback.searchParams.set("state", auth.searchParams.get("state")!);
      callback.searchParams.set("code", "code");
      const response = await fetch(callback);
      assert.equal(response.status, 500);
      assert.ok(!(await response.text()).includes("private-path-and-token"));
      await assert.rejects(connection.done, /Could not exchange or save/);
    } finally { connection.close(); }
  });
});

describe("startup integration", () => {
  async function fixture() {
    const dir = await folder();
    await cp("scripts", path.join(dir, "scripts"), { recursive: true });
    await symlink(path.join(process.cwd(), "node_modules"), path.join(dir, "node_modules"));
    await mkdir(path.join(dir, "bin"));
    return dir;
  }
  const execute = (dir: string, script: string, args: string[] = []) => spawnSync(process.execPath, [script, ...args], {
    cwd: dir, encoding: "utf8", timeout: 15_000,
    env: { ...process.env, PATH: `${path.join(dir, "bin")}${path.delimiter}${process.env.PATH}` },
  });
  it("never writes settings when the wizard is invoked without a TTY", async () => {
    const dir = await fixture();
    const result = execute(dir, "scripts/setup.ts", ["--target", "vercel"]);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /interactive terminal/);
    assert.ok(!(await readdir(dir)).some(name => name.startsWith(".env")));
  });
  it("starts hosted mode without Docker and leaves both the env and saved DB target intact", async () => {
    const dir = await fixture();
    const config = mergeEnv("# preserved\n", valid);
    await writeFile(path.join(dir, ".env.local"), config);
    await writeFile(path.join(dir, "bin/next"), `#!/usr/bin/env bun\nimport {writeFileSync} from 'node:fs';\nwriteFileSync('started.json',JSON.stringify({args:process.argv.slice(2),url:process.env.SUPABASE_URL}));\n`, { mode: 0o700 });
    const result = execute(dir, "scripts/dev.ts");
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(await readFile(path.join(dir, "started.json"), "utf8")), { args: ["dev", "-H", "127.0.0.1"], url: valid.SUPABASE_URL });
    assert.equal(await readFile(path.join(dir, ".env.local"), "utf8"), config);
    const refused = execute(dir, "scripts/setup.ts", ["database"]);
    assert.equal(refused.status, 1);
    assert.match(refused.stderr, /left unchanged/);
  });
  it("uses only start, pending local migrations and status for local DB setup", async () => {
    const dir = await fixture();
    await writeFile(path.join(dir, "bin/docker"), "#!/usr/bin/env bun\nprocess.exit(0);\n", { mode: 0o700 });
    await writeFile(path.join(dir, "bin/supabase"), `#!/usr/bin/env bun\nimport {appendFileSync} from 'node:fs';\nconst args=process.argv.slice(2);\nappendFileSync('commands.jsonl',JSON.stringify(args)+'\\n');\nif(args[0]==='status') console.log(JSON.stringify({API_URL:'http://127.0.0.1:54321',SERVICE_ROLE_KEY:'fixture-only-key'}));\n`, { mode: 0o700 });
    const result = execute(dir, "scripts/setup.ts", ["database"]);
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual((await readFile(path.join(dir, "commands.jsonl"), "utf8")).trim().split("\n").map(line => JSON.parse(line)), [
      ["start"], ["migration", "up", "--local"], ["status", "-o", "json"],
    ]);
    assert.ok(!result.stdout.includes("fixture-only-key"));
    assert.equal((await readEnv(path.join(dir, ".env.local"))).SUPABASE_URL, "http://127.0.0.1:54321");
  });
  it("does not leak malformed CLI status or overwrite existing settings on failure", async () => {
    const dir = await fixture();
    const source = 'SUPABASE_URL="http://127.0.0.1:54321"\nSUPABASE_SERVICE_ROLE_KEY="keep-this-key"\n';
    await writeFile(path.join(dir, ".env.local"), source);
    await writeFile(path.join(dir, "bin/docker"), "#!/usr/bin/env bun\nprocess.exit(0);\n", { mode: 0o700 });
    await writeFile(path.join(dir, "bin/supabase"), "#!/usr/bin/env bun\nif(process.argv[2]==='status') console.log('not-json private-cli-key');\n", { mode: 0o700 });
    const result = execute(dir, "scripts/setup.ts", ["database"]);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Could not parse Supabase status/);
    assert.ok(!(result.stdout + result.stderr).includes("private-cli-key"));
    assert.equal(await readFile(path.join(dir, ".env.local"), "utf8"), source);
  });
});
