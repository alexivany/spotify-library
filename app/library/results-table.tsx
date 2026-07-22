import Image from "next/image";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDate, formatDuration } from "@/lib/library/format";
import type { LibraryAlbumItem, LibraryTrackItem, LibraryView } from "@/lib/library/types";

function ArtistNames({ artists }: { artists: { id: string; name: string }[] }) {
  if (artists.length === 0) return <span className="text-muted-foreground">Unknown artist</span>;
  return <>{artists.map((a) => a.name).join(", ")}</>;
}

function CoverImage({ url, alt }: { url: string | null; alt: string }) {
  if (!url) {
    return <div className="size-10 shrink-0 rounded bg-muted" aria-hidden />;
  }
  return (
    <Image
      src={url}
      alt={alt}
      width={40}
      height={40}
      className="size-10 shrink-0 rounded object-cover"
      unoptimized
    />
  );
}

export function ResultsTable({
  view,
  items,
}: {
  view: LibraryView;
  items: (LibraryTrackItem | LibraryAlbumItem)[];
}) {
  if (items.length === 0) {
    return (
      <div className="rounded-md border border-dashed p-12 text-center text-sm text-muted-foreground">
        No {view} match the current filters.
      </div>
    );
  }

  if (view === "tracks") {
    const tracks = items as LibraryTrackItem[];
    return (
      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12" />
              <TableHead>Track</TableHead>
              <TableHead>Album</TableHead>
              <TableHead>Artist</TableHead>
              <TableHead>Release date</TableHead>
              <TableHead>Label</TableHead>
              <TableHead className="text-right">Duration</TableHead>
              <TableHead className="text-right">Popularity</TableHead>
              <TableHead>Saved</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tracks.map((track) => (
              <TableRow key={track.id}>
                <TableCell>
                  <CoverImage url={track.album?.image_url ?? null} alt={track.album?.name ?? track.name} />
                </TableCell>
                <TableCell className="font-medium">
                  <div className="flex items-center gap-2">
                    {track.name}
                    {track.explicit && (
                      <Badge variant="secondary" className="text-[10px]">
                        E
                      </Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-muted-foreground">{track.album?.name ?? "—"}</TableCell>
                <TableCell className="text-muted-foreground">
                  <ArtistNames artists={track.artists} />
                </TableCell>
                <TableCell className="text-muted-foreground">{formatDate(track.album?.release_date ?? null)}</TableCell>
                <TableCell className="text-muted-foreground">{track.album?.label ?? "—"}</TableCell>
                <TableCell className="text-right text-muted-foreground">{formatDuration(track.duration_ms)}</TableCell>
                <TableCell className="text-right text-muted-foreground">{track.popularity ?? "—"}</TableCell>
                <TableCell className="text-muted-foreground">{formatDate(track.saved_at)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  }

  const albums = items as LibraryAlbumItem[];
  return (
    <div className="overflow-x-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-12" />
            <TableHead>Album</TableHead>
            <TableHead>Artist</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Release date</TableHead>
            <TableHead>Label</TableHead>
            <TableHead className="text-right">Tracks</TableHead>
            <TableHead className="text-right">Popularity</TableHead>
            <TableHead>Saved</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {albums.map((album) => (
            <TableRow key={album.id}>
              <TableCell>
                <CoverImage url={album.image_url} alt={album.name} />
              </TableCell>
              <TableCell className="font-medium">{album.name}</TableCell>
              <TableCell className="text-muted-foreground">
                <ArtistNames artists={album.artists} />
              </TableCell>
              <TableCell className="text-muted-foreground capitalize">{album.album_type}</TableCell>
              <TableCell className="text-muted-foreground">{formatDate(album.release_date)}</TableCell>
              <TableCell className="text-muted-foreground">{album.label ?? "—"}</TableCell>
              <TableCell className="text-right text-muted-foreground">{album.total_tracks ?? "—"}</TableCell>
              <TableCell className="text-right text-muted-foreground">{album.popularity ?? "—"}</TableCell>
              <TableCell className="text-muted-foreground">{formatDate(album.saved_at)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
