import { backupDatabaseToCsv } from "@/lib/backup/csv";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/types";
import { chunk, SpotifyApiError, spotifyFetch } from "./client";
import type {
  SpotifyAlbum,
  SpotifyAlbumsResponse,
  SpotifyArtist,
  SpotifyArtistsResponse,
  SpotifyPagingObject,
  SpotifySavedAlbum,
  SpotifySavedTrack,
  SpotifySimplifiedArtist,
} from "./types";

/** Spotify API responses are plain JSON but don't structurally satisfy the generated `Json` type. */
function asJson(value: unknown): Json {
  return value as Json;
}

const PAGE_LIMIT = 50;
const ARTIST_BATCH_SIZE = 50;
const ALBUM_BATCH_SIZE = 20;

// Vercel's function timeout kills the invocation outright, skipping the
// catch block in runSync() below — so a run that gets killed mid-flight
// leaves its sync_runs row stuck at status "running" forever, with no
// finished_at, instead of ever reaching "error". Sweep those up before
// starting a new run so the UI's "last sync" reflects reality instead of a
// row that will never update on its own. 10 minutes is comfortably above
// the 60s maxDuration (Vercel Hobby's ceiling) this route runs under.
const STALE_RUN_THRESHOLD_MS = 10 * 60 * 1000;

async function reapStaleSyncRuns(supabase: ReturnType<typeof getSupabaseServerClient>) {
  const staleCutoff = new Date(Date.now() - STALE_RUN_THRESHOLD_MS).toISOString();
  await supabase
    .from("sync_runs")
    .update({
      status: "error",
      finished_at: new Date().toISOString(),
      error: "Orphaned: the previous run exceeded Vercel's function timeout and never reported a final status.",
      cursor: null,
    })
    .eq("status", "running")
    .lt("started_at", staleCutoff);
}

export interface SyncCounts {
  savedTracks: number;
  savedAlbums: number;
  artists: number;
  albums: number;
  tracksUnsaved: number;
  albumsUnsaved: number;
}

export type SyncOutcome = { status: "success"; counts: SyncCounts } | { status: "partial" };

/**
 * Progress checkpoint persisted to sync_runs.cursor between chunks. A large
 * library can take longer to sync than a single serverless invocation is
 * allowed to run, so performSync() below does as much as fits in one time
 * budget and returns this instead of finishing — the next call to runSync()
 * (another cron tick, or the button firing again) picks up right where this
 * one left off rather than restarting the whole library from scratch.
 */
interface SyncCursor {
  phase: "albums" | "tracks" | "reconcile";
  albumOffset: number;
  trackOffset: number;
  savedAlbumIds: string[];
  savedTrackIds: string[];
  initialArtistCount: number;
  initialAlbumCount: number;
  forbiddenSkipCount: number;
}

// Leaves ~10s of the 60s maxDuration (Vercel Hobby's ceiling) as margin for
// the final DB writes, CSV backup, and response — a chunk that started a
// Spotify fetch just before the budget expired still needs time to land it.
const CHUNK_TIME_BUDGET_MS = 50 * 1000;

export async function runSync(): Promise<SyncOutcome> {
  const supabase = getSupabaseServerClient();
  await reapStaleSyncRuns(supabase);

  const { data: inProgress } = await supabase
    .from("sync_runs")
    .select("id, cursor")
    .eq("status", "running")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let runId: string;
  let cursor: SyncCursor | null;
  if (inProgress) {
    runId = inProgress.id;
    cursor = inProgress.cursor as SyncCursor | null;
  } else {
    const { data: run, error: insertError } = await supabase
      .from("sync_runs")
      .insert({ status: "running" })
      .select()
      .single();
    if (insertError || !run) {
      throw new Error(`Failed to create sync_runs row: ${insertError?.message}`);
    }
    runId = run.id;
    cursor = null;
  }

  try {
    const step = await performSync(cursor);
    if (step.done === false) {
      await supabase.from("sync_runs").update({ cursor: asJson(step.cursor) }).eq("id", runId);
      return { status: "partial" };
    }

    await supabase
      .from("sync_runs")
      .update({
        status: "success",
        finished_at: new Date().toISOString(),
        counts: asJson(step.counts),
        cursor: null,
      })
      .eq("id", runId);
    // A backup failure shouldn't turn a successful sync into a reported
    // failure — log it and move on rather than throwing.
    try {
      const backup = await backupDatabaseToCsv();
      console.log(`[sync] CSV backup written to ${backup.dir}`);
    } catch (backupError) {
      console.warn(
        `[sync] CSV backup failed: ${backupError instanceof Error ? backupError.message : String(backupError)}`,
      );
    }
    return { status: "success", counts: step.counts };
  } catch (error) {
    await supabase
      .from("sync_runs")
      .update({
        status: "error",
        finished_at: new Date().toISOString(),
        error: error instanceof Error ? error.message : String(error),
        cursor: null,
      })
      .eq("id", runId);
    throw error;
  }
}

