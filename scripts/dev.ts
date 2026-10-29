import { spawn } from "node:child_process";
import { readEnv, isLoopback, saveEnv } from "./setup/config";
import { startLocalDatabase } from "./setup/database";

async function main() {
  const env = await readEnv(".env.local");
  if (!env.SUPABASE_URL || !env.APP_PASSWORD || !env.AUTH_SECRET) {
    throw new Error("First run? Use bun run setup to configure your database and app login.");
  }
  if (isLoopback(env.SUPABASE_URL)) {
    await saveEnv(".env.local", await startLocalDatabase());
  } else {
    console.log("Using the hosted Supabase configured in .env.local. Docker is not needed.");
  }
  // Only override the DB credentials here. Let Bun/Next handle dotenv expansion
  // for other existing settings, such as passwords containing escaped dollars.
  const selected = await readEnv(".env.local");
  const child = spawn("next", ["dev", "-H", "127.0.0.1", ...process.argv.slice(2)], {
    stdio: "inherit", env: { ...process.env, SUPABASE_URL: selected.SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: selected.SUPABASE_SERVICE_ROLE_KEY },
  });
  child.on("error", () => { console.error("Cannot start Next.js. Run bun install first."); process.exitCode = 1; });
  child.on("exit", code => { process.exitCode = code ?? 0; });
  for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, () => child.kill(signal));
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
