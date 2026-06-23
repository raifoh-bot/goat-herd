import { setFarmSlug as applyFarmSlug } from "@workspace/api-client-react";

const STORAGE_KEY = "mygoatherd.farmSlug";

/**
 * Resolve the farm slug for the current environment.
 *
 * In production each farm is served from its own subdomain
 * (e.g. `smithfarm.mygoatherd.com`), so the server resolves the tenant from the
 * `Host` header and no client slug is needed. In the Replit dev preview there is
 * no real subdomain, so we persist the slug chosen at login in localStorage and
 * send it back via the `X-Farm-Slug` header on every request.
 */
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

/** Initialize the API client's farm slug from persisted storage at app boot. */
export function initFarmSlug(): void {
  applyFarmSlug(loadStoredFarmSlug());
}
