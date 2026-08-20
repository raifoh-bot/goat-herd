import { useCallback, useEffect, useState } from "react";

const DISMISSED_KEY = "pwa-install-dismissed";
const DISMISSAL_COUNT_KEY = "pwa-install-dismissal-count";
const VISIT_COUNT_KEY = "pwa-install-visit-count";
const VISIT_RECORDED_SESSION_KEY = "pwa-install-visit-recorded";
const INSTALL_PROMPT_CHANGE_EVENT = "install-prompt-preferences-changed";
const DISMISSAL_CHANGED_EVENT = "pwa-install-dismissal-changed";

/** Adjust this to change how many separate browser sessions pass before the reminder appears. */
export const INSTALL_NUDGE_VISIT_THRESHOLD = 3;
const MAX_INSTALL_DISMISSALS = 2;

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
  /** Number of separate browser sessions in which the app has been visited. */
  visitCount: number;
  /** Number of times the install invitation has been explicitly dismissed. */
  dismissalCount: number;
  /** True when a returning visitor should see the lighter manual-install reminder. */
  shouldShowNudge: boolean;
  /** Trigger the native browser install prompt (Android/Chrome). No-op on iOS. */
  triggerInstall: () => Promise<void>;
  /** Persist dismissal so the banner doesn't reappear. */
  dismiss: () => void;
  /** Record a second dismissal and suppress future install reminders. */
  dismissNudge: () => void;
  /** Clear the dismissal so the banner can reappear (useful for a manual install entry). */
  clearDismissal: () => void;
}

function getStoredCount(key: string): number {
  const value = Number.parseInt(localStorage.getItem(key) ?? "0", 10);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function getDismissalCount(): number {
  const storedCount = getStoredCount(DISMISSAL_COUNT_KEY);
  // Keep existing users' original banner dismissal meaningful after the counter
  // is introduced.
  return Math.max(
    storedCount,
    localStorage.getItem(DISMISSED_KEY) === "1" ? 1 : 0,
  );
}

function dispatchPreferenceChange() {
  window.dispatchEvent(new Event(INSTALL_PROMPT_CHANGE_EVENT));
  // Retain the event introduced for the iOS settings-card flow so any
  // already-mounted install-prompt consumers update immediately.
  window.dispatchEvent(new Event(DISMISSAL_CHANGED_EVENT));
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
  const [visitCount, setVisitCount] = useState(
    () => getStoredCount(VISIT_COUNT_KEY),
  );
  const [dismissalCount, setDismissalCount] = useState(getDismissalCount);

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
    const syncPreferences = () => {
      setVisitCount(getStoredCount(VISIT_COUNT_KEY));
      setDismissalCount(getDismissalCount());
      setIsDismissed(localStorage.getItem(DISMISSED_KEY) === "1");
    };

    const syncFromOtherTabs = (event: StorageEvent) => {
      if (
        event.key === DISMISSED_KEY ||
        event.key === DISMISSAL_COUNT_KEY ||
        event.key === VISIT_COUNT_KEY
      ) {
        syncPreferences();
      }
    };

    window.addEventListener(INSTALL_PROMPT_CHANGE_EVENT, syncPreferences);
    window.addEventListener(DISMISSAL_CHANGED_EVENT, syncPreferences);
    window.addEventListener("storage", syncFromOtherTabs);
    return () => {
      window.removeEventListener(INSTALL_PROMPT_CHANGE_EVENT, syncPreferences);
      window.removeEventListener(DISMISSAL_CHANGED_EVENT, syncPreferences);
      window.removeEventListener("storage", syncFromOtherTabs);
    };
  }, []);

  useEffect(() => {
    if (sessionStorage.getItem(VISIT_RECORDED_SESSION_KEY) === "1") {
      setVisitCount(getStoredCount(VISIT_COUNT_KEY));
      return;
    }

    const nextVisitCount = getStoredCount(VISIT_COUNT_KEY) + 1;
    localStorage.setItem(VISIT_COUNT_KEY, String(nextVisitCount));
    sessionStorage.setItem(VISIT_RECORDED_SESSION_KEY, "1");
    setVisitCount(nextVisitCount);
    dispatchPreferenceChange();
  }, []);

  useEffect(() => {
    const handler = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };
    window.addEventListener("appinstalled", handler);
    return () => window.removeEventListener("appinstalled", handler);
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
    const nextDismissalCount = Math.min(
      getDismissalCount() + 1,
      MAX_INSTALL_DISMISSALS,
    );
    localStorage.setItem(DISMISSED_KEY, "1");
    localStorage.setItem(DISMISSAL_COUNT_KEY, String(nextDismissalCount));
    setIsDismissed(true);
    setDismissalCount(nextDismissalCount);
    dispatchPreferenceChange();
  }, []);

  const dismissNudge = useCallback(() => {
    if (dismissalCount >= MAX_INSTALL_DISMISSALS) return;
    dismiss();
  }, [dismiss, dismissalCount]);

  const clearDismissal = useCallback(() => {
    localStorage.removeItem(DISMISSED_KEY);
    setIsDismissed(false);
    dispatchPreferenceChange();
  }, []);

  const canPrompt = deferredPrompt !== null;
  const shouldShowBanner =
    !isInstalled && !isDismissed && (canPrompt || ios);
  const shouldShowNudge =
    !isInstalled &&
    isDismissed &&
    dismissalCount < MAX_INSTALL_DISMISSALS &&
    visitCount >= INSTALL_NUDGE_VISIT_THRESHOLD &&
    (canPrompt || ios);

  return {
    canPrompt,
    isIos: ios,
    isInstalled,
    isDismissed,
    shouldShowBanner,
    visitCount,
    dismissalCount,
    shouldShowNudge,
    triggerInstall,
    dismiss,
    dismissNudge,
    clearDismissal,
  };
}