/**
 * Pages through /me/albums then /me/tracks, upserting each page as soon as
 * it's fetched and enriched — rather than collecting the whole library into
 * memory and writing it all at the end. This means a failure partway through
 * a large library (e.g. Spotify's own transient 5xx errors) still leaves
 * everything synced so far persisted; a re-run just resumes from offset 0
 * and re-upserts (idempotent, so no duplicates — see upsert* below).
 *
 * Albums are processed before tracks so that an album which is *both*
 * directly saved *and* referenced by a liked track gets its real `saved_at`
 * written exactly once (by the albums pass); the tracks pass then only
 * touches albums it hasn't already seen, writing `saved_at: null` for those
 * (referenced but never directly saved).
 *
 * A large library can take longer than CHUNK_TIME_BUDGET_MS to get through —
 * checked between pages, never mid-page — in which case this returns
 * `done: false` with a cursor instead of finishing; the caller persists it
 * and the next invocation resumes from exactly that pagination offset rather
 * than restarting the whole library.
 */
async function performSync(
  resumeFrom: SyncCursor | null,
): Promise<{ done: true; counts: SyncCounts } | { done: false; cursor: SyncCursor }> {
  const supabase = getSupabaseServerClient();
  const deadline = Date.now() + CHUNK_TIME_BUDGET_MS;

  // Artists/albums already in the DB are never re-fetched from Spotify — only
  // their id is needed to skip them, not their (possibly now-stale) data.
  // This saves API requests, but metadata like popularity/genres/label is
  // only ever fetched once and can become stale.
  // Re-derived fresh every chunk rather than persisted in the cursor: it's a
  // cheap paginated read, and it naturally reflects whatever earlier chunks
  // (this run or a prior one) have already upserted.
  const [seenArtistIds, seenAlbumIds] = await Promise.all([
    fetchExistingIds("artists"),
    fetchExistingIds("albums"),
  ]);

  const state: SyncCursor = resumeFrom ?? {
    phase: "albums",
    albumOffset: 0,
    trackOffset: 0,
    savedAlbumIds: [],
    savedTrackIds: [],
    initialArtistCount: seenArtistIds.size,
    initialAlbumCount: seenAlbumIds.size,
    forbiddenSkipCount: 0,
  };
  // recordForbiddenSkip() below mutates this module-level counter; restore it
  // from the cursor so a resumed run keeps counting from where it left off.
  forbiddenSkipCount = state.forbiddenSkipCount;

  if (state.phase === "albums") {
    for (;;) {
      const page = await spotifyFetch<SpotifyPagingObject<SpotifySavedAlbum>>("/me/albums", {
        searchParams: { limit: PAGE_LIMIT, offset: state.albumOffset },
      });
      if (page.items.length > 0) {
        await processSavedAlbumsPage(page.items, seenArtistIds, seenAlbumIds);
        for (const { album } of page.items) state.savedAlbumIds.push(album.id);
      }
      state.forbiddenSkipCount = forbiddenSkipCount;
      console.log(`[sync] albums: ${state.savedAlbumIds.length}/${page.total}`);
      if (page.items.length < PAGE_LIMIT || state.savedAlbumIds.length >= page.total) {
        state.phase = "tracks";
        break;
      }
      state.albumOffset += PAGE_LIMIT;
      if (Date.now() >= deadline) return { done: false, cursor: state };
    }
  }

  if (state.phase === "tracks") {
    for (;;) {
      const page = await spotifyFetch<SpotifyPagingObject<SpotifySavedTrack>>("/me/tracks", {
        searchParams: { limit: PAGE_LIMIT, offset: state.trackOffset },
      });
      if (page.items.length > 0) {
        await processSavedTracksPage(page.items, seenArtistIds, seenAlbumIds);
        for (const { track } of page.items) state.savedTrackIds.push(track.id);
      }
      state.forbiddenSkipCount = forbiddenSkipCount;
      console.log(`[sync] tracks: ${state.savedTrackIds.length}/${page.total}`);
      if (page.items.length < PAGE_LIMIT || state.savedTrackIds.length >= page.total) {
        state.phase = "reconcile";
        break;
      }
      state.trackOffset += PAGE_LIMIT;
      if (Date.now() >= deadline) return { done: false, cursor: state };
    }
  }

  // Only reconcile once both passes have fully completed — this needs the
  // complete current-library id sets, not a partial one from an interrupted run.
  const tracksUnsaved = await reconcileUnsaved(supabase, "tracks", state.savedTrackIds);
  const albumsUnsaved = await reconcileUnsaved(supabase, "albums", state.savedAlbumIds);

  return {
    done: true,
    counts: {
      savedTracks: state.savedTrackIds.length,
      savedAlbums: state.savedAlbumIds.length,
      artists: seenArtistIds.size - state.initialArtistCount,
      albums: seenAlbumIds.size - state.initialAlbumCount,
      tracksUnsaved,
      albumsUnsaved,
    },
  };
}

