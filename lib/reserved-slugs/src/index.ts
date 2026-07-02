/**
 * The single source of truth for reserved farm slugs, shared by the API server
 * and the web client so the two can never drift.
 *
 * A farm slug is the first URL path segment (`mygoatherd.com/<slug>/...`). Any
 * word that names a top-level app route or platform path must be reserved, or a
 * farm registering that slug would shadow the app's own page. When you add a new
 * top-level route word, add it here and both sides pick it up automatically.
 */
export const RESERVED_SLUGS: ReadonlySet<string> = new Set([
  "www",
  "api",
  "app",
  "admin",
  "superadmin",
  "register",
  "login",
  "default",
  "static",
  "assets",
  "health",
  "healthz",
  // Top-level app route words.
  "goats",
  "breedings",
  "inventory",
  "lineage",
]);

/** True when a slug collides with a reserved app/platform path. */
export function isReservedSlug(slug: string): boolean {
  return RESERVED_SLUGS.has(slug.trim().toLowerCase());
}
