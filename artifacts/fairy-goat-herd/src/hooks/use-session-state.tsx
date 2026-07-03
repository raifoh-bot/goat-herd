import * as React from "react";

/**
 * Like useState, but the value is persisted to sessionStorage under `key` so it
 * survives navigating away and back within the same browser session (and is
 * cleared when the tab closes). Used for list sort selections so they stay put
 * as the user moves between pages.
 */
export function useSessionState<T extends string>(
  key: string,
  initialValue: T,
): [T, (value: T) => void] {
  const [value, setValue] = React.useState<T>(() => {
    try {
      const stored = sessionStorage.getItem(key);
      return stored !== null ? (stored as T) : initialValue;
    } catch {
      return initialValue;
    }
  });

  const set = React.useCallback(
    (next: T) => {
      setValue(next);
      try {
        sessionStorage.setItem(key, next);
      } catch {
        /* ignore storage failures */
      }
    },
    [key],
  );

  return [value, set];
}