/** Pages through a table's ids past PostgREST's default max_rows cap. */
async function fetchExistingIds(table: "artists" | "albums"): Promise<Set<string>> {
  const supabase = getSupabaseServerClient();
  const ids = new Set<string>();
  const pageSize = 1000;
  let offset = 0;
  for (;;) {
    const { data, error } = await supabase.from(table).select("id").range(offset, offset + pageSize - 1);
    if (error) throw new Error(`Failed to load existing ${table} ids: ${error.message}`);
    for (const row of data ?? []) ids.add(row.id);
    if (!data || data.length < pageSize) break;
    offset += pageSize;
  }
  return ids;
}

async function processSavedAlbumsPage(
  savedAlbums: SpotifySavedAlbum[],
  seenArtistIds: Set<string>,
  seenAlbumIds: Set<string>,
) {
  const newArtistIds = [...new Set(savedAlbums.flatMap(({ album }) => album.artists.map((a) => a.id)))].filter(
    (id) => !seenArtistIds.has(id),
  );
  const artists = newArtistIds.length ? await fetchArtistsByIds(newArtistIds) : [];
  await upsertArtists(artists);
  for (const artist of artists) seenArtistIds.add(artist.id);

  const newSavedAlbums = savedAlbums.filter(({ album }) => !seenAlbumIds.has(album.id));
  if (newSavedAlbums.length > 0) {
    // /me/albums already embeds the full album object (label, upc, etc.) —
    // no need for a redundant /albums?ids= batch call here.
    const albums = newSavedAlbums.map((s) => s.album);
    const savedAlbumMap = new Map(newSavedAlbums.map((s) => [s.album.id, s.added_at]));
    await upsertAlbums(albums, savedAlbumMap);
    for (const album of albums) seenAlbumIds.add(album.id);
  }

  // Re-link every album in this page to its artists, not just newly-inserted
  // ones. An earlier run may have inserted the album before all its artists
  // were fetchable (e.g. hit a quota wall mid-run), leaving the link
  // permanently missing since an already-seen album is never revisited
  // otherwise. upsertAlbumArtists is an idempotent upsert, so re-linking an
  // already-complete album every run is just a cheap no-op write.
  await upsertAlbumArtists(savedAlbums.map((s) => s.album), seenArtistIds);

  // Skipping already-synced albums above only skips re-fetching their
  // metadata — `saved_at` still needs refreshing for every album in this
  // page (new or not), or an album that's already synced and *still* saved
  // would never get its saved_at re-confirmed on later runs.
  await updateSavedAt(savedAlbums.map((s) => ({ id: s.album.id, savedAt: s.added_at })));
}

