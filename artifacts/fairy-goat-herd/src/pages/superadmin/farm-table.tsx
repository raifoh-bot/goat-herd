import { useMemo, useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useUpdateFarm,
  useDeleteFarm,
  useApproveFarm,
  useRejectFarm,
  usePurgeFarm,
  useViewFarm,
  useListFarmUsers,
  useSuperadminResetUserPassword,
  getListFarmUsersQueryKey,
  getListFarmsQueryKey,
  getGetPlatformSummaryQueryKey,
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
  Users,
} from "lucide-react";
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

export function formatDate(value?: string | null): string {
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

function RejectFarmDialog({ farm }: { farm: SuperadminFarm }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const rejectFarm = useRejectFarm();

  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");

  const canReject = reason.trim().length > 0;

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!canReject) return;
    rejectFarm.mutate(
      { id: farm.id, data: { reason: reason.trim() } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListFarmsQueryKey() });
          queryClient.invalidateQueries({
            queryKey: getGetPlatformSummaryQueryKey(),
          });
          toast({
            title: "Registration rejected",
            description: `${farm.name} will not go live.`,
          });
          setOpen(false);
          setReason("");
        },
        onError: () => {
          toast({
            title: "Could not reject registration",
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
        if (!next) setReason("");
      }}
    >
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="text-destructive hover:text-destructive"
        >
          Reject
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Reject {farm.name}?</DialogTitle>
            <DialogDescription>
              The registration is declined and its users will never be able to
              sign in. The farm is kept for auditing and its address (
              <span className="font-mono">{farm.slug}</span>) stays reserved.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-4">
            <Label htmlFor={`rejectReason-${farm.id}`}>Reason for rejection</Label>
            <Textarea
              id={`rejectReason-${farm.id}`}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={500}
              placeholder="e.g. Spam signup, duplicate registration…"
              required
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button
              type="submit"
              variant="destructive"
              disabled={rejectFarm.isPending || !canReject}
            >
              {rejectFarm.isPending ? "Rejecting…" : "Reject registration"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Permanent removal of a REJECTED registration. Unlike DeleteFarmDialog (soft
 * delete, kept for auditing), purging erases the farm and its users so the
 * address (slug) can be registered again.
 */
function PurgeFarmDialog({ farm }: { farm: SuperadminFarm }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const purgeFarm = usePurgeFarm();

  const [open, setOpen] = useState(false);
  const [confirmSlug, setConfirmSlug] = useState("");

  const canPurge = confirmSlug.trim() === farm.slug;

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!canPurge) return;
    purgeFarm.mutate(
      { id: farm.id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListFarmsQueryKey() });
          queryClient.invalidateQueries({
            queryKey: getGetPlatformSummaryQueryKey(),
          });
          toast({
            title: "Registration deleted permanently",
            description: `${farm.name} was removed and ${farm.slug} can be registered again.`,
          });
          setOpen(false);
          setConfirmSlug("");
        },
        onError: () => {
          toast({
            title: "Could not delete registration",
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
        if (!next) setConfirmSlug("");
      }}
    >
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="text-destructive hover:text-destructive"
        >
          Delete permanently
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Permanently delete {farm.name}?</DialogTitle>
            <DialogDescription>
              This erases the rejected registration, its user accounts, and the
              recorded rejection. The address (
              <span className="font-mono">{farm.slug}</span>) becomes available
              for a new registration. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-4">
            <Label htmlFor={`purgeConfirmSlug-${farm.id}`}>
              Type <span className="font-mono font-semibold">{farm.slug}</span>{" "}
              to confirm
            </Label>
            <Input
              id={`purgeConfirmSlug-${farm.id}`}
              value={confirmSlug}
              onChange={(e) => setConfirmSlug(e.target.value)}
              autoComplete="off"
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button
              type="submit"
              variant="destructive"
              disabled={purgeFarm.isPending || !canPurge}
            >
              {purgeFarm.isPending ? "Deleting…" : "Delete permanently"}
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
  const approveFarm = useApproveFarm();

  const suspended = farm.status === "suspended";
  const pending = farm.status === "pending";
  const rejected = farm.status === "rejected";
  const abandoned = !pending && !rejected && isAbandoned(farm, thresholds);

  const handleApprove = () => {
    approveFarm.mutate(
      { id: farm.id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListFarmsQueryKey() });
          queryClient.invalidateQueries({
            queryKey: getGetPlatformSummaryQueryKey(),
          });
          toast({
            title: "Farm approved",
            description: `${farm.name} is now live and its admin can sign in.`,
          });
        },
        onError: () => {
          toast({
            title: "Could not approve farm",
            description: "It may have already been approved or rejected.",
            variant: "destructive",
          });
        },
      },
    );
  };

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
        {pending ? (
          <Badge
            variant="outline"
            className="border-amber-500/50 bg-amber-500/10 text-amber-600 dark:text-amber-500"
          >
            Awaiting approval
          </Badge>
        ) : rejected ? (
          <Badge variant="destructive" title={farm.rejectedReason ?? undefined}>
            Rejected
          </Badge>
        ) : (
          <Badge variant={suspended ? "destructive" : "secondary"}>
            {farm.status}
          </Badge>
        )}
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
          {pending ? (
            <>
              <Button size="sm" onClick={handleApprove} disabled={approveFarm.isPending}>
                {approveFarm.isPending ? "Approving…" : "Approve"}
              </Button>
              <RejectFarmDialog farm={farm} />
            </>
          ) : rejected ? (
            <>
              <Button
                size="sm"
                variant="outline"
                onClick={handleApprove}
                disabled={approveFarm.isPending}
              >
                {approveFarm.isPending ? "Approving…" : "Approve anyway"}
              </Button>
              <PurgeFarmDialog farm={farm} />
            </>
          ) : (
            <>
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
            </>
          )}
        </div>
      </TableCell>
    </TableRow>
  );
}

/**
 * Sortable farms table shared by the active and suspended farm pages. Renders
 * the column-header sort controls and a `FarmRow` per farm with all its
 * actions (approve, reject, view, suspend/reactivate, delete).
 */
export function FarmsTable({
  farms,
  thresholds,
}: {
  farms: SuperadminFarm[];
  thresholds: PlatformThresholds | undefined;
}) {
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

  const sortedFarms = useMemo(() => {
    const list = [...farms].sort((a, b) => compareFarms(a, b, sortKey));
    return sortDir === "asc" ? list : list.reverse();
  }, [farms, sortKey, sortDir]);

  return (
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
          <FarmRow key={farm.id} farm={farm} thresholds={thresholds} />
        ))}
      </TableBody>
    </Table>
  );
}
