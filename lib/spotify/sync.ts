import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/types";
import { chunk, spotifyFetch } from "./client";
import type {
  SpotifyAlbum,
  SpotifyAlbumsResponse,
  SpotifyArtist,
  SpotifyArtistsResponse,
  SpotifyPagingObject,
  SpotifySavedAlbum,
  SpotifySavedTrack,
} from "./types";

/** Spotify API responses are plain JSON but don't structurally satisfy the generated `Json` type. */
function asJson(value: unknown): Json {
  return value as Json;
}

const PAGE_LIMIT = 50;
const ARTIST_BATCH_SIZE = 50;
const ALBUM_BATCH_SIZE = 20;

export interface SyncCounts {
  savedTracks: number;
  savedAlbums: number;
  artists: number;
  albums: number;
  tracksUnsaved: number;
  albumsUnsaved: number;
}

export async function runSync(): Promise<SyncCounts> {
  const supabase = getSupabaseServerClient();

  const { data: run, error: insertError } = await supabase
    .from("sync_runs")
    .insert({ status: "running" })
    .select()
    .single();
  if (insertError || !run) {
    throw new Error(`Failed to create sync_runs row: ${insertError?.message}`);
  }

  try {
    const counts = await performSync();
    await supabase
      .from("sync_runs")
      .update({ status: "success", finished_at: new Date().toISOString(), counts: asJson(counts) })
      .eq("id", run.id);
    return counts;
  } catch (error) {
    await supabase
      .from("sync_runs")
      .update({
        status: "error",
        finished_at: new Date().toISOString(),
        error: error instanceof Error ? error.message : String(error),
      })
      .eq("id", run.id);
    throw error;
  }
}

async function performSync(): Promise<SyncCounts> {
  const supabase = getSupabaseServerClient();

  const [savedTracks, savedAlbums] = await Promise.all([
    fetchAllSavedTracks(),
    fetchAllSavedAlbums(),
  ]);

  const artistIds = new Set<string>();
  for (const { track } of savedTracks) {
    for (const artist of track.artists) artistIds.add(artist.id);
    for (const artist of track.album.artists) artistIds.add(artist.id);
  }
  for (const { album } of savedAlbums) {
    for (const artist of album.artists) artistIds.add(artist.id);
  }

  const albumIds = new Set<string>();
  for (const { track } of savedTracks) albumIds.add(track.album.id);
  for (const { album } of savedAlbums) albumIds.add(album.id);

  const [artists, albums] = await Promise.all([
    fetchArtistsByIds([...artistIds]),
    fetchAlbumsByIds([...albumIds]),
  ]);

  const savedAlbumMap = new Map(savedAlbums.map((s) => [s.album.id, s.added_at]));

  await upsertArtists(artists);
  await upsertAlbums(albums, savedAlbumMap);
  await upsertAlbumArtists(albums);
  await upsertTracks(savedTracks);
  await upsertTrackArtists(savedTracks);

  const savedTrackIds = savedTracks.map((s) => s.track.id);
  const savedAlbumIds = [...savedAlbumMap.keys()];

  const tracksUnsaved = await reconcileUnsaved(supabase, "tracks", savedTrackIds);
  const albumsUnsaved = await reconcileUnsaved(supabase, "albums", savedAlbumIds);

  return {
    savedTracks: savedTracks.length,
    savedAlbums: savedAlbums.length,
    artists: artists.length,
    albums: albums.length,
    tracksUnsaved,
    albumsUnsaved,
  };
}

async function fetchAllSavedTracks(): Promise<SpotifySavedTrack[]> {
  const items: SpotifySavedTrack[] = [];
  let offset = 0;
  for (;;) {
    const page = await spotifyFetch<SpotifyPagingObject<SpotifySavedTrack>>("/me/tracks", {
      searchParams: { limit: PAGE_LIMIT, offset },
    });
    items.push(...page.items);
    if (page.items.length < PAGE_LIMIT || items.length >= page.total) break;
    offset += PAGE_LIMIT;
  }
  return items;
}

async function fetchAllSavedAlbums(): Promise<SpotifySavedAlbum[]> {
  const items: SpotifySavedAlbum[] = [];
  let offset = 0;
  for (;;) {
    const page = await spotifyFetch<SpotifyPagingObject<SpotifySavedAlbum>>("/me/albums", {
      searchParams: { limit: PAGE_LIMIT, offset },
    });
    items.push(...page.items);
    if (page.items.length < PAGE_LIMIT || items.length >= page.total) break;
    offset += PAGE_LIMIT;
  }
  return items;
}

async function fetchArtistsByIds(ids: string[]): Promise<SpotifyArtist[]> {
  const artists: SpotifyArtist[] = [];
  for (const batch of chunk(ids, ARTIST_BATCH_SIZE)) {
    if (batch.length === 0) continue;
    const res = await spotifyFetch<SpotifyArtistsResponse>("/artists", {
      searchParams: { ids: batch.join(",") },
    });
    artists.push(...res.artists.filter((a): a is SpotifyArtist => a !== null));
  }
  return artists;
}

async function fetchAlbumsByIds(ids: string[]): Promise<SpotifyAlbum[]> {
  const albums: SpotifyAlbum[] = [];
  for (const batch of chunk(ids, ALBUM_BATCH_SIZE)) {
    if (batch.length === 0) continue;
    const res = await spotifyFetch<SpotifyAlbumsResponse>("/albums", {
      searchParams: { ids: batch.join(",") },
    });
    albums.push(...res.albums.filter((a): a is SpotifyAlbum => a !== null));
  }
  return albums;
}

async function upsertArtists(artists: SpotifyArtist[]) {
  if (artists.length === 0) return;
  const supabase = getSupabaseServerClient();
  const rows = artists.map((artist) => ({
    id: artist.id,
    name: artist.name,
    genres: artist.genres,
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

async function upsertAlbumArtists(albums: SpotifyAlbum[]) {
  const rows = albums.flatMap((album) =>
    album.artists.map((artist, position) => ({
      album_id: album.id,
      artist_id: artist.id,
      position,
    })),
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

async function upsertTrackArtists(savedTracks: SpotifySavedTrack[]) {
  const rows = savedTracks.flatMap(({ track }) =>
    track.artists.map((artist, position) => ({
      track_id: track.id,
      artist_id: artist.id,
      position,
    })),
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
async function reconcileUnsaved(
  supabase: ReturnType<typeof getSupabaseServerClient>,
  table: "tracks" | "albums",
  currentIds: string[],
): Promise<number> {
  let query = supabase.from(table).update({ saved_at: null }).not("saved_at", "is", null);
  if (currentIds.length > 0) {
    query = query.not("id", "in", `(${currentIds.map((id) => `"${id}"`).join(",")})`);
  }
  const { data, error } = await query.select("id");
  if (error) throw new Error(`Failed to reconcile ${table}: ${error.message}`);
  return data?.length ?? 0;
}

/** Spotify release dates are truncated to year or month depending on precision; pad to a full date. */
function normalizeReleaseDate(releaseDate: string, precision: string): string {
  if (precision === "day") return releaseDate;
  if (precision === "month") return `${releaseDate}-01`;
  return `${releaseDate}-01-01`;
}
