import { useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListSuperadminUsers,
  useCreateSuperadminUser,
  useUpdateSuperadminUser,
  useGetCurrentUser,
  getListSuperadminUsersQueryKey,
  getGetCurrentUserQueryKey,
  type User,
} from "@workspace/api-client-react";
import { SuperadminLayout } from "@/components/superadmin-layout";
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

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function CreateSuperadminDialog() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const createUser = useCreateSuperadminUser();

  const [open, setOpen] = useState(false);
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const reset = () => {
    setUsername("");
    setEmail("");
    setPassword("");
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmedUsername = username.trim();
    const trimmedEmail = email.trim();
    if (!trimmedUsername || !EMAIL_RE.test(trimmedEmail) || password.length < 8) {
      toast({
        title: "Check the details",
        description:
          "Username, a valid email, and a password of at least 8 characters are required.",
        variant: "destructive",
      });
      return;
    }

    createUser.mutate(
      { data: { username: trimmedUsername, email: trimmedEmail, password } },
      {
        onSuccess: (user) => {
          queryClient.invalidateQueries({
            queryKey: getListSuperadminUsersQueryKey(),
          });
          toast({
            title: "Super-admin created",
            description: `${user.username} can now sign in at the root login page.`,
          });
          setOpen(false);
          reset();
        },
        onError: (err) => {
          const conflict = (err as { status?: number })?.status === 409;
          toast({
            title: "Could not create super-admin",
            description: conflict
              ? "That username is already taken."
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
        <Button>New Super-admin</Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Create a super-admin</DialogTitle>
            <DialogDescription>
              A new platform operator account. Share the temporary password
              securely — they should change it after their first sign-in.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="sa-username">Username</Label>
              <Input
                id="sa-username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="off"
                required
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sa-email">Email</Label>
              <Input
                id="sa-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="off"
                required
              />
              <p className="text-xs text-muted-foreground">
                Required for password recovery.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="sa-password">Temporary password</Label>
              <Input
                id="sa-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                minLength={8}
                placeholder="At least 8 characters"
                required
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={createUser.isPending}>
              {createUser.isPending ? "Creating…" : "Create super-admin"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EditEmailDialog({ user }: { user: User }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const updateUser = useUpdateSuperadminUser();

  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState(user.email ?? "");

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = email.trim();
    if (!EMAIL_RE.test(trimmed)) {
      toast({
        title: "Check the email",
        description: "Please enter a valid email address.",
        variant: "destructive",
      });
      return;
    }

    updateUser.mutate(
      { id: user.id, data: { email: trimmed } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({
            queryKey: getListSuperadminUsersQueryKey(),
          });
          toast({
            title: "Email saved",
            description: `${user.fullName || user.username} can now use password recovery.`,
          });
          setOpen(false);
        },
        onError: () => {
          toast({
            title: "Could not save email",
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
        if (next) setEmail(user.email ?? "");
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          {user.email ? "Edit email" : "Add email"}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>
              {user.email ? "Edit email" : "Add email"} for {user.fullName || user.username}
            </DialogTitle>
            <DialogDescription>
              The contact email is used for password recovery and new-farm
              notifications.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-4">
            <Label htmlFor={`sa-edit-email-${user.id}`}>Email</Label>
            <Input
              id={`sa-edit-email-${user.id}`}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="off"
              required
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={updateUser.isPending}>
              {updateUser.isPending ? "Saving…" : "Save email"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function SuperadminUserRow({
  user,
  isSelf,
}: {
  user: User;
  isSelf: boolean;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const updateUser = useUpdateSuperadminUser();

  const toggleActive = () => {
    updateUser.mutate(
      { id: user.id, data: { active: !user.active } },
      {
        onSuccess: (updated) => {
          queryClient.invalidateQueries({
            queryKey: getListSuperadminUsersQueryKey(),
          });
          toast({
            title: updated.active ? "Account activated" : "Account deactivated",
            description: `${updated.fullName || updated.username} ${updated.active ? "can sign in again." : "can no longer sign in."}`,
          });
        },
        onError: () => {
          toast({
            title: "Could not update account",
            description: "Please try again.",
            variant: "destructive",
          });
        },
      },
    );
  };

  return (
    <TableRow>
      <TableCell className="font-medium">
        {user.fullName || user.username}
        {isSelf && (
          <span className="ml-2 text-xs text-muted-foreground">(you)</span>
        )}
      </TableCell>
      <TableCell>{user.email ?? "—"}</TableCell>
      <TableCell>
        <Badge variant={user.active ? "default" : "secondary"}>
          {user.active ? "Active" : "Inactive"}
        </Badge>
      </TableCell>
      <TableCell>{formatDate(user.createdAt)}</TableCell>
      <TableCell className="text-right">
        <div className="flex justify-end gap-2">
          <EditEmailDialog user={user} />
          <Button
            variant="outline"
            size="sm"
            onClick={toggleActive}
            disabled={isSelf || updateUser.isPending}
            title={isSelf ? "You cannot deactivate your own account" : undefined}
          >
            {user.active ? "Deactivate" : "Activate"}
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

export default function SuperadminUsers() {
  const { data: currentUser } = useGetCurrentUser({
    query: { queryKey: getGetCurrentUserQueryKey() },
  });

  const {
    data: users,
    isLoading,
    error,
  } = useListSuperadminUsers({
    query: { queryKey: getListSuperadminUsersQueryKey() },
  });

  return (
    <SuperadminLayout>
      <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
            <div>
              <CardTitle>Super-admin accounts</CardTitle>
              <CardDescription>
                Platform operators who can manage every farm.
              </CardDescription>
            </div>
            <CreateSuperadminDialog />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Loading accounts…
              </p>
            ) : error ? (
              <p className="py-8 text-center text-sm text-destructive">
                Could not load super-admin accounts. You may not have access.
              </p>
            ) : !users || users.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No super-admin accounts found.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Username</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((user) => (
                    <SuperadminUserRow
                      key={user.id}
                      user={user}
                      isSelf={currentUser?.id === user.id}
                    />
                  ))}
                </TableBody>
              </Table>
            )}
        </CardContent>
      </Card>
    </SuperadminLayout>
  );
}
