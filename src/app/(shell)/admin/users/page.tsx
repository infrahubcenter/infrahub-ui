"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { RouteGuard } from "@/components/auth/route-guard";
import { useAuth } from "@/components/auth/auth-provider";
import { UserStatusBadge } from "@/components/infrastructure/user-status-badge";
import { RoleBadge } from "@/components/infrastructure/role-badge";
import { DeleteResourceDialog } from "@/components/infrastructure/delete-resource-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
import { formatAgo } from "@/lib/format";
import {
  ApiError,
  addWorkspaceMember,
  createUser,
  deleteUser,
  listUsers,
  listWorkspaces,
  type Role,
  type UserListItem,
  type UserStatus,
  type Workspace,
} from "@/lib/api";

const ALL = "__all__";
const PAGE_SIZE = 25;

type SortField = "name" | "email" | "role" | "status" | "last_login_at" | "created_at";

// useSearchParams requires a Suspense boundary at build time -- mirrors
// alerts/page.tsx's AlertsPage/AlertsPageContent split, the one existing
// filtered+paginated+URL-synced list page in this codebase.
export default function AdminUsersPage() {
  return (
    <RouteGuard requireRole="ADMIN">
      <Suspense fallback={null}>
        <AdminUsersContent />
      </Suspense>
    </RouteGuard>
  );
}

function AdminUsersContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user: currentUser } = useAuth();

  const [roleFilter, setRoleFilter] = useState<string>(searchParams.get("role") ?? ALL);
  const [statusFilter, setStatusFilter] = useState<string>(searchParams.get("status") ?? ALL);
  const [search, setSearch] = useState(searchParams.get("search") ?? "");
  const [sort, setSort] = useState<SortField>((searchParams.get("sort") as SortField | null) ?? "email");
  const [order, setOrder] = useState<"asc" | "desc">(searchParams.get("order") === "desc" ? "desc" : "asc");
  const [page, setPage] = useState(0);

  const [users, setUsers] = useState<UserListItem[] | null>(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    listUsers({
      search: search.trim() || undefined,
      role: roleFilter !== ALL ? (roleFilter as Role) : undefined,
      status: statusFilter !== ALL ? (statusFilter as UserStatus) : undefined,
      sort,
      order,
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
    })
      .then((res) => {
        setUsers(res.users);
        setTotal(res.total);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load users."));
  }, [search, roleFilter, statusFilter, sort, order, page]);

  useEffect(() => {
    load();
  }, [load]);

  // Keeps the URL in sync so filters/sort are shareable/bookmarkable and
  // survive the browser back button -- mirrors alerts/page.tsx exactly,
  // extended with sort/order since this list (unlike Alerts) exposes them.
  useEffect(() => {
    const params = new URLSearchParams();
    if (roleFilter !== ALL) params.set("role", roleFilter);
    if (statusFilter !== ALL) params.set("status", statusFilter);
    if (search.trim()) params.set("search", search.trim());
    if (sort !== "email") params.set("sort", sort);
    if (order !== "asc") params.set("order", order);
    const qs = params.toString();
    router.replace(`/admin/users${qs ? `?${qs}` : ""}`, { scroll: false });
    // Only the local filter state should trigger this -- re-running on
    // every searchParams/router identity change would fight the browser's
    // own back/forward navigation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roleFilter, statusFilter, search, sort, order]);

  function handleRoleChange(v: string) {
    setRoleFilter(v);
    setPage(0);
  }
  function handleStatusChange(v: string) {
    setStatusFilter(v);
    setPage(0);
  }
  function handleSearchChange(v: string) {
    setSearch(v);
    setPage(0);
  }
  function handleSortChange(v: string) {
    setSort(v as SortField);
    setPage(0);
  }
  function handleOrderChange(v: string) {
    setOrder(v as "asc" | "desc");
    setPage(0);
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Users</h2>
        <p className="text-sm text-slate-500">
          Manage member accounts and administrators.
        </p>
      </div>

      <InviteUserForm onCreated={load} />

      <div className="flex flex-wrap items-center gap-3">
        <Select value={roleFilter} onValueChange={(v) => handleRoleChange(v ?? ALL)}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Role" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All roles</SelectItem>
            <SelectItem value="OWNER">Owner</SelectItem>
            <SelectItem value="ADMIN">Admin</SelectItem>
            <SelectItem value="MEMBER">Member</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={(v) => handleStatusChange(v ?? ALL)}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All statuses</SelectItem>
            <SelectItem value="ACTIVE">Active</SelectItem>
            <SelectItem value="INVITED">Invited</SelectItem>
            <SelectItem value="DISABLED">Disabled</SelectItem>
          </SelectContent>
        </Select>
        <Select value={sort} onValueChange={(v) => handleSortChange(v ?? "email")}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Sort by" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="name">Name</SelectItem>
            <SelectItem value="email">Email</SelectItem>
            <SelectItem value="role">Role</SelectItem>
            <SelectItem value="status">Status</SelectItem>
            <SelectItem value="last_login_at">Last Login</SelectItem>
            <SelectItem value="created_at">Created</SelectItem>
          </SelectContent>
        </Select>
        <Select value={order} onValueChange={(v) => handleOrderChange(v ?? "asc")}>
          <SelectTrigger className="w-32">
            <SelectValue placeholder="Order" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="asc">Ascending</SelectItem>
            <SelectItem value="desc">Descending</SelectItem>
          </SelectContent>
        </Select>
        <Input
          value={search}
          onChange={(e) => handleSearchChange(e.target.value)}
          placeholder="Search name or email…"
          className="w-64"
        />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {users !== null && users.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center">
          <p className="text-sm font-medium text-slate-700">No users match your filters.</p>
        </div>
      ) : (
        users !== null && (
          <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last Login</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell>
                      <Link href={`/admin/users/${u.id}`} className="font-medium text-sky-700 hover:underline">
                        {u.name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-slate-600">{u.email}</TableCell>
                    <TableCell>
                      <RoleBadge role={u.role} />
                    </TableCell>
                    <TableCell>
                      <UserStatusBadge status={u.status} />
                    </TableCell>
                    <TableCell className="text-slate-600">{formatAgo(u.last_login_at)}</TableCell>
                    <TableCell className="text-slate-600">{new Date(u.created_at).toLocaleDateString()}</TableCell>
                    <TableCell className="text-right">
                      {u.id !== currentUser?.id && (
                        <DeleteResourceDialog
                          trigger={
                            <Button variant="outline" size="sm">
                              Remove
                            </Button>
                          }
                          resourceTypeLabel="user"
                          resourceName={u.name}
                          description="Permanently removes them from the Users list and blocks sign-in. Their past activity (audit logs, resources they created) stays intact under their name."
                          onConfirm={async () => {
                            await deleteUser(u.id, u.name);
                          }}
                          onDeleted={load}
                        />
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )
      )}

      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between text-sm text-slate-600">
          <span>
            Showing {page * PAGE_SIZE + 1}–{Math.min(total, (page + 1) * PAGE_SIZE)} of {total}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}>
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function InviteUserForm({ onCreated }: { onCreated: () => void }) {
  const { user } = useAuth();
  const isOwner = user?.role === "OWNER";
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("MEMBER");
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [workspaceId, setWorkspaceId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdPassword, setCreatedPassword] = useState<{ email: string; password: string } | null>(null);

  useEffect(() => {
    listWorkspaces()
      .then((res) => setWorkspaces(res.workspaces))
      .catch(() => setWorkspaces([]));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const created = await createUser({ name, email, role });
      if (workspaceId) {
        try {
          await addWorkspaceMember(workspaceId, created.id);
        } catch {
          setError("User created, but adding to the workspace failed. You can add them to a workspace from their profile page.");
        }
      }
      setName("");
      setEmail("");
      setRole("MEMBER");
      setWorkspaceId("");
      if (created.temporary_password) {
        setCreatedPassword({ email: created.email, password: created.temporary_password });
      }
      onCreated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create user.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <h3 className="mb-3 text-sm font-semibold text-slate-900">Invite User</h3>

      {createdPassword && (
        <Alert className="mb-4">
          <AlertDescription>
            Account created for <strong>{createdPassword.email}</strong>. Temporary
            password (shown once): <code className="rounded bg-slate-100 px-1 py-0.5">{createdPassword.password}</code>{" "}
            -- it cannot be retrieved again after you leave this page, so relay it to the user now.
          </AlertDescription>
        </Alert>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex flex-1 flex-col gap-1.5">
            <Label htmlFor="new-name">Name</Label>
            <Input id="new-name" required value={name} onChange={(e) => setName(e.target.value)} disabled={submitting} />
          </div>
          <div className="flex flex-1 flex-col gap-1.5">
            <Label htmlFor="new-email">Email</Label>
            <Input
              id="new-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={submitting}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="new-role">Role</Label>
            <Select value={role} onValueChange={(v) => setRole(v as Role)} disabled={submitting}>
              <SelectTrigger id="new-role" className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="MEMBER">MEMBER</SelectItem>
                <SelectItem value="ADMIN">ADMIN</SelectItem>
                {isOwner && <SelectItem value="OWNER">OWNER</SelectItem>}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex flex-col gap-2 border-t border-slate-100 pt-3">
          <p className="text-xs font-medium text-slate-700">Initial Access (optional)</p>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex flex-1 flex-col gap-1.5">
              <Label htmlFor="new-workspace">Workspace</Label>
              <Select value={workspaceId} onValueChange={(v) => setWorkspaceId(v ?? "")} disabled={submitting}>
                <SelectTrigger id="new-workspace">
                  <SelectValue placeholder="Select a workspace" />
                </SelectTrigger>
                <SelectContent>
                  {workspaces.map((w) => (
                    <SelectItem key={w.id} value={w.id}>
                      {w.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <div className="flex justify-end">
          <Button type="submit" disabled={submitting}>
            {submitting ? "Inviting…" : "Invite User"}
          </Button>
        </div>
      </form>

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}
