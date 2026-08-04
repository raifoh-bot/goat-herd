import type { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useLogout,
  getGetCurrentUserQueryKey,
} from "@workspace/api-client-react";
import { Archive, PauseCircle, Tractor, Users } from "lucide-react";
import { GoatIcon } from "@/components/goat-icon";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { storeFarmSlug } from "@/lib/farm";
import { storeAuthToken } from "@/lib/token";

const NAV_ITEMS = [
  { href: "/superadmin/farms", label: "Farms", icon: Tractor },
  { href: "/superadmin/suspended-farms", label: "Suspended Farms", icon: PauseCircle },
  { href: "/superadmin/deleted-farms", label: "Deleted Farms", icon: Archive },
  { href: "/superadmin/users", label: "Users", icon: Users },
];

/**
 * Shared chrome for every super-admin page: top header with branding and
 * sign-out, plus a left-hand navigation between the panel's sections. On
 * small screens the nav collapses into a horizontal scrollable bar under
 * the header.
 */
export function SuperadminLayout({ children }: { children: ReactNode }) {
  const [location, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const logout = useLogout();

  const handleLogout = () => {
    logout.mutate(undefined, {
      onSuccess: () => {
        storeFarmSlug(null);
        storeAuthToken(null);
        queryClient.setQueryData(getGetCurrentUserQueryKey(), null);
        setLocation("/login");
      },
    });
  };

  const navLinks = NAV_ITEMS.map((item) => {
    const active = location === item.href;
    const Icon = item.icon;
    return (
      <Link
        key={item.href}
        href={item.href}
        className={cn(
          "flex items-center gap-2 whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium transition-colors",
          active
            ? "bg-primary/10 text-primary"
            : "text-muted-foreground hover:bg-muted hover:text-foreground",
        )}
      >
        <Icon className="h-4 w-4 shrink-0" />
        {item.label}
      </Link>
    );
  });

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sidebar-primary text-sidebar-primary-foreground">
              <GoatIcon className="h-6 w-6" />
            </div>
            <div>
              <h1 className="font-serif text-lg font-semibold">Platform admin</h1>
              <p className="text-xs text-muted-foreground">
                Manage every farm on MyGoatHerd
              </p>
            </div>
          </div>
          <Button variant="ghost" onClick={handleLogout} disabled={logout.isPending}>
            Sign out
          </Button>
        </div>
        {/* Mobile: horizontal nav under the header */}
        <nav className="flex gap-1 overflow-x-auto px-4 pb-3 md:hidden">
          {navLinks}
        </nav>
      </header>

      <div className="mx-auto flex max-w-6xl gap-8 px-6 py-8">
        {/* Desktop: left-hand sidebar */}
        <aside className="hidden w-52 shrink-0 md:block">
          <nav className="sticky top-8 flex flex-col gap-1">{navLinks}</nav>
        </aside>
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
