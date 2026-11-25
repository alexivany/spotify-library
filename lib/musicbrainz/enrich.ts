import { randomUUID } from "node:crypto";
import { backupDatabaseToCsv } from "@/lib/backup/csv";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/types";
import {
  createMusicBrainzClient,
  MusicBrainzChunkBudgetExceededError,
  MusicBrainzUnavailableError,
} from "./client";
import { matchAlbum, type MatchResult } from "./match";

const RETRY_COOLDOWN_DAYS = 7;
const PAGE_SIZE = 100;
// The explicit route limit is 60s. Reserve time for bounded DB finalization.
const CHUNK_TIME_BUDGET_MS = 40_000;
const LEASE_MS = 90_000;
const DB_TIMEOUT_MS = 5_000;

export interface EnrichmentCounts {
  candidates: number;
  matched: number;
  ambiguous: number;
  unmatched: number;
  errors: number;
}

export type EnrichmentOutcome =
  | { status: "success"; counts: EnrichmentCounts }
  | { status: "partial"; counts: EnrichmentCounts }
  | { status: "paused"; retryAfterSeconds: number; message: string };

type Dependencies = {
  supabase?: ReturnType<typeof getSupabaseServerClient>;
  match?: typeof matchAlbum;
  now?: () => number;
  backup?: typeof backupDatabaseToCsv;
};

function restoreCounts(cursor: Json | null): EnrichmentCounts {
  const value = cursor && typeof cursor === "object" && !Array.isArray(cursor) ? cursor : {};
  const count = (key: string) => typeof value[key] === "number" && Number.isFinite(value[key]) ? Math.max(0, value[key] as number) : 0;
  const matched = count("matched"), ambiguous = count("ambiguous"), unmatched = count("unmatched");
  // Old cursors counted attempts. Rebuild the denominator from completed outcomes.
  return { candidates: matched + ambiguous + unmatched, matched, ambiguous, unmatched, errors: count("errors") };
}

function paused(seconds: number, busy = false): EnrichmentOutcome {
  const retryAfterSeconds = Math.max(1, Math.ceil(seconds));
  return {
    status: "paused", retryAfterSeconds,
    message: busy
      ? `Another enrichment request is running. Try again in ${retryAfterSeconds} seconds.`
      : `MusicBrainz is busy. Your progress is saved. Try again in ${retryAfterSeconds} seconds.`,
  };
}

