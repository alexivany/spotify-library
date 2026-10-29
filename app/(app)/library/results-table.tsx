import Image from "next/image";
import Link from "next/link";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDate, formatDuration } from "@/lib/library/format";
import type { LibraryAlbumItem, LibraryTrackItem, LibraryView, SortOption } from "@/lib/library/types";
import { SortableTableHead } from "./sortable-table-head";
import { ItemActions } from "./item-actions";
import { LibraryRowMenu } from "./item-context-menu";
import { buildAlbumMenuData, buildTrackMenuData, filterHref } from "@/lib/library/menu-data";

interface NamedItem {
  id: string;
  name: string;
}

export function ArtistNames({ artists }: { artists: { id: string; name: string }[] }) {
  if (artists.length === 0) return <span className="text-muted-foreground">Unknown artist</span>;
  return (
    <>
      {artists.map((artist, i) => (
        <span key={artist.id}>
          {i > 0 && ", "}
          <Link href={filterHref({ artistId: artist.id })} draggable={false} className="hover:text-white hover:underline">
            {artist.name}
          </Link>
        </span>
      ))}
    </>
  );
}

export function YearLink({ year }: { year: string | null }) {
  if (!year) return null;
  return (
    <Link
      href={filterHref({ releaseFrom: `${year}-01-01`, releaseTo: `${year}-12-31` })}
      draggable={false}
      className="hover:text-white hover:underline"
    >
      {year}
    </Link>
  );
}

export function LabelLink({ label }: { label: string | null | undefined }) {
  if (!label) return <>—</>;
  return (
    <Link href={filterHref({ label })} draggable={false} className="hover:text-white hover:underline">
      {label}
    </Link>
  );
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
  sort,
  searchParams,
  items,
  folders,
  tags,
  itemFolderIds,
  itemTagIds,
}: {
  view: LibraryView;
  sort: SortOption;
  searchParams: URLSearchParams;
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
              <SortableTableHead label="Track" sortKey="name" sort={sort} searchParams={searchParams} />
              <SortableTableHead label="Album" sortKey="album" sort={sort} searchParams={searchParams} className="hidden md:table-cell" />
              <SortableTableHead label="Artist" sortKey="artist" sort={sort} searchParams={searchParams} />
              <SortableTableHead label="Release date" sortKey="release_date" sort={sort} searchParams={searchParams} className="hidden lg:table-cell" />
              <SortableTableHead label="Label" sortKey="label" sort={sort} searchParams={searchParams} className="hidden lg:table-cell" />
              <TableHead className="hidden text-right sm:table-cell">Duration</TableHead>
              <TableHead className="hidden md:table-cell">Saved</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tracks.map((track) => (
              <LibraryRowMenu
                key={track.id}
                itemType="track"
                itemId={track.id}
                folders={folders}
                tags={tags}
                initialFolderIds={itemFolderIds.get(track.id) ?? []}
                initialTagIds={itemTagIds.get(track.id) ?? []}
                {...buildTrackMenuData(track)}
              >
                <TableCell>
                  <CoverImage url={track.album?.image_url ?? null} alt={track.album?.name ?? track.name} />
                </TableCell>
                <TableCell className="font-heading font-medium text-white">
                  <div className="flex items-center gap-2">
                    {track.name}
                    {track.explicit && <ExplicitTag />}
                  </div>
                </TableCell>
                <TableCell className="hidden text-muted-foreground md:table-cell">{track.album?.name ?? "—"}</TableCell>
                <TableCell className="text-muted-foreground">
                  <ArtistNames artists={track.artists} />
                </TableCell>
                <TableCell className="hidden text-muted-foreground lg:table-cell">
                  {formatDate(track.album?.release_date ?? null)}
                </TableCell>
                <TableCell className="hidden text-muted-foreground lg:table-cell">
                  <LabelLink label={track.album?.label} />
                </TableCell>
                <TableCell className="hidden text-right text-muted-foreground sm:table-cell">
                  {formatDuration(track.duration_ms)}
                </TableCell>
                <TableCell className="hidden text-muted-foreground md:table-cell">{formatDate(track.saved_at)}</TableCell>
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
              </LibraryRowMenu>
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
            <SortableTableHead label="Album" sortKey={sort.startsWith("album-") ? "album" : "name"} sort={sort} searchParams={searchParams} />
            <SortableTableHead label="Artist" sortKey="artist" sort={sort} searchParams={searchParams} />
            <TableHead className="hidden md:table-cell">Type</TableHead>
            <SortableTableHead label="Release date" sortKey="release_date" sort={sort} searchParams={searchParams} className="hidden lg:table-cell" />
            <SortableTableHead label="Label" sortKey="label" sort={sort} searchParams={searchParams} className="hidden lg:table-cell" />
            <TableHead className="hidden text-right sm:table-cell">Tracks</TableHead>
            <TableHead className="hidden md:table-cell">Saved</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {albums.map((album) => (
            <LibraryRowMenu
              key={album.id}
              itemType="album"
              itemId={album.id}
              folders={folders}
              tags={tags}
              initialFolderIds={itemFolderIds.get(album.id) ?? []}
              initialTagIds={itemTagIds.get(album.id) ?? []}
              {...buildAlbumMenuData(album)}
            >
              <TableCell>
                <CoverImage url={album.image_url} alt={album.name} />
              </TableCell>
              <TableCell className="font-medium text-white">{album.name}</TableCell>
              <TableCell className="text-muted-foreground">
                <ArtistNames artists={album.artists} />
              </TableCell>
              <TableCell className="hidden text-muted-foreground capitalize md:table-cell">{album.album_type}</TableCell>
              <TableCell className="hidden text-muted-foreground lg:table-cell">{formatDate(album.release_date)}</TableCell>
              <TableCell className="hidden text-muted-foreground lg:table-cell">
                <LabelLink label={album.label} />
              </TableCell>
              <TableCell className="hidden text-right text-muted-foreground sm:table-cell">
                {album.total_tracks ?? "—"}
              </TableCell>
              <TableCell className="hidden text-muted-foreground md:table-cell">{formatDate(album.saved_at)}</TableCell>
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
            </LibraryRowMenu>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
