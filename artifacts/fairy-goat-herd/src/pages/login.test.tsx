import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ReactNode } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { LoginResponse } from "@workspace/api-client-react";

const setLocationMock = vi.fn();
const loginMutateMock = vi.fn();
const setFarmSlugMock = vi.fn();
const assignMock = vi.fn();
const replaceMock = vi.fn();
let currentUser: unknown = undefined;

vi.mock("wouter", () => ({
  useLocation: () => ["/", setLocationMock] as const,
  useSearch: () => "",
  Link: ({ href, children }: { href: string; children: ReactNode }) => (
    <a href={href}>{children}</a>
  ),
  Redirect: () => null,
}));

vi.mock("@workspace/api-client-react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@workspace/api-client-react")>();
  return {
    ...actual,
    useLogin: () => ({ mutate: loginMutateMock, isPending: false }),
    useGetCurrentUser: () => ({
      data: currentUser,
      isLoading: false,
      error: undefined,
    }),
    getGetCurrentUserQueryKey: () => ["/api/auth/me"],
    setFarmSlug: (...args: unknown[]) => setFarmSlugMock(...args),
    setAuthTokenGetter: vi.fn(),
  };
});

import Login from "@/pages/login";
import { RootLanding } from "@/App";

/**
 * Point the app at a URL. `getUrlFarmSlug()` reads `window.location.pathname`,
 * so this controls whether the page renders in farm context (`/<slug>/login`)
 * or at the root fallback (`/login`). `assign`/`replace` are stubbed so the
 * full-page redirects can be asserted without a real navigation.
 */
function setUrl(pathname: string, search = "") {
  Object.defineProperty(window, "location", {
    configurable: true,
    value: {
      pathname,
      search,
      assign: assignMock,
      replace: replaceMock,
      href: `http://localhost${pathname}${search}`,
    },
  });
}

function renderWithClient(node: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const result = render(
    <QueryClientProvider client={client}>{node}</QueryClientProvider>,
  );
  return { client, ...result };
}

function makeLoginResponse(overrides: Partial<LoginResponse> = {}): LoginResponse {
  return {
    id: 1,
    username: "owner",
    email: "owner@example.com",
    role: "owner",
    farmSlug: "smithfarm",
    firstLogin: false,
    token: "sess-token",
    ...overrides,
  };
}

async function submitLogin() {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Username"), "owner");
  await user.type(screen.getByLabelText("Password"), "secret123");
  await user.click(screen.getByRole("button", { name: "Sign In" }));
}

beforeEach(() => {
  vi.clearAllMocks();
  currentUser = undefined;
  localStorage.clear();
});

