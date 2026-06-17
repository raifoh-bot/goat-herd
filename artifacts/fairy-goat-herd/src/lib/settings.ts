import {
  useGetSettings,
  getGetSettingsQueryKey,
} from "@workspace/api-client-react";

/**
 * Reads the farm-level settings. Defaults `usesAi` to `true` while the request
 * is loading (or if it fails) so AI UI is only ever hidden once we positively
 * know the farm has opted out — matching the server-side default.
 */
export function useFarmSettings(): { usesAi: boolean; isLoading: boolean } {
  const { data, isLoading } = useGetSettings({
    query: { queryKey: getGetSettingsQueryKey(), staleTime: 30_000 },
  });
  return { usesAi: data?.usesAi ?? true, isLoading };
}
