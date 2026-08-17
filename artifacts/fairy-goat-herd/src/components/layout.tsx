import { ReactNode, useState } from "react";
import { Link, useLocation } from "wouter";
import { ClipboardList, FileText, Heart, HeartPulse, List, LogOut, Menu, Milk, MoreHorizontal, Settings, Snowflake } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useLogout, getGetCurrentUserQueryKey } from "@workspace/api-client-react";
import { cn } from "@/lib/utils";
import { GoatIcon } from "@/components/goat-icon";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { useAuth } from "@/lib/auth";
import { storeAuthToken } from "@/lib/token";
import { useFarmSettings } from "@/lib/settings";
import { QuickPhotoCapture } from "@/components/quick-photo-capture";
import { InstallBanner, InstallMenuItem } from "@/components/install-banner";

interface LayoutProps {
  children: ReactNode;
}

const ROLE_LABELS: Record<string, string> = {
  admin: "Admin",
  owner: "Owner",
  farmhand: "Farm Hand",
};

interface NavItem {
  href: string;
  label: string;
  icon: typeof ClipboardList;
  exact: boolean;
}

function isNavActive(item: NavItem, location: string): boolean {
  return item.exact
    ? location === item.href
    : location === item.href || location.startsWith(item.href + "/");
}

// The four destinations that live in the mobile bottom tab bar. Everything else
// (Herd Work Day, Add Goat, AI Inventory, Settings, photo capture, sign out)
// lives behind the "More" tab which opens the drawer.
const PRIMARY_MOBILE_HREFS = new Set(["/", "/goats", "/breedings", "/reports"]);