async function processSavedTracksPage(
  savedTracks: SpotifySavedTrack[],
  seenArtistIds: Set<string>,
  seenAlbumIds: Set<string>,
) {
  const artistIds = new Set<string>();
  for (const { track } of savedTracks) {
    for (const artist of track.artists) artistIds.add(artist.id);
    for (const artist of track.album.artists) artistIds.add(artist.id);
  }
  const newArtistIds = [...artistIds].filter((id) => !seenArtistIds.has(id));
  const artists = newArtistIds.length ? await fetchArtistsByIds(newArtistIds) : [];
  await upsertArtists(artists);
  for (const artist of artists) seenArtistIds.add(artist.id);

  // /me/tracks only embeds a simplified album (no label/upc) — batch-fetch
  // the full album for any album not already handled by the albums pass.
  const newAlbumIds = [...new Set(savedTracks.map(({ track }) => track.album.id))].filter(
    (id) => !seenAlbumIds.has(id),
  );
  if (newAlbumIds.length > 0) {
    const albums = await fetchAlbumsByIds(newAlbumIds);
    await upsertAlbums(albums, new Map());
    for (const album of albums) seenAlbumIds.add(album.id);
  }

  // Re-link every track's album to its artists this page touches, not just
  // newly-fetched ones — mirrors the albums-pass fix above, for albums only
  // ever seen via this tracks pass (referenced-but-never-directly-saved
  // albums, which the albums pass above never visits).
  const albumsForLinking = [...new Map(savedTracks.map(({ track }) => [track.album.id, track.album])).values()];
  await upsertAlbumArtists(albumsForLinking, seenArtistIds);

  // A track whose album couldn't be fetched at all (batch and individual
  // fallback both failed) would violate the tracks.album_id FK — skip it
  // rather than crashing the whole page.
  const syncableTracks = savedTracks.filter(({ track }) => seenAlbumIds.has(track.album.id));
  for (const { track } of savedTracks) {
    if (!seenAlbumIds.has(track.album.id)) {
      console.warn(`[sync] Skipping track ${track.id} (${track.name}): album ${track.album.id} could not be fetched`);
    }
  }

  await upsertTracks(syncableTracks);
  await upsertTrackArtists(syncableTracks, seenArtistIds);
}

// Spotify sometimes 400s (or 404s) an entire batch lookup when just one id in
// it references delisted/restricted content, instead of returning null for
// that one id. On these statuses, bisect the batch and retry each half,
// recursing down to individual ids only where a failure actually is — this
// isolates a bad id in ~log2(n) extra requests instead of n, keeping the
// extra request volume (and rate-limit exposure) much smaller than retrying
// every id in the batch individually.
const BATCH_FALLBACK_STATUSES = new Set([400, 403, 404]);

// Confirmed against the real API (2026-07-26): a 403 on the plural "several
// artists/albums" endpoint is unconditional — it happens for every id,
// including ones the singular /artists/{id} endpoint fetches fine seconds
// later, and doesn't vary with which ids are in the batch. So bisecting on
// 403 (like 400/404) just re-issues the same doomed batch call at smaller
// sizes. Instead, fall back straight to singular per-id fetches, which are
// unaffected by whatever is blocking the plural endpoint. A ~real~ per-id
// restriction still shows up as a 403 from the singular endpoint itself, and
// that's what actually feeds the forbidden-skip safety net below.
const BATCH_FORBIDDEN_STATUS = 403;

// A handful of individually-skipped ids per sync (genuinely delisted/invalid
// content, or a real per-id 403 from the singular endpoint) is normal. But a
// sync where these pile up into the hundreds or thousands means something
// bigger is wrong — e.g. the token/app itself losing access broadly — and
// continuing would silently drop far more of the library than a few odd
// ids. Once forbidden singular-fetch failures cross this threshold, abort
// the sync instead so it surfaces as a clear sync_runs failure rather than
// quietly missing data — a re-run resumes from whatever was already upserted.
const MAX_FORBIDDEN_SKIPS_PER_SYNC = 20;
let forbiddenSkipCount = 0;

