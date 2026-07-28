export type LibraryView = "tracks" | "albums";
export type LibraryDisplay = "list" | "grid";
export type AlbumType = "album" | "single" | "compilation";

export type SortKey = "saved_at" | "name" | "popularity" | "release_date";
export type SortDirection = "asc" | "desc";
export type SortOption = `${SortKey}-${SortDirection}`;

export const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: "saved_at-desc", label: "Recently saved" },
  { value: "saved_at-asc", label: "Oldest saved" },
  { value: "name-asc", label: "Name (A-Z)" },
  { value: "name-desc", label: "Name (Z-A)" },
  { value: "release_date-desc", label: "Newest release" },
  { value: "release_date-asc", label: "Oldest release" },
  { value: "popularity-desc", label: "Most popular" },
  { value: "popularity-asc", label: "Least popular" },
];

export const ALBUM_TYPES: AlbumType[] = ["album", "single", "compilation"];

export const DEFAULT_PAGE_SIZE = 25;

export interface LibraryFilters {
  view: LibraryView;
  albumTypes: AlbumType[];
  genres: string[];
  releaseFrom?: string;
  releaseTo?: string;
  label?: string;
  q?: string;
  explicit?: boolean;
  popularityMin?: number;
  popularityMax?: number;
  durationMinMs?: number;
  durationMaxMs?: number;
  savedFrom?: string;
  savedTo?: string;
  folderId?: string;
  tagId?: string;
  sort: SortOption;
  page: number;
  pageSize: number;
}

export interface LibraryArtistRef {
  id: string;
  name: string;
}

export interface LibraryTrackItem {
  id: string;
  name: string;
  duration_ms: number | null;
  explicit: boolean;
  popularity: number | null;
  saved_at: string | null;
  preview_url: string | null;
  album: {
    id: string;
    name: string;
    album_type: string;
    release_date: string | null;
    label: string | null;
    image_url: string | null;
  } | null;
  artists: LibraryArtistRef[];
}

export interface LibraryAlbumItem {
  id: string;
  name: string;
  album_type: string;
  release_date: string | null;
  release_date_precision: string | null;
  label: string | null;
  total_tracks: number | null;
  popularity: number | null;
  image_url: string | null;
  saved_at: string | null;
  artists: LibraryArtistRef[];
}

export interface LibraryQueryResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}
