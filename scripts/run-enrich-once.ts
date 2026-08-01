#!/usr/bin/env bun
/**
 * One-off MusicBrainz enrichment runner for manual monitoring. Calls
 * runEnrichment() in this process so all `[enrich] ...` / `[musicbrainz] ...`
 * console output is captured here (the dev-server route logs to its own
 * stdout, which we can't tail).
 */
import { runEnrichment } from "../lib/musicbrainz/enrich";

const t0 = Date.now();
try {
  const counts = await runEnrichment();
  console.log(`[run-enrich-once] SUCCESS in ${((Date.now() - t0) / 1000).toFixed(1)}s`, JSON.stringify(counts));
  process.exit(0);
} catch (error) {
  console.error(
    `[run-enrich-once] FAILED in ${((Date.now() - t0) / 1000).toFixed(1)}s:`,
    error instanceof Error ? error.message : String(error),
  );
  process.exit(1);
}
