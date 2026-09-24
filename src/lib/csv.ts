/** One CSV cell: quoted when needed, and neutralised if it could run as a formula. */
export function csvCell(value: unknown): string {
  let s = value == null ? '' : String(value);
  // Text from users (titles from the public report form, names…) starting
  // with = + - @ or a tab/CR is run as a formula by Excel and Sheets (CSV
  // injection). A leading apostrophe makes it plain text. Numbers are left
  // alone so negative amounts stay numeric.
  if (typeof value !== 'number' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** Minimal CSV export. Rows are objects with the given column keys. */
export function toCsv<T>(columns: { key: keyof T; label: string }[], rows: T[]): string {
  const header = columns.map((c) => csvCell(c.label)).join(',');
  const body = rows.map((row) => columns.map((c) => csvCell(row[c.key])).join(',')).join('\r\n');
  return `${header}\r\n${body}`;
}

export function downloadCsv<T>(
  filename: string,
  columns: { key: keyof T; label: string }[],
  rows: T[]
): void {
  // The UTF-8 byte-order mark makes Excel on Windows read Vietnamese
  // correctly instead of mojibake.
  const blob = new Blob(['\uFEFF' + toCsv(columns, rows)], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
