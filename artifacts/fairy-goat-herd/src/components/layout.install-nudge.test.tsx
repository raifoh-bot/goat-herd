import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Layout } from "./layout";

const installPromptMocks = vi.hoisted(() => ({
  dismissNudge: vi.fn(),
  useInstallPrompt: vi.fn(),
}));

vi.mock("wouter", () => ({
  Link: ({
    children,
    href,
    ...props
  }: React.PropsWithChildren<{ href: string }>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
  useLocation: () => ["/", vi.fn()],
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({
    setQueryData: vi.fn(),
    clear: vi.fn(),
  }),
}));

vi.mock("@workspace/api-client-react", () => ({
  useLogout: () => ({
    mutate: vi.fn(),
    isPending: false,
  }),
  getGetCurrentUserQueryKey: () => ["current-user"],
}));

vi.mock("@/lib/auth", () => ({
  useAuth: () => ({
    user: {
      role: "admin",
      username: "test-admin",
      fullName: "Test Admin",
    },
  }),
}));

vi.mock("@/lib/settings", () => ({
  useFarmSettings: () => ({
    usesAi: false,
    farmName: "Test Farm",
    logoUrl: null,
  }),
}));

vi.mock("@/components/quick-photo-capture", () => ({
  QuickPhotoCapture: () => null,
}));

vi.mock("@/components/install-banner", () => ({
  InstallBanner: () => null,
  InstallMenuItem: () => <button type="button">Install App</button>,
}));

vi.mock("@/hooks/use-install-prompt", () => ({
  useInstallPrompt: installPromptMocks.useInstallPrompt,
}));

describe("Layout install reminder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    installPromptMocks.useInstallPrompt.mockReturnValue({
      shouldShowNudge: true,
      dismissNudge: installPromptMocks.dismissNudge,
    });
  });

  it("points returning mobile visitors to the manual install entry", () => {
    render(
      <Layout>
        <div>Page content</div>
      </Layout>,
    );

    expect(screen.getByLabelText("Install app reminder")).toBeInTheDocument();
    expect(
      screen.getByText("Install for quicker access from the option below."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Install App" })).toBeInTheDocument();
  });

  it("offers an explicit second dismissal", async () => {
    const user = userEvent.setup();
    render(
      <Layout>
        <div>Page content</div>
      </Layout>,
    );

    await user.click(
      screen.getByRole("button", { name: "Dismiss install reminder" }),
    );

    expect(installPromptMocks.dismissNudge).toHaveBeenCalledOnce();
  });

  it("does not render the reminder when it is suppressed", () => {
    installPromptMocks.useInstallPrompt.mockReturnValue({
      shouldShowNudge: false,
      dismissNudge: installPromptMocks.dismissNudge,
    });

    render(
      <Layout>
        <div>Page content</div>
      </Layout>,
    );

    expect(screen.queryByLabelText("Install app reminder")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Install for quicker access from the option below."),
    ).not.toBeInTheDocument();
  });
});