import { useMemo, useState, type FormEvent } from "react";
import { KeyRound, Mail, UserPlus } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListUsers,
  useCreateUser,
  useUpdateUser,
  useSetUserPassword,
  getListUsersQueryKey,
  UserRole,
  type User,
  type UpdateUserBodyRole,
} from "@workspace/api-client-react";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useSessionState } from "@/hooks/use-session-state";
import { SortSelect, type SortOption } from "@/components/sort-select";

const ROLE_LABELS: Record<string, string> = {
  admin: "Admin",
  owner: "Owner",
  farmhand: "Farm Hand",
};

type UserSort =
  | "username-asc"
  | "username-desc"
  | "role"
  | "active-first"
  | "inactive-first";

const USER_SORT_OPTIONS: SortOption<UserSort>[] = [
  { value: "username-asc", label: "Username (A–Z)" },
  { value: "username-desc", label: "Username (Z–A)" },
  { value: "role", label: "Role" },
  { value: "active-first", label: "Active First" },
  { value: "inactive-first", label: "Inactive First" },
];

function sortUsers(list: User[], sort: UserSort): User[] {
  return [...list].sort((a, b) => {
    switch (sort) {
      case "username-asc":
        return a.username.localeCompare(b.username);
      case "username-desc":
        return b.username.localeCompare(a.username);
      case "role":
        return (
          a.role.localeCompare(b.role) || a.username.localeCompare(b.username)
        );
      case "active-first":
        return (
          Number(b.active) - Number(a.active) ||
          a.username.localeCompare(b.username)
        );
      case "inactive-first":
        return (
          Number(a.active) - Number(b.active) ||
          a.username.localeCompare(b.username)
        );
      default:
        return 0;
    }
  });
}

const ROLE_OPTIONS = [
  { value: UserRole.admin, label: "Admin" },
  { value: UserRole.owner, label: "Owner" },
  { value: UserRole.farmhand, label: "Farm Hand" },
];

