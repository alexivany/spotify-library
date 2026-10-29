import { randomBytes } from "node:crypto";
import { chmod, copyFile, lstat, readFile, rename, writeFile } from "node:fs/promises";
import { parseEnv } from "node:util";

export type Env = Record<string, string>;
export type Target = "local" | "hosted" | "vercel";

export function profileFor(target: Target): string {
  return target === "vercel" ? ".env.vercel" : ".env.local";
}

export function isLoopback(url: string): boolean {
  try { return ["127.0.0.1", "localhost", "[::1]"].includes(new URL(url).hostname); }
  catch { return false; }
}

export async function readEnv(file: string): Promise<Env> {
  try {
    const parsed = parseEnv(await readFile(file, "utf8"));
    return Object.fromEntries(Object.entries(parsed).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw new Error(`Cannot read ${file}. Check its permissions and dotenv syntax.`);
  }
}

// Keep generated dotenv portable across Bun, Next.js and Vercel's importer.
// Next expands dollar signs even inside quotes. Reject ambiguous characters
// instead of silently changing the password or key the user pasted.
export function validateValue(value: string): string | undefined {
  if (/[\x00-\x1f\x7f"'\\$]/.test(value)) {
    return "Use one line without quotes, backslashes, dollar signs or control characters.";
  }
}

export function mergeEnv(source: string, updates: Env): string {
  for (const [key, value] of Object.entries(updates)) {
    if (!/^[A-Z][A-Z0-9_]*$/.test(key) || validateValue(value)) {
      throw new Error(`Cannot safely save ${key}. ${validateValue(value) ?? "Invalid variable name."}`);
    }
  }
  const remaining = new Set(Object.keys(updates));
  const lines = source.split(/\r?\n/).flatMap(line => {
    const key = line.match(/^\s*(?:export\s+)?([A-Z][A-Z0-9_]*)\s*=/)?.[1];
    if (!key || !(key in updates)) return [line];
    if (!remaining.delete(key)) return [];
    return [`${key}="${updates[key]}"`];
  });
  while (lines.at(-1) === "") lines.pop();
  for (const key of remaining) lines.push(`${key}="${updates[key]}"`);
  return lines.join("\n") + "\n";
}

/** Atomic writes; preserve unknown settings and keep an owner-only backup. */
export async function saveEnv(file: string, updates: Env): Promise<void> {
  let source = "";
  try {
    if ((await lstat(file)).isSymbolicLink()) throw new Error("Refusing to replace a symlink.");
    source = await readFile(file, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const next = mergeEnv(source, updates);
  if (source === next) return;
  if (source) {
    await chmod(file, 0o600);
    // A unique backup avoids overwriting either a previous backup or a symlink.
    const backup = `${file}.backup-${Date.now()}-${randomBytes(4).toString("hex")}`;
    await copyFile(file, backup);
    await chmod(backup, 0o600);
  }
  const temporary = `${file}.${randomBytes(8).toString("hex")}.tmp`;
  await writeFile(temporary, next, { mode: 0o600, flag: "wx" });
  await rename(temporary, file);
}

export function generatedSecrets(env: Env): Env {
  return Object.fromEntries(["AUTH_SECRET", "CRON_SECRET"]
    .filter(key => !env[key]).map(key => [key, randomBytes(32).toString("hex")]));
}

export function validateConfig(env: Env, target?: Target): string[] {
  const issues: string[] = [];
  for (const key of ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "APP_PASSWORD", "AUTH_SECRET", "CRON_SECRET", "SPOTIFY_CLIENT_ID", "SPOTIFY_CLIENT_SECRET"]) {
    if (!env[key]) issues.push(`${key} is missing. Run bun run setup.`);
  }
  if (env.APP_PASSWORD && env.APP_PASSWORD.length < 16) issues.push("APP_PASSWORD must be at least 16 characters; use a unique passphrase.");
  for (const key of ["AUTH_SECRET", "CRON_SECRET"]) {
    if (env[key] && env[key].length < 32) issues.push(`${key} must be at least 32 random characters.`);
  }
  if (env.SUPABASE_URL) {
    try {
      const url = new URL(env.SUPABASE_URL);
      if (url.username || url.password || url.search || url.hash || url.pathname !== "/" ||
          (url.protocol !== "https:" && !(url.protocol === "http:" && isLoopback(url.href)))) throw new Error();
      if (target === "vercel" && isLoopback(url.href)) issues.push("Vercel needs a hosted Supabase project; it cannot reach your laptop's database.");
    } catch { issues.push("SUPABASE_URL must be an HTTPS project origin, or an HTTP loopback origin for local development."); }
  }
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (key) {
    let role: string | undefined;
    try { role = JSON.parse(Buffer.from(key.split(".")[1], "base64url").toString()).role; } catch { /* New secret keys are not JWTs. */ }
    if (!key.startsWith("sb_secret_") && role !== "service_role") {
      issues.push("Use a Supabase secret key (sb_secret_…) or legacy service_role JWT, not a publishable/anon key or database password.");
    }
  }
  try {
    const uri = new URL(env.SPOTIFY_REDIRECT_URI);
    if (uri.pathname !== "/api/spotify/callback" || uri.search || uri.hash || uri.username || uri.password ||
        !(uri.protocol === "https:" || (uri.protocol === "http:" && ["127.0.0.1", "[::1]"].includes(uri.hostname)))) throw new Error();
    if (target === "vercel" && isLoopback(uri.href)) issues.push("Set SPOTIFY_REDIRECT_URI to your stable HTTPS Vercel URL + /api/spotify/callback.");
  } catch { issues.push("SPOTIFY_REDIRECT_URI must end in /api/spotify/callback; use HTTP 127.0.0.1 locally or HTTPS on Vercel, never localhost."); }
  const interval = Number(env.MUSICBRAINZ_MIN_REQUEST_INTERVAL_MS ?? "1100");
  if (!Number.isFinite(interval) || interval < 1000) issues.push("MUSICBRAINZ_MIN_REQUEST_INTERVAL_MS must be at least 1000.");
  return issues;
}
