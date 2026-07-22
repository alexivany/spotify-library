import Link from "next/link";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { SyncButton } from "@/components/sync-button";

function formatCounts(counts: unknown): string | null {
  if (!counts || typeof counts !== "object") return null;
  const c = counts as Record<string, number>;
  if (typeof c.savedTracks !== "number" && typeof c.savedAlbums !== "number") return null;
  return `${c.savedTracks ?? 0} tracks, ${c.savedAlbums ?? 0} albums`;
}

export async function SiteHeader() {
  const supabase = getSupabaseServerClient();
  const { data: lastRun } = await supabase
    .from("sync_runs")
    .select("finished_at, status, counts")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const countsLabel = lastRun ? formatCounts(lastRun.counts) : null;

  return (
    <header className="border-b">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-3">
        <nav className="flex items-center gap-4 text-sm font-medium">
          <Link href="/library">Library</Link>
          <Link href="/folders">Folders</Link>
          <Link href="/tags">Tags</Link>
        </nav>
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          {lastRun?.finished_at && (
            <span>
              Last synced {new Date(lastRun.finished_at).toLocaleString()}
              {lastRun.status === "error" ? " (failed)" : countsLabel ? ` · ${countsLabel}` : ""}
            </span>
          )}
          <SyncButton />
        </div>
      </div>
    </header>
  );
}
