export interface SpotifyImage {
  url: string;
  height: number | null;
  width: number | null;
}

export interface SpotifySimplifiedArtist {
  id: string;
  name: string;
}

export interface SpotifyArtist extends SpotifySimplifiedArtist {
  genres: string[];
  popularity: number;
  followers: { total: number };
  images: SpotifyImage[];
}

export interface SpotifySimplifiedAlbum {
  id: string;
  name: string;
  album_type: string;
  release_date: string;
  release_date_precision: string;
  total_tracks: number;
  images: SpotifyImage[];
  artists: SpotifySimplifiedArtist[];
}

export interface SpotifyAlbum extends SpotifySimplifiedAlbum {
  label?: string;
  popularity: number;
  external_ids?: { upc?: string; ean?: string; isrc?: string };
}

export interface SpotifyTrack {
  id: string;
  name: string;
  album: SpotifySimplifiedAlbum;
  artists: SpotifySimplifiedArtist[];
  duration_ms: number;
  explicit: boolean;
  popularity: number;
  disc_number: number;
  track_number: number;
  preview_url: string | null;
  external_ids?: { isrc?: string };
}

export interface SpotifyPagingObject<T> {
  items: T[];
  limit: number;
  offset: number;
  total: number;
  next: string | null;
}

export interface SpotifySavedTrack {
  added_at: string;
  track: SpotifyTrack;
}

export interface SpotifySavedAlbum {
  added_at: string;
  album: SpotifyAlbum;
}

export interface SpotifyArtistsResponse {
  artists: (SpotifyArtist | null)[];
}

export interface SpotifyAlbumsResponse {
  albums: (SpotifyAlbum | null)[];
}
