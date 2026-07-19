import { useMemo, useState, type FormEvent } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListFarms,
  useGetPlatformSummary,
  useGetPlatformSettings,
  useUpdatePlatformSettings,
  useCreateFarm,
  useUpdateFarm,
  useDeleteFarm,
  useViewFarm,
  useLogout,
  useListFarmUsers,
  useSuperadminResetUserPassword,
  getListFarmUsersQueryKey,
  getListFarmsQueryKey,
  getGetPlatformSummaryQueryKey,
  getGetPlatformSettingsQueryKey,
  getGetCurrentUserQueryKey,
  type SuperadminFarm,
  type PlatformThresholds,
  type User,
} from "@workspace/api-client-react";
import {
  ArrowDown,
  ArrowUp,
  ChevronsUpDown,
  Eye,
  KeyRound,
  Link2,
  Settings2,
  Users,
} from "lucide-react";
import { GoatIcon } from "@/components/goat-icon";
import { SuperadminNav } from "@/components/superadmin-nav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
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
import { storeFarmSlug, farmUrl } from "@/lib/farm";
import { storeAuthToken } from "@/lib/token";

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
}

function formatDate(value?: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
}

const DAY_MS = 1000 * 60 * 60 * 24;

function formatRelative(value: string | null): string {
  if (!value) return "Never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Never";
  const days = Math.floor((Date.now() - date.getTime()) / DAY_MS);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 30) return `${days} days ago`;
  if (days < 60) return "1 month ago";
  if (days < 365) return `${Math.floor(days / 30)} months ago`;
  const years = Math.floor(days / 365);
  return years === 1 ? "1 year ago" : `${years} years ago`;
}

/**
 * Whole-day gap between `value` and now, or null when there is no timestamp.
 */
function daysSince(value: string | null): number | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return (Date.now() - date.getTime()) / DAY_MS;
}

/**
 * Tailwind text color for last-active age, using the super-admin's configured
 * bands: green within `activeWithinDays`, yellow within `idleWithinDays`, red
 * beyond that (or never active).
 */
function lastActiveColor(
  value: string | null,
  thresholds: PlatformThresholds | undefined,
): string {
  const days = daysSince(value);
  if (days === null) return "text-destructive";
  const active = thresholds?.activeWithinDays ?? 7;
  const idle = thresholds?.idleWithinDays ?? 30;
  if (days < active) return "text-green-600 dark:text-green-500";
  if (days < idle) return "text-yellow-600 dark:text-yellow-500";
  return "text-destructive";
}

/**
 * A farm is "Abandoned" when it has been inactive for at least
 * `abandonedAfterDays`. Inactivity is measured from the farm's last activity, or
 * from its creation date when it has never been active (the creation floor stops
 * a brand-new farm from instantly appearing abandoned only because it has no
 * activity yet).
 */
function isAbandoned(
  farm: SuperadminFarm,
  thresholds: PlatformThresholds | undefined,
): boolean {
  if (!thresholds) return false;
  const reference = farm.lastActiveAt ?? farm.createdAt;
  const days = daysSince(reference ?? null);
  if (days === null) return false;
  return days >= thresholds.abandonedAfterDays;
}

type SortKey =
  | "name"
  | "status"
  | "userCount"
  | "goatCount"
  | "breedingCount"
  | "lastActiveAt"
  | "createdAt";
type SortDir = "asc" | "desc";

const COLUMNS: { key: SortKey; label: string; numeric?: boolean }[] = [
  { key: "name", label: "Farm" },
  { key: "status", label: "Status" },
  { key: "userCount", label: "Users", numeric: true },
  { key: "goatCount", label: "Goats", numeric: true },
  { key: "breedingCount", label: "Breedings", numeric: true },
  { key: "lastActiveAt", label: "Last active" },
  { key: "createdAt", label: "Created" },
];

