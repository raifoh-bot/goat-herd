import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ReactNode } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const setLocationMock = vi.fn();

let currentUser: unknown = undefined;
let currentIsLoading = false;
let currentError: unknown = undefined;

const AUTH_QUERY_KEY = ["/api/auth/me"] as const;

vi.mock("wouter", () => ({
  useLocation: () => ["/", setLocationMock] as const,
}));

/** Point the browser URL at a path so getUrlFarmSlug() derives its farm slug. */
function setPathname(pathname: string) {
  window.history.replaceState({}, "", pathname);
}

vi.mock("@workspace/api-client-react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@workspace/api-client-react")>();
  return {
    ...actual,
    useGetCurrentUser: () => ({
      data: currentUser,
      isLoading: currentIsLoading,
      error: currentError,
    }),
    getGetCurrentUserQueryKey: () => AUTH_QUERY_KEY,
  };
});

import { AuthGuard } from "@/lib/auth";

function makeClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
}

function renderWithClient(node: ReactNode, client: QueryClient = makeClient()) {
  const result = render(
    <QueryClientProvider client={client}>{node}</QueryClientProvider>,
  );
  return { client, ...result };
}

beforeEach(() => {
  vi.clearAllMocks();
  currentUser = undefined;
  currentIsLoading = false;
  currentError = undefined;
  setPathname("/");
});

describe("AuthGuard — signed-out redirect", () => {
  it("redirects to the root /login when there is no farm context", async () => {
    currentUser = undefined;

    renderWithClient(
      <AuthGuard>
        <div>protected content</div>
      </AuthGuard>,
    );

    await waitFor(() =>
      expect(setLocationMock).toHaveBeenCalledWith("~/login"),
    );
    expect(screen.queryByText("protected content")).toBeNull();
  });

  it("redirects to the farm's own /<slug>/login when on a farm page", async () => {
    currentUser = undefined;
    setPathname("/smithfarm/goats");

    renderWithClient(
      <AuthGuard>
        <div>protected content</div>
      </AuthGuard>,
    );

    await waitFor(() =>
      expect(setLocationMock).toHaveBeenCalledWith("~/smithfarm/login"),
    );
    expect(screen.queryByText("protected content")).toBeNull();
  });

  it("redirects to /login when the auth query errors (e.g. 401)", async () => {
    currentUser = undefined;
    currentError = new Error("401 Unauthorized");

    renderWithClient(
      <AuthGuard>
        <div>protected content</div>
      </AuthGuard>,
    );

    await waitFor(() =>
      expect(setLocationMock).toHaveBeenCalledWith("~/login"),
    );
    expect(screen.queryByText("protected content")).toBeNull();
  });

  it("does not redirect while the auth check is still loading", () => {
    currentIsLoading = true;

    renderWithClient(
      <AuthGuard>
        <div>protected content</div>
      </AuthGuard>,
    );

    expect(setLocationMock).not.toHaveBeenCalled();
    expect(screen.getByText("Loading your herd…")).toBeInTheDocument();
  });

  it("clears any stale cached user so it cannot loop back from /login to /", async () => {
    // Simulate a stale user left in the cache while the live query reports an
    // auth failure. Without clearing it, /login would see the cached user and
    // bounce back to "/", which bounces back here — an infinite loop.
    currentUser = undefined;
    currentError = new Error("401 Unauthorized");

    const client = makeClient();
    client.setQueryData(AUTH_QUERY_KEY, {
      id: 5,
      username: "owner",
      role: "owner",
      farmSlug: "smithfarm",
    });

    renderWithClient(
      <AuthGuard>
        <div>protected content</div>
      </AuthGuard>,
      client,
    );

    await waitFor(() =>
      expect(setLocationMock).toHaveBeenCalledWith("~/login"),
    );
    await waitFor(() =>
      expect(client.getQueryData(AUTH_QUERY_KEY)).toBeNull(),
    );
  });
});
