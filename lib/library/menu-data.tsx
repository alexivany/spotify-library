import type { ReactNode } from "react";
import { formatDate, formatDuration } from "@/lib/library/format";
import type { LibraryAlbumItem, LibraryTrackItem } from "@/lib/library/types";

export interface FilterFacet {
  label: string;
  href: string;
}

export interface DetailRow {
  label: string;
  value: ReactNode;
}

export interface MenuData {
  filters: FilterFacet[];
  spotifyUrl: string;
  albumSpotifyUrl?: string;
  details: DetailRow[];
  detailsTitle: string;
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function releaseYear(date: string | null | undefined): string | null {
  if (!date) return null;
  return /^\d{4}$/.test(date.slice(0, 4)) ? date.slice(0, 4) : null;
}

function filterHref(params: Record<string, string>): string {
  return `/library?${new URLSearchParams({ view: "albums", ...params }).toString()}`;
}

function buildFacets(
  artists: { name: string }[],
  label: string | null | undefined,
  releaseDate: string | null | undefined,
  albumType: string | null | undefined,
): FilterFacet[] {
  const facets: FilterFacet[] = [];
  if (label) facets.push({ label: `Label: ${label}`, href: filterHref({ label }) });
  for (const artist of artists) {
    facets.push({ label: `Artist: ${artist.name}`, href: filterHref({ q: artist.name }) });
  }
  const year = releaseYear(releaseDate);
  if (year) facets.push({ label: `Year: ${year}`, href: filterHref({ releaseFrom: `${year}-01-01`, releaseTo: `${year}-12-31` }) });
  if (albumType) facets.push({ label: `Type: ${capitalize(albumType)}`, href: filterHref({ albumType }) });
  return facets;
}

export function buildAlbumMenuData(album: LibraryAlbumItem): MenuData {
  return {
    filters: buildFacets(album.artists, album.label, album.release_date, album.album_type),
    spotifyUrl: `https://open.spotify.com/album/${album.id}`,
    detailsTitle: album.name,
    details: [
      { label: "Artists", value: album.artists.map((a) => a.name).join(", ") || "—" },
      { label: "Type", value: capitalize(album.album_type) },
      { label: "Release date", value: formatDate(album.release_date) },
      { label: "Label", value: album.label ?? "—" },
      { label: "Tracks", value: album.total_tracks !== null ? String(album.total_tracks) : "—" },
      { label: "Saved", value: formatDate(album.saved_at) },
    ],
  };
}

export function buildTrackMenuData(track: LibraryTrackItem): MenuData {
  return {
    filters: buildFacets(track.artists, track.album?.label, track.album?.release_date, track.album?.album_type),
    spotifyUrl: `https://open.spotify.com/track/${track.id}`,
    albumSpotifyUrl: track.album ? `https://open.spotify.com/album/${track.album.id}` : undefined,
    detailsTitle: track.name,
    details: [
      { label: "Artists", value: track.artists.map((a) => a.name).join(", ") || "—" },
      { label: "Album", value: track.album?.name ?? "—" },
      { label: "Duration", value: formatDuration(track.duration_ms) },
      { label: "Explicit", value: track.explicit ? "Yes" : "No" },
      { label: "Label", value: track.album?.label ?? "—" },
      { label: "Saved", value: formatDate(track.saved_at) },
      ...(track.preview_url
        ? [
            {
              label: "Preview",
              value: (
                <a href={track.preview_url} target="_blank" rel="noreferrer" className="underline underline-offset-2">
                  Listen
                </a>
              ),
            },
          ]
        : []),
    ],
  };
}
