#!/usr/bin/env bun
/**
 * One-off MusicBrainz enrichment runner for manual monitoring. Calls
 * runEnrichment() in this process so all `[enrich] ...` / `[musicbrainz] ...`
 * console output is captured here (the dev-server route logs to its own
 * stdout, which we can't tail).
 */
import { runEnrichment } from "../lib/musicbrainz/enrich";

// A large backlog can take more than one chunk (see CHUNK_TIME_BUDGET_MS in
// lib/musicbrainz/enrich.ts) — keep calling runEnrichment() until it reports
// "success".
const t0 = Date.now();
try {
  let outcome = await runEnrichment();
  while (outcome.status === "partial") {
    console.log(`[run-enrich-once] chunk done at ${((Date.now() - t0) / 1000).toFixed(1)}s, continuing…`);
    outcome = await runEnrichment();
  }
  if (outcome.status === "paused") {
    console.log(`[run-enrich-once] PAUSED: ${outcome.message}`);
    process.exit(0);
  }
  console.log(`[run-enrich-once] SUCCESS in ${((Date.now() - t0) / 1000).toFixed(1)}s`, JSON.stringify(outcome.counts));
  process.exit(0);
} catch (error) {
  console.error(
    `[run-enrich-once] FAILED in ${((Date.now() - t0) / 1000).toFixed(1)}s:`,
    error instanceof Error ? error.message : String(error),
  );
  process.exit(1);
}