export async function runEnrichment(dependencies: Dependencies = {}): Promise<EnrichmentOutcome> {
  const now = dependencies.now ?? Date.now;
  const deadline = now() + CHUNK_TIME_BUDGET_MS;
  const supabase = dependencies.supabase ?? getSupabaseServerClient();
  const token = randomUUID();
  const timestamp = () => new Date(now()).toISOString();
  const dbSignal = (withinChunk = false) => AbortSignal.timeout(withinChunk ? Math.max(1, Math.min(DB_TIMEOUT_MS, deadline - now())) : DB_TIMEOUT_MS);
  const asJson = (value: EnrichmentCounts) => value as unknown as Json;

  // UPDATE's predicate and row lock make this an atomic claim across instances.
  const { data: lease, error: claimError } = await supabase
    .from("musicbrainz_enrichment_state")
    .update({ lease_token: token, lease_expires_at: new Date(now() + LEASE_MS).toISOString(), heartbeat_at: timestamp() })
    .eq("id", true).lte("lease_expires_at", timestamp()).lte("retry_after", timestamp())
    .select("no_progress_chunks").abortSignal(dbSignal()).maybeSingle();
  if (claimError) throw new Error(`Cannot coordinate MusicBrainz enrichment. Apply the latest database migrations. ${claimError.message}`);
  if (!lease) {
    const { data: state, error } = await supabase.from("musicbrainz_enrichment_state")
      .select("lease_expires_at, retry_after").eq("id", true).abortSignal(dbSignal()).single();
    if (error || !state) throw new Error("MusicBrainz coordination state is unavailable. Apply the latest database migrations.");
    const retryAt = Date.parse(state.retry_after), leaseUntil = Date.parse(state.lease_expires_at);
    return paused((Math.max(retryAt, leaseUntil) - now()) / 1000, leaseUntil > now() && leaseUntil >= retryAt);
  }

  let runId: string | undefined;
  let counts = restoreCounts(null);
  let retryAt = new Date(0).toISOString();
  let noProgressChunks = lease.no_progress_chunks;
  let finishedSuccessfully = false;

  async function heartbeat() {
    const { data, error } = await supabase.from("musicbrainz_enrichment_state")
      .update({ heartbeat_at: timestamp() }).eq("id", true).eq("lease_token", token)
      .select("id").abortSignal(dbSignal(true)).maybeSingle();
    if (error || !data) throw new Error("Lost the MusicBrainz enrichment lease; retry after the current request finishes.");
  }

  async function checkpoint(withinChunk = false) {
    const { error } = await supabase.from("enrichment_runs").update({ cursor: asJson(counts) })
      .eq("id", runId!).abortSignal(dbSignal(withinChunk));
    if (error) throw new Error(`Failed to save enrichment progress: ${error.message}`);
  }

  try {
    // A run may be paused overnight. Its original start time is not a heartbeat.
    // Only the short invocation lease expires; the run and completed albums survive.
    const { data: existing, error } = await supabase.from("enrichment_runs")
      .select("id, cursor").eq("status", "running").order("started_at", { ascending: false })
      .limit(1).abortSignal(dbSignal(true)).maybeSingle();
    if (error) throw new Error(`Failed to load enrichment progress: ${error.message}`);
    if (existing) {
      runId = existing.id;
      counts = restoreCounts(existing.cursor);
    } else {
      const { data: run, error: insertError } = await supabase.from("enrichment_runs")
        .insert({ status: "running" }).select("id").abortSignal(dbSignal(true)).single();
      if (insertError || !run) throw new Error(`Failed to create enrichment run: ${insertError?.message}`);
      runId = run.id;
    }

    const completedBefore = counts.candidates;
    const request = createMusicBrainzClient({ deadline, now });
    const cutoff = new Date(now() - RETRY_COOLDOWN_DAYS * 86_400_000).toISOString();
    let cooldownSeconds = 0;
    let done = false;

    try {
      while (now() < deadline) {
        const { data: albums, error: loadError } = await supabase.from("albums")
          .select("id, name, total_tracks, album_artists(position, artists(name))")
          .not("saved_at", "is", null)
          .or(`musicbrainz_checked_at.is.null,and(musicbrainz_match_status.neq.matched,musicbrainz_checked_at.lt.${cutoff})`)
          .order("id").limit(PAGE_SIZE).abortSignal(dbSignal(true));
        if (loadError) throw new Error(`Failed to load enrichment candidates: ${loadError.message}`);
        if (!albums?.length) { done = true; break; }
        console.log(`[enrich] processing up to ${albums.length} candidate album(s)`);
        for (const album of albums) {
          if (now() >= deadline) throw new MusicBrainzChunkBudgetExceededError();
          const primaryArtistName = (album.album_artists ?? []).slice().sort((a, b) => a.position - b.position)[0]?.artists?.name ?? null;
          const result = await (dependencies.match ?? matchAlbum)({ id: album.id, name: album.name, totalTracks: album.total_tracks, primaryArtistName }, request);
          await persistMatch(album.id, result);
          counts[result.status]++;
          counts.candidates++;
          await checkpoint(true);
          await heartbeat();
        }
        // Re-query the shrinking set, including after short pages, to confirm completion.
      }
    } catch (error) {
      if (error instanceof MusicBrainzUnavailableError) cooldownSeconds = error.retryAfterSeconds;
      else if (!(error instanceof MusicBrainzChunkBudgetExceededError)) throw error;
    }

    const completed = counts.candidates - completedBefore;
    noProgressChunks = completed > 0 || done ? 0 : noProgressChunks + 1;
    if (cooldownSeconds || (!done && completed === 0)) {
      const delay = Math.max(cooldownSeconds, Math.min(900, 60 * 2 ** Math.min(noProgressChunks, 4)));
      retryAt = new Date(now() + delay * 1000).toISOString();
      await checkpoint();
      console.warn(`[enrich] paused for ${delay}s; completed ${completed} album(s) this chunk`);
      return paused(delay);
    }
    if (!done) {
      await checkpoint();
      console.log(`[enrich] chunk saved; completed ${completed} album(s)`);
      return { status: "partial", counts };
    }

    const { error: finishError } = await supabase.from("enrichment_runs")
      .update({ status: "success", finished_at: timestamp(), counts: asJson(counts), cursor: null, error: null })
      .eq("id", runId!).abortSignal(dbSignal());
    if (finishError) throw new Error(`Failed to finish enrichment run: ${finishError.message}`);
    finishedSuccessfully = true;
    console.log(`[enrich] completed; ${counts.matched}/${counts.candidates} albums matched`);
    return { status: "success", counts };
  } catch (error) {
    if (runId) {
      counts.errors++;
      const { error: saveError } = await supabase.from("enrichment_runs")
        .update({ status: "error", finished_at: timestamp(), counts: asJson(counts), cursor: null, error: error instanceof Error ? error.message : String(error) })
        .eq("id", runId!).abortSignal(dbSignal());
      if (saveError) console.error("[enrich] Failed to save run failure; the next invocation can recover after the lease expires.");
    }
    throw error;
  } finally {
    const { data, error } = await supabase.from("musicbrainz_enrichment_state")
      .update({ lease_token: null, lease_expires_at: timestamp(), heartbeat_at: timestamp(), retry_after: retryAt, no_progress_chunks: noProgressChunks })
      .eq("id", true).eq("lease_token", token).select("id").abortSignal(dbSignal()).maybeSingle();
    if (error || !data) throw new Error("Could not save MusicBrainz cooldown state. Wait 90 seconds before trying again.");
    // A local backup can outlive the chunk. Release the work lease first.
    if (finishedSuccessfully && !process.env.VERCEL) {
      try { await (dependencies.backup ?? backupDatabaseToCsv)(); }
      catch { console.warn("[enrich] Local CSV backup failed; enrichment progress is saved in the database."); }
    }
  }

  async function persistMatch(albumId: string, result: MatchResult) {
    const { error } = await supabase.from("albums").update({
      musicbrainz_release_id: result.releaseId, musicbrainz_release_group_id: result.releaseGroupId,
      musicbrainz_label: result.label, musicbrainz_genres: result.genres,
      musicbrainz_match_status: result.status, musicbrainz_match_score: result.score,
      musicbrainz_checked_at: timestamp(),
    }).eq("id", albumId).abortSignal(dbSignal(true));
    if (error) throw new Error(`Failed to persist MusicBrainz match: ${error.message}`);
  }
}
