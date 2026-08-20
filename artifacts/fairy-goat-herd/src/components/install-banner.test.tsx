/**
 * Component tests for InstallBanner and InstallMenuItem.
 * The useInstallPrompt hook is mocked so these tests focus purely on
 * rendering logic, user interactions, and what the components delegate
 * to the hook.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { InstallPromptState } from "@/hooks/use-install-prompt";

// ---------------------------------------------------------------------------
// Mock the hook — must come before importing the components
// ---------------------------------------------------------------------------

const mockUseInstallPrompt = vi.fn<() => InstallPromptState>();

vi.mock("@/hooks/use-install-prompt", () => ({
  useInstallPrompt: () => mockUseInstallPrompt(),
}));

import {
  InstallBanner,
  InstallMenuItem,
  IosInstallSettingsCard,
} from "./install-banner";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeState(
  overrides: Partial<InstallPromptState> = {},
): InstallPromptState {
  return {
    canPrompt: false,
    isIos: false,
    isInstalled: false,
    isDismissed: false,
    shouldShowBanner: false,
    visitCount: 0,
    dismissalCount: 0,
    shouldShowNudge: false,
    triggerInstall: vi.fn().mockResolvedValue(undefined),
    dismiss: vi.fn(),
    dismissNudge: vi.fn(),
    clearDismissal: vi.fn(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// InstallBanner
// ---------------------------------------------------------------------------

describe("InstallBanner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("visibility", () => {
    it("renders nothing when shouldShowBanner is false", () => {
      mockUseInstallPrompt.mockReturnValue(
        makeState({ shouldShowBanner: false }),
      );
      const { container } = render(<InstallBanner />);
      expect(container).toBeEmptyDOMElement();
    });

    it("renders the banner element when shouldShowBanner is true", () => {
      mockUseInstallPrompt.mockReturnValue(
        makeState({ shouldShowBanner: true, canPrompt: true }),
      );
      render(<InstallBanner />);
      expect(screen.getByRole("banner")).toBeInTheDocument();
    });

    it("shows the app name in the banner", () => {
      mockUseInstallPrompt.mockReturnValue(
        makeState({ shouldShowBanner: true, canPrompt: true }),
      );
      render(<InstallBanner />);
      expect(screen.getByText(/Install MyGoatHerd/i)).toBeInTheDocument();
    });
  });

  describe("copy — Android vs iOS", () => {
    it("shows offline copy when isIos is false", () => {
      mockUseInstallPrompt.mockReturnValue(
        makeState({ shouldShowBanner: true, canPrompt: true, isIos: false }),
      );
      render(<InstallBanner />);
      expect(screen.getByText(/even offline/i)).toBeInTheDocument();
    });

    it("shows iOS-specific copy when isIos is true", () => {
      mockUseInstallPrompt.mockReturnValue(
        makeState({ shouldShowBanner: true, isIos: true }),
      );
      render(<InstallBanner />);
      // iOS copy references "home screen" but NOT "offline"
      expect(screen.getByText(/home screen/i)).toBeInTheDocument();
      expect(screen.queryByText(/even offline/i)).not.toBeInTheDocument();
    });
  });

  describe("dismiss button", () => {
    it("calls dismiss() when the X button is clicked", async () => {
      const dismiss = vi.fn();
      mockUseInstallPrompt.mockReturnValue(
        makeState({ shouldShowBanner: true, canPrompt: true, dismiss }),
      );
      const user = userEvent.setup();
      render(<InstallBanner />);

      await user.click(
        screen.getByRole("button", { name: /dismiss install prompt/i }),
      );

      expect(dismiss).toHaveBeenCalledOnce();
    });
  });

  describe("Install button — Android/Chrome", () => {
    it("calls triggerInstall() when clicked", async () => {
      const triggerInstall = vi.fn().mockResolvedValue(undefined);
      mockUseInstallPrompt.mockReturnValue(
        makeState({ shouldShowBanner: true, canPrompt: true, triggerInstall }),
      );
      const user = userEvent.setup();
      render(<InstallBanner />);

      await user.click(screen.getByRole("button", { name: /^install$/i }));

      expect(triggerInstall).toHaveBeenCalledOnce();
    });

    it("does NOT call triggerInstall() on iOS", async () => {
      const triggerInstall = vi.fn();
      mockUseInstallPrompt.mockReturnValue(
        makeState({ shouldShowBanner: true, isIos: true, triggerInstall }),
      );
      const user = userEvent.setup();
      render(<InstallBanner />);

      await user.click(screen.getByRole("button", { name: /^install$/i }));

      expect(triggerInstall).not.toHaveBeenCalled();
    });
  });

  describe("iOS sheet", () => {
    it("opens the iOS instruction sheet when Install is clicked on iOS", async () => {
      mockUseInstallPrompt.mockReturnValue(
        makeState({ shouldShowBanner: true, isIos: true }),
      );
      const user = userEvent.setup();
      render(<InstallBanner />);

      await user.click(screen.getByRole("button", { name: /^install$/i }));

      // The sheet title should now be visible
      expect(
        screen.getByRole("heading", { name: /add to home screen/i }),
      ).toBeInTheDocument();
    });

    it("sheet is closed by default (not open on initial render)", () => {
      mockUseInstallPrompt.mockReturnValue(
        makeState({ shouldShowBanner: true, isIos: true }),
      );
      render(<InstallBanner />);
      // The sheet heading should not be present before user clicks
      expect(
        screen.queryByRole("heading", { name: /add to home screen/i }),
      ).not.toBeInTheDocument();
    });
  });

  describe("banner hidden after dismissal (simulated remount)", () => {
    it("does not render the banner when shouldShowBanner is false (e.g. after dismiss)", () => {
      // Simulate post-dismiss state — hook returns false for shouldShowBanner
      mockUseInstallPrompt.mockReturnValue(
        makeState({ shouldShowBanner: false, isDismissed: true }),
      );
      const { container } = render(<InstallBanner />);
      expect(container).toBeEmptyDOMElement();
    });
  });
});

// ---------------------------------------------------------------------------
// InstallMenuItem
// ---------------------------------------------------------------------------

describe("InstallMenuItem", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("visibility", () => {
    it("renders nothing when already installed", () => {
      mockUseInstallPrompt.mockReturnValue(makeState({ isInstalled: true }));
      const { container } = render(<InstallMenuItem />);
      expect(container).toBeEmptyDOMElement();
    });

    it("renders nothing when neither canPrompt nor isIos", () => {
      mockUseInstallPrompt.mockReturnValue(
        makeState({ isInstalled: false, canPrompt: false, isIos: false }),
      );
      const { container } = render(<InstallMenuItem />);
      expect(container).toBeEmptyDOMElement();
    });

    it("shows Install App button when canPrompt is true", () => {
      mockUseInstallPrompt.mockReturnValue(makeState({ canPrompt: true }));
      render(<InstallMenuItem />);
      expect(
        screen.getByRole("button", { name: /install app/i }),
      ).toBeInTheDocument();
    });

    it("shows Install App button on iOS Safari", () => {
      mockUseInstallPrompt.mockReturnValue(makeState({ isIos: true }));
      render(<InstallMenuItem />);
      expect(
        screen.getByRole("button", { name: /install app/i }),
      ).toBeInTheDocument();
    });

    it("shows Install App button even when banner was dismissed (isDismissed has no effect here)", () => {
      mockUseInstallPrompt.mockReturnValue(
        makeState({ canPrompt: true, isDismissed: true }),
      );
      render(<InstallMenuItem />);
      expect(
        screen.getByRole("button", { name: /install app/i }),
      ).toBeInTheDocument();
    });
  });

  describe("Android/Chrome click", () => {
    it("calls clearDismissal() and triggerInstall() when clicked", async () => {
      const triggerInstall = vi.fn().mockResolvedValue(undefined);
      const clearDismissal = vi.fn();
      mockUseInstallPrompt.mockReturnValue(
        makeState({ canPrompt: true, triggerInstall, clearDismissal }),
      );
      const user = userEvent.setup();
      render(<InstallMenuItem />);

      await user.click(screen.getByRole("button", { name: /install app/i }));

      expect(clearDismissal).toHaveBeenCalledOnce();
      expect(triggerInstall).toHaveBeenCalledOnce();
    });

    it("does NOT open iOS sheet on Android", async () => {
      mockUseInstallPrompt.mockReturnValue(
        makeState({
          canPrompt: true,
          triggerInstall: vi.fn().mockResolvedValue(undefined),
          clearDismissal: vi.fn(),
        }),
      );
      const user = userEvent.setup();
      render(<InstallMenuItem />);

      await user.click(screen.getByRole("button", { name: /install app/i }));

      expect(
        screen.queryByRole("heading", { name: /add to home screen/i }),
      ).not.toBeInTheDocument();
    });
  });

  describe("iOS click", () => {
    it("calls clearDismissal() and opens the iOS sheet", async () => {
      const clearDismissal = vi.fn();
      const triggerInstall = vi.fn();
      mockUseInstallPrompt.mockReturnValue(
        makeState({ isIos: true, clearDismissal, triggerInstall }),
      );
      const user = userEvent.setup();
      render(<InstallMenuItem />);

      await user.click(screen.getByRole("button", { name: /install app/i }));

      expect(clearDismissal).toHaveBeenCalledOnce();
      expect(
        screen.getByRole("heading", { name: /add to home screen/i }),
      ).toBeInTheDocument();
    });

    it("does NOT call triggerInstall() on iOS", async () => {
      const triggerInstall = vi.fn();
      mockUseInstallPrompt.mockReturnValue(
        makeState({ isIos: true, triggerInstall, clearDismissal: vi.fn() }),
      );
      const user = userEvent.setup();
      render(<InstallMenuItem />);

      await user.click(screen.getByRole("button", { name: /install app/i }));

      expect(triggerInstall).not.toHaveBeenCalled();
    });
  });

  describe("optional onClick callback", () => {
    it("calls the onClick prop before triggering install", async () => {
      const onClick = vi.fn();
      const triggerInstall = vi.fn().mockResolvedValue(undefined);
      mockUseInstallPrompt.mockReturnValue(
        makeState({
          canPrompt: true,
          triggerInstall,
          clearDismissal: vi.fn(),
        }),
      );
      const user = userEvent.setup();
      render(<InstallMenuItem onClick={onClick} />);

      await user.click(screen.getByRole("button", { name: /install app/i }));

      expect(onClick).toHaveBeenCalledOnce();
    });
  });
});

// ---------------------------------------------------------------------------
// IosInstallSettingsCard
// ---------------------------------------------------------------------------

describe("IosInstallSettingsCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows an Install App entry for iOS Safari after the banner was dismissed", () => {
    mockUseInstallPrompt.mockReturnValue(
      makeState({ isIos: true, isDismissed: true }),
    );

    render(<IosInstallSettingsCard />);

    expect(
      screen.getByRole("button", { name: /install app/i }),
    ).toBeInTheDocument();
  });

  it.each([
    ["the banner has not been dismissed", makeState({ isIos: true })],
    ["the browser is not iOS Safari", makeState({ isDismissed: true })],
    [
      "the app is already installed",
      makeState({ isIos: true, isDismissed: true, isInstalled: true }),
    ],
  ])("is hidden when %s", (_reason, installState) => {
    mockUseInstallPrompt.mockReturnValue(installState);

    const { container } = render(<IosInstallSettingsCard />);

    expect(container).toBeEmptyDOMElement();
  });

  it("reopens the iOS instruction sheet without clearing the dismissal", async () => {
    const clearDismissal = vi.fn();
    mockUseInstallPrompt.mockReturnValue(
      makeState({ isIos: true, isDismissed: true, clearDismissal }),
    );
    const user = userEvent.setup();
    render(<IosInstallSettingsCard />);

    await user.click(screen.getByRole("button", { name: /install app/i }));

    expect(
      screen.getByRole("heading", { name: /add to home screen/i }),
    ).toBeInTheDocument();
    expect(clearDismissal).not.toHaveBeenCalled();
  });
});
