import { getSupabaseServerClient } from "@/lib/supabase/server";
import {
  ALBUM_TYPES,
  DEFAULT_PAGE_SIZE,
  SORT_OPTIONS,
  type AlbumType,
  type LibraryAlbumItem,
  type LibraryFilters,
  type LibraryQueryResult,
  type LibraryTrackItem,
  type LibraryView,
  type SortOption,
  type SortKey,
} from "./types";

type RawSearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function parseList(value: string | string[] | undefined): string[] {
  const raw = first(value);
  return raw ? raw.split(",").filter(Boolean) : [];
}

function parseNumber(value: string | string[] | undefined): number | undefined {
  const raw = first(value);
  if (!raw) return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

const VALID_SORTS = new Set<SortOption>(SORT_OPTIONS.map(({ value }) => value));

function sortColumnFor(view: LibraryView, key: SortKey): string {
  // Sort by the primary artist credited in the Spotify snapshot, including
  // historical aliases. Display names from
  // the artists table can change independently. Keep this in SQL so the whole
  // filtered library is ordered before pagination.
  if (key === "artist") return "raw->artists->0->>name";
  if (key === "album") return view === "tracks" ? "albums(name)" : "name";
  if (key === "label") return view === "tracks" ? "albums(resolved_label)" : "resolved_label";
  if (key === "release_date" && view === "tracks") return "albums(release_date)";
  return key;
}

export function parseLibraryFilters(searchParams: RawSearchParams): LibraryFilters {
  const view: LibraryView = first(searchParams.view) === "albums" ? "albums" : "tracks";
  const albumTypes = parseList(searchParams.albumType).filter((t): t is AlbumType =>
    ALBUM_TYPES.includes(t as AlbumType),
  );
  const explicitRaw = first(searchParams.explicit);
  const sortRaw = first(searchParams.sort) as SortOption | undefined;

  return {
    view,
    albumTypes,
    genres: parseList(searchParams.genre),
    releaseFrom: first(searchParams.releaseFrom),
    releaseTo: first(searchParams.releaseTo),
    label: first(searchParams.label),
    artistId: first(searchParams.artistId),
    q: first(searchParams.q),
    explicit: explicitRaw === "true" ? true : explicitRaw === "false" ? false : undefined,
    popularityMin: parseNumber(searchParams.popularityMin),
    popularityMax: parseNumber(searchParams.popularityMax),
    durationMinMs: parseNumber(searchParams.durationMinMs),
    durationMaxMs: parseNumber(searchParams.durationMaxMs),
    savedFrom: first(searchParams.savedFrom),
    savedTo: first(searchParams.savedTo),
    folderId: first(searchParams.folder),
    tagId: first(searchParams.tag),
    sort: sortRaw && VALID_SORTS.has(sortRaw) ? sortRaw : "saved_at-desc",
    page: Math.max(1, parseNumber(searchParams.page) ?? 1),
    pageSize: parseNumber(searchParams.pageSize) ?? DEFAULT_PAGE_SIZE,
  };
}

function escapeIlike(value: string): string {
  return value.replace(/[%_]/g, (c) => `\\${c}`);
}

async function resolveFolderIds(view: LibraryView, folderId: string): Promise<string[]> {
  const supabase = getSupabaseServerClient();
  const itemType = view === "tracks" ? "track" : "album";
  const { data, error } = await supabase
    .from("folder_items")
    .select("item_id")
    .eq("folder_id", folderId)
    .eq("item_type", itemType);
  if (error) throw new Error(`Failed to resolve folder filter: ${error.message}`);
  return (data ?? []).map((row) => row.item_id);
}

async function resolveTagIds(view: LibraryView, tagId: string): Promise<string[]> {
  const supabase = getSupabaseServerClient();
  const itemType = view === "tracks" ? "track" : "album";
  const { data, error } = await supabase
    .from("item_tags")
    .select("item_id")
    .eq("tag_id", tagId)
    .eq("item_type", itemType);
  if (error) throw new Error(`Failed to resolve tag filter: ${error.message}`);
  return (data ?? []).map((row) => row.item_id);
}

async function resolveArtistIds(view: LibraryView, artistId: string): Promise<string[]> {
  const supabase = getSupabaseServerClient();
  if (view === "tracks") {
    const { data, error } = await supabase.from("track_artists").select("track_id").eq("artist_id", artistId);
    if (error) throw new Error(`Failed to resolve artist filter: ${error.message}`);
    return (data ?? []).map((row) => row.track_id);
  }
  const { data, error } = await supabase.from("album_artists").select("album_id").eq("artist_id", artistId);
  if (error) throw new Error(`Failed to resolve artist filter: ${error.message}`);
  return (data ?? []).map((row) => row.album_id);
}

async function resolveSearchIds(view: LibraryView, q: string): Promise<string[]> {
  const supabase = getSupabaseServerClient();
  const pattern = `%${escapeIlike(q)}%`;
  const ids = new Set<string>();

  if (view === "tracks") {
    const [byName, byAlbum, byArtist] = await Promise.all([
      supabase.from("tracks").select("id").ilike("name", pattern),
      supabase.from("tracks").select("id, albums!inner(name)").ilike("albums.name", pattern),
      supabase.from("track_artists").select("track_id, artists!inner(name)").ilike("artists.name", pattern),
    ]);
    for (const row of byName.data ?? []) ids.add(row.id);
    for (const row of byAlbum.data ?? []) ids.add(row.id);
    for (const row of byArtist.data ?? []) ids.add(row.track_id);
  } else {
    const [byName, byArtist] = await Promise.all([
      supabase.from("albums").select("id").ilike("name", pattern),
      supabase.from("album_artists").select("album_id, artists!inner(name)").ilike("artists.name", pattern),
    ]);
    for (const row of byName.data ?? []) ids.add(row.id);
    for (const row of byArtist.data ?? []) ids.add(row.album_id);
  }

  return [...ids];
}

const NO_MATCH_SENTINEL = "00000000-0000-0000-0000-000000000000";

async function intersectIdFilter(
  currentIds: string[] | undefined,
  resolver: () => Promise<string[]>,
): Promise<string[]> {
  const resolved = await resolver();
  if (currentIds === undefined) return resolved.length ? resolved : [NO_MATCH_SENTINEL];
  const resolvedSet = new Set(resolved);
  const intersected = currentIds.filter((id) => resolvedSet.has(id));
  return intersected.length ? intersected : [NO_MATCH_SENTINEL];
}

export async function queryLibrary(
  filters: LibraryFilters,
): Promise<LibraryQueryResult<LibraryTrackItem | LibraryAlbumItem>> {
  return filters.view === "tracks" ? queryTracks(filters) : queryAlbums(filters);
}

// Genre is deliberately NOT resolved here. The album_genres/track_genres views
// union artists.genres with albums.musicbrainz_genres, but Spotify deprecated
// artist genres so that half is permanently empty — genres come only from
// albums.musicbrainz_genres. Resolving genre to an id list and passing it via
// `.in("id", ...)` overflowed PostgREST's URI length limit ("URI too long")
// once enrichment populated genres for thousands of albums. Instead each query
// builder filters musicbrainz_genres directly with `overlaps` (a column
// predicate, ANDed server-side), which composes with these id filters.
async function resolveIdFilter(filters: LibraryFilters): Promise<string[] | undefined> {
  let ids: string[] | undefined;
  if (filters.folderId) {
    ids = await intersectIdFilter(ids, () => resolveFolderIds(filters.view, filters.folderId!));
  }
  if (filters.tagId) {
    ids = await intersectIdFilter(ids, () => resolveTagIds(filters.view, filters.tagId!));
  }
  if (filters.artistId) {
    ids = await intersectIdFilter(ids, () => resolveArtistIds(filters.view, filters.artistId!));
  }
  if (filters.q) {
    ids = await intersectIdFilter(ids, () => resolveSearchIds(filters.view, filters.q!));
  }
  return ids;
}

async function queryTracks(filters: LibraryFilters): Promise<LibraryQueryResult<LibraryTrackItem>> {
  const supabase = getSupabaseServerClient();

  let query = supabase
    .from("tracks")
    .select(
      `id,name,duration_ms,explicit,popularity,saved_at,preview_url,
       albums!inner(id,name,album_type,release_date,resolved_label,image_url,musicbrainz_genres),
       track_artists(position,artists(id,name))`,
      { count: "exact" },
    )
    .not("saved_at", "is", null);

  if (filters.albumTypes.length > 0) query = query.in("albums.album_type", filters.albumTypes);
  if (filters.label) query = query.ilike("albums.resolved_label", `%${escapeIlike(filters.label)}%`);
  if (filters.releaseFrom) query = query.gte("albums.release_date", filters.releaseFrom);
  if (filters.releaseTo) query = query.lte("albums.release_date", filters.releaseTo);
  if (filters.explicit !== undefined) query = query.eq("explicit", filters.explicit);
  if (filters.popularityMin !== undefined) query = query.gte("popularity", filters.popularityMin);
  if (filters.popularityMax !== undefined) query = query.lte("popularity", filters.popularityMax);
  if (filters.durationMinMs !== undefined) query = query.gte("duration_ms", filters.durationMinMs);
  if (filters.durationMaxMs !== undefined) query = query.lte("duration_ms", filters.durationMaxMs);
  if (filters.savedFrom) query = query.gte("saved_at", filters.savedFrom);
  if (filters.savedTo) query = query.lte("saved_at", filters.savedTo);
  if (filters.genres.length > 0) query = query.overlaps("albums.musicbrainz_genres", filters.genres);

  const idFilter = await resolveIdFilter(filters);
  if (idFilter) query = query.in("id", idFilter);

  const [sortKey, sortDirection] = filters.sort.split("-") as [SortKey, "asc" | "desc"];
  const ascending = sortDirection === "asc";
  const sortColumn = sortColumnFor("tracks", sortKey);
  query = query.order(sortColumn, { ascending, nullsFirst: false });
  if (sortColumn !== "name") query = query.order("name", { ascending: true });
  query = query.order("id", { ascending: true });

  const from = (filters.page - 1) * filters.pageSize;
  const to = from + filters.pageSize - 1;
  query = query.range(from, to);

  const { data, error, count } = await query;
  if (error) throw new Error(`Failed to query tracks: ${error.message}`);

  const items: LibraryTrackItem[] = (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    duration_ms: row.duration_ms,
    explicit: row.explicit,
    popularity: row.popularity,
    saved_at: row.saved_at,
    preview_url: row.preview_url,
    album: row.albums
      ? {
          id: row.albums.id,
          name: row.albums.name,
          album_type: row.albums.album_type,
          release_date: row.albums.release_date,
          label: row.albums.resolved_label,
          image_url: row.albums.image_url,
          genres: row.albums.musicbrainz_genres ?? [],
        }
      : null,
    artists: (row.track_artists ?? [])
      .slice()
      .sort((a, b) => a.position - b.position)
      .map((ta) => ta.artists)
      .filter((a): a is { id: string; name: string } => a !== null),
  }));

  return { items, total: count ?? 0, page: filters.page, pageSize: filters.pageSize };
}

