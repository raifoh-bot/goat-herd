import { setFarmSlug as applyFarmSlug } from "@workspace/api-client-react";
import { RESERVED_SLUGS, isReservedSlug } from "@workspace/reserved-slugs";

export { RESERVED_SLUGS, isReservedSlug };

const STORAGE_KEY = "mygoatherd.farmSlug";

/** The artifact base path (e.g. "/" in dev), without a trailing slash. */
export function basePath(): string {
  return import.meta.env.BASE_URL.replace(/\/$/, "");
}

/**
 * Derive the active farm slug from a URL pathname. The farm slug is the first
 * path segment after the artifact base path — unless it's empty or a reserved
 * word (a global/root page like `/login` or `/superadmin/...`), in which case
 * there is no farm context. Pure so it can be unit-tested without a DOM.
 */
export function deriveFarmSlug(pathname: string, base: string): string | null {
  let rest = pathname;
  if (base && rest.toLowerCase().startsWith(base.toLowerCase())) {
    rest = rest.slice(base.length);
  }
  const segment = rest.replace(/^\/+/, "").split("/")[0]?.toLowerCase() ?? "";
  if (!segment || RESERVED_SLUGS.has(segment)) {
    return null;
  }
  return segment;
}

/** The farm slug derived from the current browser URL, or null at a root page. */
export function getUrlFarmSlug(): string | null {
  return deriveFarmSlug(window.location.pathname, basePath());
}

/** Build an absolute in-app URL under a farm's path prefix (for full-page navigation). */
export function farmUrl(slug: string, path = "/"): string {
  const suffix = path.startsWith("/") ? path : `/${path}`;
  return `${basePath()}/${slug}${suffix}`;
}

/** Build an absolute in-app URL at the root (no farm prefix). */
export function rootUrl(path = "/"): string {
  const suffix = path.startsWith("/") ? path : `/${path}`;
  return `${basePath()}${suffix}`;
}

export function loadStoredFarmSlug(): string | null {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return value && value.trim() ? value.trim() : null;
  } catch {
    return null;
  }
}

/** Persist the active farm slug and apply it to the API client. */
export function storeFarmSlug(slug: string | null): void {
  try {
    if (slug && slug.trim()) {
      window.localStorage.setItem(STORAGE_KEY, slug.trim());
    } else {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // Ignore storage failures (e.g. private mode); the in-memory slug still applies.
  }
  applyFarmSlug(slug);
}

/**
 * Initialize the API client's farm slug at app boot. The URL path is the source
 * of truth: on a farm page (`/<slug>/...`) the slug scopes every API call; on a
 * root page there is no farm context (the login form or the persisted session
 * supplies the tenant instead).
 */
export function initFarmSlug(): void {
  applyFarmSlug(getUrlFarmSlug());
}
