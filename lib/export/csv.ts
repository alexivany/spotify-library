export interface CsvColumn<T> {
  header: string;
  value: (row: T) => string;
}

/** RFC-4180 CSV encoder: quotes fields containing commas, quotes, or newlines; doubles embedded quotes. */
export function toCsv<T>(rows: T[], columns: CsvColumn<T>[]): string {
  const headerLine = columns.map((c) => escapeCsvField(c.header)).join(",");
  const lines = rows.map((row) => columns.map((c) => escapeCsvField(c.value(row))).join(","));
  return [headerLine, ...lines].join("\r\n") + "\r\n";
}

function escapeCsvField(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
