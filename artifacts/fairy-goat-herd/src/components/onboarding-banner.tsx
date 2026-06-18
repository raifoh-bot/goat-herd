import { useEffect, useState } from "react";
import { Link } from "wouter";
import { Building2, PartyPopper, Users, X } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useFarmSettings, DEFAULT_FARM_NAME } from "@/lib/settings";
import { Button } from "@/components/ui/button";

const dismissKey = (userId: number) => `onboarding_dismissed_${userId}`;

/**
 * A prominent, dismissible setup prompt shown to new Owners on the dashboard
 * before they've named their farm. Disappears automatically once the farm name
 * is configured, or when the Owner dismisses it (remembered per user/device).
 */
export function OnboardingBanner() {
  const { user } = useAuth();
  const { farmName, isLoading } = useFarmSettings();
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    try {
      setDismissed(localStorage.getItem(dismissKey(user.id)) !== null);
    } catch {
      setDismissed(false);
    }
  }, [user.id]);

  const handleDismiss = () => {
    try {
      localStorage.setItem(dismissKey(user.id), "1");
    } catch {
      // Ignore storage failures; the banner will simply reappear next visit.
    }
    setDismissed(true);
  };

  const farmConfigured =
    !isLoading && farmName.trim() !== "" && farmName !== DEFAULT_FARM_NAME;

  if (user.role !== "owner" || isLoading || farmConfigured || dismissed) {
    return null;
  }

  return (
    <div className="relative overflow-hidden rounded-2xl border border-amber-300/70 bg-gradient-to-br from-amber-50 to-amber-100/60 p-6 shadow-md animate-in fade-in slide-in-from-top-2 duration-500 dark:border-amber-500/30 dark:from-amber-950/40 dark:to-amber-900/20">
      <button
        type="button"
        onClick={handleDismiss}
        aria-label="Dismiss setup guide"
        className="absolute right-4 top-4 rounded-md p-1 text-amber-700/70 transition-colors hover:bg-amber-200/60 hover:text-amber-900 dark:text-amber-200/70 dark:hover:bg-amber-800/40"
      >
        <X className="h-4 w-4" />
      </button>

      <div className="flex items-start gap-4">
        <div className="hidden h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-amber-200/80 text-amber-700 sm:flex dark:bg-amber-800/40 dark:text-amber-200">
          <PartyPopper className="h-6 w-6" />
        </div>
        <div className="flex-1 space-y-4">
          <div className="space-y-1 pr-8">
            <h3 className="font-serif text-xl font-bold text-amber-900 dark:text-amber-100">
              Welcome to MyGoatHerd!
            </h3>
            <p className="text-sm text-amber-800/90 dark:text-amber-200/80">
              Let's get your farm set up. These two quick steps make the app feel
              like home for your whole team.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-3 rounded-xl border border-amber-200 bg-white/70 p-4 dark:border-amber-500/20 dark:bg-amber-950/30">
              <div className="flex items-center gap-2 text-amber-900 dark:text-amber-100">
                <Building2 className="h-5 w-5 text-amber-600 dark:text-amber-300" />
                <span className="font-medium">1. Name your farm</span>
              </div>
              <p className="flex-1 text-sm text-amber-800/80 dark:text-amber-200/70">
                Set your farm name and logo so they show across the app and on
                printed reports.
              </p>
              <Button asChild size="sm" className="bg-amber-600 hover:bg-amber-700">
                <Link href="/admin/settings?tab=farm">Set up farm identity</Link>
              </Button>
            </div>

            <div className="flex flex-col gap-3 rounded-xl border border-amber-200 bg-white/70 p-4 dark:border-amber-500/20 dark:bg-amber-950/30">
              <div className="flex items-center gap-2 text-amber-900 dark:text-amber-100">
                <Users className="h-5 w-5 text-amber-600 dark:text-amber-300" />
                <span className="font-medium">2. Add your team</span>
              </div>
              <p className="flex-1 text-sm text-amber-800/80 dark:text-amber-200/70">
                Invite admins and farm hands so everyone can help manage the
                herd.
              </p>
              <Button
                asChild
                size="sm"
                variant="outline"
                className="border-amber-400 text-amber-800 hover:bg-amber-100 dark:border-amber-500/40 dark:text-amber-100 dark:hover:bg-amber-900/40"
              >
                <Link href="/admin/settings?tab=users">Add team members</Link>
              </Button>
            </div>
          </div>

          <button
            type="button"
            onClick={handleDismiss}
            className="text-sm font-medium text-amber-700/80 underline-offset-2 transition-colors hover:text-amber-900 hover:underline dark:text-amber-200/70 dark:hover:text-amber-100"
          >
            Skip for now
          </button>
        </div>
      </div>
    </div>
  );
}
