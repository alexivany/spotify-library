#!/usr/bin/env bun
/**
 * One-off sync runner used for manual monitoring. Calls runSync() in this
 * process so all `[spotify] 429 ...` / `[sync] ...` console output is captured
 * here (the dev-server route logs to its own stdout, which we can't tail).
 */
import { runSync } from "../lib/spotify/sync";

const t0 = Date.now();
try {
  const counts = await runSync();
  console.log(`[run-sync-once] SUCCESS in ${((Date.now() - t0) / 1000).toFixed(1)}s`, JSON.stringify(counts));
  process.exit(0);
} catch (error) {
  console.error(
    `[run-sync-once] FAILED in ${((Date.now() - t0) / 1000).toFixed(1)}s:`,
    error instanceof Error ? error.message : String(error),
  );
  process.exit(1);
}
