import { ReactNode, useState, type FormEvent } from "react";
import { Link, useLocation } from "wouter";
import { ClipboardList, GitBranch, Heart, KeyRound, List, LogOut, Milk, Snowflake, Users } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useLogout, useChangeOwnPassword, getGetCurrentUserQueryKey } from "@workspace/api-client-react";
import { cn } from "@/lib/utils";
import { GoatIcon } from "@/components/goat-icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
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
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const logout = useLogout();
  const changePassword = useChangeOwnPassword();

  const [passwordOpen, setPasswordOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");

  const isManager = user.role === "admin" || user.role === "owner";

  const resetPasswordForm = () => {
    setCurrentPassword("");
    setNewPassword("");
  };

  const handleChangePassword = (e: FormEvent) => {
    e.preventDefault();
    if (!currentPassword || newPassword.length < 8) {
      toast({
        title: "Check the form",
        description: "Enter your current password and a new password of at least 8 characters.",
        variant: "destructive",
      });
      return;
    }

    changePassword.mutate(
      { data: { currentPassword, newPassword } },
      {
        onSuccess: () => {
          toast({ title: "Password changed", description: "Use your new password next time you sign in." });
          setPasswordOpen(false);
          resetPasswordForm();
        },
        onError: () =>
          toast({
            title: "Could not change password",
            description: "Check that your current password is correct.",
            variant: "destructive",
          }),
      },
    );
  };

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
            onClick={() => {
              resetPasswordForm();
              setPasswordOpen(true);
            }}
            className="w-full justify-start text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          >
            <KeyRound className="mr-2 h-4 w-4" />
            Change Password
          </Button>
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

      <Dialog
        open={passwordOpen}
        onOpenChange={(open) => {
          setPasswordOpen(open);
          if (!open) resetPasswordForm();
        }}
      >
        <DialogContent>
          <form onSubmit={handleChangePassword}>
            <DialogHeader>
              <DialogTitle className="font-serif flex items-center gap-2">
                <KeyRound className="h-4 w-4 text-primary" /> Change Password
              </DialogTitle>
              <DialogDescription>
                Update the password you use to sign in.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="current-password">Current password</Label>
                <Input
                  id="current-password"
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  autoComplete="current-password"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="layout-new-password">New password</Label>
                <Input
                  id="layout-new-password"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  autoComplete="new-password"
                  placeholder="At least 8 characters"
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setPasswordOpen(false);
                  resetPasswordForm();
                }}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={changePassword.isPending}>
                {changePassword.isPending ? "Saving…" : "Change Password"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
