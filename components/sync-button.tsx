"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function SyncButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSync() {
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/spotify/sync", { method: "POST" });
      const json = res.headers.get("content-type")?.includes("application/json") ? await res.json() : null;
      if (!res.ok || json?.status === "error") {
        throw new Error(json?.error ?? `Sync failed (${res.status})`);
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sync failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      {error && <span className="text-xs text-destructive">{error}</span>}
      <Button size="sm" onClick={handleSync} disabled={pending}>
        {pending ? "Syncing…" : "Sync now"}
      </Button>
    </div>
  );
}