function recordForbiddenSkip(kind: "artist" | "album") {
  forbiddenSkipCount += 1;
  if (forbiddenSkipCount > MAX_FORBIDDEN_SKIPS_PER_SYNC) {
    throw new Error(
      `Spotify returned 403 Forbidden for ${forbiddenSkipCount} ${kind}s in this sync — this looks like ` +
        `app-level rate limiting/throttling rather than individually restricted content. Aborting sync early ` +
        `instead of silently dropping data; wait before retrying.`,
    );
  }
}

async function fetchArtistsByIds(ids: string[]): Promise<SpotifyArtist[]> {
  const artists: SpotifyArtist[] = [];
  for (const batch of chunk(ids, ARTIST_BATCH_SIZE)) {
    if (batch.length === 0) continue;
    artists.push(...(await fetchArtistBatchBisecting(batch)));
  }
  return artists;
}

async function fetchArtistBatchBisecting(ids: string[]): Promise<SpotifyArtist[]> {
  if (ids.length === 0) return [];
  try {
    const res = await spotifyFetch<SpotifyArtistsResponse>("/artists", { searchParams: { ids: ids.join(",") } });
    return res.artists.filter((a): a is SpotifyArtist => a !== null);
  } catch (error) {
    if (!(error instanceof SpotifyApiError) || !BATCH_FALLBACK_STATUSES.has(error.status)) throw error;
    if (error.status === BATCH_FORBIDDEN_STATUS) {
      console.warn(`[sync] Batch artist fetch 403'd for ${ids.length} ids; falling back to singular fetches`);
      return fetchArtistsIndividually(ids);
    }
    if (ids.length === 1) {
      console.warn(`[sync] Skipping artist ${ids[0]} (${error.status}): ${error.message}`);
      return [];
    }
    console.warn(`[sync] Batch artist fetch failed (${error.status}) for ${ids.length} ids; bisecting`);
    const mid = Math.ceil(ids.length / 2);
    const left = await fetchArtistBatchBisecting(ids.slice(0, mid));
    const right = await fetchArtistBatchBisecting(ids.slice(mid));
    return [...left, ...right];
  }
}

async function fetchArtistsIndividually(ids: string[]): Promise<SpotifyArtist[]> {
  const artists: SpotifyArtist[] = [];
  for (const id of ids) {
    try {
      artists.push(await spotifyFetch<SpotifyArtist>(`/artists/${id}`));
    } catch (error) {
      if (!(error instanceof SpotifyApiError) || !BATCH_FALLBACK_STATUSES.has(error.status)) throw error;
      if (error.status === BATCH_FORBIDDEN_STATUS) recordForbiddenSkip("artist");
      console.warn(`[sync] Skipping artist ${id} (${error.status}): ${error.message}`);
    }
  }
  return artists;
}

async function fetchAlbumsByIds(ids: string[]): Promise<SpotifyAlbum[]> {
  const albums: SpotifyAlbum[] = [];
  for (const batch of chunk(ids, ALBUM_BATCH_SIZE)) {
    if (batch.length === 0) continue;
    albums.push(...(await fetchAlbumBatchBisecting(batch)));
  }
  return albums;
}

async function fetchAlbumBatchBisecting(ids: string[]): Promise<SpotifyAlbum[]> {
  if (ids.length === 0) return [];
  try {
    const res = await spotifyFetch<SpotifyAlbumsResponse>("/albums", { searchParams: { ids: ids.join(",") } });
    return res.albums.filter((a): a is SpotifyAlbum => a !== null);
  } catch (error) {
    if (!(error instanceof SpotifyApiError) || !BATCH_FALLBACK_STATUSES.has(error.status)) throw error;
    if (error.status === BATCH_FORBIDDEN_STATUS) {
      console.warn(`[sync] Batch album fetch 403'd for ${ids.length} ids; falling back to singular fetches`);
      return fetchAlbumsIndividually(ids);
    }
    if (ids.length === 1) {
      console.warn(`[sync] Skipping album ${ids[0]} (${error.status}): ${error.message}`);
      return [];
    }
    console.warn(`[sync] Batch album fetch failed (${error.status}) for ${ids.length} ids; bisecting`);
    const mid = Math.ceil(ids.length / 2);
    const left = await fetchAlbumBatchBisecting(ids.slice(0, mid));
    const right = await fetchAlbumBatchBisecting(ids.slice(mid));
    return [...left, ...right];
  }
}

