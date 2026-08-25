import Image from "next/image";
import type { GridCardSize, LibraryAlbumItem, LibraryTrackItem, LibraryView } from "@/lib/library/types";
import { releaseYear } from "@/lib/library/format";
import { ArtistNames, ExplicitTag, LabelLink, YearLink } from "./results-table";
import { LibraryCardMenu } from "./item-context-menu";
import { buildAlbumMenuData, buildTrackMenuData } from "@/lib/library/menu-data";

interface NamedItem {
  id: string;
  name: string;
}

// Column counts per size are all divisors of DEFAULT_PAGE_SIZE (24, see
// lib/library/types.ts) so a full page always fills complete rows at every
// breakpoint, regardless of which size is selected.
const GRID_COLS_CLASSES: Record<GridCardSize, string> = {
  large: "grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-4",
  medium: "grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8",
  small: "grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-12",
};

const GRID_IMAGE_SIZES: Record<GridCardSize, string> = {
  large: "(min-width: 1024px) 22vw, (min-width: 768px) 30vw, 45vw",
  medium: "(min-width: 1280px) 12vw, (min-width: 1024px) 15vw, (min-width: 768px) 22vw, (min-width: 640px) 30vw, 45vw",
  small: "(min-width: 1280px) 8vw, (min-width: 1024px) 12vw, (min-width: 768px) 15vw, (min-width: 640px) 22vw, 30vw",
};

function GridCoverImage({ url, alt, cardSize }: { url: string | null; alt: string; cardSize: GridCardSize }) {
  return (
    <div className="relative aspect-square w-full overflow-hidden rounded-md bg-muted shadow-lg">
      {url && (
        <Image
          src={url}
          alt={alt}
          fill
          sizes={GRID_IMAGE_SIZES[cardSize]}
          className="object-cover"
          unoptimized
        />
      )}
    </div>
  );
}

export function GridView({
  view,
  items,
  folders,
  tags,
  itemFolderIds,
  itemTagIds,
  cardSize,
}: {
  view: LibraryView;
  items: (LibraryTrackItem | LibraryAlbumItem)[];
  folders: NamedItem[];
  tags: NamedItem[];
  itemFolderIds: Map<string, string[]>;
  itemTagIds: Map<string, string[]>;
  cardSize: GridCardSize;
}) {
  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-white/10 bg-card/40 p-12 text-center text-sm text-muted-foreground">
        No {view} match the current filters.
      </div>
    );
  }

  return (
    <div className={`grid gap-5 ${GRID_COLS_CLASSES[cardSize]}`}>
      {items.map((item) => {
        const track = view === "tracks" ? (item as LibraryTrackItem) : null;
        const album = view === "albums" ? (item as LibraryAlbumItem) : null;
        const coverUrl = track ? (track.album?.image_url ?? null) : (album?.image_url ?? null);
        const subtitle = track
          ? (track.album?.name ?? "—")
          : `${album?.total_tracks ?? "—"} track${album?.total_tracks === 1 ? "" : "s"}`;
        const label = track ? track.album?.label : album?.label;
        const year = releaseYear(track ? track.album?.release_date : album?.release_date);

        const menuData = track ? buildTrackMenuData(track) : buildAlbumMenuData(album!);

        return (
          <LibraryCardMenu
            key={item.id}
            itemType={track ? "track" : "album"}
            itemId={item.id}
            folders={folders}
            tags={tags}
            initialFolderIds={itemFolderIds.get(item.id) ?? []}
            initialTagIds={itemTagIds.get(item.id) ?? []}
            {...menuData}
            className="group min-w-0 space-y-2 rounded-lg p-3 transition-colors hover:bg-white/5"
          >
            <GridCoverImage url={coverUrl} alt={item.name} cardSize={cardSize} />
            <div className="space-y-0.5">
              <div className="flex items-center gap-1.5">
                <p className="min-w-0 truncate font-heading text-sm font-bold text-white">{item.name}</p>
                {track?.explicit && <ExplicitTag />}
              </div>
              <p className="truncate text-xs text-muted-foreground">
                <ArtistNames artists={item.artists} />
              </p>
              <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
              {(label || year) && (
                <p className="truncate text-xs text-muted-foreground">
                  {label && <LabelLink label={label} />}
                  {label && year && " · "}
                  <YearLink year={year} />
                </p>
              )}
            </div>
          </LibraryCardMenu>
        );
      })}
    </div>
  );
}
