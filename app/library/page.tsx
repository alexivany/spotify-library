import { getAvailableGenres, getAvailableLabels, parseLibraryFilters, queryLibrary } from "@/lib/library/query";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { LibraryFilterSidebar } from "./filter-sidebar";
import { ResultsTable } from "./results-table";
import { LibraryPagination } from "./pagination";
import { ViewToggle } from "./view-toggle";

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

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 gap-8 px-6 py-6">
      <aside className="w-64 shrink-0">
        <LibraryFilterSidebar
          filters={filters}
          genres={genres}
          labels={labels}
          folders={foldersRes.data ?? []}
          tags={tagsRes.data ?? []}
        />
      </aside>
      <main className="min-w-0 flex-1 space-y-4">
        <ViewToggle view={filters.view} />
        <ResultsTable view={filters.view} items={items} />
        <LibraryPagination page={page} pageSize={pageSize} total={total} searchParams={toURLSearchParams(sp)} />
      </main>
    </div>
  );
}
