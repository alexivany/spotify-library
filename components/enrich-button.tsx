"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function EnrichButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleEnrich() {
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/musicbrainz/enrich", { method: "POST" });
      const json = res.headers.get("content-type")?.includes("application/json") ? await res.json() : null;
      if (!res.ok || json?.status === "error") {
        throw new Error(json?.error ?? `Enrichment failed (${res.status})`);
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Enrichment failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      {error && <span className="text-xs text-destructive">{error}</span>}
      <Button size="sm" variant="outline" onClick={handleEnrich} disabled={pending}>
        {pending ? "Enriching…" : "Enrich now"}
      </Button>
    </div>
  );
}