async function queryAlbums(filters: LibraryFilters): Promise<LibraryQueryResult<LibraryAlbumItem>> {
  const supabase = getSupabaseServerClient();

  let query = supabase
    .from("albums")
    .select(
      `id,name,album_type,release_date,release_date_precision,resolved_label,total_tracks,popularity,image_url,saved_at,musicbrainz_genres,
       album_artists(position,artists(id,name))`,
      { count: "exact" },
    )
    .not("saved_at", "is", null);

  if (filters.albumTypes.length > 0) query = query.in("album_type", filters.albumTypes);
  if (filters.label) query = query.ilike("resolved_label", `%${escapeIlike(filters.label)}%`);
  if (filters.releaseFrom) query = query.gte("release_date", filters.releaseFrom);
  if (filters.releaseTo) query = query.lte("release_date", filters.releaseTo);
  if (filters.popularityMin !== undefined) query = query.gte("popularity", filters.popularityMin);
  if (filters.popularityMax !== undefined) query = query.lte("popularity", filters.popularityMax);
  if (filters.savedFrom) query = query.gte("saved_at", filters.savedFrom);
  if (filters.savedTo) query = query.lte("saved_at", filters.savedTo);
  if (filters.genres.length > 0) query = query.overlaps("musicbrainz_genres", filters.genres);

  const idFilter = await resolveIdFilter(filters);
  if (idFilter) query = query.in("id", idFilter);

  const [sortKey, sortDirection] = filters.sort.split("-") as [SortKey, "asc" | "desc"];
  const ascending = sortDirection === "asc";
  const sortColumn = sortColumnFor("albums", sortKey);
  query = query.order(sortColumn, { ascending, nullsFirst: false });
  if (sortColumn !== "name") query = query.order("name", { ascending: true });
  query = query.order("id", { ascending: true });

  const from = (filters.page - 1) * filters.pageSize;
  const to = from + filters.pageSize - 1;
  query = query.range(from, to);

  const { data, error, count } = await query;
  if (error) throw new Error(`Failed to query albums: ${error.message}`);

  const items: LibraryAlbumItem[] = (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    album_type: row.album_type,
    release_date: row.release_date,
    release_date_precision: row.release_date_precision,
    label: row.resolved_label,
    total_tracks: row.total_tracks,
    popularity: row.popularity,
    image_url: row.image_url,
    saved_at: row.saved_at,
    genres: row.musicbrainz_genres ?? [],
    artists: (row.album_artists ?? [])
      .slice()
      .sort((a, b) => a.position - b.position)
      .map((aa) => aa.artists)
      .filter((a): a is { id: string; name: string } => a !== null),
  }));

  return { items, total: count ?? 0, page: filters.page, pageSize: filters.pageSize };
}

