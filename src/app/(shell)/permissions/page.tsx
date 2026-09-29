"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { RouteGuard } from "@/components/auth/route-guard";
import { ConfirmDialog } from "@/components/infrastructure/confirm-dialog";
import { RoleBadge } from "@/components/infrastructure/role-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  listPermissions,
  listWorkspaces,
  revokeDatabaseAccess,
  revokeObjectStorageAccess,
  revokeVMAccess,
  type PermissionGrant,
  type Role,
  type Workspace,
} from "@/lib/api";

type ResourceType = "VM" | "DATABASE" | "OBJECT_STORAGE";

const ALL = "__all__";

const RESOURCE_TYPE_LABELS: Record<ResourceType, string> = {
  VM: "VM",
  DATABASE: "Database",
  OBJECT_STORAGE: "Object Storage",
};

function revokeByType(type: ResourceType, resourceId: string, userId: string) {
  switch (type) {
    case "VM":
      return revokeVMAccess(userId, resourceId);
    case "DATABASE":
      return revokeDatabaseAccess(resourceId, userId);
    case "OBJECT_STORAGE":
      return revokeObjectStorageAccess(resourceId, userId);
  }
}

export default function PermissionsPage() {
  return (
    <RouteGuard requireRole="ADMIN">
      <PermissionsContent />
    </RouteGuard>
  );
}

function PermissionsContent() {
  const [grants, setGrants] = useState<PermissionGrant[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [resourceTypeFilter, setResourceTypeFilter] = useState(ALL);
  const [workspaceFilter, setWorkspaceFilter] = useState(ALL);
  const [roleFilter, setRoleFilter] = useState(ALL);

  const loadGrants = useCallback(() => {
    listPermissions({
      resource_type: resourceTypeFilter !== ALL ? (resourceTypeFilter as ResourceType) : undefined,
      workspace_id: workspaceFilter !== ALL ? workspaceFilter : undefined,
      role: roleFilter !== ALL ? (roleFilter as Role) : undefined,
    })
      .then((res) => setGrants(res.grants))
      .catch(() => setListError("Failed to load permissions."));
  }, [resourceTypeFilter, workspaceFilter, roleFilter]);

  useEffect(() => {
    loadGrants();
  }, [loadGrants]);

  useEffect(() => {
    listWorkspaces()
      .then((res) => setWorkspaces(res.workspaces))
      .catch(() => setWorkspaces([]));
  }, []);

  async function handleRevoke(grant: PermissionGrant) {
    await revokeByType(grant.resource_type, grant.resource_id, grant.user_id);
    loadGrants();
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Permissions</h2>
        <p className="text-sm text-slate-500">
          A read-only ledger of every direct resource grant across VMs, Databases, and Object Storage. Granting or
          revoking access happens from each member&apos;s workspace page now -- open the workspace in the Scope
          column below and use Manage Access. Workspace-derived access remains visible on each resource&apos;s own
          Access section instead of here.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Select value={resourceTypeFilter} onValueChange={(v) => setResourceTypeFilter(v ?? ALL)}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Resource type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All types</SelectItem>
            <SelectItem value="VM">VM</SelectItem>
            <SelectItem value="DATABASE">Database</SelectItem>
            <SelectItem value="OBJECT_STORAGE">Object Storage</SelectItem>
          </SelectContent>
        </Select>
        <Select value={workspaceFilter} onValueChange={(v) => setWorkspaceFilter(v ?? ALL)}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Workspace" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All workspaces</SelectItem>
            {workspaces.map((w) => (
              <SelectItem key={w.id} value={w.id}>
                {w.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={roleFilter} onValueChange={(v) => setRoleFilter(v ?? ALL)}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Role" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All roles</SelectItem>
            <SelectItem value="ADMIN">Admin</SelectItem>
            <SelectItem value="MEMBER">Member</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {listError && <p className="text-sm text-red-600">{listError}</p>}

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Permission</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Resource</TableHead>
              <TableHead>Scope</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Status</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {grants?.map((g) => (
              <TableRow key={`${g.resource_id}-${g.user_id}-${g.permission}`}>
                <TableCell className="font-mono text-xs">{g.permission}</TableCell>
                <TableCell className="text-slate-600">{g.description}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-slate-900">{g.resource_name}</span>
                    <Badge variant="secondary">{RESOURCE_TYPE_LABELS[g.resource_type]}</Badge>
                  </div>
                  <div className="text-xs text-slate-500">
                    {g.user_name} ({g.user_email})
                  </div>
                </TableCell>
                <TableCell>
                  <Link href={`/workspaces/${g.workspace_id}`} className="text-sky-700 hover:underline">
                    {g.workspace_name}
                  </Link>
                </TableCell>
                <TableCell>
                  <RoleBadge role={g.user_role} />
                </TableCell>
                <TableCell className="text-slate-600">Granted {new Date(g.granted_at).toLocaleDateString()}</TableCell>
                <TableCell>
                  <ConfirmDialog
                    trigger={
                      <Button variant="ghost" size="sm">
                        Revoke
                      </Button>
                    }
                    title="Revoke permission"
                    description={`This revokes ALL of ${g.user_name}'s direct permissions on ${g.resource_name} (not just ${g.permission}) -- the underlying API revokes a user's access to a resource as a whole, not one permission at a time.`}
                    confirmLabel="Revoke"
                    destructive
                    onConfirm={() => handleRevoke(g)}
                  />
                </TableCell>
              </TableRow>
            ))}
            {grants?.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-slate-500">
                  No direct permission grants match these filters.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
