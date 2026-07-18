import { useState } from "react";
import { Link } from "wouter";
import { Mail, X } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";

const DISMISS_KEY = "mygoatherd.missing-email-banner-dismissed";

/**
 * Gentle, non-blocking prompt shown to signed-in farm users who have no email
 * on file (accounts created before email became required). Without an email
 * the forgot-password flow can't reach them. Dismissable per browser session;
 * it reappears next session until an email is saved.
 */
export function MissingEmailBanner() {
  const { user } = useAuth();
  const [dismissed, setDismissed] = useState(
    () => sessionStorage.getItem(DISMISS_KEY) === "1",
  );

  if (user.role === "superadmin" || user.email || dismissed) {
    return null;
  }

  const dismiss = () => {
    sessionStorage.setItem(DISMISS_KEY, "1");
    setDismissed(true);
  };

  return (
    <div className="no-print flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 bg-sky-100 px-3 py-1.5 sm:px-4 sm:py-2 text-xs sm:text-sm text-sky-950 border-b border-sky-200">
      <span className="flex items-center gap-1.5 sm:gap-2 min-w-0">
        <Mail className="h-4 w-4 flex-shrink-0" />
        <span>
          Your account has no email on file, so password reset won't work.{" "}
          <Link
            href="/admin/settings?tab=account"
            className="font-semibold underline underline-offset-2 hover:text-sky-800"
          >
            Add your email
          </Link>
        </span>
      </span>
      <Button
        size="sm"
        variant="ghost"
        className="h-7 px-2 text-sky-950 hover:bg-sky-200"
        onClick={dismiss}
        aria-label="Dismiss email reminder"
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}
