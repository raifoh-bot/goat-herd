import { useState, type FormEvent } from "react";
import { useForgotPassword } from "@workspace/api-client-react";
import { GoatIcon } from "@/components/goat-icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getUrlFarmSlug } from "@/lib/farm";

export default function ForgotPassword() {
  const [identifier, setIdentifier] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const urlFarmSlug = getUrlFarmSlug();
  const forgotPassword = useForgotPassword();

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!identifier.trim()) return;
    forgotPassword.mutate(
      { data: { identifier: identifier.trim() } },
      {
        // Always show the same neutral confirmation, regardless of outcome, so
        // the page can never reveal whether an account exists.
        onSuccess: () => setSubmitted(true),
        onError: () => setSubmitted(true),
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
          <CardTitle className="font-serif text-2xl">Reset your password</CardTitle>
          <CardDescription>
            {submitted
              ? "Check your inbox for the next step."
              : "Enter your username or email and we'll send you a reset link."}
          </CardDescription>
        </CardHeader>
        <CardContent className="pb-10">
          {submitted ? (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground text-center">
                If an account matches, we've sent a password reset link to its email
                address. The link expires in 1 hour.
              </p>
              <Button asChild variant="outline" className="w-full">
                <a href="login">Back to sign in</a>
              </Button>
            </div>
          ) : (
            <>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="identifier">Username or email</Label>
                  <Input
                    id="identifier"
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    autoComplete="username"
                    autoFocus
                    required
                  />
                </div>
                <Button type="submit" className="w-full" disabled={forgotPassword.isPending}>
                  {forgotPassword.isPending ? "Sending…" : "Send reset link"}
                </Button>
              </form>
              <p className="mt-6 text-center text-sm text-muted-foreground">
                Remembered it?{" "}
                <a href="login" className="font-medium text-primary hover:underline">
                  Back to sign in
                </a>
              </p>
              {urlFarmSlug && (
                <p className="mt-2 text-center text-xs text-muted-foreground">
                  Resetting the password for your {urlFarmSlug} account.
                </p>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
