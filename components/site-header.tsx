import { LogOut } from "lucide-react";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { SyncButton } from "@/components/sync-button";
import { EnrichButton } from "@/components/enrich-button";
import { Button } from "@/components/ui/button";

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

export async function SiteHeader() {
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
    <header className="sticky top-0 z-10 flex items-center justify-between gap-4 bg-background/80 px-6 py-3.5 backdrop-blur-md">
      <div className="flex flex-col text-sm text-muted-foreground">
        {lastSync?.finished_at && (
          <span>
            Last synced {new Date(lastSync.finished_at).toLocaleString()}
            {lastSync.status === "error" ? " (failed)" : syncCountsLabel ? ` · ${syncCountsLabel}` : ""}
          </span>
        )}
        {lastEnrichment?.finished_at && (
          <span>
            Last enriched {new Date(lastEnrichment.finished_at).toLocaleString()}
            {lastEnrichment.status === "error" ? " (failed)" : enrichmentCountsLabel ? ` · ${enrichmentCountsLabel}` : ""}
          </span>
        )}
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
