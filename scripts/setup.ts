import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { generatedSecrets, isLoopback, profileFor, readEnv, saveEnv, validateValue, type Target } from "./setup/config";
import { schemaBundle, startLocalDatabase } from "./setup/database";
import { checkSetup } from "./setup/doctor";
import { ask, confirm } from "./setup/prompts";
import { exchangeCode, SETUP_CALLBACK, startSpotifyConnection } from "./setup/spotify";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function main() {
  const { values, positionals } = parseArgs({
    args: process.argv.slice(2), allowPositionals: true,
    options: { target: { type: "string" }, help: { type: "boolean", short: "h" } },
  });
  const command = positionals[0] ?? "wizard";
  if (positionals.length > 1 || !["wizard", "doctor", "spotify", "database", "sql"].includes(command)) throw new Error("Unknown setup command. Run bun run setup --help.");
  if (values.help) {
    console.log(`Spotify Library Manager setup\n\n  bun run setup                       Interactive, resumable setup\n  bun run setup --target local         App + Docker Supabase on your computer\n  bun run setup --target hosted        Local app + your hosted Supabase\n  bun run setup --target vercel        Prepare .env.vercel for private deployment\n  bun run setup:spotify                Connect Spotify; save token without copy/paste\n  bun run setup:doctor                 Validate settings, database and Spotify\n  bun run setup:sql                    Generate SQL for a NEW hosted project\n\nspotify/doctor accept --target vercel to use .env.vercel.\nSaved secrets are never printed. Account signup and deployment steps: docs/SETUP.md.\nAI companion prompt: docs/AI_SETUP.md.`);
    return;
  }
  if (values.target && !["local", "hosted", "vercel"].includes(values.target)) throw new Error("Target must be local, hosted or vercel.");
  if (["wizard", "spotify"].includes(command) && (!process.stdin.isTTY || !process.stdout.isTTY)) {
    throw new Error("Setup needs an interactive terminal. Run this command in your terminal; no settings were changed. See docs/SETUP.md.");
  }
  if (command === "database" && values.target && values.target !== "local") throw new Error("The database command only starts local Docker. Use the wizard for hosted/Vercel setup.");
  process.chdir(root);

  async function writeSchema() {
    await mkdir(path.join(root, "tmp"), { recursive: true });
    await writeFile(path.join(root, "tmp/setup-schema.sql"), await schemaBundle(root));
    console.log("Created tmp/setup-schema.sql. Run the whole file in your NEW, EMPTY Supabase project's SQL Editor. It refuses existing public tables and applies every migration in one transaction. See docs/SETUP.md for upgrades.");
  }
  if (command === "sql") { await writeSchema(); return; }

  let target = values.target as Target | undefined;
  if (!target && command === "wizard") {
    console.log("\nSet up your own Spotify Library Manager\n\n1. Local app + local database (Docker required; no Supabase account)\n2. Local app + hosted Supabase (no Docker)\n3. Private Vercel deployment + hosted Supabase\n\nSpotify currently requires Premium for development-mode app owners.\nCheck https://developer.spotify.com/dashboard before creating other accounts.\nGuide: docs/SETUP.md · Keys belong in this terminal, never in AI chat.\n");
    let choice = "";
    while (!["1", "2", "3"].includes(choice)) choice = await ask("Choose 1, 2 or 3");
    target = ({ "1": "local", "2": "hosted", "3": "vercel" } as const)[choice as "1" | "2" | "3"];
  }
  const file = path.join(root, profileFor(target ?? "local"));
  let env = await readEnv(file);
  const save = async (updates: Record<string, string>) => {
    await saveEnv(file, updates);
    env = await readEnv(file);
  };
  const field = async (key: string, label: string, secret = false, fallback = "", minimum = 1) => {
    for (;;) {
      const answer = await ask(`${label}${env[key] ? " [Enter keeps saved value]" : fallback ? ` [${fallback}]` : ""}`, secret);
      if (!answer && env[key]) return;
      const value = answer || fallback;
      const issue = validateValue(value);
      if (issue || value.length < minimum) { console.log(issue ?? `Enter at least ${minimum} characters.`); continue; }
      await save({ [key]: value });
      return;
    }
  };
  const doctor = async () => {
    console.log(`\nChecking ${path.basename(file)} (reads database metadata and Spotify access; no sync)…`);
    const checks = await checkSetup(env, target);
    checks.forEach(check => console.log(`${check.ok ? "OK" : "FIX"}  ${check.message}`));
    const ready = checks.every(check => check.ok);
    if (!ready) process.exitCode = 1;
    return ready;
  };
  const connect = async () => {
    if (!env.SPOTIFY_CLIENT_ID || !env.SPOTIFY_CLIENT_SECRET) throw new Error("Run bun run setup first to save your Spotify client ID and secret.");
    console.log(`\nIn https://developer.spotify.com/dashboard → your app → Settings, add this exact redirect URI:\n\n  ${SETUP_CALLBACK}\n\nSave it before continuing. This temporary loopback listener does not need the app or database running.\nIt will save the refresh token directly to ${path.basename(file)}.`);
    if (!await confirm("Ready to connect Spotify in your browser?")) { console.log("Skipped. Resume with bun run setup:spotify" + (target === "vercel" ? " --target vercel" : "")); return; }
    const connection = await startSpotifyConnection({
      clientId: env.SPOTIFY_CLIENT_ID,
      exchange: (code, uri) => exchangeCode(env, code, uri),
      saveToken: token => save({ SPOTIFY_REFRESH_TOKEN: token }),
    });
    console.log(`\nOpen this link on THIS computer and approve access to your saved library:\n\n${connection.authorizeUrl}\n\nWaiting up to 10 minutes. Ctrl+C cancels; previously saved settings remain.`);
    await connection.done;
    console.log(`Spotify connected. Refresh token saved privately to ${path.basename(file)}.`);
  };

  if (command === "doctor") { await doctor(); return; }
  if (command === "spotify") { await connect(); return; }
  if (command === "database") {
    if (env.SUPABASE_URL && !isLoopback(env.SUPABASE_URL)) throw new Error("Your .env.local points to hosted Supabase. It was left unchanged. Use bun run dev, or explicitly choose local in bun run setup to switch databases.");
    await save(await startLocalDatabase());
    return;
  }

  console.log(`\nSaving progress to ${path.basename(file)}. Existing values can be kept; changed files get private backups.\n`);
  await save(generatedSecrets(env));
  await field("APP_PASSWORD", "Choose a unique app login password (16+ characters)", true, "", 16);
  console.log("\nSpotify: sign up at https://www.spotify.com/signup if needed.\nOpen https://developer.spotify.com/dashboard, create/reuse an app, select Web API,\nand add the setup redirect URI above plus your app callback below.\nUnder Users Management, allow the Spotify account whose library you will sync.\nCopy Client ID and Client Secret from Settings; do not use your Spotify password.\nSetup redirect: " + SETUP_CALLBACK);
  const oldId = env.SPOTIFY_CLIENT_ID;
  const oldSecret = env.SPOTIFY_CLIENT_SECRET;
  await field("SPOTIFY_CLIENT_ID", "Spotify Client ID", true);
  await field("SPOTIFY_CLIENT_SECRET", "Spotify Client Secret", true);
  if ((oldId && oldId !== env.SPOTIFY_CLIENT_ID) || (oldSecret && oldSecret !== env.SPOTIFY_CLIENT_SECRET)) await save({ SPOTIFY_REFRESH_TOKEN: "" });
  await field("SPOTIFY_REDIRECT_URI", target === "vercel" ? "Stable Vercel HTTPS URL followed by /api/spotify/callback (see docs/SETUP.md)" : "App callback URI", false,
    target === "vercel" ? "" : "http://127.0.0.1:3000/api/spotify/callback");

  if (target === "local") {
    if (env.SUPABASE_URL && !isLoopback(env.SUPABASE_URL) && !await confirm("Replace this profile's hosted database settings with local Docker settings? A backup will be kept")) return;
    console.log("\nStart Docker Desktop (https://www.docker.com/products/docker-desktop/) and install the Supabase CLI:\nhttps://supabase.com/docs/guides/local-development/cli/getting-started\nNo Supabase signup or cloud API key is needed for local Docker mode.");
    if (await confirm("Start local Supabase and apply pending local migrations now?")) await save(await startLocalDatabase());
    else console.log("Run bun run db:setup after installing Docker and the Supabase CLI.");
  } else {
    console.log("\nCreate your own project at https://supabase.com/dashboard (sign up, choose an organization, region and database password).\nUse a NEW project dedicated to this single-user app. Keep the database password in your password manager.\nIn the project's Connect dialog / Settings → API Keys, copy the project URL and a SECRET key.\nUse sb_secret_… (recommended) or the legacy service_role key; NOT the publishable/anon key.\nKeep the Data API enabled with public exposed; migrations lock public roles out of your tables.");
    await field("SUPABASE_URL", "Supabase project URL");
    await field("SUPABASE_SERVICE_ROLE_KEY", "Supabase secret key", true);
    await writeSchema();
    await ask("If this project is new, run tmp/setup-schema.sql in its SQL Editor now. Press Enter when ready (or Ctrl+C to resume later)");
  }
  console.log("\nMusicBrainz enrichment is optional. No account or API key is needed.\nIt sends a contact email in the request User-Agent so MusicBrainz can reach the operator.");
  if (await confirm("Enable MusicBrainz enrichment?")) await field("MUSICBRAINZ_CONTACT_EMAIL", "Contact email for MusicBrainz");
  if (!env.MUSICBRAINZ_MIN_REQUEST_INTERVAL_MS) await save({ MUSICBRAINZ_MIN_REQUEST_INTERVAL_MS: "1100" });
  if (!env.SPOTIFY_REFRESH_TOKEN || await confirm("Replace the saved Spotify connection?")) await connect();
  if (!await doctor()) {
    console.log(`\nProgress saved in ${path.basename(file)}. Resolve the FIX items above, then rerun\nbun run setup --target ${target}. Setup is not complete yet.`);
    return;
  }
  if (target === "vercel") {
    console.log(`\nNext: follow docs/SETUP.md → Deploy privately to Vercel.\nImport ${path.basename(file)} into Production environment variables, enable Vercel Authentication\nfor All Deployments, deploy and verify /login in a private browser window.\nThis wizard prepared settings; it has NOT deployed or uploaded your secrets.\nYour local .env.local was not changed.`);
  } else {
    console.log("\nNext: bun run dev → http://127.0.0.1:3000/login\nEnter your APP_PASSWORD, then click Sync now. Keep the tab open until sync finishes.\nUse bun run setup again to resume or change settings.");
  }
}

main().catch(error => {
  console.error(`\nSetup stopped: ${error instanceof Error ? error.message : "Unexpected setup failure. See docs/SETUP.md."}`);
  process.exitCode = 1;
});
