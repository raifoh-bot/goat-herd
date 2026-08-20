import { useState, type FormEvent } from "react";
import { KeyRound, Mail, UserRound } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useChangeOwnPassword,
  useUpdateOwnEmail,
  useUpdateOwnName,
  getGetCurrentUserQueryKey,
} from "@workspace/api-client-react";
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
import { IosInstallSettingsCard } from "@/components/install-banner";

function NameCard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const updateName = useUpdateOwnName();

  const [fullName, setFullName] = useState(user.fullName ?? "");

  const savedName = user.fullName ?? "";
  const trimmed = fullName.trim();

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    updateName.mutate(
      { data: { fullName: trimmed } },
      {
        onSuccess: (updated) => {
          queryClient.setQueryData(getGetCurrentUserQueryKey(), updated);
          toast({
            title: trimmed ? "Name saved" : "Name cleared",
            description: trimmed
              ? "Your name is now on your account."
              : "Your account no longer has a name on file.",
          });
        },
        onError: () =>
          toast({
            title: "Could not save name",
            description: "That change could not be saved. Please try again.",
            variant: "destructive",
          }),
      },
    );
  };

  return (
    <Card className="border-primary/10 shadow-lg">
      <CardHeader>
        <CardTitle className="font-serif flex items-center gap-2">
          <UserRound className="h-4 w-4 text-primary" /> Your Name
        </CardTitle>
        <CardDescription>
          {savedName
            ? "The name shown on your account."
            : "Add your name so others know who this account belongs to."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="max-w-sm space-y-4">
          <div className="space-y-2">
            <Label htmlFor="account-full-name">Full name</Label>
            <Input
              id="account-full-name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              autoComplete="name"
              placeholder="Jane Smith"
              maxLength={120}
            />
          </div>
          <Button type="submit" disabled={updateName.isPending || trimmed === savedName}>
            {updateName.isPending ? "Saving…" : savedName ? "Update Name" : "Save Name"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function EmailCard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const updateEmail = useUpdateOwnEmail();

  const [email, setEmail] = useState(user.email ?? "");

  const savedEmail = user.email ?? "";
  const trimmed = email.trim();

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!trimmed || !/^\S+@\S+\.\S+$/.test(trimmed)) {
      toast({
        title: "Check the email address",
        description: "Enter a valid email address, like you@example.com.",
        variant: "destructive",
      });
      return;
    }

    updateEmail.mutate(
      { data: { email: trimmed } },
      {
        onSuccess: (updated) => {
          // Refresh the cached current user so the missing-email banner and
          // other consumers see the new address immediately.
          queryClient.setQueryData(getGetCurrentUserQueryKey(), updated);
          toast({
            title: "Email saved",
            description: "Password reset links will be sent to this address.",
          });
        },
        onError: () =>
          toast({
            title: "Could not save email",
            description: "That change could not be saved. Please try again.",
            variant: "destructive",
          }),
      },
    );
  };

  return (
    <Card className="border-primary/10 shadow-lg">
      <CardHeader>
        <CardTitle className="font-serif flex items-center gap-2">
          <Mail className="h-4 w-4 text-primary" /> Contact Email
        </CardTitle>
        <CardDescription>
          {savedEmail
            ? "The address password reset links are sent to."
            : "Your account has no email on file yet — add one so you can reset your password if you ever forget it."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="max-w-sm space-y-4">
          <div className="space-y-2">
            <Label htmlFor="account-email">Email address</Label>
            <Input
              id="account-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              placeholder="you@example.com"
            />
          </div>
          <Button
            type="submit"
            disabled={updateEmail.isPending || trimmed === savedEmail}
          >
            {updateEmail.isPending ? "Saving…" : savedEmail ? "Update Email" : "Save Email"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function PasswordCard() {
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

export function AccountTab() {
  return (
    <div className="space-y-8">
      <IosInstallSettingsCard />
      <NameCard />
      <EmailCard />
      <PasswordCard />
    </div>
  );
}
