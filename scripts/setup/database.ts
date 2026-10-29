import { spawn } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { Env } from "./config";

export function run(command: string, args: string[], capture = false): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit" });
    let output = "";
    child.stdout?.on("data", chunk => { output += chunk; });
    // Captured CLI output may contain keys: never include it in thrown errors.
    child.stderr?.resume();
    child.on("error", () => reject(new Error(`Cannot run ${command}. Check docs/SETUP.md for installation instructions.`)));
    child.on("close", code => code === 0 ? resolve(output) : reject(new Error(`${command} failed. Resolve the issue and retry; no data was reset.`)));
  });
}

export function localCredentials(status: Record<string, string>): Env {
  const url = status.API_URL;
  const key = status.SERVICE_ROLE_KEY ?? status.SECRET_KEY;
  if (!url || !key) throw new Error("Supabase status did not return API_URL and a service role/secret key. Update the Supabase CLI.");
  return { SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: key };
}

export async function startLocalDatabase(): Promise<Env> {
  await run("docker", ["info"], true);
  // No reset, volume deletion, global login changes or stopping other projects.
  // Suppress status/start output because both can contain private keys.
  console.log("Starting this project's Supabase stack. First run may take several minutes to download images…");
  try { await run("supabase", ["start"], true); }
  catch { throw new Error("Supabase could not start. Run supabase start in your terminal to see diagnostics. Check Docker, available memory and ports 54320–54329. Other stacks and existing data were left intact."); }
  await run("supabase", ["migration", "up", "--local"]);
  const output = await run("supabase", ["status", "-o", "json"], true);
  let status: Record<string, string>;
  try { status = JSON.parse(output); }
  catch { throw new Error("Could not parse Supabase status JSON. Update the CLI and retry. Output was hidden because it may contain keys."); }
  return localCredentials(status);
}

/** Dashboard path for new hosted projects; deliberately refuses a populated schema. */
export async function schemaBundle(root: string): Promise<string> {
  const folder = path.join(root, "supabase/migrations");
  const files = (await readdir(folder)).filter(name => /^\d+_.+\.sql$/.test(name)).sort();
  const migrations = await Promise.all(files.map(name => readFile(path.join(folder, name), "utf8")));
  return `-- Spotify Library Manager: NEW, EMPTY Supabase project only.\n-- Generated from ${files.length} repository migrations. No user data or credentials.\n-- See docs/SETUP.md before running this in the SQL Editor.\nbegin;\ndo $$ begin\n  if exists (select 1 from pg_tables where schemaname = 'public') then\n    raise exception 'Use a new, empty Supabase project. Setup will not modify existing public tables.';\n  end if;\nend $$;\n\n` + files.map((name, i) => `-- ${name}\n${migrations[i]}`).join("\n") + "\ncommit;\n";
}
