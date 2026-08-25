import { LogOut } from "lucide-react";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { SyncButton } from "@/components/sync-button";
import { EnrichButton } from "@/components/enrich-button";
import { MobileNav } from "@/components/mobile-nav";
import { Button } from "@/components/ui/button";
import type { Tables } from "@/lib/supabase/types";

type Folder = Pick<Tables<"folders">, "id" | "name">;
type Tag = Pick<Tables<"tags">, "id" | "name">;

function formatSyncCounts(counts: unknown): string | null {
  if (!counts || typeof counts !== "object") return null;
  const c = counts as Record<string, number>;
  if (typeof c.savedTracks !== "number" && typeof c.savedAlbums !== "number") return null;
  return `${c.savedTracks ?? 0} tracks, ${c.savedAlbums ?? 0} albums`;
}

function formatEnrichmentCounts(counts: unknown): string | null {
  if (!counts || typeof counts !== "object") return null;
  const c = counts as Record<string, number>;
  if (typeof c.candidates !== "number") return null;
  return `${c.matched ?? 0}/${c.candidates} matched`;
}

export async function SiteHeader({ folders, tags }: { folders: Folder[]; tags: Tag[] }) {
  const supabase = getSupabaseServerClient();
  const [{ data: lastSync }, { data: lastEnrichment }] = await Promise.all([
    supabase
      .from("sync_runs")
      .select("finished_at, status, counts")
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("enrichment_runs")
      .select("finished_at, status, counts")
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const syncCountsLabel = lastSync ? formatSyncCounts(lastSync.counts) : null;
  const enrichmentCountsLabel = lastEnrichment ? formatEnrichmentCounts(lastEnrichment.counts) : null;

  return (
    <header className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 bg-background/80 px-4 py-3 backdrop-blur-md sm:px-6 sm:py-3.5">
      <div className="flex min-w-0 items-center gap-2">
        <MobileNav folders={folders} tags={tags} />
        <div className="flex min-w-0 flex-col text-xs text-muted-foreground sm:text-sm">
          {lastSync?.finished_at && (
            <span className="truncate">
              Last synced {new Date(lastSync.finished_at).toLocaleString()}
              {lastSync.status === "error" ? " (failed)" : syncCountsLabel ? ` · ${syncCountsLabel}` : ""}
            </span>
          )}
          {lastEnrichment?.finished_at && (
            <span className="truncate">
              Last enriched {new Date(lastEnrichment.finished_at).toLocaleString()}
              {lastEnrichment.status === "error" ? " (failed)" : enrichmentCountsLabel ? ` · ${enrichmentCountsLabel}` : ""}
            </span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <EnrichButton />
        <SyncButton />
        <form action="/api/auth/logout" method="post">
          <Button type="submit" variant="ghost" size="icon" aria-label="Sign out">
            <LogOut />
          </Button>
        </form>
      </div>
    </header>
  );
}
