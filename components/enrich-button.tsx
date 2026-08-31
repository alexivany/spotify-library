"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

// A large backlog can take longer to enrich than a single serverless
// invocation is allowed to run, so the server does one bounded chunk per
// request and reports { status: "partial" } instead of finishing. Loop here
// until it reports "success" — the user just sees one continuous
// "Enriching…" rather than needing to click the button repeatedly.
const MAX_CHUNKS = 50;

export function EnrichButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleEnrich() {
    setPending(true);
    setError(null);
    setProgress(null);
    try {
      for (let chunk = 1; chunk <= MAX_CHUNKS; chunk++) {
        const res = await fetch("/api/musicbrainz/enrich", { method: "POST" });
        const json = res.headers.get("content-type")?.includes("application/json") ? await res.json() : null;
        if (!res.ok || json?.status === "error") {
          throw new Error(json?.error ?? `Enrichment failed (${res.status})`);
        }
        if (json?.status === "success") {
          router.refresh();
          return;
        }
        // status === "partial": more chunks to go.
        setProgress(chunk);
      }
      throw new Error(`Enrichment didn't finish after ${MAX_CHUNKS} chunks — try again`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Enrichment failed");
    } finally {
      setPending(false);
      setProgress(null);
    }
  }

  return (
    <div className="flex items-center gap-2">
      {error && <span className="text-xs text-destructive">{error}</span>}
      <Button size="sm" variant="outline" onClick={handleEnrich} disabled={pending}>
        {pending ? (progress ? `Enriching… (${progress})` : "Enriching…") : "Enrich now"}
      </Button>
    </div>
  );
}
