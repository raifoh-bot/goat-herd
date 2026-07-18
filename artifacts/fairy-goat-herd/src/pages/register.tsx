import { useEffect, useState, type FormEvent } from "react";
import { Link } from "wouter";
import { useRegisterFarm } from "@workspace/api-client-react";
import { GoatIcon } from "@/components/goat-icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { farmUrl, isReservedSlug, storeFarmSlug } from "@/lib/farm";

/** Turn a farm name into a URL-friendly slug suggestion. */
function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
}

export default function Register() {
  const { toast } = useToast();

  const [farmName, setFarmName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState("");

  const register = useRegisterFarm();

  // Auto-suggest the slug from the farm name until the user edits it directly.
  useEffect(() => {
    if (!slugEdited) {
      setSlug(slugify(farmName));
    }
  }, [farmName, slugEdited]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmedSlug = slug.trim();
    if (
      !farmName.trim() ||
      !trimmedSlug ||
      !username.trim() ||
      password.length < 8 ||
      !email.trim()
    ) {
      return;
    }

    // A farm slug becomes the first URL path segment, so it can't be a word the
    // app already routes (login, goats, admin, …). Mirror of the server check.
    if (isReservedSlug(trimmedSlug)) {
      toast({
        title: "Farm address unavailable",
        description: "That address is reserved. Please choose another.",
        variant: "destructive",
      });
      return;
    }

    register.mutate(
      {
        data: {
          farmName: farmName.trim(),
          slug: trimmedSlug,
          username: username.trim(),
          password,
          email: email.trim(),
        },
      },
      {
        onSuccess: (farm) => {
          // Apply the new farm slug, then send the owner to their farm's own
          // sign-in URL. A full-page navigation mounts the app under /<slug>.
          storeFarmSlug(farm.slug);
          window.location.assign(farmUrl(farm.slug, "/login"));
        },
        onError: (err) => {
          const conflict = (err as { status?: number })?.status === 409;
          toast({
            title: "Registration failed",
            description: conflict
              ? "That farm address or username is already taken. Try another."
              : "Please check your details and try again.",
            variant: "destructive",
          });
        },
      },
    );
  };

  const passwordTooShort = password.length > 0 && password.length < 8;

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4 relative overflow-hidden">
      <div className="absolute top-0 left-0 w-full h-64 bg-gradient-to-b from-primary/5 to-transparent pointer-events-none" />
      <Card className="w-full max-w-md border-primary/10 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-primary via-secondary to-accent" />
        <CardHeader className="text-center pt-10">
          <div className="mx-auto h-14 w-14 rounded-2xl bg-sidebar-primary flex items-center justify-center text-sidebar-primary-foreground shadow-inner mb-4">
            <GoatIcon className="h-8 w-8" />
          </div>
          <CardTitle className="font-serif text-2xl">Register your farm</CardTitle>
          <CardDescription>Create your herd's own space on MyGoatHerd.</CardDescription>
        </CardHeader>
        <CardContent className="pb-10">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="farmName">Farm name</Label>
              <Input
                id="farmName"
                value={farmName}
                onChange={(e) => setFarmName(e.target.value)}
                placeholder="Smith Family Dairy"
                autoFocus
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="slug">Farm address</Label>
              <Input
                id="slug"
                value={slug}
                onChange={(e) => {
                  setSlugEdited(true);
                  setSlug(slugify(e.target.value));
                }}
                placeholder="smith-family-dairy"
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                minLength={3}
                maxLength={32}
                required
              />
              <p className="text-xs text-muted-foreground">
                Used in your sign-in address. Letters, numbers and dashes only.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="username">Admin username</Label>
              <Input
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                minLength={8}
                required
              />
              {passwordTooShort && (
                <p className="text-xs text-destructive">Use at least 8 characters.</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                placeholder="name@example.com"
                required
              />
              <p className="text-xs text-muted-foreground">
                Used to send you password reset links.
              </p>
            </div>
            <Button type="submit" className="w-full" disabled={register.isPending}>
              {register.isPending ? "Creating your farm…" : "Create farm"}
            </Button>
          </form>
          <p className="mt-6 text-center text-sm text-muted-foreground">
            Already have a farm?{" "}
            <Link href="/login" className="font-medium text-primary hover:underline">
              Sign in
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
