import fs from "node:fs/promises";
import path from "node:path";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

/** Every base table in the schema — mirrors supabase/migrations, not the derived album_genres/track_genres views. */
const BACKUP_TABLES: (keyof Database["public"]["Tables"])[] = [
  "artists",
  "albums",
  "tracks",
  "album_artists",
  "track_artists",
  "folders",
  "folder_items",
  "tags",
  "item_tags",
  "sync_runs",
  "enrichment_runs",
];

const PAGE_SIZE = 1000;

/** Pages through a table past PostgREST's default max_rows cap — same pattern as fetchExistingIds in sync.ts. */
async function fetchAllRows(table: keyof Database["public"]["Tables"]): Promise<Record<string, unknown>[]> {
  const supabase = getSupabaseServerClient();
  const rows: Record<string, unknown>[] = [];
  let offset = 0;
  for (;;) {
    const { data, error } = await supabase.from(table).select("*").range(offset, offset + PAGE_SIZE - 1);
    if (error) throw new Error(`Failed to read ${table} for backup: ${error.message}`);
    rows.push(...((data ?? []) as Record<string, unknown>[]));
    if (!data || data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  return rows;
}

/** RFC 4180 field escaping. Arrays/objects (e.g. genres, raw) are JSON-encoded rather than comma-joined, so they round-trip unambiguously. */
function csvField(value: unknown): string {
  if (value === null || value === undefined) return "";
  const str =
    typeof value === "string"
      ? value
      : typeof value === "object"
        ? JSON.stringify(value)
        : String(value);
  return /[",\r\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const columns = Object.keys(rows[0]);
  const lines = [columns.join(",")];
  for (const row of rows) lines.push(columns.map((col) => csvField(row[col])).join(","));
  return lines.join("\r\n") + "\r\n";
}

/**
 * Dumps every base table to its own CSV file under backups/<timestamp>/.
 * Called by runSync() after a sync completes successfully — a plain-text
 * snapshot of the library that survives independently of the Supabase
 * volume (e.g. `supabase stop` / `docker volume rm` wiping local dev data).
 *
 * Local-filesystem writes only — fine for the local dev Supabase this app
 * currently targets, but a Vercel deployment's filesystem is read-only
 * outside /tmp (which doesn't persist between invocations), so this would
 * need a different destination (e.g. object storage) before relying on it
 * in production.
 */
export async function backupDatabaseToCsv(
  baseDir: string = path.join(process.cwd(), "backups"),
): Promise<{ dir: string; files: string[] }> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  // This is an output directory, not a bundled input. Do not trace private
  // local backups or the project tree into serverless deployment artifacts.
  const dir = path.join(/* turbopackIgnore: true */ baseDir, timestamp);
  await fs.mkdir(dir, { recursive: true });

  const files: string[] = [];
  for (const table of BACKUP_TABLES) {
    const rows = await fetchAllRows(table);
    const filePath = path.join(dir, `${table}.csv`);
    await fs.writeFile(filePath, toCsv(rows), "utf8");
    files.push(filePath);
  }
  return { dir, files };
}
