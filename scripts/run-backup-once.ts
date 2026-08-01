#!/usr/bin/env bun
/**
 * One-off full CSV backup of the current database — the same
 * backupDatabaseToCsv() the sync/enrichment runs invoke on success, exposed
 * for manual on-demand backups. Restore with `bun scripts/restore-backup.ts`.
 */
import { backupDatabaseToCsv } from "../lib/backup/csv";

const t0 = Date.now();
try {
  const { dir, files } = await backupDatabaseToCsv();
  console.log(`[run-backup-once] SUCCESS in ${((Date.now() - t0) / 1000).toFixed(1)}s → ${dir} (${files.length} tables)`);
  process.exit(0);
} catch (error) {
  console.error(
    `[run-backup-once] FAILED in ${((Date.now() - t0) / 1000).toFixed(1)}s:`,
    error instanceof Error ? error.message : String(error),
  );
  process.exit(1);
}
