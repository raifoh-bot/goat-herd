import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Farm } from "@workspace/api-client-react";

const registerMutateMock = vi.fn();
const setFarmSlugMock = vi.fn();
const toastMock = vi.fn();
const assignMock = vi.fn();

vi.mock("wouter", () => ({
  Link: ({ href, children }: { href: string; children: ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock("@workspace/api-client-react", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@workspace/api-client-react")>();
  return {
    ...actual,
    useRegisterFarm: () => ({ mutate: registerMutateMock, isPending: false }),
    setFarmSlug: (...args: unknown[]) => setFarmSlugMock(...args),
  };
});

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: toastMock }),
}));

import Register from "@/pages/register";

/**
 * Point the app at a URL and stub `window.location.assign` so the full-page
 * redirect into the new farm's URL context can be asserted without a real
 * navigation. `farmUrl()` reads `import.meta.env.BASE_URL` (base path), which
 * is "/" in tests, so a redirect resolves to `/<slug>/login`.
 */
function setUrl(pathname: string) {
  Object.defineProperty(window, "location", {
    configurable: true,
    value: {
      pathname,
      assign: assignMock,
      href: `http://localhost${pathname}`,
    },
  });
}

function renderWithClient(node: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>{node}</QueryClientProvider>,
  );
}

function makeFarm(overrides: Partial<Farm> = {}): Farm {
  return {
    id: 1,
    slug: "smithfarm",
    name: "Smith Family Dairy",
    status: "active",
    ...overrides,
  };
}

/**
 * Fill in every registration field. The slug field is typed into directly so it
 * stops auto-tracking the farm name, letting each test pin an exact slug.
 */
async function fillForm(overrides: { slug?: string } = {}) {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Farm name"), "Smith Family Dairy");
  const slugInput = screen.getByLabelText("Farm address");
  await user.clear(slugInput);
  await user.type(slugInput, overrides.slug ?? "smithfarm");
  await user.type(screen.getByLabelText("Admin username"), "owner");
  await user.type(screen.getByLabelText("Password"), "secret123");
  await user.click(screen.getByRole("button", { name: "Create farm" }));
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  setUrl("/register");
});

describe("Register page — farm sign-up routing", () => {
  it("full-page redirects a newly registered owner to their farm's /<slug>/login", async () => {
    registerMutateMock.mockImplementation((_vars, opts) =>
      opts.onSuccess(makeFarm({ slug: "smithfarm" })),
    );

    renderWithClient(<Register />);
    await fillForm({ slug: "smithfarm" });

    // A full-page navigation (not a client-side route change) mounts the app
    // under /<slug> so the new owner lands in their farm's URL context.
    expect(assignMock).toHaveBeenCalledWith("/smithfarm/login");
    expect(setFarmSlugMock).toHaveBeenCalledWith("smithfarm");
    expect(toastMock).not.toHaveBeenCalled();
  });

  it("honors the slug the server returns, even if it differs from the typed one", async () => {
    registerMutateMock.mockImplementation((_vars, opts) =>
      opts.onSuccess(makeFarm({ slug: "server-slug" })),
    );

    renderWithClient(<Register />);
    await fillForm({ slug: "smithfarm" });

    expect(assignMock).toHaveBeenCalledWith("/server-slug/login");
    expect(setFarmSlugMock).toHaveBeenCalledWith("server-slug");
  });

  it("blocks a reserved slug before calling the API and does not redirect", async () => {
    renderWithClient(<Register />);
    await fillForm({ slug: "login" });

    expect(registerMutateMock).not.toHaveBeenCalled();
    expect(assignMock).not.toHaveBeenCalled();
    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({ variant: "destructive" }),
    );
  });

  it("surfaces a duplicate-slug (409) error without redirecting", async () => {
    registerMutateMock.mockImplementation((_vars, opts) =>
      opts.onError({ status: 409 }),
    );

    renderWithClient(<Register />);
    await fillForm({ slug: "smithfarm" });

    expect(assignMock).not.toHaveBeenCalled();
    expect(setFarmSlugMock).not.toHaveBeenCalled();
    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Registration failed",
        description: expect.stringContaining("already taken"),
        variant: "destructive",
      }),
    );
  });

  it("surfaces a generic registration error without redirecting", async () => {
    registerMutateMock.mockImplementation((_vars, opts) =>
      opts.onError({ status: 500 }),
    );

    renderWithClient(<Register />);
    await fillForm({ slug: "smithfarm" });

    expect(assignMock).not.toHaveBeenCalled();
    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Registration failed",
        variant: "destructive",
      }),
    );
  });
});
