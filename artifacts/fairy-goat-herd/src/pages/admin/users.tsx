import { useState, type FormEvent } from "react";
import { useLocation } from "wouter";
import { KeyRound, ShieldCheck, UserPlus } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListUsers,
  useCreateUser,
  useUpdateUser,
  useSetUserPassword,
  getListUsersQueryKey,
  UserRole,
  type User,
} from "@workspace/api-client-react";
import { Layout } from "@/components/layout";
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

const ROLE_LABELS: Record<string, string> = {
  admin: "Admin",
  owner: "Owner",
  farmhand: "Farm Hand",
};

const ROLE_OPTIONS = [
  { value: UserRole.admin, label: "Admin" },
  { value: UserRole.owner, label: "Owner" },
  { value: UserRole.farmhand, label: "Farm Hand" },
];

export default function AdminUsers() {
  const { user: currentUser } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<string>(UserRole.farmhand);

  const [resetTarget, setResetTarget] = useState<User | null>(null);
  const [resetPassword, setResetPassword] = useState("");

  const isManager = currentUser.role === "admin" || currentUser.role === "owner";

  const { data: users, isLoading } = useListUsers({
    query: { queryKey: getListUsersQueryKey(), enabled: isManager },
  });
  const createUser = useCreateUser();
  const updateUser = useUpdateUser();
  const setUserPassword = useSetUserPassword();

  // Farm Hands have no business here.
  if (!isManager) {
    setLocation("/");
    return null;
  }

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });

  const handleCreate = (e: FormEvent) => {
    e.preventDefault();
    if (!username.trim() || password.length < 8) {
      toast({
        title: "Check the form",
        description: "Username is required and the password must be at least 8 characters.",
        variant: "destructive",
      });
      return;
    }

    createUser.mutate(
      {
        data: {
          username: username.trim(),
          password,
          role: role as (typeof UserRole)[keyof typeof UserRole],
        },
      },
      {
        onSuccess: (created) => {
          toast({ title: "User created", description: `${created.username} can now sign in.` });
          setUsername("");
          setPassword("");
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
      { id: target.id, data: { role: newRole as (typeof UserRole)[keyof typeof UserRole] } },
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
    <Layout>
      <div className="space-y-8 animate-in fade-in duration-500">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-3xl font-serif font-bold text-foreground">User Management</h2>
            <p className="text-muted-foreground">Add team members and control who can access the herd.</p>
          </div>
        </div>

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
          <CardHeader>
            <CardTitle className="font-serif">Team</CardTitle>
            <CardDescription>Roles take effect the next time a user loads a page.</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="text-sm text-muted-foreground py-8 text-center">Loading users…</p>
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
                  {(users ?? []).map((u) => {
                    const isSelf = u.id === currentUser.id;
                    return (
                      <TableRow key={u.id}>
                        <TableCell className="font-medium">
                          {u.username}
                          {isSelf && <span className="ml-2 text-xs text-muted-foreground">(you)</span>}
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
      </div>

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
    </Layout>
  );
}
