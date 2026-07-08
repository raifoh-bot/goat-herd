import { useEffect, useState, type FormEvent } from "react";
import { Link, useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useLogin,
  useGetCurrentUser,
  getGetCurrentUserQueryKey,
} from "@workspace/api-client-react";
import { GoatIcon } from "@/components/goat-icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import {
  getUrlFarmSlug,
  farmUrl,
  rootUrl,
  loadStoredFarmSlug,
  storeFarmSlug,
  readNextPath,
} from "@/lib/farm";
import { storeAuthToken } from "@/lib/token";

export default function Login() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  // When the page is served under a farm's path (`/<slug>/login`), the URL
  // already identifies the tenant — no Farm field is shown, and the slug set at
  // app boot scopes the request. At the root `/login` there is no farm in the
  // URL, so the Farm field is the fallback way to choose one.
  const urlFarmSlug = getUrlFarmSlug();
  const isFarmContext = urlFarmSlug !== null;
  const [farmSlug, setFarmSlugField] = useState(() => loadStoredFarmSlug() ?? "");

  const login = useLogin();

  // If a valid session already exists, skip the login screen. Redirecting to "/"
  // lands on the farm dashboard (farm context) or the root landing (global
  // context), which forwards superadmins and farm members to their real home.
  const { data: currentUser } = useGetCurrentUser({
    query: { queryKey: getGetCurrentUserQueryKey(), retry: false, staleTime: 30_000 },
  });
  useEffect(() => {
    if (currentUser) {
      setLocation("/");
    }
  }, [currentUser, setLocation]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) return;

    // At the root fallback, apply the chosen farm slug before logging in so the
    // request is scoped to the right tenant. In farm context the slug is already
    // applied from the URL at boot.
    if (!isFarmContext) {
      storeFarmSlug(farmSlug.trim() || null);
    }

    login.mutate(
      { data: { username: username.trim(), password } },
      {
        onSuccess: (user) => {
          // Persist the bearer token used when the session cookie is blocked (iframe).
          storeAuthToken(user.token ?? null);
          queryClient.setQueryData(getGetCurrentUserQueryKey(), user);

          const isManager = user.role === "admin" || user.role === "owner";
          // Return the user to the page they were headed to before being bounced
          // to login (captured as `?next=` by the AuthGuard). Fall back to the
          // dashboard, or Farm Settings for a first-time manager onboarding.
          const nextPath = readNextPath(window.location.search ?? "");
          const landing =
            nextPath ??
            (user.firstLogin && isManager ? "/admin/settings?tab=farm" : "/");

          if (user.role === "superadmin") {
            // Superadmins live at the root, not under a farm prefix.
            storeFarmSlug(null);
            setLocation("/superadmin/farms");
            return;
          }

          // Farm member: persist the server-confirmed slug.
          storeFarmSlug(user.farmSlug ?? null);

          if (isFarmContext) {
            // Already under /<slug>; navigate within the farm router.
            setLocation(landing);
          } else if (user.farmSlug) {
            // Logged in via the root fallback: switch into the farm's URL context
            // with a full-page navigation so the router re-mounts under /<slug>.
            window.location.assign(farmUrl(user.farmSlug, landing));
          } else {
            setLocation("/");
          }
        },
        onError: () => {
          toast({
            title: "Login failed",
            description: "That username and password don't match our records.",
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
          <CardTitle className="font-serif text-2xl">MyGoatHerd</CardTitle>
          <CardDescription>
            {isFarmContext ? `Sign in to ${urlFarmSlug}.` : "Sign in to manage your herd."}
          </CardDescription>
        </CardHeader>
        <CardContent className="pb-10">
          <form onSubmit={handleSubmit} className="space-y-4">
            {!isFarmContext && (
              <div className="space-y-2">
                <Label htmlFor="farmSlug">Farm</Label>
                <Input
                  id="farmSlug"
                  value={farmSlug}
                  onChange={(e) => setFarmSlugField(e.target.value)}
                  placeholder="your-farm"
                  autoComplete="off"
                  autoCapitalize="none"
                  spellCheck={false}
                />
                <p className="text-xs text-muted-foreground">
                  Your farm's address. Leave blank if you're a platform admin.
                </p>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                autoFocus
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
                autoComplete="current-password"
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={login.isPending}>
              {login.isPending ? "Signing in…" : "Sign In"}
            </Button>
          </form>
          {isFarmContext && (
            <p className="mt-4 text-center text-sm text-muted-foreground">
              <Link href="/forgot-password" className="font-medium text-primary hover:underline">
                Forgot your password?
              </Link>
            </p>
          )}
          <p className="mt-6 text-center text-sm text-muted-foreground">
            New here?{" "}
            {isFarmContext ? (
              <a href={rootUrl("/register")} className="font-medium text-primary hover:underline">
                Register your farm
              </a>
            ) : (
              <Link href="/register" className="font-medium text-primary hover:underline">
                Register your farm
              </Link>
            )}
          </p>
          {isFarmContext && (
            <p className="mt-2 text-center text-sm text-muted-foreground">
              Not your farm?{" "}
              <a href={rootUrl("/login")} className="font-medium text-primary hover:underline">
                Sign in to a different farm
              </a>
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