async function fetchAlbumsIndividually(ids: string[]): Promise<SpotifyAlbum[]> {
  const albums: SpotifyAlbum[] = [];
  for (const id of ids) {
    try {
      albums.push(await spotifyFetch<SpotifyAlbum>(`/albums/${id}`));
    } catch (error) {
      if (!(error instanceof SpotifyApiError) || !BATCH_FALLBACK_STATUSES.has(error.status)) throw error;
      if (error.status === BATCH_FORBIDDEN_STATUS) recordForbiddenSkip("album");
      console.warn(`[sync] Skipping album ${id} (${error.status}): ${error.message}`);
    }
  }
  return albums;
}

async function upsertArtists(artists: SpotifyArtist[]) {
  if (artists.length === 0) return;
  const supabase = getSupabaseServerClient();
  const rows = artists.map((artist) => ({
    id: artist.id,
    name: artist.name,
    genres: artist.genres ?? [],
    popularity: artist.popularity,
    followers: artist.followers?.total ?? null,
    image_url: artist.images[0]?.url ?? null,
    raw: asJson(artist),
    updated_at: new Date().toISOString(),
  }));
  for (const batch of chunk(rows, 500)) {
    const { error } = await supabase.from("artists").upsert(batch);
    if (error) throw new Error(`Failed to upsert artists: ${error.message}`);
  }
}

async function upsertAlbums(albums: SpotifyAlbum[], savedAlbumMap: Map<string, string>) {
  if (albums.length === 0) return;
  const supabase = getSupabaseServerClient();
  const rows = albums.map((album) => ({
    id: album.id,
    name: album.name,
    album_type: album.album_type,
    release_date: normalizeReleaseDate(album.release_date, album.release_date_precision),
    release_date_precision: album.release_date_precision,
    label: album.label ?? null,
    total_tracks: album.total_tracks,
    upc: album.external_ids?.upc ?? null,
    popularity: album.popularity,
    image_url: album.images[0]?.url ?? null,
    saved_at: savedAlbumMap.get(album.id) ?? null,
    raw: asJson(album),
    updated_at: new Date().toISOString(),
  }));
  for (const batch of chunk(rows, 500)) {
    const { error } = await supabase.from("albums").upsert(batch);
    if (error) throw new Error(`Failed to upsert albums: ${error.message}`);
  }
}

/**
 * Refreshes just `saved_at` for albums that already exist — used to keep an
 * already-synced album's saved status current without re-writing (or
 * re-fetching) its full metadata. Uses a real UPDATE rather than a
 * partial-column upsert: Postgres validates NOT NULL on the candidate insert
 * row before it even checks for a conflict, so an upsert missing `name`/
 * `album_type` fails with a NOT NULL violation even when every row already
 * exists and the insert branch is never actually taken. Tracks don't need
 * this: they're never skip-optimized, so they're always fully upserted.
 */
async function updateSavedAt(entries: { id: string; savedAt: string }[]) {
  const supabase = getSupabaseServerClient();
  await Promise.all(
    entries.map(async ({ id, savedAt }) => {
      const { error } = await supabase.from("albums").update({ saved_at: savedAt }).eq("id", id);
      if (error) throw new Error(`Failed to refresh saved_at for album ${id}: ${error.message}`);
    }),
  );
}

async function upsertAlbumArtists(
  albums: { id: string; artists: SpotifySimplifiedArtist[] }[],
  knownArtistIds: Set<string>,
) {
  const rows = albums.flatMap((album) =>
    album.artists
      .map((artist, position) => ({
        album_id: album.id,
        artist_id: artist.id,
        position,
      }))
      // An artist not yet fetched/upserted into `artists` (still pending, or
      // permanently unfetchable — see BATCH_FALLBACK_STATUSES) would violate
      // the FK if linked. Safe to skip here: once the artist does land in
      // `artists`, this same call re-runs against the full page every sync
      // and adds the link then.
      .filter((row) => knownArtistIds.has(row.artist_id)),
  );
  if (rows.length === 0) return;
  const supabase = getSupabaseServerClient();
  for (const batch of chunk(rows, 1000)) {
    const { error } = await supabase
      .from("album_artists")
      .upsert(batch, { onConflict: "album_id,artist_id" });
    if (error) throw new Error(`Failed to upsert album_artists: ${error.message}`);
  }
}

