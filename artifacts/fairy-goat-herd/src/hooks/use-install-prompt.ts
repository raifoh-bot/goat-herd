import { useCallback, useEffect, useState } from "react";

const DISMISSED_KEY = "pwa-install-dismissed";
const DISMISSAL_CHANGED_EVENT = "pwa-install-dismissal-changed";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export interface InstallPromptState {
  /** True on Android/Chrome (and compatible browsers) with a pending install prompt. */
  canPrompt: boolean;
  /** True when running in iOS Safari (where the native Add-to-Home-Screen flow is manual). */
  isIos: boolean;
  /** True when the app is already running in standalone / installed mode. */
  isInstalled: boolean;
  /** True after the user dismissed the banner (persisted across sessions). */
  isDismissed: boolean;
  /** True when the banner should be shown (not installed, not dismissed, and either canPrompt or isIos). */
  shouldShowBanner: boolean;
  /** Trigger the native browser install prompt (Android/Chrome). No-op on iOS. */
  triggerInstall: () => Promise<void>;
  /** Persist dismissal so the banner doesn't reappear. */
  dismiss: () => void;
  /** Clear the dismissal so the banner can reappear (useful for a manual install entry). */
  clearDismissal: () => void;
}

function isIosSafari(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  const isIos = /iphone|ipad|ipod/i.test(ua);
  // Chrome on iOS reports CriOS, Firefox reports FxiOS — exclude those since
  // they cannot do Add to Home Screen from their own prompts.
  const isSafari = /safari/i.test(ua) && !/chrome|crios|fxios|edgios/i.test(ua);
  return isIos && isSafari;
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const standaloneMedia =
    typeof window.matchMedia === "function"
      ? window.matchMedia("(display-mode: standalone)").matches
      : false;
  // iOS PWA check
  const iosStandalone =
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return standaloneMedia || iosStandalone;
}

export function useInstallPrompt(): InstallPromptState {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(isStandalone);
  const [isDismissed, setIsDismissed] = useState(
    () => localStorage.getItem(DISMISSED_KEY) === "1",
  );

  const ios = isIosSafari();

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  useEffect(() => {
    const handler = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };
    window.addEventListener("appinstalled", handler);
    return () => window.removeEventListener("appinstalled", handler);
  }, []);

  useEffect(() => {
    const syncDismissal = () => {
      setIsDismissed(localStorage.getItem(DISMISSED_KEY) === "1");
    };
    window.addEventListener("storage", syncDismissal);
    window.addEventListener(DISMISSAL_CHANGED_EVENT, syncDismissal);
    return () => {
      window.removeEventListener("storage", syncDismissal);
      window.removeEventListener(DISMISSAL_CHANGED_EVENT, syncDismissal);
    };
  }, []);

  const triggerInstall = useCallback(async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      setIsInstalled(true);
    }
    setDeferredPrompt(null);
  }, [deferredPrompt]);

  const dismiss = useCallback(() => {
    localStorage.setItem(DISMISSED_KEY, "1");
    setIsDismissed(true);
    window.dispatchEvent(new Event(DISMISSAL_CHANGED_EVENT));
  }, []);

  const clearDismissal = useCallback(() => {
    localStorage.removeItem(DISMISSED_KEY);
    setIsDismissed(false);
    window.dispatchEvent(new Event(DISMISSAL_CHANGED_EVENT));
  }, []);

  const canPrompt = deferredPrompt !== null;
  const shouldShowBanner =
    !isInstalled && !isDismissed && (canPrompt || ios);

  return {
    canPrompt,
    isIos: ios,
    isInstalled,
    isDismissed,
    shouldShowBanner,
    triggerInstall,
    dismiss,
    clearDismissal,
  };
}
