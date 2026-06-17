import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { ClipboardList, GitBranch, Heart, List, LogOut, Milk, Snowflake, Users } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useLogout, getGetCurrentUserQueryKey } from "@workspace/api-client-react";
import { cn } from "@/lib/utils";
import { GoatIcon } from "@/components/goat-icon";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";

interface LayoutProps {
  children: ReactNode;
}

const ROLE_LABELS: Record<string, string> = {
  admin: "Admin",
  owner: "Owner",
  farmhand: "Farm Hand",
};

export function Layout({ children }: LayoutProps) {
  const [location, setLocation] = useLocation();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const logout = useLogout();

  const isManager = user.role === "admin" || user.role === "owner";

  const handleLogout = () => {
    logout.mutate(undefined, {
      onSettled: () => {
        queryClient.setQueryData(getGetCurrentUserQueryKey(), null);
        queryClient.clear();
        setLocation("/login");
      },
    });
  };

  const navItems = [
    { href: "/", label: "Dashboard", icon: ClipboardList, exact: true },
    { href: "/goats", label: "The Herd", icon: List, exact: false },
    { href: "/breedings", label: "Kiddings", icon: Heart, exact: false },
    { href: "/inventory", label: "Semen Inventory", icon: Snowflake, exact: false },
    ...(isManager ? [{ href: "/goats/new", label: "Add Goat", icon: Milk, exact: true }] : []),
    { href: "/lineage", label: "Lineage Reports", icon: GitBranch, exact: false },
    ...(isManager ? [{ href: "/admin/users", label: "User Management", icon: Users, exact: false }] : []),
  ];

  return (
    <div className="min-h-screen bg-background flex flex-col md:flex-row">
      <aside className="w-full md:w-64 bg-sidebar text-sidebar-foreground flex-shrink-0 border-r border-sidebar-border shadow-xl z-10 relative">
        <div className="p-6">
          <div className="flex items-center gap-3 mb-8">
            <div className="h-10 w-10 rounded-xl bg-sidebar-primary flex items-center justify-center text-sidebar-primary-foreground shadow-inner">
              <GoatIcon className="h-6 w-6" />
            </div>
            <div>
              <h1 className="font-serif font-semibold text-lg text-sidebar-foreground">MyGoatHerd</h1>
            </div>
          </div>

          <nav className="space-y-1.5">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = item.exact
                ? location === item.href
                : location === item.href || location.startsWith(item.href + "/");

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
          </nav>
        </div>

        <div className="mt-auto p-6 space-y-3">
          <div className="rounded-xl bg-sidebar-accent/50 p-4 border border-sidebar-accent">
            <p className="text-sm font-medium text-sidebar-foreground truncate">{user.username}</p>
            <p className="text-xs text-sidebar-foreground/70">{ROLE_LABELS[user.role] ?? user.role}</p>
          </div>
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
        </div>
      </aside>

      <main className="flex-1 flex flex-col min-h-0 overflow-hidden relative">
        <div className="absolute top-0 left-0 w-full h-64 bg-gradient-to-b from-primary/5 to-transparent pointer-events-none" />
        <div className="flex-1 overflow-auto p-4 md:p-8 lg:p-12 relative z-0">
          <div className="max-w-6xl mx-auto">{children}</div>
        </div>
      </main>
    </div>
  );
}
