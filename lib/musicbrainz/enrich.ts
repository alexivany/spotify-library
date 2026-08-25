import { backupDatabaseToCsv } from "@/lib/backup/csv";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/types";
import { resetMusicBrainzCircuitBreaker, MusicBrainzUnavailableError } from "./client";
import { matchAlbum, type MatchResult } from "./match";

function asJson(value: unknown): Json {
  return value as Json;
}

const RETRY_COOLDOWN_DAYS = 7;
const PAGE_SIZE = 1000;

// Vercel's function timeout kills the invocation outright, skipping the
// catch block in runEnrichment() below — so a run that gets killed
// mid-flight leaves its enrichment_runs row stuck at status "running"
// forever, with no finished_at, instead of ever reaching "error". Sweep
// those up before starting a new run so the UI's "last enriched" reflects
// reality instead of a row that will never update on its own. 10 minutes is
// comfortably above the 60s maxDuration (Vercel Hobby's ceiling) this route
// runs under.
const STALE_RUN_THRESHOLD_MS = 10 * 60 * 1000;

async function reapStaleEnrichmentRuns(supabase: ReturnType<typeof getSupabaseServerClient>) {
  const staleCutoff = new Date(Date.now() - STALE_RUN_THRESHOLD_MS).toISOString();
  await supabase
    .from("enrichment_runs")
    .update({
      status: "error",
      finished_at: new Date().toISOString(),
      error: "Orphaned: the previous run exceeded Vercel's function timeout and never reported a final status.",
    })
    .eq("status", "running")
    .lt("started_at", staleCutoff);
}

// A handful of unexpected failures (network blips, a transient MusicBrainz
// 5xx that outlasted the client's own retries) is normal over a long run.
// More than this suggests something systemic — e.g. MusicBrainz blocking the
// User-Agent — so abort early with a clear enrichment_runs error rather than
// grinding through hours of failures. A re-run resumes from whatever wasn't
// yet successfully checked.
const MAX_ERRORS_PER_RUN = 20;

export interface EnrichmentCounts {
  candidates: number;
  matched: number;
  ambiguous: number;
  unmatched: number;
  errors: number;
}

export async function runEnrichment(): Promise<EnrichmentCounts> {
  const supabase = getSupabaseServerClient();
  await reapStaleEnrichmentRuns(supabase);

  const { data: run, error: insertError } = await supabase
    .from("enrichment_runs")
    .insert({ status: "running" })
    .select()
    .single();
  if (insertError || !run) {
    throw new Error(`Failed to create enrichment_runs row: ${insertError?.message}`);
  }

  try {
    const counts = await performEnrichment();
    await supabase
      .from("enrichment_runs")
      .update({ status: "success", finished_at: new Date().toISOString(), counts: asJson(counts) })
      .eq("id", run.id);
    try {
      const backup = await backupDatabaseToCsv();
      console.log(`[enrich] CSV backup written to ${backup.dir}`);
    } catch (backupError) {
      console.warn(
        `[enrich] CSV backup failed: ${backupError instanceof Error ? backupError.message : String(backupError)}`,
      );
    }
    return counts;
  } catch (error) {
    await supabase
      .from("enrichment_runs")
      .update({
        status: "error",
        finished_at: new Date().toISOString(),
        error: error instanceof Error ? error.message : String(error),
      })
      .eq("id", run.id);
    throw error;
  }
}

/**
 * Processes every album needing MusicBrainz enrichment: never checked, or
 * checked before but not confidently matched and past the 7-day cooldown.
 * Every conclusive result (matched/ambiguous/unmatched) sets
 * musicbrainz_checked_at, which removes that album from the candidate set —
 * matched rows permanently (excluded by status), the rest until the cooldown
 * next elapses. So repeatedly re-querying from the top of the (shrinking)
 * candidate set, rather than paging with an increasing offset, naturally
 * drains the whole backlog without the classic "offset pagination skips rows
 * as the underlying set shrinks" problem. An album that keeps erroring stays
 * in the set (checked_at untouched) and gets retried each pass, which is what
 * feeds the circuit breaker below.
 */
async function performEnrichment(): Promise<EnrichmentCounts> {
  const supabase = getSupabaseServerClient();
  const counts: EnrichmentCounts = { candidates: 0, matched: 0, ambiguous: 0, unmatched: 0, errors: 0 };
  const cutoffIso = new Date(Date.now() - RETRY_COOLDOWN_DAYS * 24 * 60 * 60 * 1000).toISOString();
  resetMusicBrainzCircuitBreaker();

  for (;;) {
    const { data, error } = await supabase
      .from("albums")
      .select("id, name, total_tracks, album_artists(position, artists(name))")
      .not("saved_at", "is", null)
      .or(`musicbrainz_checked_at.is.null,and(musicbrainz_match_status.neq.matched,musicbrainz_checked_at.lt.${cutoffIso})`)
      .range(0, PAGE_SIZE - 1);
    if (error) throw new Error(`Failed to load enrichment candidates: ${error.message}`);
    if (!data || data.length === 0) break;

    console.log(`[enrich] processing ${data.length} candidate album(s)`);

    for (const row of data) {
      counts.candidates += 1;
      const primaryArtistName =
        (row.album_artists ?? [])
          .slice()
          .sort((a, b) => a.position - b.position)[0]?.artists?.name ?? null;

      try {
        const result = await matchAlbum({
          id: row.id,
          name: row.name,
          totalTracks: row.total_tracks,
          primaryArtistName,
        });
        await persistMatch(row.id, result);
        counts[result.status] += 1;
      } catch (err) {
        if (err instanceof MusicBrainzUnavailableError) {
          console.warn(`[enrich] ${err.message}`);
          throw err;
        }
        counts.errors += 1;
        console.warn(
          `[enrich] Failed to match album ${row.id} (${row.name}): ${err instanceof Error ? err.message : String(err)}`,
        );
        if (counts.errors > MAX_ERRORS_PER_RUN) {
          throw new Error(
            `MusicBrainz enrichment hit ${counts.errors} unexpected errors in this run — aborting rather than ` +
              `continuing to grind through failures. A re-run resumes from whatever wasn't yet checked.`,
          );
        }
      }
    }

    if (data.length < PAGE_SIZE) break;
  }

  return counts;
}

async function persistMatch(albumId: string, result: MatchResult) {
  const supabase = getSupabaseServerClient();
  const { error } = await supabase
    .from("albums")
    .update({
      musicbrainz_release_id: result.releaseId,
      musicbrainz_release_group_id: result.releaseGroupId,
      musicbrainz_label: result.label,
      musicbrainz_genres: result.genres,
      musicbrainz_match_status: result.status,
      musicbrainz_match_score: result.score,
      musicbrainz_checked_at: new Date().toISOString(),
    })
    .eq("id", albumId);
  if (error) throw new Error(`Failed to persist MusicBrainz match for album ${albumId}: ${error.message}`);
}
