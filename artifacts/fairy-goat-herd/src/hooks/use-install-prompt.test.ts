/**
 * Unit tests for the useInstallPrompt hook.
 * These test the REAL hook implementation; no module mocks are used here.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useInstallPrompt } from "./use-install-prompt";

// ---------------------------------------------------------------------------
// Platform stub helpers
// ---------------------------------------------------------------------------

function stubUserAgent(ua: string) {
  Object.defineProperty(navigator, "userAgent", {
    value: ua,
    configurable: true,
    writable: true,
  });
}

function stubMatchMedia(standalone: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      matches: query === "(display-mode: standalone)" ? standalone : false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
}

function stubIosStandalone(value: boolean | undefined) {
  Object.defineProperty(navigator, "standalone", {
    value,
    configurable: true,
    writable: true,
  });
}

/** Fire a synthetic beforeinstallprompt event and return the mock prompt fn. */
function fireBeforeInstallPrompt(
  outcome: "accepted" | "dismissed" = "dismissed",
) {
  const promptFn = vi.fn().mockResolvedValue(undefined);
  const userChoice = Promise.resolve({ outcome });
  const event = new Event("beforeinstallprompt");
  Object.assign(event, { prompt: promptFn, userChoice });
  act(() => {
    window.dispatchEvent(event);
  });
  return { event, promptFn };
}

/** Fire the appinstalled event. */
function fireAppInstalled() {
  act(() => {
    window.dispatchEvent(new Event("appinstalled"));
  });
}

// ---------------------------------------------------------------------------
// Known UAs
// ---------------------------------------------------------------------------

