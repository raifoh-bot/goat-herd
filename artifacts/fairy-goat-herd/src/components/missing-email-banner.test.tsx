import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AuthUser } from "@workspace/api-client-react";

const useAuthMock = vi.fn();

vi.mock("@/lib/auth", () => ({
  useAuth: () => useAuthMock(),
}));

vi.mock("wouter", () => ({
  Link: ({ href, children }: { href: string; children: ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

import { MissingEmailBanner } from "./missing-email-banner";

const WARNING = /your account has no email on file/i;
const DISMISS_KEY = "mygoatherd.missing-email-banner-dismissed";

function makeUser(overrides: Partial<AuthUser> = {}): AuthUser {
  return {
    id: 1,
    username: "owner",
    role: "owner",
    email: null,
    ...overrides,
  };
}

function setup(overrides: Partial<AuthUser> = {}) {
  useAuthMock.mockReturnValue({ user: makeUser(overrides) });
  return render(<MissingEmailBanner />);
}

describe("MissingEmailBanner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
  });

  it("stays hidden when the signed-in user has a saved email", () => {
    setup({ email: "owner@example.com" });
    expect(screen.queryByText(WARNING)).not.toBeInTheDocument();
  });

  it("shows for a legacy account without an email and links to Account settings", () => {
    setup({ email: null });
    expect(screen.getByText(WARNING)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Add your email" })).toHaveAttribute(
      "href",
      "/admin/settings?tab=account",
    );
  });

  it("never shows for a superadmin", () => {
    setup({ role: "superadmin", email: null });
    expect(screen.queryByText(WARNING)).not.toBeInTheDocument();
  });

  it("stays hidden for the browser session after dismissal", async () => {
    const user = userEvent.setup();
    const first = setup({ email: null });

    await user.click(
      screen.getByRole("button", { name: "Dismiss email reminder" }),
    );
    expect(screen.queryByText(WARNING)).not.toBeInTheDocument();
    expect(sessionStorage.getItem(DISMISS_KEY)).toBe("1");

    first.unmount();
    setup({ email: null });
    expect(screen.queryByText(WARNING)).not.toBeInTheDocument();
  });
});