import { NextRequest } from "next/server";
import { parseLibraryFilters, queryAllLibraryItems } from "@/lib/library/query";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { toCsv, type CsvColumn } from "@/lib/export/csv";
import type { LibraryAlbumItem, LibraryTrackItem } from "@/lib/library/types";
import { formatDate, formatDuration } from "@/lib/library/format";

interface ExportRow {
  name: string;
  artists: string;
  album: string;
  albumType: string;
  releaseDate: string;
  label: string;
  genres: string;
  duration: string;
  explicit: string;
  totalTracks: string;
  popularity: string;
  savedAt: string;
  folders: string;
  tags: string;
}

const TRACK_COLUMNS: CsvColumn<ExportRow>[] = [
  { header: "Name", value: (r) => r.name },
  { header: "Artist", value: (r) => r.artists },
  { header: "Album", value: (r) => r.album },
  { header: "Content Type", value: (r) => r.albumType },
  { header: "Release Date", value: (r) => r.releaseDate },
  { header: "Label", value: (r) => r.label },
  { header: "Genres", value: (r) => r.genres },
  { header: "Duration", value: (r) => r.duration },
  { header: "Explicit", value: (r) => r.explicit },
  { header: "Popularity", value: (r) => r.popularity },
  { header: "Saved At", value: (r) => r.savedAt },
  { header: "Folders", value: (r) => r.folders },
  { header: "Tags", value: (r) => r.tags },
];

const ALBUM_COLUMNS: CsvColumn<ExportRow>[] = [
  { header: "Name", value: (r) => r.name },
  { header: "Artist", value: (r) => r.artists },
  { header: "Content Type", value: (r) => r.albumType },
  { header: "Release Date", value: (r) => r.releaseDate },
  { header: "Label", value: (r) => r.label },
  { header: "Genres", value: (r) => r.genres },
  { header: "Total Tracks", value: (r) => r.totalTracks },
  { header: "Popularity", value: (r) => r.popularity },
  { header: "Saved At", value: (r) => r.savedAt },
  { header: "Folders", value: (r) => r.folders },
  { header: "Tags", value: (r) => r.tags },
];

const NO_MATCH_SENTINEL = "00000000-0000-0000-0000-000000000000";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const rawParams = Object.fromEntries(url.searchParams.entries());
  const exportAll = rawParams.all === "true";

  const filters = parseLibraryFilters(exportAll ? { view: rawParams.view } : rawParams);
  const items = await queryAllLibraryItems(filters);

  const itemType = filters.view === "tracks" ? "track" : "album";
  const ids = items.map((item) => item.id);
  const supabase = getSupabaseServerClient();

  const [folderRows, tagRows, folders, tags, genreRows] = await Promise.all([
    supabase
      .from("folder_items")
      .select("item_id,folder_id")
      .eq("item_type", itemType)
      .in("item_id", ids.length ? ids : [NO_MATCH_SENTINEL]),
    supabase
      .from("item_tags")
      .select("item_id,tag_id")
      .eq("item_type", itemType)
      .in("item_id", ids.length ? ids : [NO_MATCH_SENTINEL]),
    supabase.from("folders").select("id,name"),
    supabase.from("tags").select("id,name"),
    filters.view === "tracks"
      ? supabase
          .from("track_genres")
          .select("track_id,genres")
          .in("track_id", ids.length ? ids : [NO_MATCH_SENTINEL])
      : supabase
          .from("album_genres")
          .select("album_id,genres")
          .in("album_id", ids.length ? ids : [NO_MATCH_SENTINEL]),
  ]);

  const folderNameById = new Map((folders.data ?? []).map((f) => [f.id, f.name]));
  const tagNameById = new Map((tags.data ?? []).map((t) => [t.id, t.name]));

  const foldersByItem = new Map<string, string[]>();
  for (const row of folderRows.data ?? []) {
    const name = folderNameById.get(row.folder_id) ?? row.folder_id;
    foldersByItem.set(row.item_id, [...(foldersByItem.get(row.item_id) ?? []), name]);
  }
  const tagsByItem = new Map<string, string[]>();
  for (const row of tagRows.data ?? []) {
    const name = tagNameById.get(row.tag_id) ?? row.tag_id;
    tagsByItem.set(row.item_id, [...(tagsByItem.get(row.item_id) ?? []), name]);
  }
  const genresByItem = new Map<string, string[]>();
  for (const row of genreRows.data ?? []) {
    const id = "track_id" in row ? row.track_id : row.album_id;
    if (id) genresByItem.set(id, row.genres ?? []);
  }

  const rows: ExportRow[] = items.map((item) => {
    const artists = "artists" in item ? item.artists.map((a) => a.name).join(", ") : "";
    const isTrack = filters.view === "tracks";
    const track = item as LibraryTrackItem;
    const album = item as LibraryAlbumItem;
    return {
      name: item.name,
      artists,
      album: isTrack ? (track.album?.name ?? "") : "",
      albumType: isTrack ? (track.album?.album_type ?? "") : album.album_type,
      releaseDate: isTrack ? formatDate(track.album?.release_date ?? null) : formatDate(album.release_date),
      label: isTrack ? (track.album?.label ?? "") : (album.label ?? ""),
      genres: (genresByItem.get(item.id) ?? []).join(", "),
      duration: isTrack ? formatDuration(track.duration_ms) : "",
      explicit: isTrack ? String(track.explicit) : "",
      totalTracks: isTrack ? "" : String(album.total_tracks ?? ""),
      popularity: String(item.popularity ?? ""),
      savedAt: formatDate(item.saved_at),
      folders: (foldersByItem.get(item.id) ?? []).join(", "),
      tags: (tagsByItem.get(item.id) ?? []).join(", "),
    };
  });

  const csv = toCsv(rows, filters.view === "tracks" ? TRACK_COLUMNS : ALBUM_COLUMNS);

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filters.view}-export.csv"`,
    },
  });
}
