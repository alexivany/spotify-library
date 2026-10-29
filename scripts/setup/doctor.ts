import { createClient } from "@supabase/supabase-js";
import { validateConfig, type Env, type Target } from "./config";

export type Check = { ok: boolean; message: string };

export async function checkSetup(env: Env, target?: Target): Promise<Check[]> {
  const issues = validateConfig(env, target);
  if (issues.length) return issues.map(message => ({ ok: false, message }));
  const results: Check[] = [{ ok: true, message: "Required configuration is present. Secret values are hidden." }];
  const client = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (input, init) => fetch(input, { ...init, redirect: "error", signal: AbortSignal.timeout(15_000) }) },
  });
  // Limit zero validates tables/columns/grants without downloading library data.
  for (const [table, columns] of Object.entries({
    artists: "id", albums: "id,resolved_label,musicbrainz_genres", tracks: "id",
    album_artists: "album_id", track_artists: "track_id", folders: "id",
    folder_items: "folder_id", tags: "id", item_tags: "tag_id",
    sync_runs: "id,cursor", enrichment_runs: "id,cursor",
    album_genres: "album_id", track_genres: "track_id",
  })) {
    try {
      const { error } = await client.from(table).select(columns).limit(0);
      if (error) throw new Error();
    } catch {
      results.push({ ok: false, message: `Database check failed at ${table}. Check the project URL/secret key, project status, Data API, and apply ALL migrations including grants and RLS. See docs/SETUP.md.` });
      break;
    }
  }
  if (results.every(result => result.ok)) results.push({ ok: true, message: "Database API, required tables, views and cursor columns are reachable." });

  if (!env.SPOTIFY_REFRESH_TOKEN) {
    results.push({ ok: false, message: "Spotify is not connected. Run bun run setup:spotify (add --target vercel for .env.vercel)." });
  } else {
    try {
      const tokenResponse = await fetch("https://accounts.spotify.com/api/token", {
        method: "POST", redirect: "error", signal: AbortSignal.timeout(15_000),
        headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: `Basic ${Buffer.from(`${env.SPOTIFY_CLIENT_ID}:${env.SPOTIFY_CLIENT_SECRET}`).toString("base64")}` },
        body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: env.SPOTIFY_REFRESH_TOKEN }),
      });
      const token = await tokenResponse.json();
      if (!tokenResponse.ok || typeof token.access_token !== "string") throw new Error();
      const response = await fetch("https://api.spotify.com/v1/me/tracks?limit=1", {
        redirect: "error", signal: AbortSignal.timeout(15_000), headers: { Authorization: `Bearer ${token.access_token}` },
      });
      await response.body?.cancel();
      const hint = response.status === 403 ? "Check Premium eligibility and Users Management in your Spotify app." :
        response.status === 429 ? "Spotify is rate limited; wait before trying again." : "Reconnect Spotify and check user-library-read permission.";
      results.push({ ok: response.ok, message: response.ok ? "Spotify token and saved-library access work." : `Spotify returned HTTP ${response.status}. ${hint}` });
    } catch { results.push({ ok: false, message: "Spotify credentials could not be verified. Check connectivity, client ID/secret and reconnect with setup:spotify." }); }
  }
  if (!env.MUSICBRAINZ_CONTACT_EMAIL) console.log("Note: MusicBrainz enrichment is optional and needs MUSICBRAINZ_CONTACT_EMAIL before use.");
  return results;
}