async function upsertTracks(savedTracks: SpotifySavedTrack[]) {
  if (savedTracks.length === 0) return;
  const supabase = getSupabaseServerClient();
  const rows = savedTracks.map(({ track, added_at }) => ({
    id: track.id,
    name: track.name,
    album_id: track.album.id,
    duration_ms: track.duration_ms,
    explicit: track.explicit,
    popularity: track.popularity,
    disc_number: track.disc_number,
    track_number: track.track_number,
    isrc: track.external_ids?.isrc ?? null,
    preview_url: track.preview_url,
    saved_at: added_at,
    raw: asJson(track),
    updated_at: new Date().toISOString(),
  }));
  for (const batch of chunk(rows, 500)) {
    const { error } = await supabase.from("tracks").upsert(batch);
    if (error) throw new Error(`Failed to upsert tracks: ${error.message}`);
  }
}

async function upsertTrackArtists(savedTracks: SpotifySavedTrack[], knownArtistIds: Set<string>) {
  const rows = savedTracks.flatMap(({ track }) =>
    track.artists
      .map((artist, position) => ({
        track_id: track.id,
        artist_id: artist.id,
        position,
      }))
      .filter((row) => knownArtistIds.has(row.artist_id)),
  );
  if (rows.length === 0) return;
  const supabase = getSupabaseServerClient();
  for (const batch of chunk(rows, 1000)) {
    const { error } = await supabase
      .from("track_artists")
      .upsert(batch, { onConflict: "track_id,artist_id" });
    if (error) throw new Error(`Failed to upsert track_artists: ${error.message}`);
  }
}

/** Clears `saved_at` for rows no longer present in the current library snapshot. Returns the count cleared. */
/**
 * Marks rows saved_at: null for anything previously saved but no longer
 * present in the current sync. Diffs id sets in JS and updates only the
 * ids that changed, in small `.in(...)` batches, rather than putting the
 * full (up to ~10k-id) current-library list into a `.not("id", "in", ...)`
 * filter — that put every id straight into the request URL and, once the
 * library grew large enough, overflowed Cloudflare's URI length limit
 * ("414 Request-URI Too Large").
 */
async function reconcileUnsaved(
  supabase: ReturnType<typeof getSupabaseServerClient>,
  table: "tracks" | "albums",
  currentIds: string[],
): Promise<number> {
  const currentIdSet = new Set(currentIds);
  const previouslySavedIds = await fetchSavedIds(supabase, table);
  const idsToUnsave = previouslySavedIds.filter((id) => !currentIdSet.has(id));

  for (const batch of chunk(idsToUnsave, 200)) {
    const { error } = await supabase.from(table).update({ saved_at: null }).in("id", batch);
    if (error) throw new Error(`Failed to reconcile ${table}: ${error.message}`);
  }
  return idsToUnsave.length;
}

/** Pages through a table's currently-saved ids past PostgREST's default max_rows cap. */
async function fetchSavedIds(
  supabase: ReturnType<typeof getSupabaseServerClient>,
  table: "tracks" | "albums",
): Promise<string[]> {
  const ids: string[] = [];
  const pageSize = 1000;
  let offset = 0;
  for (;;) {
    const { data, error } = await supabase
      .from(table)
      .select("id")
      .not("saved_at", "is", null)
      .range(offset, offset + pageSize - 1);
    if (error) throw new Error(`Failed to load saved ${table} ids: ${error.message}`);
    for (const row of data ?? []) ids.push(row.id);
    if (!data || data.length < pageSize) break;
    offset += pageSize;
  }
  return ids;
}

/** Spotify release dates are truncated to year or month depending on precision; pad to a full date. */
function normalizeReleaseDate(releaseDate: string, precision: string): string {
  if (precision === "day") return releaseDate;
  if (precision === "month") return `${releaseDate}-01`;
  return `${releaseDate}-01-01`;
}
