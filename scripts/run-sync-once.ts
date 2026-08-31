#!/usr/bin/env bun
/**
 * One-off sync runner used for manual monitoring. Calls runSync() in this
 * process so all `[spotify] 429 ...` / `[sync] ...` console output is captured
 * here (the dev-server route logs to its own stdout, which we can't tail).
 */
import { runSync } from "../lib/spotify/sync";

// A large library can take more than one chunk (see CHUNK_TIME_BUDGET_MS in
// lib/spotify/sync.ts) — keep calling runSync() until it reports "success".
const t0 = Date.now();
try {
  let outcome = await runSync();
  while (outcome.status === "partial") {
    console.log(`[run-sync-once] chunk done at ${((Date.now() - t0) / 1000).toFixed(1)}s, continuing…`);
    outcome = await runSync();
  }
  console.log(`[run-sync-once] SUCCESS in ${((Date.now() - t0) / 1000).toFixed(1)}s`, JSON.stringify(outcome.counts));
  process.exit(0);
} catch (error) {
  console.error(
    `[run-sync-once] FAILED in ${((Date.now() - t0) / 1000).toFixed(1)}s:`,
    error instanceof Error ? error.message : String(error),
  );
  process.exit(1);
}
