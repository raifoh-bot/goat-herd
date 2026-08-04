import { useMemo, useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListFarms,
  useGetPlatformSummary,
  useGetPlatformSettings,
  useUpdatePlatformSettings,
  useCreateFarm,
  getListFarmsQueryKey,
  getGetPlatformSummaryQueryKey,
  getGetPlatformSettingsQueryKey,
  type PlatformThresholds,
} from "@workspace/api-client-react";
import { Settings2 } from "lucide-react";
import { SuperadminLayout } from "@/components/superadmin-layout";
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
import { farmUrl } from "@/lib/farm";
import { FarmsTable } from "./farm-table";

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
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
  const [createdSlug, setCreatedSlug] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const reset = () => {
    setName("");
    setSlug("");
    setSlugEdited(false);
    setAdminUsername("");
    setAdminPassword("");
    setCreatedSlug(null);
    setCopied(false);
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmedSlug = slug.trim();
    if (
      !name.trim() ||
      !trimmedSlug ||
      !adminUsername.trim() ||
      adminPassword.length < 8
    ) {
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
          queryClient.invalidateQueries({
            queryKey: getGetPlatformSummaryQueryKey(),
          });
          toast({
            title: "Farm created",
            description: `${farm.name} is ready.`,
          });
          setCreatedSlug(farm.slug);
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
        {createdSlug ? (
          <div>
            <DialogHeader>
              <DialogTitle>Farm created</DialogTitle>
              <DialogDescription>
                Share this link with the farm's admin to let them sign in.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2 py-4">
              <Label htmlFor="farmLink">Farm link</Label>
              <div className="flex gap-2">
                <Input
                  id="farmLink"
                  readOnly
                  value={`${window.location.origin}${farmUrl(createdSlug)}`}
                  onFocus={(e) => e.currentTarget.select()}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    void navigator.clipboard
                      .writeText(
                        `${window.location.origin}${farmUrl(createdSlug)}`,
                      )
                      .then(() => {
                        setCopied(true);
                        setTimeout(() => setCopied(false), 2000);
                      });
                  }}
                >
                  {copied ? "Copied!" : "Copy link"}
                </Button>
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                onClick={() => {
                  setOpen(false);
                  reset();
                }}
              >
                Done
              </Button>
            </DialogFooter>
          </div>
        ) : (
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
        )}
      </DialogContent>
    </Dialog>
  );
}

