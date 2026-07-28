import Image from "next/image";
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
import { ItemActions } from "./item-actions";

interface NamedItem {
  id: string;
  name: string;
}

export function ArtistNames({ artists }: { artists: { id: string; name: string }[] }) {
  if (artists.length === 0) return <span className="text-muted-foreground">Unknown artist</span>;
  return <>{artists.map((a) => a.name).join(", ")}</>;
}

function CoverImage({ url, alt }: { url: string | null; alt: string }) {
  if (!url) {
    return <div className="size-11 shrink-0 rounded-[3px] bg-muted" aria-hidden />;
  }
  return (
    <Image
      src={url}
      alt={alt}
      width={44}
      height={44}
      className="size-11 shrink-0 rounded-[3px] object-cover shadow-sm"
      unoptimized
    />
  );
}

export function ExplicitTag() {
  return (
    <span className="flex size-4 shrink-0 items-center justify-center rounded-[3px] bg-[#a7a7a7] text-[10px] leading-none font-bold text-[#121212]">
      E
    </span>
  );
}

export function ResultsTable({
  view,
  items,
  folders,
  tags,
  itemFolderIds,
  itemTagIds,
}: {
  view: LibraryView;
  items: (LibraryTrackItem | LibraryAlbumItem)[];
  folders: NamedItem[];
  tags: NamedItem[];
  itemFolderIds: Map<string, string[]>;
  itemTagIds: Map<string, string[]>;
}) {
  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-white/10 bg-card/40 p-12 text-center text-sm text-muted-foreground">
        No {view} match the current filters.
      </div>
    );
  }

  if (view === "tracks") {
    const tracks = items as LibraryTrackItem[];
    return (
      <div className="overflow-x-auto">
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
              <TableHead>Saved</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tracks.map((track) => (
              <TableRow key={track.id}>
                <TableCell>
                  <CoverImage url={track.album?.image_url ?? null} alt={track.album?.name ?? track.name} />
                </TableCell>
                <TableCell className="font-heading font-medium text-white">
                  <div className="flex items-center gap-2">
                    {track.name}
                    {track.explicit && <ExplicitTag />}
                  </div>
                </TableCell>
                <TableCell className="text-muted-foreground">{track.album?.name ?? "—"}</TableCell>
                <TableCell className="text-muted-foreground">
                  <ArtistNames artists={track.artists} />
                </TableCell>
                <TableCell className="text-muted-foreground">{formatDate(track.album?.release_date ?? null)}</TableCell>
                <TableCell className="text-muted-foreground">{track.album?.label ?? "—"}</TableCell>
                <TableCell className="text-right text-muted-foreground">{formatDuration(track.duration_ms)}</TableCell>
                <TableCell className="text-muted-foreground">{formatDate(track.saved_at)}</TableCell>
                <TableCell>
                  <ItemActions
                    itemType="track"
                    itemId={track.id}
                    folders={folders}
                    tags={tags}
                    initialFolderIds={itemFolderIds.get(track.id) ?? []}
                    initialTagIds={itemTagIds.get(track.id) ?? []}
                    iconOnly
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  }

  const albums = items as LibraryAlbumItem[];
  return (
    <div className="overflow-x-auto">
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
            <TableHead>Saved</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {albums.map((album) => (
            <TableRow key={album.id}>
              <TableCell>
                <CoverImage url={album.image_url} alt={album.name} />
              </TableCell>
              <TableCell className="font-medium text-white">{album.name}</TableCell>
              <TableCell className="text-muted-foreground">
                <ArtistNames artists={album.artists} />
              </TableCell>
              <TableCell className="text-muted-foreground capitalize">{album.album_type}</TableCell>
              <TableCell className="text-muted-foreground">{formatDate(album.release_date)}</TableCell>
              <TableCell className="text-muted-foreground">{album.label ?? "—"}</TableCell>
              <TableCell className="text-right text-muted-foreground">{album.total_tracks ?? "—"}</TableCell>
              <TableCell className="text-muted-foreground">{formatDate(album.saved_at)}</TableCell>
              <TableCell>
                <ItemActions
                  itemType="album"
                  itemId={album.id}
                  folders={folders}
                  tags={tags}
                  initialFolderIds={itemFolderIds.get(album.id) ?? []}
                  initialTagIds={itemTagIds.get(album.id) ?? []}
                  iconOnly
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
