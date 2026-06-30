import { getFarmSlug } from "@workspace/api-client-react";
import { loadAuthToken } from "./token";

/**
 * Downloads a CSV export from the API and triggers a browser save.
 *
 * Uses a raw `fetch` (rather than the generated client) so we can read the
 * response as a Blob and honour the server's `Content-Disposition` filename.
 * The same auth context as every other request is attached: the session cookie
 * (`credentials: include`), the bearer token fallback used in the cross-site
 * dev preview, and the active `X-Farm-Slug` tenant header.
 */
export async function downloadCsv(path: string, fallbackName: string): Promise<void> {
  const headers: Record<string, string> = {};

  const slug = getFarmSlug();
  if (slug) headers["X-Farm-Slug"] = slug;

  const token = loadAuthToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const response = await fetch(path, { headers, credentials: "include" });
  if (!response.ok) {
    throw new Error(`Export failed (${response.status})`);
  }

  const blob = await response.blob();

  let fileName = fallbackName;
  const disposition = response.headers.get("content-disposition");
  const match = disposition?.match(/filename="?([^";]+)"?/i);
  if (match?.[1]) fileName = match[1];

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/** Builds a fallback download filename like `my-farm-herd-2026-06-30.csv`. */
export function buildCsvFileName(kind: string): string {
  const slug = getFarmSlug() ?? "farm";
  const date = new Date().toISOString().slice(0, 10);
  return `${slug}-${kind}-${date}.csv`;
}