function ThresholdsDialog({
  thresholds,
}: {
  thresholds: PlatformThresholds | undefined;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const updateSettings = useUpdatePlatformSettings();

  const [open, setOpen] = useState(false);
  const [abandonedAfterDays, setAbandonedAfterDays] = useState("90");
  const [activeWithinDays, setActiveWithinDays] = useState("7");
  const [idleWithinDays, setIdleWithinDays] = useState("30");

  // Load the current values whenever the dialog opens.
  const syncFromThresholds = () => {
    setAbandonedAfterDays(String(thresholds?.abandonedAfterDays ?? 90));
    setActiveWithinDays(String(thresholds?.activeWithinDays ?? 7));
    setIdleWithinDays(String(thresholds?.idleWithinDays ?? 30));
  };

  const active = Number(activeWithinDays);
  const idle = Number(idleWithinDays);
  const abandoned = Number(abandonedAfterDays);
  const bandsValid =
    Number.isInteger(active) &&
    Number.isInteger(idle) &&
    Number.isInteger(abandoned) &&
    active >= 1 &&
    idle > active &&
    abandoned >= 1;

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!bandsValid) return;
    updateSettings.mutate(
      {
        data: {
          abandonedAfterDays: abandoned,
          activeWithinDays: active,
          idleWithinDays: idle,
        },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({
            queryKey: getGetPlatformSettingsQueryKey(),
          });
          toast({
            title: "Thresholds updated",
            description: "Status definitions saved.",
          });
          setOpen(false);
        },
        onError: () => {
          toast({
            title: "Could not save",
            description: "Please check the values and try again.",
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
        if (next) syncFromThresholds();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline">
          <Settings2 className="mr-2 h-4 w-4" />
          Status thresholds
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Status thresholds</DialogTitle>
            <DialogDescription>
              Define when a farm is flagged abandoned and how the last-active
              color bands are set.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="abandonedAfterDays">
                Abandoned after (days of inactivity)
              </Label>
              <Input
                id="abandonedAfterDays"
                type="number"
                min={1}
                max={3650}
                value={abandonedAfterDays}
                onChange={(e) => setAbandonedAfterDays(e.target.value)}
                required
                autoFocus
              />
              <p className="text-xs text-muted-foreground">
                Farms with no activity for at least this many days are flagged
                “Abandoned”.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="activeWithinDays">
                Active within (days) — green
              </Label>
              <Input
                id="activeWithinDays"
                type="number"
                min={1}
                max={3650}
                value={activeWithinDays}
                onChange={(e) => setActiveWithinDays(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="idleWithinDays">
                Idle within (days) — yellow
              </Label>
              <Input
                id="idleWithinDays"
                type="number"
                min={1}
                max={3650}
                value={idleWithinDays}
                onChange={(e) => setIdleWithinDays(e.target.value)}
                required
              />
              <p className="text-xs text-muted-foreground">
                Within “active” shows green, within “idle” shows yellow, beyond
                shows red. Idle must be greater than active.
              </p>
            </div>
            {!bandsValid && (
              <p className="text-xs text-destructive">
                Enter whole numbers ≥ 1, with idle greater than active.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button
              type="submit"
              disabled={updateSettings.isPending || !bandsValid}
            >
              {updateSettings.isPending ? "Saving…" : "Save thresholds"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Super-admin landing page: active farms plus registrations still awaiting a
 * decision (pending/rejected). Suspended and deleted farms live on their own
 * pages in the left-hand navigation.
 */
export default function SuperadminFarms() {
  const {
    data: farms,
    isLoading,
    error,
  } = useListFarms({
    query: { queryKey: getListFarmsQueryKey(), retry: false },
  });
  const { data: summary } = useGetPlatformSummary({
    query: { queryKey: getGetPlatformSummaryQueryKey(), retry: false },
  });
  const { data: thresholds } = useGetPlatformSettings({
    query: { queryKey: getGetPlatformSettingsQueryKey(), retry: false },
  });

  // Suspended farms have their own page; deleted farms have theirs too.
  const visibleFarms = useMemo(
    () =>
      (farms ?? []).filter((f) => !f.deletedAt && f.status !== "suspended"),
    [farms],
  );

  return (
    <SuperadminLayout>
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total farms</CardDescription>
            <CardTitle className="text-3xl tabular-nums">
              {summary?.totalFarms ?? "—"}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            {summary ? (
              <>
                {summary.activeFarms} active · {summary.suspendedFarms} suspended
                {summary.pendingFarms > 0 && (
                  <>
                    {" · "}
                    <span className="font-medium text-amber-600 dark:text-amber-500">
                      {summary.pendingFarms} awaiting approval
                    </span>
                  </>
                )}
              </>
            ) : (
              "\u00a0"
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total users</CardDescription>
            <CardTitle className="text-3xl tabular-nums">
              {summary?.totalUsers ?? "—"}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            across all farms
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total goats</CardDescription>
            <CardTitle className="text-3xl tabular-nums">
              {summary?.totalGoats ?? "—"}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            across all farms
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>New this month</CardDescription>
            <CardTitle className="text-3xl tabular-nums">
              {summary?.farmsThisMonth ?? "—"}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            farms registered
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
          <div>
            <CardTitle>Farms</CardTitle>
            <CardDescription>
              Active farms and registrations awaiting a decision. Suspended and
              deleted farms have their own pages.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <ThresholdsDialog thresholds={thresholds} />
            <CreateFarmDialog />
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Loading farms…
            </p>
          ) : error ? (
            <p className="py-8 text-center text-sm text-destructive">
              Could not load farms. You may not have access.
            </p>
          ) : visibleFarms.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No farms yet. Create the first one.
            </p>
          ) : (
            <FarmsTable farms={visibleFarms} thresholds={thresholds} />
          )}
        </CardContent>
      </Card>
    </SuperadminLayout>
  );
}