function compareFarms(
  a: SuperadminFarm,
  b: SuperadminFarm,
  key: SortKey,
): number {
  switch (key) {
    case "name":
      return a.name.localeCompare(b.name);
    case "status":
      return a.status.localeCompare(b.status);
    case "userCount":
    case "goatCount":
    case "breedingCount":
      return a[key] - b[key];
    case "lastActiveAt":
    case "createdAt": {
      const av = a[key] ? new Date(a[key] as string).getTime() : 0;
      const bv = b[key] ? new Date(b[key] as string).getTime() : 0;
      return av - bv;
    }
    default:
      return 0;
  }
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

function DeleteFarmDialog({ farm }: { farm: SuperadminFarm }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const deleteFarm = useDeleteFarm();

  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [confirmSlug, setConfirmSlug] = useState("");

  const reset = () => {
    setReason("");
    setConfirmSlug("");
  };

  const canDelete =
    reason.trim().length > 0 && confirmSlug.trim() === farm.slug;

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!canDelete) return;
    deleteFarm.mutate(
      { id: farm.id, data: { reason: reason.trim() } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListFarmsQueryKey() });
          queryClient.invalidateQueries({
            queryKey: getGetPlatformSummaryQueryKey(),
          });
          toast({
            title: "Farm deleted",
            description: `${farm.name} has been removed.`,
          });
          setOpen(false);
          reset();
        },
        onError: () => {
          toast({
            title: "Could not delete farm",
            description: "Please try again.",
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
        <Button
          variant="ghost"
          size="sm"
          className="text-destructive hover:text-destructive"
        >
          Delete
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Delete {farm.name}?</DialogTitle>
            <DialogDescription>
              This removes the farm and blocks its users from signing in. The
              farm and its data are retained in the deleted-farms record for
              auditing.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="deleteReason">Reason for deletion</Label>
              <Textarea
                id="deleteReason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={500}
                placeholder="e.g. Duplicate account, requested by owner…"
                required
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmSlug">
                Type{" "}
                <span className="font-mono font-semibold">{farm.slug}</span> to
                confirm
              </Label>
              <Input
                id="confirmSlug"
                value={confirmSlug}
                onChange={(e) => setConfirmSlug(e.target.value)}
                autoComplete="off"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="submit"
              variant="destructive"
              disabled={deleteFarm.isPending || !canDelete}
            >
              {deleteFarm.isPending ? "Deleting…" : "Delete farm"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ShareLoginDialog({ farm }: { farm: SuperadminFarm }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const loginUrl = `${window.location.origin}${farmUrl(farm.slug, "/login")}`;

  const copy = () => {
    void navigator.clipboard.writeText(loginUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setCopied(false);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          <Link2 className="mr-1.5 h-4 w-4" />
          Login link
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Login link for {farm.name}</DialogTitle>
          <DialogDescription>
            Share this link with a member of this farm to take them straight to
            their sign-in page.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 py-4">
          <Label htmlFor={`loginLink-${farm.id}`}>Farm login link</Label>
          <div className="flex gap-2">
            <Input
              id={`loginLink-${farm.id}`}
              readOnly
              value={loginUrl}
              onFocus={(e) => e.currentTarget.select()}
            />
            <Button type="button" variant="outline" onClick={copy}>
              {copied ? "Copied!" : "Copy link"}
            </Button>
          </div>
        </div>
        <DialogFooter>
          <Button type="button" onClick={() => setOpen(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ResetPasswordDialog({
  farmId,
  user,
}: {
  farmId: number;
  user: User;
}) {
  const { toast } = useToast();
  const resetPassword = useSuperadminResetUserPassword();

  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  const reset = () => {
    setPassword("");
    setConfirm("");
  };

  const mismatch = confirm.length > 0 && password !== confirm;
  const canSubmit = password.length >= 8 && password === confirm;

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    resetPassword.mutate(
      { id: farmId, userId: user.id, data: { password } },
      {
        onSuccess: () => {
          toast({
            title: "Password reset",
            description: `${user.username} can now sign in with the new password.`,
          });
          setOpen(false);
          reset();
        },
        onError: () => {
          toast({
            title: "Could not reset password",
            description: "Please try again.",
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
        <Button variant="outline" size="sm">
          <KeyRound className="mr-1.5 h-4 w-4" />
          Reset Password
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Reset password for {user.username}</DialogTitle>
            <DialogDescription>
              The new password takes effect immediately. Share it with the user
              so they can sign in.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor={`newPassword-${user.id}`}>New password</Label>
              <Input
                id={`newPassword-${user.id}`}
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                minLength={8}
                required
                autoFocus
              />
              <p className="text-xs text-muted-foreground">
                At least 8 characters.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor={`confirmPassword-${user.id}`}>
                Confirm new password
              </Label>
              <Input
                id={`confirmPassword-${user.id}`}
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password"
                minLength={8}
                required
              />
              {mismatch && (
                <p className="text-xs text-destructive">
                  Passwords do not match.
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={resetPassword.isPending || !canSubmit}>
              {resetPassword.isPending ? "Resetting…" : "Reset password"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function FarmUsersDialog({ farm }: { farm: SuperadminFarm }) {
  const [open, setOpen] = useState(false);
  const {
    data: users,
    isLoading,
    error,
  } = useListFarmUsers(farm.id, {
    query: {
      queryKey: getListFarmUsersQueryKey(farm.id),
      enabled: open,
      retry: false,
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          <Users className="mr-1.5 h-4 w-4" />
          Users
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Users of {farm.name}</DialogTitle>
          <DialogDescription>
            Reset a user's password if they are locked out of their account.
          </DialogDescription>
        </DialogHeader>
        {isLoading ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Loading users…
          </p>
        ) : error ? (
          <p className="py-8 text-center text-sm text-destructive">
            Could not load this farm's users.
          </p>
        ) : !users || users.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            This farm has no users.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Username</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => (
                <TableRow key={user.id}>
                  <TableCell className="font-medium">{user.username}</TableCell>
                  <TableCell className="capitalize">{user.role}</TableCell>
                  <TableCell>
                    <Badge variant={user.active ? "secondary" : "destructive"}>
                      {user.active ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <ResetPasswordDialog farmId={farm.id} user={user} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </DialogContent>
    </Dialog>
  );
}

function FarmRow({
  farm,
  thresholds,
}: {
  farm: SuperadminFarm;
  thresholds: PlatformThresholds | undefined;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const updateFarm = useUpdateFarm();
  const viewFarm = useViewFarm();

  const suspended = farm.status === "suspended";
  const abandoned = isAbandoned(farm, thresholds);

  const handleView = () => {
    viewFarm.mutate(
      { id: farm.id },
      {
        onSuccess: (data) => {
          // Full-page navigation so the app re-mounts under the farm's `/<slug>`
          // prefix, which scopes every API call to that tenant. The superadmin's
          // access there is read-only (enforced server-side).
          window.location.href = farmUrl(data.slug, "/");
        },
        onError: () => {
          toast({
            title: "Could not open farm",
            description: "Please try again.",
            variant: "destructive",
          });
        },
      },
    );
  };

  const toggleStatus = () => {
    updateFarm.mutate(
      { id: farm.id, data: { status: suspended ? "active" : "suspended" } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListFarmsQueryKey() });
          queryClient.invalidateQueries({
            queryKey: getGetPlatformSummaryQueryKey(),
          });
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
        <div className="flex items-center gap-2">
          <div className="font-medium">{farm.name}</div>
          {abandoned && (
            <Badge
              variant="outline"
              className="border-amber-500/50 text-amber-600 dark:text-amber-500"
            >
              Abandoned
            </Badge>
          )}
        </div>
        <div className="text-xs text-muted-foreground">{farm.slug}</div>
      </TableCell>
      <TableCell>
        <Badge variant={suspended ? "destructive" : "secondary"}>
          {farm.status}
        </Badge>
      </TableCell>
      <TableCell className="tabular-nums">{farm.userCount}</TableCell>
      <TableCell className="tabular-nums">{farm.goatCount}</TableCell>
      <TableCell className="tabular-nums">{farm.breedingCount}</TableCell>
      <TableCell
        className={`text-sm font-medium ${lastActiveColor(farm.lastActiveAt, thresholds)}`}
      >
        {formatRelative(farm.lastActiveAt)}
      </TableCell>
      <TableCell>{formatDate(farm.createdAt)}</TableCell>
      <TableCell className="text-right">
        <div className="flex items-center justify-end gap-1">
          {!suspended && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleView}
              disabled={viewFarm.isPending}
            >
              <Eye className="mr-1.5 h-4 w-4" />
              {viewFarm.isPending ? "Opening…" : "View"}
            </Button>
          )}
          <FarmUsersDialog farm={farm} />
          <ShareLoginDialog farm={farm} />
          <Button
            variant={suspended ? "default" : "outline"}
            size="sm"
            onClick={toggleStatus}
            disabled={updateFarm.isPending}
          >
            {suspended ? "Reactivate" : "Suspend"}
          </Button>
          <DeleteFarmDialog farm={farm} />
        </div>
      </TableCell>
    </TableRow>
  );
}

function DeletedFarmsSection({ farms }: { farms: SuperadminFarm[] }) {
  if (farms.length === 0) return null;
  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle>Deleted farms</CardTitle>
        <CardDescription>
          Removed farms are kept here for auditing. Their users can no longer
          sign in.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Farm</TableHead>
              <TableHead>Deleted</TableHead>
              <TableHead>By</TableHead>
              <TableHead>Reason</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {farms.map((farm) => (
              <TableRow key={farm.id}>
                <TableCell>
                  <div className="font-medium">{farm.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {farm.slug}
                  </div>
                </TableCell>
                <TableCell className="whitespace-nowrap text-sm">
                  {formatDate(farm.deletedAt)}
                </TableCell>
                <TableCell className="text-sm">
                  {farm.deletedByUsername ?? "—"}
                </TableCell>
                <TableCell className="max-w-xs text-sm text-muted-foreground">
                  {farm.deletedReason ?? "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

export default function SuperadminFarms() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const logout = useLogout();
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

  const [sortKey, setSortKey] = useState<SortKey>("createdAt");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "name" || key === "status" ? "asc" : "desc");
    }
  };

  const activeFarms = useMemo(
    () => (farms ?? []).filter((f) => !f.deletedAt),
    [farms],
  );
  const deletedFarms = useMemo(
    () =>
      (farms ?? [])
        .filter((f) => f.deletedAt)
        .sort(
          (a, b) =>
            new Date(b.deletedAt!).getTime() - new Date(a.deletedAt!).getTime(),
        ),
    [farms],
  );

  const sortedFarms = useMemo(() => {
    const list = [...activeFarms].sort((a, b) => compareFarms(a, b, sortKey));
    return sortDir === "asc" ? list : list.reverse();
  }, [activeFarms, sortKey, sortDir]);

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
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sidebar-primary text-sidebar-primary-foreground">
                <GoatIcon className="h-6 w-6" />
              </div>
              <div>
                <h1 className="font-serif text-lg font-semibold">
                  Platform admin
                </h1>
                <p className="text-xs text-muted-foreground">
                  Manage every farm on MyGoatHerd
                </p>
              </div>
            </div>
            <SuperadminNav />
          </div>
          <Button
            variant="ghost"
            onClick={handleLogout}
            disabled={logout.isPending}
          >
            Sign out
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-8">
        <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Total farms</CardDescription>
              <CardTitle className="text-3xl tabular-nums">
                {summary?.totalFarms ?? "—"}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">
              {summary
                ? `${summary.activeFarms} active · ${summary.suspendedFarms} suspended`
                : "\u00a0"}
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
                All registered farms and their activity.
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
            ) : sortedFarms.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No farms yet. Create the first one.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    {COLUMNS.map((col) => {
                      const activeSort = sortKey === col.key;
                      return (
                        <TableHead
                          key={col.key}
                          className={col.numeric ? "tabular-nums" : undefined}
                        >
                          <button
                            type="button"
                            onClick={() => toggleSort(col.key)}
                            className="inline-flex items-center gap-1 hover:text-foreground"
                          >
                            {col.label}
                            {activeSort ? (
                              sortDir === "asc" ? (
                                <ArrowUp className="h-3.5 w-3.5" />
                              ) : (
                                <ArrowDown className="h-3.5 w-3.5" />
                              )
                            ) : (
                              <ChevronsUpDown className="h-3.5 w-3.5 opacity-40" />
                            )}
                          </button>
                        </TableHead>
                      );
                    })}
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedFarms.map((farm) => (
                    <FarmRow
                      key={farm.id}
                      farm={farm}
                      thresholds={thresholds}
                    />
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <DeletedFarmsSection farms={deletedFarms} />
      </main>
    </div>
  );
}