export function Layout({ children }: LayoutProps) {
  const [location, setLocation] = useLocation();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const logout = useLogout();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const isManager = user.role === "admin" || user.role === "owner";
  const { usesAi, farmName, logoUrl } = useFarmSettings();

  const handleLogout = () => {
    logout.mutate(undefined, {
      onSettled: () => {
        storeAuthToken(null);
        queryClient.setQueryData(getGetCurrentUserQueryKey(), null);
        queryClient.clear();
        setLocation("/login");
      },
    });
  };

  const navItems: NavItem[] = [
    { href: "/", label: "Dashboard", icon: ClipboardList, exact: true },
    { href: "/goats", label: "The Herd", icon: List, exact: false },
    { href: "/breedings", label: "Kiddings", icon: Heart, exact: false },
    { href: "/health-events/new", label: "Herd Work Day", icon: HeartPulse, exact: true },
    ...(usesAi ? [{ href: "/inventory", label: "AI Inventory", icon: Snowflake, exact: false }] : []),
    ...(isManager ? [{ href: "/goats/new", label: "Add Goat", icon: Milk, exact: true }] : []),
    { href: "/reports", label: "Reports", icon: FileText, exact: false },
    { href: "/admin/settings", label: "Farm Settings", icon: Settings, exact: false },
  ];

  const bottomNav: NavItem[] = [
    { href: "/", label: "Dashboard", icon: ClipboardList, exact: true },
    { href: "/goats", label: "Herd", icon: List, exact: false },
    { href: "/breedings", label: "Kiddings", icon: Heart, exact: false },
    { href: "/reports", label: "Reports", icon: FileText, exact: false },
  ];

  // "More" is highlighted whenever the current page isn't one of the primary tabs.
  const moreActive = !bottomNav.some((item) => isNavActive(item, location));

  const userCard = (
    <div className="rounded-xl bg-sidebar-accent/50 p-4 border border-sidebar-accent">
      <p className="text-sm font-medium text-sidebar-foreground truncate">{user.fullName || user.username}</p>
      <p className="text-xs text-sidebar-foreground/70">{ROLE_LABELS[user.role] ?? user.role}</p>
    </div>
  );

  const signOutButton = (
    <Button
      variant="ghost"
      size="sm"
      onClick={handleLogout}
      disabled={logout.isPending}
      className="w-full justify-start text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
    >
      <LogOut className="mr-2 h-4 w-4" />
      {logout.isPending ? "Signing out…" : "Sign Out"}
    </Button>
  );

  const logoBadge = logoUrl ? (
    <img
      src={logoUrl}
      alt={`${farmName} logo`}
      className="h-10 w-10 rounded-xl object-cover shadow-inner bg-white"
    />
  ) : (
    <div className="h-10 w-10 rounded-xl bg-sidebar-primary flex items-center justify-center text-sidebar-primary-foreground shadow-inner">
      <GoatIcon className="h-6 w-6" />
    </div>
  );

  return (
    <div className="min-h-screen bg-background flex flex-col md:flex-row">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex md:w-64 bg-sidebar text-sidebar-foreground flex-shrink-0 border-r border-sidebar-border shadow-xl z-10 relative flex-col">
        <div className="p-6">
          <div className="flex items-center gap-3 mb-8">
            {logoBadge}
            <div className="min-w-0">
              <h1 className="font-serif font-semibold text-lg text-sidebar-foreground truncate">{farmName}</h1>
            </div>
          </div>

          <nav aria-label="Main" className="space-y-1.5">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = isNavActive(item, location);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 text-sm font-medium",
                    isActive
                      ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-md"
                      : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
            <InstallMenuItem />
          </nav>

          <QuickPhotoCapture />
        </div>

        <div className="mt-auto p-6 space-y-3">
          {userCard}
          {signOutButton}
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="no-print md:hidden flex items-center gap-3 bg-sidebar text-sidebar-foreground border-b border-sidebar-border px-4 py-3 shadow-sm">
        {logoUrl ? (
          <img
            src={logoUrl}
            alt={`${farmName} logo`}
            className="h-8 w-8 rounded-lg object-cover shadow-inner bg-white"
          />
        ) : (
          <div className="h-8 w-8 rounded-lg bg-sidebar-primary flex items-center justify-center text-sidebar-primary-foreground shadow-inner">
            <GoatIcon className="h-5 w-5" />
          </div>
        )}
        <h1 className="font-serif font-semibold text-base text-sidebar-foreground truncate flex-1">{farmName}</h1>
        <button
          type="button"
          aria-label="Open menu"
          onClick={() => setDrawerOpen(true)}
          className="rounded-lg p-2 text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        >
          <Menu className="h-5 w-5" />
        </button>
      </header>

      <main className="flex-1 flex flex-col min-h-0 overflow-hidden relative">
        <div className="no-print absolute top-0 left-0 w-full h-64 bg-gradient-to-b from-primary/5 to-transparent pointer-events-none" />
        <div className="flex-1 overflow-auto p-4 pb-24 md:p-8 md:pb-8 lg:p-12 lg:pb-12 relative z-0 print:overflow-visible print:p-0 print:pb-0">
          <div className="max-w-6xl mx-auto">
            <InstallBanner />
            {children}
          </div>
        </div>
      </main>

      {/* Mobile bottom tab bar */}
      <nav aria-label="Bottom" className="no-print md:hidden fixed bottom-0 inset-x-0 z-30 bg-sidebar text-sidebar-foreground border-t border-sidebar-border shadow-[0_-2px_10px_rgba(0,0,0,0.08)] flex items-stretch">
        {bottomNav.map((item) => {
          const Icon = item.icon;
          const isActive = isNavActive(item, location);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex-1 flex flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-medium transition-colors",
                isActive
                  ? "text-sidebar-primary-foreground bg-sidebar-primary/90"
                  : "text-sidebar-foreground/70 hover:text-sidebar-accent-foreground"
              )}
            >
              <Icon className="h-5 w-5" />
              {item.label}
            </Link>
          );
        })}
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          className={cn(
            "flex-1 flex flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-medium transition-colors",
            moreActive
              ? "text-sidebar-primary-foreground bg-sidebar-primary/90"
              : "text-sidebar-foreground/70 hover:text-sidebar-accent-foreground"
          )}
        >
          <MoreHorizontal className="h-5 w-5" />
          More
        </button>
      </nav>

      {/* Mobile drawer (full nav + tools) */}
      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent
          side="left"
          className="w-[86%] max-w-sm bg-sidebar text-sidebar-foreground border-sidebar-border p-0 flex flex-col"
        >
          <div className="flex items-center gap-3 p-6 pb-4 border-b border-sidebar-border">
            {logoBadge}
            <div className="min-w-0">
              <SheetTitle className="font-serif font-semibold text-lg text-sidebar-foreground truncate">{farmName}</SheetTitle>
            </div>
          </div>

          <div className="flex-1 overflow-auto p-4">
            <nav aria-label="Menu" className="space-y-1.5">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = isNavActive(item, location);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setDrawerOpen(false)}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 text-sm font-medium",
                      isActive
                        ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-md"
                        : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </Link>
                );
              })}
              <InstallMenuItem onClick={() => setDrawerOpen(false)} />
            </nav>

            <QuickPhotoCapture />
          </div>

          <div className="p-4 space-y-3 border-t border-sidebar-border">
            {userCard}
            {signOutButton}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
