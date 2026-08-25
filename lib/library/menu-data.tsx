import type { ReactNode } from "react";
import Link from "next/link";
import { formatDate, formatDuration, releaseYear } from "@/lib/library/format";
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
  imageUrl: string | null;
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function filterHref(params: Record<string, string>): string {
  return `/library?${new URLSearchParams({ view: "albums", ...params }).toString()}`;
}

function FilterLink({ href, children }: { href: string; children: ReactNode }): ReactNode {
  return (
    <Link href={href} className="hover:text-white hover:underline">
      {children}
    </Link>
  );
}

function joinLinks(items: { key: string; href: string; label: string }[]): ReactNode {
  if (items.length === 0) return "—";
  return items.map((item, i) => (
    <span key={item.key}>
      {i > 0 && ", "}
      <FilterLink href={item.href}>{item.label}</FilterLink>
    </span>
  ));
}

function artistLinks(artists: { id: string; name: string }[]): ReactNode {
  return joinLinks(artists.map((a) => ({ key: a.id, href: filterHref({ artistId: a.id }), label: a.name })));
}

function labelLink(label: string | null | undefined): ReactNode {
  if (!label) return "—";
  return <FilterLink href={filterHref({ label })}>{label}</FilterLink>;
}

function genreLinks(genres: string[]): ReactNode {
  return joinLinks(genres.map((genre) => ({ key: genre, href: filterHref({ genre }), label: genre })));
}

function buildFacets(
  artists: { id: string; name: string }[],
  label: string | null | undefined,
  releaseDate: string | null | undefined,
  albumType: string | null | undefined,
): FilterFacet[] {
  const facets: FilterFacet[] = [];
  if (label) facets.push({ label: `Label: ${label}`, href: filterHref({ label }) });
  for (const artist of artists) {
    facets.push({ label: `Artist: ${artist.name}`, href: filterHref({ artistId: artist.id }) });
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
    imageUrl: album.image_url,
    details: [
      { label: "Artists", value: artistLinks(album.artists) },
      { label: "Type", value: capitalize(album.album_type) },
      { label: "Release date", value: formatDate(album.release_date) },
      { label: "Label", value: labelLink(album.label) },
      { label: "Genres", value: genreLinks(album.genres) },
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
    imageUrl: track.album?.image_url ?? null,
    details: [
      { label: "Artists", value: artistLinks(track.artists) },
      { label: "Album", value: track.album?.name ?? "—" },
      { label: "Duration", value: formatDuration(track.duration_ms) },
      { label: "Explicit", value: track.explicit ? "Yes" : "No" },
      { label: "Label", value: labelLink(track.album?.label) },
      { label: "Genres", value: genreLinks(track.album?.genres ?? []) },
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
