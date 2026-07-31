#!/usr/bin/env bun
/**
 * Restores a CSV backup produced by lib/backup/csv.ts into the local Supabase
 * Postgres. The inverse of backupDatabaseToCsv():
 *
 *   bun scripts/restore-backup.ts [backups/<timestamp>]
 *
 * With no argument it picks the newest backups/<timestamp> directory.
 *
 * Loading strategy: pipe each CSV through `COPY ... FROM STDIN` so Postgres does
 * per-column type coercion from text (ints, booleans, dates, jsonb all parse
 * natively, and text columns like upc/isrc keep leading zeros — which a
 * JSON-client insert that guessed at numeric conversion would corrupt). The
 * only values COPY can't take as-is are the text[] columns (genres,
 * musicbrainz_genres), which the backup JSON-encodes as ["a","b"]; those are
 * rewritten to Postgres array literals {"a","b"} before loading.
 */
import fs from "node:fs";
import path from "node:path";

const CONTAINER = "supabase_db_spotify-library";

// FK-safe insert order (parents before children), matching BACKUP_TABLES.
// arrayColumns lists the text[] columns needing JSON→Postgres-literal rewrite.
const TABLES: { name: string; arrayColumns: string[] }[] = [
  { name: "artists", arrayColumns: ["genres"] },
  { name: "albums", arrayColumns: ["musicbrainz_genres"] },
  { name: "tracks", arrayColumns: [] },
  { name: "album_artists", arrayColumns: [] },
  { name: "track_artists", arrayColumns: [] },
  { name: "folders", arrayColumns: [] },
  { name: "folder_items", arrayColumns: [] },
  { name: "tags", arrayColumns: [] },
  { name: "item_tags", arrayColumns: [] },
  { name: "sync_runs", arrayColumns: [] },
  { name: "enrichment_runs", arrayColumns: [] },
];

/** RFC 4180 parser: handles quoted fields, doubled quotes, and CR/LF inside quotes. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;
  const pushField = () => {
    row.push(field);
    field = "";
  };
  const pushRow = () => {
    pushField();
    rows.push(row);
    row = [];
  };
  while (i < text.length) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
        } else {
          inQuotes = false;
          i++;
        }
      } else {
        field += c;
        i++;
      }
    } else if (c === '"') {
      inQuotes = true;
      i++;
    } else if (c === ",") {
      pushField();
      i++;
    } else if (c === "\r") {
      // swallow CR; the following LF ends the row
      i++;
    } else if (c === "\n") {
      pushRow();
      i++;
    } else {
      field += c;
      i++;
    }
  }
  // trailing field/row if file doesn't end with a newline
  if (field.length > 0 || row.length > 0) pushRow();
  return rows;
}

/** JSON array (parsed from the backup) → Postgres array literal, e.g. {"rock","pop"}. */
function toPgArray(jsonEncoded: string): string {
  const arr = JSON.parse(jsonEncoded) as unknown[];
  const items = arr.map((el) => {
    if (el === null) return "NULL";
    const s = String(el).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    return `"${s}"`;
  });
  return `{${items.join(",")}}`;
}

/** Encode one cell for a COPY CSV stream; empty original → NULL (via `NULL ''`). */
function csvField(value: string | null): string {
  if (value === null || value === "") return "";
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function newestBackupDir(): string {
  const base = path.join(process.cwd(), "backups");
  const dirs = fs
    .readdirSync(base)
    .filter((d) => fs.statSync(path.join(base, d)).isDirectory())
    .sort();
  if (dirs.length === 0) throw new Error("No backups found under backups/");
  return path.join(base, dirs[dirs.length - 1]);
}

async function psql(sql: string): Promise<string> {
  const proc = Bun.spawn(
    ["docker", "exec", "-i", CONTAINER, "psql", "-U", "postgres", "-d", "postgres", "-At", "-v", "ON_ERROR_STOP=1", "-c", sql],
    { stdout: "pipe", stderr: "pipe" },
  );
  const code = await proc.exited;
  if (code !== 0) throw new Error(await new Response(proc.stderr).text());
  return await new Response(proc.stdout).text();
}

/** Generated columns (e.g. albums.resolved_label) can't be targeted by COPY, so drop them from the load. */
async function generatedColumns(): Promise<Set<string>> {
  const out = await psql(
    "SELECT table_name || '.' || column_name FROM information_schema.columns WHERE table_schema='public' AND is_generated='ALWAYS'",
  );
  return new Set(out.split("\n").filter(Boolean));
}

async function copyInto(table: string, columns: string[], csv: string): Promise<void> {
  const cmd = `COPY public.${table} (${columns.join(", ")}) FROM STDIN WITH (FORMAT csv, NULL '')`;
  const proc = Bun.spawn(
    ["docker", "exec", "-i", CONTAINER, "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-c", cmd],
    { stdin: "pipe", stdout: "pipe", stderr: "pipe" },
  );
  // If psql aborts the COPY (ON_ERROR_STOP) it closes stdin, so the write can
  // EPIPE — swallow that and let stderr below report the real cause.
  try {
    proc.stdin.write(csv);
    await proc.stdin.end();
  } catch (err) {
    if ((err as { code?: string }).code !== "EPIPE") throw err;
  }
  const code = await proc.exited;
  if (code !== 0) throw new Error(await new Response(proc.stderr).text());
}

const backupDir = process.argv[2] ? path.resolve(process.argv[2]) : newestBackupDir();
console.log(`Restoring from ${backupDir}`);

const generated = await generatedColumns();

// Clean slate so the restore is re-runnable (CASCADE covers FK order).
await psql(`TRUNCATE ${TABLES.map((t) => `public.${t.name}`).join(", ")} CASCADE`);

for (const { name, arrayColumns } of TABLES) {
  const file = path.join(backupDir, `${name}.csv`);
  if (!fs.existsSync(file)) {
    console.log(`  ${name}: no file, skipping`);
    continue;
  }
  const rows = parseCsv(fs.readFileSync(file, "utf8"));
  if (rows.length <= 1) {
    console.log(`  ${name}: 0 rows`);
    continue;
  }
  const header = rows[0];
  // Drop generated columns — COPY can't target them; the DB recomputes them.
  const keep = header.map((col, i) => ({ col, i })).filter(({ col }) => !generated.has(`${name}.${col}`));
  const arrayIdx = new Set(arrayColumns.map((c) => header.indexOf(c)).filter((i) => i >= 0));

  const out: string[] = [];
  for (let r = 1; r < rows.length; r++) {
    const cells = rows[r];
    const encoded = keep.map(({ i }) => {
      const cell = cells[i];
      if (cell === "" || cell === undefined) return "";
      if (arrayIdx.has(i)) return csvField(toPgArray(cell));
      return csvField(cell);
    });
    out.push(encoded.join(","));
  }

  await copyInto(name, keep.map((k) => k.col), out.join("\n") + "\n");
  console.log(`  ${name}: ${rows.length - 1} rows`);
}

console.log("Restore complete.");
