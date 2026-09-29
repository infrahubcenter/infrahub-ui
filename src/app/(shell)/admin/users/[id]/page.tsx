"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { RouteGuard } from "@/components/auth/route-guard";
import { RoleBadge } from "@/components/infrastructure/role-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ApiError,
  addWorkspaceMember,
  getUser,
  listWorkspaces,
  removeWorkspaceMember,
  updateUser,
  type UserDetail,
  type Workspace,
} from "@/lib/api";

export default function AdminUserDetailPage() {
  return (
    <RouteGuard requireRole="ADMIN">
      <AdminUserDetailContent />
    </RouteGuard>
  );
}

function AdminUserDetailContent() {
  const params = useParams<{ id: string }>();
  const userId = params.id;

  const [detail, setDetail] = useState<UserDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    getUser(userId)
      .then(setDetail)
      .catch(() => setError("Failed to load user."));
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  async function toggleActive() {
    if (!detail) return;
    try {
      await updateUser(userId, { is_active: !detail.is_active });
      load();
    } catch {
      setError("Failed to update user status.");
    }
  }

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!detail) return <p className="text-sm text-slate-500">Loading&hellip;</p>;

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">{detail.name}</h2>
            <p className="text-sm text-slate-500">{detail.email}</p>
          </div>
          <div className="flex items-center gap-2">
            <RoleBadge role={detail.role} />
            <Badge variant={detail.is_active ? "outline" : "destructive"}>
              {detail.is_active ? "Active" : "Disabled"}
            </Badge>
          </div>
        </div>
        <Button variant="outline" size="sm" className="mt-4" onClick={toggleActive}>
          {detail.is_active ? "Disable account" : "Re-enable account"}
        </Button>
      </div>

      <WorkspaceAccessSection userId={userId} workspaces={detail.workspaces} onChange={load} />

      <p className="text-sm text-slate-500">
        VM, Database, Object Storage, and Docker/Kubernetes access are granted per workspace now -- open one of{" "}
        {detail.workspaces.length === 0 ? (
          "this member's workspaces"
        ) : (
          detail.workspaces.map((w, i) => (
            <span key={w.workspace_id}>
              {i > 0 && ", "}
              <Link href={`/workspaces/${w.workspace_id}`} className="text-sky-700 hover:underline">
                {w.workspace_name}
              </Link>
            </span>
          ))
        )}{" "}
        and use Manage Access on this member&apos;s row.
      </p>

      <EffectiveAccessSection detail={detail} />
    </div>
  );
}

function WorkspaceAccessSection({
  userId,
  workspaces,
  onChange,
}: {
  userId: string;
  workspaces: UserDetail["workspaces"];
  onChange: () => void;
}) {
  const [availableWorkspaces, setAvailableWorkspaces] = useState<Workspace[]>([]);
  const [workspaceId, setWorkspaceId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listWorkspaces()
      .then((res) => setAvailableWorkspaces(res.workspaces))
      .catch(() => setAvailableWorkspaces([]));
  }, []);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await addWorkspaceMember(workspaceId, userId);
      setWorkspaceId("");
      onChange();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to add to workspace.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRemove(wId: string) {
    await removeWorkspaceMember(wId, userId);
    onChange();
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <h3 className="mb-3 text-sm font-semibold text-slate-900">Workspace Access</h3>

      {workspaces.length === 0 && <p className="text-sm text-slate-500">No workspace access.</p>}
      <ul className="flex flex-col gap-2">
        {workspaces.map((w) => (
          <li key={w.workspace_id} className="flex items-center justify-between rounded-md border border-slate-100 px-3 py-2">
            <span className="text-sm font-medium text-slate-900">{w.workspace_name}</span>
            <Button variant="ghost" size="sm" onClick={() => handleRemove(w.workspace_id)}>
              Remove
            </Button>
          </li>
        ))}
      </ul>

      <form onSubmit={handleAdd} className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex flex-1 flex-col gap-1.5">
          <Label htmlFor="workspace-access-workspace">Workspace</Label>
          <Select value={workspaceId} onValueChange={(v) => setWorkspaceId(v ?? "")} disabled={submitting}>
            <SelectTrigger id="workspace-access-workspace">
              <SelectValue placeholder="Select a workspace" />
            </SelectTrigger>
            <SelectContent>
              {availableWorkspaces.map((w) => (
                <SelectItem key={w.id} value={w.id}>
                  {w.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button type="submit" disabled={submitting || !workspaceId}>
          Add to Workspace
        </Button>
      </form>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}

// Step 18 decision #12: Effective Access is computed client-side from the
// three access arrays the backend already returns (each already carrying
// `access_source`), rather than a new aggregate endpoint -- no extra round
// trip, no second source of truth. Spec §27 format: one row per resource
// with Access/Source/Permissions lines.
type EffectiveRow = { key: string; name: string; source: string; permissions: string[] };

function accessSourceLabel(accessSource: "DIRECT" | "WORKSPACE" | "ADMIN", workspaceName?: string): string {
  if (accessSource === "ADMIN") return "Administrator";
  if (accessSource === "WORKSPACE") return workspaceName ? `${workspaceName} Workspace` : "Workspace";
  return "Direct Assignment";
}

function buildEffectiveAccess(detail: UserDetail): EffectiveRow[] {
  const vmRows: EffectiveRow[] = detail.vm_access.map((vm) => ({
    key: `vm-${vm.id}`,
    name: vm.name,
    source: accessSourceLabel(vm.access_source, vm.workspace),
    permissions: vm.permissions,
  }));
  const dbRows: EffectiveRow[] = (detail.database_access ?? []).map((db) => ({
    key: `db-${db.id}`,
    name: db.name || db.database_name || db.host,
    source: accessSourceLabel(db.access_source, db.workspace_name),
    permissions: db.permissions,
  }));
  const storageRows: EffectiveRow[] = (detail.object_storage_access ?? []).map((s) => ({
    key: `storage-${s.id}`,
    name: s.name,
    source: accessSourceLabel(s.access_source, s.workspace_name),
    permissions: s.permissions,
  }));
  return [...vmRows, ...dbRows, ...storageRows];
}

// Read-only summary -- not a fourth grant/revoke surface. Every row here
// comes from an access array the backend already scoped to resources this
// user can actually reach, so Access is definitionally always "granted";
// there is no ✗ case to render (unlike PermissionMark's per-permission
// grant/deny marks above, which do need both states).
function EffectiveAccessSection({ detail }: { detail: UserDetail }) {
  const rows = buildEffectiveAccess(detail);

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <h3 className="mb-3 text-sm font-semibold text-slate-900">Effective Access</h3>

      {rows.length === 0 ? (
        <p className="text-sm text-slate-500">No access to any resources yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((row) => (
            <li key={row.key} className="rounded-md border border-slate-100 px-3 py-2">
              <div className="text-sm font-medium text-slate-900">{row.name}</div>
              <div className="mt-1 text-xs text-slate-500">
                <div>Access: ✓</div>
                <div>Source: {row.source}</div>
                <div>Permissions: {row.permissions.join(", ")}</div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
