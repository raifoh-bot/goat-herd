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
import { loadStoredFarmSlug, storeFarmSlug } from "@/lib/farm";
import { storeAuthToken } from "@/lib/token";

export default function Login() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [farmSlug, setFarmSlugField] = useState(() => loadStoredFarmSlug() ?? "");

  const login = useLogin();

  // If a valid session already exists, skip the login screen.
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

    // Apply the chosen farm slug before logging in so the request is scoped to
    // the right tenant in the dev preview (where there is no real subdomain).
    storeFarmSlug(farmSlug.trim() || null);

    login.mutate(
      { data: { username: username.trim(), password } },
      {
        onSuccess: (user) => {
          // Persist the server-confirmed farm slug (null for superadmins) and
          // the bearer token used when the session cookie is blocked (iframe).
          storeFarmSlug(user.farmSlug ?? null);
          storeAuthToken(user.token ?? null);
          queryClient.setQueryData(getGetCurrentUserQueryKey(), user);
          setLocation(user.role === "superadmin" ? "/superadmin/farms" : "/");
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
          <CardDescription>Sign in to manage your herd.</CardDescription>
        </CardHeader>
        <CardContent className="pb-10">
          <form onSubmit={handleSubmit} className="space-y-4">
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
          <p className="mt-6 text-center text-sm text-muted-foreground">
            New here?{" "}
            <Link href="/register" className="font-medium text-primary hover:underline">
              Register your farm
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
