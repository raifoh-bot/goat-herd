import { useState, type FormEvent } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListFarms,
  useCreateFarm,
  useUpdateFarm,
  useLogout,
  getListFarmsQueryKey,
  getGetCurrentUserQueryKey,
  type SuperadminFarm,
} from "@workspace/api-client-react";
import { GoatIcon } from "@/components/goat-icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { storeFarmSlug } from "@/lib/farm";
import { storeAuthToken } from "@/lib/token";

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
}

function formatDate(value?: string): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function CreateFarmDialog() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const createFarm = useCreateFarm();

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [adminUsername, setAdminUsername] = useState("");
  const [adminPassword, setAdminPassword] = useState("");

  const reset = () => {
    setName("");
    setSlug("");
    setSlugEdited(false);
    setAdminUsername("");
    setAdminPassword("");
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmedSlug = slug.trim();
    if (!name.trim() || !trimmedSlug || !adminUsername.trim() || adminPassword.length < 8) {
      return;
    }

    createFarm.mutate(
      {
        data: {
          name: name.trim(),
          slug: trimmedSlug,
          adminUsername: adminUsername.trim(),
          adminPassword,
        },
      },
      {
        onSuccess: (farm) => {
          queryClient.invalidateQueries({ queryKey: getListFarmsQueryKey() });
          toast({ title: "Farm created", description: `${farm.name} is ready.` });
          setOpen(false);
          reset();
        },
        onError: (err) => {
          const conflict = (err as { status?: number })?.status === 409;
          toast({
            title: "Could not create farm",
            description: conflict
              ? "That farm address or username is already taken."
              : "Please check the details and try again.",
            variant: "destructive",
          });
        },
      },
    );
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button>New farm</Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Create a farm</DialogTitle>
            <DialogDescription>
              Sets up a new farm and its first admin user.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Farm name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (!slugEdited) setSlug(slugify(e.target.value));
                }}
                required
                autoFocus
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
                minLength={3}
                maxLength={32}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="adminUsername">Admin username</Label>
              <Input
                id="adminUsername"
                value={adminUsername}
                onChange={(e) => setAdminUsername(e.target.value)}
                autoComplete="off"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="adminPassword">Admin password</Label>
              <Input
                id="adminPassword"
                type="password"
                value={adminPassword}
                onChange={(e) => setAdminPassword(e.target.value)}
                autoComplete="new-password"
                minLength={8}
                required
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={createFarm.isPending}>
              {createFarm.isPending ? "Creating…" : "Create farm"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function FarmRow({ farm }: { farm: SuperadminFarm }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const updateFarm = useUpdateFarm();

  const suspended = farm.status === "suspended";

  const toggleStatus = () => {
    updateFarm.mutate(
      { id: farm.id, data: { status: suspended ? "active" : "suspended" } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListFarmsQueryKey() });
          toast({
            title: suspended ? "Farm reactivated" : "Farm suspended",
            description: farm.name,
          });
        },
        onError: () => {
          toast({
            title: "Update failed",
            description: "Could not change the farm's status.",
            variant: "destructive",
          });
        },
      },
    );
  };

  return (
    <TableRow>
      <TableCell>
        <div className="font-medium">{farm.name}</div>
        <div className="text-xs text-muted-foreground">{farm.slug}</div>
      </TableCell>
      <TableCell>
        <Badge variant={suspended ? "destructive" : "secondary"}>{farm.status}</Badge>
      </TableCell>
      <TableCell className="tabular-nums">{farm.userCount}</TableCell>
      <TableCell className="tabular-nums">{farm.goatCount}</TableCell>
      <TableCell>{formatDate(farm.createdAt)}</TableCell>
      <TableCell className="text-right">
        <Button
          variant={suspended ? "default" : "outline"}
          size="sm"
          onClick={toggleStatus}
          disabled={updateFarm.isPending}
        >
          {suspended ? "Reactivate" : "Suspend"}
        </Button>
      </TableCell>
    </TableRow>
  );
}

export default function SuperadminFarms() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const logout = useLogout();
  const { data: farms, isLoading, error } = useListFarms({
    query: { queryKey: getListFarmsQueryKey(), retry: false },
  });

  const handleLogout = () => {
    logout.mutate(undefined, {
      onSuccess: () => {
        storeFarmSlug(null);
        storeAuthToken(null);
        queryClient.setQueryData(getGetCurrentUserQueryKey(), null);
        setLocation("/login");
      },
    });
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sidebar-primary text-sidebar-primary-foreground">
              <GoatIcon className="h-6 w-6" />
            </div>
            <div>
              <h1 className="font-serif text-lg font-semibold">Platform admin</h1>
              <p className="text-xs text-muted-foreground">Manage every farm on MyGoatHerd</p>
            </div>
          </div>
          <Button variant="ghost" onClick={handleLogout} disabled={logout.isPending}>
            Sign out
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-8">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
            <div>
              <CardTitle>Farms</CardTitle>
              <CardDescription>All registered farms and their activity.</CardDescription>
            </div>
            <CreateFarmDialog />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="py-8 text-center text-sm text-muted-foreground">Loading farms…</p>
            ) : error ? (
              <p className="py-8 text-center text-sm text-destructive">
                Could not load farms. You may not have access.
              </p>
            ) : !farms || farms.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No farms yet. Create the first one.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Farm</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Users</TableHead>
                    <TableHead>Goats</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {farms.map((farm) => (
                    <FarmRow key={farm.id} farm={farm} />
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
