import { useState } from "react";
import { Download, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useInstallPrompt } from "@/hooks/use-install-prompt";
import { IosInstallSheet } from "@/components/ios-install-sheet";

/**
 * Dismissible install banner shown at the top of the main content area.
 *
 * - Android/Chrome: triggers the browser's native install prompt.
 * - iOS Safari: opens step-by-step Add-to-Home-Screen instructions.
 * - Hidden once the app is installed or after the user dismisses it.
 */
export function InstallBanner() {
  const { shouldShowBanner, canPrompt, isIos, triggerInstall, dismiss } =
    useInstallPrompt();
  const [iosSheetOpen, setIosSheetOpen] = useState(false);

  if (!shouldShowBanner) return null;

  const handleInstallClick = async () => {
    if (isIos) {
      setIosSheetOpen(true);
    } else if (canPrompt) {
      await triggerInstall();
    }
  };

  return (
    <>
      <div
        role="banner"
        className="flex items-center gap-3 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 shadow-sm mb-4 md:mb-6"
      >
        <Download className="h-4 w-4 text-primary flex-shrink-0" />
        <p className="flex-1 text-sm text-foreground">
          <span className="font-medium">Install MyGoatHerd</span>
          {" — "}
          {isIos
            ? "add it to your home screen for quick, full-screen access."
            : "add it to your home screen for quick access, even offline."}
        </p>
        <Button
          size="sm"
          variant="default"
          onClick={handleInstallClick}
          className="flex-shrink-0 h-8 text-xs px-3"
        >
          Install
        </Button>
        <button
          type="button"
          aria-label="Dismiss install prompt"
          onClick={dismiss}
          className="flex-shrink-0 rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <IosInstallSheet open={iosSheetOpen} onOpenChange={setIosSheetOpen} />
    </>
  );
}

/**
 * A compact "Install app" button for menus/drawers — always available
 * as a manual entry point (even after the banner is dismissed), hidden only
 * when the app is already running installed.
 */
export function InstallMenuItem({ onClick }: { onClick?: () => void }) {
  const { isInstalled, canPrompt, isIos, triggerInstall, clearDismissal } =
    useInstallPrompt();
  const [iosSheetOpen, setIosSheetOpen] = useState(false);

  if (isInstalled) return null;
  // Only show when the browser supports installing or it's iOS Safari
  if (!canPrompt && !isIos) return null;

  const handleClick = async () => {
    onClick?.();
    if (isIos) {
      // Clear dismissal so re-opening the banner works if the user wants it
      clearDismissal();
      setIosSheetOpen(true);
    } else if (canPrompt) {
      clearDismissal();
      await triggerInstall();
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        className="flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 text-sm font-medium w-full text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
      >
        <Download className="h-4 w-4" />
        Install App
      </button>

      <IosInstallSheet open={iosSheetOpen} onOpenChange={setIosSheetOpen} />
    </>
  );
}

/**
 * A settings-page entry that lets iOS Safari users revisit the manual
 * Add-to-Home-Screen instructions after dismissing the install banner.
 */
export function IosInstallSettingsCard() {
  const { isDismissed, isInstalled, isIos } = useInstallPrompt();
  const [iosSheetOpen, setIosSheetOpen] = useState(false);

  if (!isIos || !isDismissed || isInstalled) return null;

  return (
    <>
      <Card className="border-primary/10 shadow-lg">
        <CardHeader>
          <CardTitle className="font-serif flex items-center gap-2">
            <Download className="h-4 w-4 text-primary" /> Install App
          </CardTitle>
          <CardDescription>
            Add MyGoatHerd to your iPhone home screen for quick, full-screen access.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button type="button" onClick={() => setIosSheetOpen(true)}>
            Install App
          </Button>
        </CardContent>
      </Card>

      <IosInstallSheet open={iosSheetOpen} onOpenChange={setIosSheetOpen} />
    </>
  );
}