export async function getAvailableGenres(): Promise<string[]> {
  const supabase = getSupabaseServerClient();
  const [artistGenres, albumGenres] = await Promise.all([
    supabase.from("artists").select("genres"),
    supabase.from("albums").select("musicbrainz_genres").not("saved_at", "is", null),
  ]);
  if (artistGenres.error) throw new Error(`Failed to load genres: ${artistGenres.error.message}`);
  if (albumGenres.error) throw new Error(`Failed to load genres: ${albumGenres.error.message}`);

  const genres = new Set<string>();
  for (const row of artistGenres.data ?? []) {
    for (const genre of row.genres ?? []) genres.add(genre);
  }
  for (const row of albumGenres.data ?? []) {
    for (const genre of row.musicbrainz_genres ?? []) genres.add(genre);
  }
  return [...genres].sort();
}

export async function getAvailableLabels(): Promise<string[]> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("albums")
    .select("resolved_label")
    .not("resolved_label", "is", null)
    .not("saved_at", "is", null);
  if (error) throw new Error(`Failed to load labels: ${error.message}`);
  const labels = new Set<string>();
  for (const row of data ?? []) {
    if (row.resolved_label) labels.add(row.resolved_label);
  }
  return [...labels].sort();
}

const EXPORT_PAGE_SIZE = 1000; // matches Supabase's default PostgREST `max_rows`

/** Fetches every row matching `filters`, ignoring pagination — used for CSV export. */
export async function queryAllLibraryItems(
  filters: LibraryFilters,
): Promise<(LibraryTrackItem | LibraryAlbumItem)[]> {
  const all: (LibraryTrackItem | LibraryAlbumItem)[] = [];
  let page = 1;
  for (;;) {
    const { items } = await queryLibrary({ ...filters, page, pageSize: EXPORT_PAGE_SIZE });
    all.push(...items);
    if (items.length < EXPORT_PAGE_SIZE) break;
    page += 1;
  }
  return all;
}
