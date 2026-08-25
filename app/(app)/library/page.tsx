import { getAvailableGenres, getAvailableLabels, parseLibraryFilters, queryLibrary } from "@/lib/library/query";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { GRID_CARD_SIZES, type GridCardSize, type LibraryDisplay } from "@/lib/library/types";
import { LibraryFilterSidebar } from "./filter-sidebar";
import { ResultsTable } from "./results-table";
import { GridView } from "./grid-view";
import { LibraryPagination } from "./pagination";
import { ViewToggle } from "./view-toggle";
import { DisplayToggle } from "./display-toggle";
import { CardSizeToggle } from "./card-size-toggle";
import { ExportLinks } from "./export-links";

export const dynamic = "force-dynamic";

type RawSearchParams = Record<string, string | string[] | undefined>;

function toURLSearchParams(sp: RawSearchParams): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(sp)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      if (value[0] !== undefined) params.set(key, value[0]);
    } else {
      params.set(key, value);
    }
  }
  return params;
}

export default async function LibraryPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const sp = await searchParams;
  const filters = parseLibraryFilters(sp);
  const displayParam = Array.isArray(sp.display) ? sp.display[0] : sp.display;
  const display: LibraryDisplay = displayParam === "grid" ? "grid" : "list";
  const cardSizeParam = Array.isArray(sp.cardSize) ? sp.cardSize[0] : sp.cardSize;
  const cardSize: GridCardSize = GRID_CARD_SIZES.includes(cardSizeParam as GridCardSize)
    ? (cardSizeParam as GridCardSize)
    : "medium";
  const supabase = getSupabaseServerClient();

  const [{ items, total, page, pageSize }, genres, labels, foldersRes, tagsRes] = await Promise.all([
    queryLibrary(filters),
    getAvailableGenres(),
    getAvailableLabels(),
    supabase.from("folders").select("id,name").order("name"),
    supabase.from("tags").select("id,name").order("name"),
  ]);

  const itemType = filters.view === "tracks" ? "track" : "album";
  const itemIds = items.map((item) => item.id);

  const [folderItemsRes, itemTagsRes] = itemIds.length
    ? await Promise.all([
        supabase.from("folder_items").select("folder_id,item_id").eq("item_type", itemType).in("item_id", itemIds),
        supabase.from("item_tags").select("tag_id,item_id").eq("item_type", itemType).in("item_id", itemIds),
      ])
    : [{ data: [] }, { data: [] }];

  const itemFolderIds = new Map<string, string[]>();
  for (const row of folderItemsRes.data ?? []) {
    itemFolderIds.set(row.item_id, [...(itemFolderIds.get(row.item_id) ?? []), row.folder_id]);
  }
  const itemTagIds = new Map<string, string[]>();
  for (const row of itemTagsRes.data ?? []) {
    itemTagIds.set(row.item_id, [...(itemTagIds.get(row.item_id) ?? []), row.tag_id]);
  }

  const folders = foldersRes.data ?? [];
  const tags = tagsRes.data ?? [];

  return (
    <div className="flex w-full flex-1 gap-6 px-6 pb-6">
      <aside className="shrink-0">
        <LibraryFilterSidebar filters={filters} genres={genres} labels={labels} folders={folders} tags={tags} />
      </aside>
      <main className="min-w-0 flex-1 space-y-5">
        <h1 className="font-heading text-2xl font-extrabold tracking-tight text-white">Your Library</h1>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <ViewToggle view={filters.view} display={display} />
            <DisplayToggle display={display} searchParams={toURLSearchParams(sp)} />
            {display === "grid" && <CardSizeToggle cardSize={cardSize} searchParams={toURLSearchParams(sp)} />}
          </div>
          <ExportLinks view={filters.view} searchParams={toURLSearchParams(sp)} />
        </div>
        {display === "grid" ? (
          <GridView
            view={filters.view}
            items={items}
            folders={folders}
            tags={tags}
            itemFolderIds={itemFolderIds}
            itemTagIds={itemTagIds}
            cardSize={cardSize}
          />
        ) : (
          <ResultsTable
            view={filters.view}
            items={items}
            folders={folders}
            tags={tags}
            itemFolderIds={itemFolderIds}
            itemTagIds={itemTagIds}
          />
        )}
        <LibraryPagination page={page} pageSize={pageSize} total={total} searchParams={toURLSearchParams(sp)} />
      </main>
    </div>
  );
}
