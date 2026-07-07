import { Eye } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { getUrlFarmSlug, rootUrl } from "@/lib/farm";
import { Button } from "@/components/ui/button";

/**
 * Sticky banner shown when a platform superadmin is viewing a farm's data in the
 * read-only "view as farm" support flow. Renders nothing for regular farm users
 * or when there is no farm context. The Exit button leaves the impersonated farm
 * with a full-page navigation so the router re-mounts at the platform root.
 */
export function SuperadminViewBanner() {
  const { user } = useAuth();
  const slug = getUrlFarmSlug();

  if (user.role !== "superadmin" || !slug) {
    return null;
  }

  return (
    <div className="no-print sticky top-0 z-50 flex flex-wrap items-center justify-between gap-2 bg-amber-500 px-4 py-2 text-sm font-medium text-amber-950 shadow-md">
      <span className="flex items-center gap-2">
        <Eye className="h-4 w-4 flex-shrink-0" />
        Viewing{" "}
        <span className="font-mono font-semibold">{slug}</span> as platform admin
        — read-only
      </span>
      <Button
        size="sm"
        variant="outline"
        className="border-amber-950/30 bg-amber-100 text-amber-950 hover:bg-amber-50"
        onClick={() => {
          window.location.href = rootUrl("/superadmin/farms");
        }}
      >
        Exit to platform admin
      </Button>
    </div>
  );
}
