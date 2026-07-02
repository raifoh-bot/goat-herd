import { createContext, useContext, useEffect, type ReactNode } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetCurrentUser,
  getGetCurrentUserQueryKey,
  type AuthUser,
} from "@workspace/api-client-react";
import { GoatIcon } from "@/components/goat-icon";
import { getUrlFarmSlug, farmUrl, rootUrl } from "@/lib/farm";

type AuthContextValue = {
  user: AuthUser;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthGuard");
  }
  return ctx;
}

/** Convenience: true when the current user has full management access. */
export function useIsManager(): boolean {
  const { user } = useAuth();
  return user.role === "admin" || user.role === "owner";
}

export function AuthGuard({ children }: { children: ReactNode }) {
  const [location, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { data: user, isLoading, error } = useGetCurrentUser({
    query: { queryKey: getGetCurrentUserQueryKey(), retry: false, staleTime: 30_000 },
  });

  // Any auth failure (401 or otherwise) sends the user to the login screen.
  const unauthenticated = !isLoading && (Boolean(error) || !user);
  useEffect(() => {
    if (unauthenticated) {
      // Clear any stale cached user so the login page agrees we're logged out.
      // Without this, a cached user on /login would redirect back to "/",
      // which redirects back here — an infinite loop that crashes the app.
      queryClient.setQueryData(getGetCurrentUserQueryKey(), null);
      // Keep signed-out farm members on their own farm's login page
      // (`/<slug>/login`); root pages fall back to the global `/login`. We use
      // wouter's `~` absolute-path escape so the target is independent of the
      // router base (which already includes the farm slug on farm pages) and
      // never double-prefixes it.
      const slug = getUrlFarmSlug();
      const loginPath = slug ? farmUrl(slug, "/login") : rootUrl("/login");
      // Remember the page they were trying to reach (base-relative, e.g.
      // `/goats/123`) so login can return them there. Skip the dashboard and
      // the login page itself — there's nothing useful to come back to.
      const intended =
        location && location !== "/" && !location.startsWith("/login")
          ? location
          : null;
      const target = intended
        ? `${loginPath}?next=${encodeURIComponent(intended)}`
        : loginPath;
      setLocation(`~${target}`);
    }
  }, [unauthenticated, setLocation, queryClient, location]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <GoatIcon className="h-10 w-10 animate-pulse text-primary" />
          <p className="text-sm">Loading your herd…</p>
        </div>
      </div>
    );
  }

  if (error || !user) {
    return null;
  }

  return <AuthContext.Provider value={{ user }}>{children}</AuthContext.Provider>;
}
