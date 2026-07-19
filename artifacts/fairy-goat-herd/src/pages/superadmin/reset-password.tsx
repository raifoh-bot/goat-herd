import { useMemo, useState, type FormEvent } from "react";
import { Link, useLocation } from "wouter";
import { useSuperadminResetPassword } from "@workspace/api-client-react";
import { GoatIcon } from "@/components/goat-icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";

export default function SuperadminResetPassword() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  // The token arrives as a query param on the reset link (?token=...). Read it
  // once from the current URL — it's outside the wouter base, so use the raw
  // browser search string.
  const token = useMemo(() => {
    try {
      return new URLSearchParams(window.location.search).get("token") ?? "";
    } catch {
      return "";
    }
  }, []);

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  const resetPassword = useSuperadminResetPassword();

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (password.length < 8) {
      toast({
        title: "Password too short",
        description: "Your new password must be at least 8 characters.",
        variant: "destructive",
      });
      return;
    }
    if (password !== confirm) {
      toast({
        title: "Passwords don't match",
        description: "Please enter the same password in both fields.",
        variant: "destructive",
      });
      return;
    }

    resetPassword.mutate(
      { data: { token, newPassword: password } },
      {
        onSuccess: () => {
          toast({
            title: "Password updated",
            description: "You can now sign in with your new password.",
          });
          setLocation("/login");
        },
        onError: () => {
          toast({
            title: "Reset failed",
            description:
              "This reset link is invalid or has expired. Request a new one.",
            variant: "destructive",
          });
        },
      },
    );
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4 relative overflow-hidden">
      <div className="absolute top-0 left-0 w-full h-64 bg-gradient-to-b from-primary/5 to-transparent pointer-events-none" />
      <Card className="w-full max-w-md border-primary/10 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-primary via-secondary to-accent" />
        <CardHeader className="text-center pt-10">
          <div className="mx-auto h-14 w-14 rounded-2xl bg-sidebar-primary flex items-center justify-center text-sidebar-primary-foreground shadow-inner mb-4">
            <GoatIcon className="h-8 w-8" />
          </div>
          <CardTitle className="font-serif text-2xl">
            Choose a new password
          </CardTitle>
          <CardDescription>
            Set the password you'll use to sign in to the platform admin panel.
          </CardDescription>
        </CardHeader>
        <CardContent className="pb-10">
          {token ? (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="new-password">New password</Label>
                <Input
                  id="new-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  placeholder="At least 8 characters"
                  autoFocus
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm-password">Confirm password</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  autoComplete="new-password"
                  required
                />
              </div>
              <Button
                type="submit"
                className="w-full"
                disabled={resetPassword.isPending}
              >
                {resetPassword.isPending ? "Saving…" : "Update password"}
              </Button>
            </form>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground text-center">
                This reset link is missing its token. Request a new link to
                continue.
              </p>
              <Button asChild variant="outline" className="w-full">
                <Link href="/superadmin/forgot-password">
                  Request a new link
                </Link>
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
