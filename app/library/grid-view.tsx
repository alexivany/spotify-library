import Image from "next/image";
import type { LibraryAlbumItem, LibraryTrackItem, LibraryView } from "@/lib/library/types";
import { ItemActions } from "./item-actions";
import { ArtistNames, ExplicitTag } from "./results-table";

interface NamedItem {
  id: string;
  name: string;
}

function GridCoverImage({ url, alt }: { url: string | null; alt: string }) {
  return (
    <div className="relative aspect-square w-full overflow-hidden rounded-md bg-muted shadow-lg">
      {url && (
        <Image
          src={url}
          alt={alt}
          fill
          sizes="(min-width: 1280px) 200px, (min-width: 768px) 22vw, 45vw"
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

  return (
    <div className="flex flex-wrap gap-5">
      {items.map((item) => {
        const track = view === "tracks" ? (item as LibraryTrackItem) : null;
        const album = view === "albums" ? (item as LibraryAlbumItem) : null;
        const coverUrl = track ? (track.album?.image_url ?? null) : (album?.image_url ?? null);
        const subtitle = track
          ? (track.album?.name ?? "—")
          : `${album?.total_tracks ?? "—"} track${album?.total_tracks === 1 ? "" : "s"}`;

        return (
          <div
            key={item.id}
            className="group min-w-0 grow shrink basis-44 space-y-2 rounded-lg p-3 transition-colors hover:bg-white/5 max-w-96"
          >
            <GridCoverImage url={coverUrl} alt={item.name} />
            <div className="space-y-0.5">
              <div className="flex items-center gap-1.5">
                <p className="min-w-0 truncate font-heading text-sm font-bold text-white">{item.name}</p>
                {track?.explicit && <ExplicitTag />}
              </div>
              <p className="truncate text-xs text-muted-foreground">
                <ArtistNames artists={item.artists} />
              </p>
              <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
            </div>
            <ItemActions
              itemType={track ? "track" : "album"}
              itemId={item.id}
              folders={folders}
              tags={tags}
              initialFolderIds={itemFolderIds.get(item.id) ?? []}
              initialTagIds={itemTagIds.get(item.id) ?? []}
              iconOnly
            />
          </div>
        );
      })}
    </div>
  );
}