describe("Login page — farm sign-in routing", () => {
  it("at the root /login, a successful farm-member login full-page redirects into /<slug>/", async () => {
    setUrl("/login");
    loginMutateMock.mockImplementation((_vars, opts) =>
      opts.onSuccess(makeLoginResponse({ role: "owner", farmSlug: "smithfarm" })),
    );

    renderWithClient(<Login />);
    await submitLogin();

    // Farm members logging in at the root land on their farm's dashboard via a
    // full-page navigation so the router re-mounts under /<slug>.
    expect(assignMock).toHaveBeenCalledWith("/smithfarm/");
    expect(setLocationMock).not.toHaveBeenCalled();
    expect(setFarmSlugMock).toHaveBeenCalledWith("smithfarm");
  });

  it("sends a first-login manager to Farm Settings under their farm prefix", async () => {
    setUrl("/login");
    loginMutateMock.mockImplementation((_vars, opts) =>
      opts.onSuccess(
        makeLoginResponse({ role: "owner", farmSlug: "smithfarm", firstLogin: true }),
      ),
    );

    renderWithClient(<Login />);
    await submitLogin();

    expect(assignMock).toHaveBeenCalledWith(
      "/smithfarm/admin/settings?tab=farm",
    );
  });

  it("under /<slug>/login, the Farm field is hidden and the farm is named", () => {
    setUrl("/smithfarm/login");

    renderWithClient(<Login />);

    expect(screen.queryByLabelText("Farm")).toBeNull();
    expect(screen.getByLabelText("Username")).toBeInTheDocument();
    expect(screen.getByText("Sign in to smithfarm.")).toBeInTheDocument();
  });

  it("under /<slug>/login, a successful login navigates within the farm router (no full-page redirect)", async () => {
    setUrl("/smithfarm/login");
    loginMutateMock.mockImplementation((_vars, opts) =>
      opts.onSuccess(makeLoginResponse({ role: "owner", farmSlug: "smithfarm" })),
    );

    renderWithClient(<Login />);
    await submitLogin();

    expect(setLocationMock).toHaveBeenCalledWith("/");
    expect(assignMock).not.toHaveBeenCalled();
  });

  it("keeps the login email in the shared current-user cache", async () => {
    setUrl("/smithfarm/login");
    loginMutateMock.mockImplementation((_vars, opts) =>
      opts.onSuccess(
        makeLoginResponse({
          role: "owner",
          farmSlug: "smithfarm",
          email: "saved@example.com",
        }),
      ),
    );

    const { client } = renderWithClient(<Login />);
    await submitLogin();

    expect(client.getQueryData(["/api/auth/me"])).toMatchObject({
      username: "owner",
      email: "saved@example.com",
    });
  });

  it("returns the user to the ?next= path within the farm router after login", async () => {
    setUrl("/smithfarm/login", "?next=%2Fgoats%2F123");
    loginMutateMock.mockImplementation((_vars, opts) =>
      opts.onSuccess(makeLoginResponse({ role: "owner", farmSlug: "smithfarm" })),
    );

    renderWithClient(<Login />);
    await submitLogin();

    expect(setLocationMock).toHaveBeenCalledWith("/goats/123");
    expect(assignMock).not.toHaveBeenCalled();
  });

  it("returns the user to the ?next= path AND its query string after login", async () => {
    setUrl(
      "/smithfarm/login",
      `?next=${encodeURIComponent("/goats?status=treatment")}`,
    );
    loginMutateMock.mockImplementation((_vars, opts) =>
      opts.onSuccess(makeLoginResponse({ role: "owner", farmSlug: "smithfarm" })),
    );

    renderWithClient(<Login />);
    await submitLogin();

    expect(setLocationMock).toHaveBeenCalledWith("/goats?status=treatment");
    expect(assignMock).not.toHaveBeenCalled();
  });

  it("honors ?next= over the first-login Farm Settings landing", async () => {
    setUrl("/smithfarm/login", "?next=%2Fbreedings%2F7");
    loginMutateMock.mockImplementation((_vars, opts) =>
      opts.onSuccess(
        makeLoginResponse({ role: "owner", farmSlug: "smithfarm", firstLogin: true }),
      ),
    );

    renderWithClient(<Login />);
    await submitLogin();

    expect(setLocationMock).toHaveBeenCalledWith("/breedings/7");
  });

  it("ignores an unsafe ?next= (open-redirect attempt) and uses the dashboard", async () => {
    setUrl("/smithfarm/login", "?next=https%3A%2F%2Fevil.example.com");
    loginMutateMock.mockImplementation((_vars, opts) =>
      opts.onSuccess(makeLoginResponse({ role: "owner", farmSlug: "smithfarm" })),
    );

    renderWithClient(<Login />);
    await submitLogin();

    expect(setLocationMock).toHaveBeenCalledWith("/");
  });

  it("carries the ?next= path into the full-page redirect from the root login", async () => {
    setUrl("/login", "?next=%2Fgoats%2F42");
    loginMutateMock.mockImplementation((_vars, opts) =>
      opts.onSuccess(makeLoginResponse({ role: "owner", farmSlug: "smithfarm" })),
    );

    renderWithClient(<Login />);
    await submitLogin();

    expect(assignMock).toHaveBeenCalledWith("/smithfarm/goats/42");
  });

  it("routes a superadmin to the platform panel and clears any farm slug", async () => {
    setUrl("/login");
    loginMutateMock.mockImplementation((_vars, opts) =>
      opts.onSuccess(
        makeLoginResponse({ role: "superadmin", farmSlug: null, token: undefined }),
      ),
    );

    renderWithClient(<Login />);
    await submitLogin();

    expect(setLocationMock).toHaveBeenCalledWith("/superadmin/farms");
    expect(setFarmSlugMock).toHaveBeenCalledWith(null);
    expect(assignMock).not.toHaveBeenCalled();
  });
});

describe("RootLanding — already-authenticated redirect", () => {
  it("redirects an authenticated farm member from the root to /<slug>/", async () => {
    setUrl("/");
    currentUser = {
      id: 5,
      username: "owner",
      role: "owner",
      farmSlug: "smithfarm",
    };

    renderWithClient(<RootLanding />);

    await waitFor(() =>
      expect(replaceMock).toHaveBeenCalledWith("/smithfarm/"),
    );
  });
});
