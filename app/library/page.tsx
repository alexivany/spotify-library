import { getAvailableGenres, getAvailableLabels, parseLibraryFilters, queryLibrary } from "@/lib/library/query";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { LibraryFilterSidebar } from "./filter-sidebar";
import { ResultsTable } from "./results-table";
import { LibraryPagination } from "./pagination";
import { ViewToggle } from "./view-toggle";
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
    <div className="mx-auto flex w-full max-w-6xl flex-1 gap-8 px-6 py-6">
      <aside className="w-64 shrink-0">
        <LibraryFilterSidebar filters={filters} genres={genres} labels={labels} folders={folders} tags={tags} />
      </aside>
      <main className="min-w-0 flex-1 space-y-4">
        <div className="flex items-center justify-between">
          <ViewToggle view={filters.view} />
          <ExportLinks view={filters.view} searchParams={toURLSearchParams(sp)} />
        </div>
        <ResultsTable
          view={filters.view}
          items={items}
          folders={folders}
          tags={tags}
          itemFolderIds={itemFolderIds}
          itemTagIds={itemTagIds}
        />
        <LibraryPagination page={page} pageSize={pageSize} total={total} searchParams={toURLSearchParams(sp)} />
      </main>
    </div>
  );
}
