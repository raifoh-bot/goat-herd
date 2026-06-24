import { setAuthTokenGetter } from "@workspace/api-client-react";

const STORAGE_KEY = "mygoatherd.authToken";

/** Read the persisted bearer token, or null when none is stored. */
export function loadAuthToken(): string | null {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return value && value.trim() ? value : null;
  } catch {
    return null;
  }
}

/** Persist (or clear, when null) the bearer token returned at login. */
export function storeAuthToken(token: string | null): void {
  try {
    if (token && token.trim()) {
      window.localStorage.setItem(STORAGE_KEY, token);
    } else {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // Ignore storage failures (e.g. private mode).
  }
}

/**
 * Register the API client's bearer-token getter. Call once at app boot.
 *
 * The token authenticates requests when the session cookie is unavailable: the
 * Replit dev preview runs the app inside a cross-site iframe, where browsers
 * block the third-party session cookie. localStorage is first-party to the
 * iframe origin, so the token survives there.
 */
export function initAuthToken(): void {
  setAuthTokenGetter(() => loadAuthToken());
}