const DESKTOP_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125 Safari/537.36";
const IOS_SAFARI_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
const IOS_CHROME_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/125.0.0.0 Mobile/15E148 Safari/604.1";

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  stubUserAgent(DESKTOP_UA);
  stubMatchMedia(false);
  stubIosStandalone(undefined);
  localStorage.clear();
  sessionStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("useInstallPrompt", () => {
  describe("initial state — no event, no stored dismissal", () => {
    it("starts with no prompt available", () => {
      const { result } = renderHook(() => useInstallPrompt());
      expect(result.current.canPrompt).toBe(false);
    });

    it("detects non-iOS UA correctly", () => {
      const { result } = renderHook(() => useInstallPrompt());
      expect(result.current.isIos).toBe(false);
    });

    it("is not installed when matchMedia returns false", () => {
      const { result } = renderHook(() => useInstallPrompt());
      expect(result.current.isInstalled).toBe(false);
    });

    it("is not dismissed on a fresh session", () => {
      const { result } = renderHook(() => useInstallPrompt());
      expect(result.current.isDismissed).toBe(false);
    });

    it("shouldShowBanner is false when canPrompt is false and not iOS", () => {
      const { result } = renderHook(() => useInstallPrompt());
      expect(result.current.shouldShowBanner).toBe(false);
    });
  });

  describe("beforeinstallprompt event", () => {
    it("sets canPrompt to true when the event fires", () => {
      const { result } = renderHook(() => useInstallPrompt());
      fireBeforeInstallPrompt();
      expect(result.current.canPrompt).toBe(true);
    });

    it("shouldShowBanner becomes true after the event", () => {
      const { result } = renderHook(() => useInstallPrompt());
      fireBeforeInstallPrompt();
      expect(result.current.shouldShowBanner).toBe(true);
    });

    it("does not show banner if already dismissed before the event fires", () => {
      localStorage.setItem("pwa-install-dismissed", "1");
      const { result } = renderHook(() => useInstallPrompt());
      fireBeforeInstallPrompt();
      expect(result.current.shouldShowBanner).toBe(false);
    });
  });

  describe("standalone / installed detection", () => {
    it("isInstalled is true when display-mode: standalone matches", () => {
      stubMatchMedia(true);
      const { result } = renderHook(() => useInstallPrompt());
      expect(result.current.isInstalled).toBe(true);
    });

    it("isInstalled is true when navigator.standalone is true (iOS PWA)", () => {
      stubIosStandalone(true);
      const { result } = renderHook(() => useInstallPrompt());
      expect(result.current.isInstalled).toBe(true);
    });

    it("shouldShowBanner is false in standalone mode even when the event fires", () => {
      stubMatchMedia(true);
      const { result } = renderHook(() => useInstallPrompt());
      fireBeforeInstallPrompt();
      expect(result.current.shouldShowBanner).toBe(false);
    });
  });

  describe("appinstalled event", () => {
    it("sets isInstalled to true when appinstalled fires", () => {
      const { result } = renderHook(() => useInstallPrompt());
      fireBeforeInstallPrompt();

      fireAppInstalled();

      expect(result.current.isInstalled).toBe(true);
      expect(result.current.shouldShowBanner).toBe(false);
    });

    it("clears canPrompt when appinstalled fires", () => {
      const { result } = renderHook(() => useInstallPrompt());
      fireBeforeInstallPrompt();
      expect(result.current.canPrompt).toBe(true);

      fireAppInstalled();

      expect(result.current.canPrompt).toBe(false);
    });
  });

  describe("dismiss", () => {
    it("persists dismissal to localStorage", () => {
      const { result } = renderHook(() => useInstallPrompt());
      fireBeforeInstallPrompt();

      act(() => {
        result.current.dismiss();
      });

      expect(localStorage.getItem("pwa-install-dismissed")).toBe("1");
      expect(localStorage.getItem("pwa-install-dismissal-count")).toBe("1");
    });

    it("sets isDismissed to true immediately", () => {
      const { result } = renderHook(() => useInstallPrompt());
      fireBeforeInstallPrompt();

      act(() => {
        result.current.dismiss();
      });

      expect(result.current.isDismissed).toBe(true);
    });

    it("shouldShowBanner is false immediately after dismissal", () => {
      const { result } = renderHook(() => useInstallPrompt());
      fireBeforeInstallPrompt();
      expect(result.current.shouldShowBanner).toBe(true);

      act(() => {
        result.current.dismiss();
      });

      expect(result.current.shouldShowBanner).toBe(false);
    });

    it("persists dismissal across remounts (reads from localStorage on init)", () => {
      localStorage.setItem("pwa-install-dismissed", "1");
      const { result } = renderHook(() => useInstallPrompt());
      expect(result.current.isDismissed).toBe(true);
    });

    it("updates other mounted install prompt consumers immediately", () => {
      const { result: bannerPrompt } = renderHook(() => useInstallPrompt());
      const { result: settingsPrompt } = renderHook(() => useInstallPrompt());

      act(() => {
        bannerPrompt.current.dismiss();
      });

      expect(settingsPrompt.current.isDismissed).toBe(true);
    });
  });

  describe("return-visit install nudge", () => {
    it("increments the persisted visit count once per browser session", () => {
      renderHook(() => useInstallPrompt());
      expect(localStorage.getItem("pwa-install-visit-count")).toBe("1");

      renderHook(() => useInstallPrompt());
      expect(localStorage.getItem("pwa-install-visit-count")).toBe("1");

      sessionStorage.clear();
      renderHook(() => useInstallPrompt());
      expect(localStorage.getItem("pwa-install-visit-count")).toBe("2");
    });

    it("shows the nudge after the threshold for a visitor who dismissed the banner once", () => {
      stubUserAgent(IOS_SAFARI_UA);
      localStorage.setItem("pwa-install-visit-count", "3");
      sessionStorage.setItem("pwa-install-visit-recorded", "1");
      const { result } = renderHook(() => useInstallPrompt());

      act(() => {
        result.current.dismiss();
      });

      expect(result.current.shouldShowNudge).toBe(true);
    });

    it("suppresses the nudge after its second explicit dismissal", () => {
      stubUserAgent(IOS_SAFARI_UA);
      localStorage.setItem("pwa-install-visit-count", "3");
      localStorage.setItem("pwa-install-dismissal-count", "1");
      localStorage.setItem("pwa-install-dismissed", "1");
      sessionStorage.setItem("pwa-install-visit-recorded", "1");
      const { result } = renderHook(() => useInstallPrompt());
      expect(result.current.shouldShowNudge).toBe(true);

      act(() => {
        result.current.dismissNudge();
      });

      expect(result.current.dismissalCount).toBe(2);
      expect(result.current.shouldShowNudge).toBe(false);
    });

    it("never shows the nudge once the app is installed", () => {
      stubUserAgent(IOS_SAFARI_UA);
      stubIosStandalone(true);
      localStorage.setItem("pwa-install-visit-count", "3");
      localStorage.setItem("pwa-install-dismissed", "1");
      sessionStorage.setItem("pwa-install-visit-recorded", "1");

      const { result } = renderHook(() => useInstallPrompt());
      expect(result.current.shouldShowNudge).toBe(false);
    });
  });

  describe("clearDismissal", () => {
    it("removes the key from localStorage", () => {
      localStorage.setItem("pwa-install-dismissed", "1");
      const { result } = renderHook(() => useInstallPrompt());

      act(() => {
        result.current.clearDismissal();
      });

      expect(localStorage.getItem("pwa-install-dismissed")).toBeNull();
    });

    it("sets isDismissed to false", () => {
      localStorage.setItem("pwa-install-dismissed", "1");
      const { result } = renderHook(() => useInstallPrompt());
      expect(result.current.isDismissed).toBe(true);

      act(() => {
        result.current.clearDismissal();
      });

      expect(result.current.isDismissed).toBe(false);
    });

    it("shouldShowBanner becomes true again after clearDismissal if a prompt is available", () => {
      localStorage.setItem("pwa-install-dismissed", "1");
      const { result } = renderHook(() => useInstallPrompt());
      fireBeforeInstallPrompt();
      expect(result.current.shouldShowBanner).toBe(false);

      act(() => {
        result.current.clearDismissal();
      });

      expect(result.current.shouldShowBanner).toBe(true);
    });
  });

  describe("triggerInstall", () => {
    it("calls prompt() on the deferred event", async () => {
      const { result } = renderHook(() => useInstallPrompt());
      const { promptFn } = fireBeforeInstallPrompt("dismissed");

      await act(async () => {
        await result.current.triggerInstall();
      });

      expect(promptFn).toHaveBeenCalledOnce();
    });

    it("clears canPrompt after triggering regardless of outcome", async () => {
      const { result } = renderHook(() => useInstallPrompt());
      fireBeforeInstallPrompt("dismissed");

      await act(async () => {
        await result.current.triggerInstall();
      });

      expect(result.current.canPrompt).toBe(false);
    });

    it("sets isInstalled when user accepts", async () => {
      const { result } = renderHook(() => useInstallPrompt());
      fireBeforeInstallPrompt("accepted");

      await act(async () => {
        await result.current.triggerInstall();
      });

      expect(result.current.isInstalled).toBe(true);
    });

    it("does not set isInstalled when user dismisses the native prompt", async () => {
      const { result } = renderHook(() => useInstallPrompt());
      fireBeforeInstallPrompt("dismissed");

      await act(async () => {
        await result.current.triggerInstall();
      });

      expect(result.current.isInstalled).toBe(false);
    });

    it("is a no-op when there is no deferred prompt", async () => {
      const { result } = renderHook(() => useInstallPrompt());

      await act(async () => {
        await result.current.triggerInstall();
      });

      expect(result.current.canPrompt).toBe(false);
    });
  });

  describe("iOS Safari detection", () => {
    it("detects iOS Safari UA correctly", () => {
      stubUserAgent(IOS_SAFARI_UA);
      const { result } = renderHook(() => useInstallPrompt());
      expect(result.current.isIos).toBe(true);
    });

    it("shouldShowBanner is true on iOS Safari even without beforeinstallprompt", () => {
      stubUserAgent(IOS_SAFARI_UA);
      const { result } = renderHook(() => useInstallPrompt());
      expect(result.current.shouldShowBanner).toBe(true);
    });

    it("does NOT detect iOS Chrome as iOS Safari", () => {
      stubUserAgent(IOS_CHROME_UA);
      const { result } = renderHook(() => useInstallPrompt());
      expect(result.current.isIos).toBe(false);
    });

    it("iOS Chrome does not show banner (no native prompt, not iOS Safari)", () => {
      stubUserAgent(IOS_CHROME_UA);
      const { result } = renderHook(() => useInstallPrompt());
      expect(result.current.shouldShowBanner).toBe(false);
    });

    it("iOS Safari banner hidden after dismissal", () => {
      stubUserAgent(IOS_SAFARI_UA);
      localStorage.setItem("pwa-install-dismissed", "1");
      const { result } = renderHook(() => useInstallPrompt());
      expect(result.current.shouldShowBanner).toBe(false);
    });

    it("iOS Safari banner hidden in standalone mode", () => {
      stubUserAgent(IOS_SAFARI_UA);
      stubIosStandalone(true);
      const { result } = renderHook(() => useInstallPrompt());
      expect(result.current.shouldShowBanner).toBe(false);
    });
  });
});
