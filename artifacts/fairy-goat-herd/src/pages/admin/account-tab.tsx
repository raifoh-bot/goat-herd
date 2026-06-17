import { useState, type FormEvent } from "react";
import { KeyRound } from "lucide-react";
import { useChangeOwnPassword } from "@workspace/api-client-react";
import { useAuth } from "@/lib/auth";
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

export function AccountTab() {
  const { user } = useAuth();
  const { toast } = useToast();
  const changePassword = useChangeOwnPassword();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const reset = () => {
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!currentPassword || newPassword.length < 8) {
      toast({
        title: "Check the form",
        description: "Enter your current password and a new password of at least 8 characters.",
        variant: "destructive",
      });
      return;
    }
    if (newPassword !== confirmPassword) {
      toast({
        title: "Passwords don't match",
        description: "The new password and confirmation must be the same.",
        variant: "destructive",
      });
      return;
    }

    changePassword.mutate(
      { data: { currentPassword, newPassword } },
      {
        onSuccess: () => {
          toast({
            title: "Password changed",
            description: "Use your new password next time you sign in.",
          });
          reset();
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

  return (
    <Card className="border-primary/10 shadow-lg">
      <CardHeader>
        <CardTitle className="font-serif flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-primary" /> Change Password
        </CardTitle>
        <CardDescription>
          Update the password{" "}
          <span className="font-medium text-foreground">{user.username}</span> uses to sign in.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="max-w-sm space-y-4">
          <div className="space-y-2">
            <Label htmlFor="account-current-password">Current password</Label>
            <Input
              id="account-current-password"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              autoComplete="current-password"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="account-new-password">New password</Label>
            <Input
              id="account-new-password"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
              placeholder="At least 8 characters"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="account-confirm-password">Confirm new password</Label>
            <Input
              id="account-confirm-password"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
              placeholder="Re-enter the new password"
            />
          </div>
          <Button type="submit" disabled={changePassword.isPending}>
            {changePassword.isPending ? "Saving…" : "Change Password"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
