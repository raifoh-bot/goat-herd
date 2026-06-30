import type { Response } from "express";

/**
 * Serializes a single value into a CSV-safe cell. `null`/`undefined` become an
 * empty cell, Dates are emitted as ISO-8601, and any value containing a comma,
 * double-quote, or newline is wrapped in quotes with embedded quotes doubled
 * (RFC 4180).
 */
function csvCell(value: unknown): string {
  if (value == null) return "";
  const text = value instanceof Date ? value.toISOString() : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Builds an RFC 4180 CSV string from a header row and data rows. */
export function toCsv(headers: string[], rows: unknown[][]): string {
  const lines = [headers.map(csvCell).join(",")];
  for (const row of rows) {
    lines.push(row.map(csvCell).join(","));
  }
  return lines.join("\r\n");
}

/**
 * Writes a CSV download response. The file is named `<baseName>-<YYYY-MM-DD>.csv`
 * and prefixed with a UTF-8 BOM so Excel opens accented characters correctly.
 */
export function sendCsv(res: Response, baseName: string, headers: string[], rows: unknown[][]): void {
  const date = new Date().toISOString().slice(0, 10);
  const fileName = `${baseName}-${date}.csv`;
  const body = `\uFEFF${toCsv(headers, rows)}`;
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
  res.send(body);
}
