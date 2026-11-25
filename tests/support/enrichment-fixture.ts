import { createClient } from "@supabase/supabase-js";
import type { Database } from "../../lib/supabase/types";

type Row = Record<string, unknown>;

/** Minimal HTTP fixture exercising the real Supabase query builder, never a hosted DB. */
export function enrichmentFixture() {
  const state: Row = { id: true, lease_token: null, lease_expires_at: new Date(0).toISOString(), retry_after: new Date(0).toISOString(), heartbeat_at: new Date(0).toISOString(), no_progress_chunks: 0 };
  const runs: Row[] = [];
  const albums: Row[] = [{ id: "fixture-album", name: "Fixture album", total_tracks: 1, album_artists: [{ position: 0, artists: { name: "Fixture artist" } }], musicbrainz_checked_at: null }];
  const requests: { table: string; method: string; params: URLSearchParams }[] = [];
  let failTable: string | undefined;
  const fetcher = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const table = url.pathname.split("/").at(-1)!;
    const method = init?.method ?? "GET";
    requests.push({ table, method, params: url.searchParams });
    if (table === failTable) return Response.json({ message: "fixture database failure", code: "XX000" }, { status: 500 });
    let rows = table === "musicbrainz_enrichment_state" ? [state] : table === "enrichment_runs" ? runs : table === "albums" ? albums : [];
    if (table === "albums") rows = rows.filter(row => row.musicbrainz_checked_at === null);
    rows = rows.filter(row => [...url.searchParams].every(([key, filter]) => {
      if (filter.startsWith("eq.")) return String(row[key]) === filter.slice(3);
      if (filter.startsWith("lte.")) return String(row[key]) <= filter.slice(4);
      return true;
    }));
    if (method === "PATCH") {
      const patch = JSON.parse(String(init?.body));
      rows.forEach(row => Object.assign(row, patch));
    } else if (method === "POST" && table === "enrichment_runs") {
      const row = { id: `run-${runs.length + 1}`, started_at: new Date().toISOString(), cursor: null, counts: {}, ...JSON.parse(String(init?.body)) };
      runs.push(row); rows = [row];
    }
    if (table === "enrichment_runs" && method === "GET") rows = [...rows].reverse();
    const limit = url.searchParams.get("limit");
    if (limit) rows = rows.slice(0, Number(limit));
    const headers = new Headers(init?.headers);
    if (headers.get("accept")?.includes("application/vnd.pgrst.object")) {
      if (rows.length !== 1) return Response.json({ code: "PGRST116", details: `The result contains ${rows.length} rows`, message: "Expected one row" }, { status: 406 });
      return Response.json(rows[0]);
    }
    return Response.json(rows);
  }) as typeof fetch;
  const client = createClient<Database>("http://fixture.invalid", "fixture-only-key", { global: { fetch: fetcher }, auth: { persistSession: false } });
  return { state, runs, albums, requests, client, fetcher, fail: (table: string) => { failTable = table; } };
}