export function UsersTab() {
  const { user: currentUser } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [username, setUsername] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<string>(UserRole.farmhand);

  const [resetTarget, setResetTarget] = useState<User | null>(null);
  const [resetPassword, setResetPassword] = useState("");

  const [emailTarget, setEmailTarget] = useState<User | null>(null);
  const [emailValue, setEmailValue] = useState("");
  const [fullNameValue, setFullNameValue] = useState("");
  const [sort, setSort] = useSessionState<UserSort>("users-sort", "username-asc");

  const { data: users, isLoading } = useListUsers({
    query: { queryKey: getListUsersQueryKey() },
  });

  const sortedUsers = useMemo(() => sortUsers(users ?? [], sort), [users, sort]);
  const createUser = useCreateUser();
  const updateUser = useUpdateUser();
  const setUserPassword = useSetUserPassword();

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });

  const handleCreate = (e: FormEvent) => {
    e.preventDefault();
    if (!username.trim() || password.length < 8 || !email.trim()) {
      toast({
        title: "Check the form",
        description:
          "Username and email are required, and the password must be at least 8 characters.",
        variant: "destructive",
      });
      return;
    }

    createUser.mutate(
      {
        data: {
          username: username.trim(),
          password,
          email: email.trim(),
          ...(fullName.trim() ? { fullName: fullName.trim() } : {}),
          role: role as (typeof UserRole)[keyof typeof UserRole],
        },
      },
      {
        onSuccess: (created) => {
          toast({ title: "User created", description: `${created.username} can now sign in.` });
          setUsername("");
          setFullName("");
          setPassword("");
          setEmail("");
          setRole(UserRole.farmhand);
          invalidate();
        },
        onError: () => {
          toast({
            title: "Could not create user",
            description: "That username may already be taken.",
            variant: "destructive",
          });
        },
      },
    );
  };

  const handleRoleChange = (target: User, newRole: string) => {
    updateUser.mutate(
      { id: target.id, data: { role: newRole as UpdateUserBodyRole } },
      {
        onSuccess: () => invalidate(),
        onError: () =>
          toast({
            title: "Update failed",
            description: "That change could not be saved.",
            variant: "destructive",
          }),
      },
    );
  };

  const handleEmailSave = (e: FormEvent) => {
    e.preventDefault();
    if (!emailTarget) return;
    if (!emailValue.trim()) {
      toast({
        title: "Email required",
        description: "Enter an email address before saving.",
        variant: "destructive",
      });
      return;
    }
    updateUser.mutate(
      {
        id: emailTarget.id,
        // A blank name clears it (the server stores null).
        data: { email: emailValue.trim(), fullName: fullNameValue.trim() },
      },
      {
        onSuccess: () => {
          toast({
            title: "Details updated",
            description: `Contact details saved for ${emailTarget.username}.`,
          });
          setEmailTarget(null);
          setEmailValue("");
          setFullNameValue("");
          invalidate();
        },
        onError: () =>
          toast({
            title: "Update failed",
            description: "That change could not be saved.",
            variant: "destructive",
          }),
      },
    );
  };

  const handleResetPassword = (e: FormEvent) => {
    e.preventDefault();
    if (!resetTarget) return;
    if (resetPassword.length < 8) {
      toast({
        title: "Password too short",
        description: "The new password must be at least 8 characters.",
        variant: "destructive",
      });
      return;
    }

    setUserPassword.mutate(
      { id: resetTarget.id, data: { password: resetPassword } },
      {
        onSuccess: () => {
          toast({
            title: "Password reset",
            description: `${resetTarget.username} can sign in with the new password.`,
          });
          setResetTarget(null);
          setResetPassword("");
        },
        onError: () =>
          toast({
            title: "Could not reset password",
            description: "That change could not be saved.",
            variant: "destructive",
          }),
      },
    );
  };

  const handleActiveToggle = (target: User) => {
    updateUser.mutate(
      { id: target.id, data: { active: !target.active } },
      {
        onSuccess: () => invalidate(),
        onError: () =>
          toast({
            title: "Update failed",
            description: "That change could not be saved.",
            variant: "destructive",
          }),
      },
    );
  };

  return (
    <div className="space-y-8">
      <Card className="border-primary/10 shadow-lg">
        <CardHeader>
          <CardTitle className="font-serif flex items-center gap-2">
            <UserPlus className="h-4 w-4 text-primary" /> Add a User
          </CardTitle>
          <CardDescription>New users sign in with the username and password you set here.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreate} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 lg:items-end">
            <div className="space-y-2">
              <Label htmlFor="new-username">Username</Label>
              <Input
                id="new-username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="off"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-full-name">Full name</Label>
              <Input
                id="new-full-name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                autoComplete="off"
                placeholder="Optional"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-password">Password</Label>
              <Input
                id="new-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                placeholder="At least 8 characters"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-email">Email</Label>
              <Input
                id="new-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="off"
                placeholder="For password resets"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-role">Role</Label>
              <Select value={role} onValueChange={setRole}>
                <SelectTrigger id="new-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button type="submit" disabled={createUser.isPending}>
              {createUser.isPending ? "Adding…" : "Add User"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card className="border-primary/10 shadow-lg">
        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between space-y-0">
          <div className="space-y-1.5">
            <CardTitle className="font-serif">Team</CardTitle>
            <CardDescription>Roles take effect the next time a user loads a page.</CardDescription>
          </div>
          {!isLoading && (users ?? []).length > 0 && (
            <SortSelect value={sort} onChange={setSort} options={USER_SORT_OPTIONS} />
          )}
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Loading users…</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Username</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedUsers.map((u) => {
                  const isSelf = u.id === currentUser.id;
                  return (
                    <TableRow key={u.id}>
                      <TableCell className="font-medium">
                        {u.username}
                        {isSelf && <span className="ml-2 text-xs text-muted-foreground">(you)</span>}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {u.fullName ? (
                          u.fullName
                        ) : (
                          <span className="text-muted-foreground/70">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {u.email ? (
                          u.email
                        ) : (
                          <span className="italic text-muted-foreground/70">No email</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Select
                          value={u.role}
                          onValueChange={(value) => handleRoleChange(u, value)}
                          disabled={isSelf || updateUser.isPending}
                        >
                          <SelectTrigger className="w-36">
                            <SelectValue>{ROLE_LABELS[u.role] ?? u.role}</SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            {ROLE_OPTIONS.map((opt) => (
                              <SelectItem key={opt.value} value={opt.value}>
                                {opt.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        {u.active ? (
                          <Badge variant="secondary">Active</Badge>
                        ) : (
                          <Badge variant="outline" className="text-muted-foreground">Inactive</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setEmailTarget(u);
                              setEmailValue(u.email ?? "");
                              setFullNameValue(u.fullName ?? "");
                            }}
                          >
                            <Mail className="mr-1.5 h-3.5 w-3.5" />
                            Details
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setResetTarget(u);
                              setResetPassword("");
                            }}
                          >
                            <KeyRound className="mr-1.5 h-3.5 w-3.5" />
                            Reset Password
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={isSelf || updateUser.isPending}
                            onClick={() => handleActiveToggle(u)}
                          >
                            {u.active ? "Deactivate" : "Activate"}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={resetTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setResetTarget(null);
            setResetPassword("");
          }
        }}
      >
        <DialogContent>
          <form onSubmit={handleResetPassword}>
            <DialogHeader>
              <DialogTitle className="font-serif flex items-center gap-2">
                <KeyRound className="h-4 w-4 text-primary" /> Reset Password
              </DialogTitle>
              <DialogDescription>
                Set a new password for{" "}
                <span className="font-medium text-foreground">{resetTarget?.username}</span>. They
                will use it the next time they sign in.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2 py-4">
              <Label htmlFor="reset-password">New password</Label>
              <Input
                id="reset-password"
                type="password"
                value={resetPassword}
                onChange={(e) => setResetPassword(e.target.value)}
                autoComplete="new-password"
                placeholder="At least 8 characters"
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setResetTarget(null);
                  setResetPassword("");
                }}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={setUserPassword.isPending}>
                {setUserPassword.isPending ? "Saving…" : "Set Password"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={emailTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setEmailTarget(null);
            setEmailValue("");
            setFullNameValue("");
          }
        }}
      >
        <DialogContent>
          <form onSubmit={handleEmailSave}>
            <DialogHeader>
              <DialogTitle className="font-serif flex items-center gap-2">
                <Mail className="h-4 w-4 text-primary" /> Contact Details
              </DialogTitle>
              <DialogDescription>
                Set the name and email for{" "}
                <span className="font-medium text-foreground">{emailTarget?.username}</span>. The
                email is used to send password reset links.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="edit-full-name">Full name</Label>
                <Input
                  id="edit-full-name"
                  value={fullNameValue}
                  onChange={(e) => setFullNameValue(e.target.value)}
                  autoComplete="off"
                  placeholder="Jane Smith (leave blank to clear)"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-email">Email</Label>
                <Input
                  id="edit-email"
                  type="email"
                  value={emailValue}
                  onChange={(e) => setEmailValue(e.target.value)}
                  autoComplete="off"
                  placeholder="name@example.com"
                  required
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setEmailTarget(null);
                  setEmailValue("");
                  setFullNameValue("");
                }}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={updateUser.isPending}>
                {updateUser.isPending ? "Saving…" : "Save Details"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
