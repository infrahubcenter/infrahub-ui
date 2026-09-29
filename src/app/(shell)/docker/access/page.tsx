"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { KeySquare } from "lucide-react";
import { RouteGuard } from "@/components/auth/route-guard";
import { ConfirmDialog } from "@/components/infrastructure/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ApiError,
  addWorkspaceMember,
  grantDatabaseAccess,
  grantDockerAccess,
  grantObjectStorageAccess,
  grantVMAccess,
  listDatabases,
  listDockerAccessGrants,
  listDockerHosts,
  listK8sClusters,
  listMonitoringDashboards,
  listMonitoringFolders,
  listObjectStorage,
  listPermissions,
  listUsers,
  listVMs,
  listWorkspaceMembers,
  listWorkspaces,
  removeWorkspaceMember,
  revokeDatabaseAccess,
  revokeDockerAccess,
  revokeObjectStorageAccess,
  revokeVMAccess,
  type DatabaseListItem,
  type DatabasePermission,
  type DockerAccessGrant,
  type DockerAccessPermission,
  type DockerHost,
  type K8sCluster,
  type MonitoringDashboard,
  type MonitoringFeature,
  type MonitoringFolder,
  type ObjectStorageListItem,
  type ObjectStoragePermission,
  type PermissionGrant,
  type UserListItem,
  type VM,
  type Workspace,
  type WorkspaceMember,
} from "@/lib/api";

const PERMISSION_LABELS: Record<DockerAccessPermission, string> = {
  "docker.monitor": "Docker Monitoring (view metrics)",
  "docker.logs": "Docker Logs (view/tail)",
  "k8s.monitor": "Kubernetes Monitoring (view pods)",
  "k8s.logs": "Kubernetes Logs (view/tail)",
};

// Duplicated (not imported) from workspaces/[id]/page.tsx -- this
// codebase has no cross-page shared-component convention, every page.tsx
// keeps its own local constants/subcomponents.
const ALL_DATABASE_PERMISSIONS: DatabasePermission[] = [
  "database.view",
  "database.performance",
  "database.browser",
  "database.logs",
  "database.query_details",
];
const ALL_OBJECT_STORAGE_PERMISSIONS: ObjectStoragePermission[] = [
  "object_storage.view",
  "object_storage.monitor",
  "object_storage.browser",
  "object_storage.download",
];
// vm.metrics/vm.updates let a Member be granted just the Metrics-and-Logs
// tree or just the Updates tree on a VM, without the broader vm.view
// (which also covers the VM detail/Docker/console sections).
const VM_PERMISSIONS = ["vm.view", "vm.connect", "vm.metrics", "vm.updates"] as const;

// FOLDER/DASHBOARD scope rows link back to where that folder/dashboard
// actually lives -- derivable purely from the grant's own permission
// string, no extra lookup needed.
function monitoringScopeHref(g: DockerAccessGrant): string | undefined {
  const base = g.permission.endsWith(".monitor") ? "/monitoring" : "/logs";
  const engine = g.permission.startsWith("docker.") ? "docker" : "kubernetes";
  if (g.scope_type === "FOLDER" && g.folder_id) return `${base}/${engine}/folders/${g.folder_id}`;
  if (g.scope_type === "DASHBOARD" && g.dashboard_id) return `${base}/${engine}/dashboards/${g.dashboard_id}`;
  return undefined;
}

export default function DockerAccessPage() {
  return (
    <RouteGuard requireRole="ADMIN">
      <DockerAccessContent />
    </RouteGuard>
  );
}

function DockerAccessContent() {
  // Shared across every section's grantee picker -- Member-only (Admin/
  // Owner already have full access everywhere and are never a valid
  // grantee), fetched once here rather than per-section.
  const [members, setMembers] = useState<UserListItem[]>([]);

  useEffect(() => {
    listUsers({ role: "MEMBER", sort: "name", order: "asc", limit: 200 })
      .then((res) => setMembers(res.users))
      .catch(() => setMembers([]));
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
          <KeySquare className="h-5 w-5" /> Access Control (RBAC)
        </h2>
        <p className="text-sm text-slate-500">
          Grant a Member access, organized by section: Workspace membership (every resource in a workspace),
          Monitoring, Logs, or direct access to one VM, Database, or Object Storage. Admins and Owners always have
          full access and never need a grant.
        </p>
      </div>

      <Tabs defaultValue="workspace">
        <TabsList>
          <TabsTrigger value="workspace">Workspace</TabsTrigger>
          <TabsTrigger value="monitoring">Monitoring</TabsTrigger>
          <TabsTrigger value="logs">Logs</TabsTrigger>
          <TabsTrigger value="resources">Resources</TabsTrigger>
        </TabsList>
        <TabsContent value="workspace">
          <WorkspaceAccessTab members={members} />
        </TabsContent>
        <TabsContent value="monitoring">
          <MonitoringLogsTab kind="MONITORING" members={members} />
        </TabsContent>
        <TabsContent value="logs">
          <MonitoringLogsTab kind="LOGS" members={members} />
        </TabsContent>
        <TabsContent value="resources">
          <ResourcesAccessTab members={members} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// --- Workspace: membership = full access to every resource in it ---

function WorkspaceAccessTab({ members }: { members: UserListItem[] }) {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [workspaceId, setWorkspaceId] = useState("");
  const [wsMembers, setWsMembers] = useState<WorkspaceMember[]>([]);
  const [newMemberId, setNewMemberId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listWorkspaces()
      .then((res) => setWorkspaces(res.workspaces))
      .catch(() => setWorkspaces([]));
  }, []);

  const loadMembers = useCallback(() => {
    if (!workspaceId) {
      setWsMembers([]);
      return;
    }
    listWorkspaceMembers(workspaceId)
      .then((res) => setWsMembers(res.members))
      .catch(() => setWsMembers([]));
  }, [workspaceId]);

  useEffect(() => {
    // Load-on-mount/param-change: no external store to subscribe to.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadMembers();
  }, [loadMembers]);

  const workspace = workspaces.find((w) => w.id === workspaceId);
  const wsMemberIds = useMemo(() => new Set(wsMembers.map((m) => m.id)), [wsMembers]);
  const addableMembers = members.filter((m) => !wsMemberIds.has(m.id));

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!newMemberId) return;
    setError(null);
    setSubmitting(true);
    try {
      await addWorkspaceMember(workspaceId, newMemberId);
      setNewMemberId("");
      loadMembers();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to add member.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRemove(userId: string) {
    await removeWorkspaceMember(workspaceId, userId);
    loadMembers();
  }

  return (
    <div className="mt-4 flex flex-col gap-4">
      <div className="max-w-sm">
        <Label htmlFor="workspace-access-ws">Workspace</Label>
        <Select value={workspaceId} onValueChange={(v) => setWorkspaceId(v ?? "")}>
          <SelectTrigger id="workspace-access-ws">
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

      {!workspaceId ? (
        <p className="text-sm text-slate-500">
          Pick a workspace to manage its members. A member gets full access to every VM/Database/Object Storage in
          that workspace.
        </p>
      ) : (
        <>
          <div className="rounded-lg border border-slate-200 bg-white">
            {wsMembers.length === 0 ? (
              <p className="p-6 text-sm text-slate-500">No members in this workspace yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Member</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {wsMembers.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell className="font-medium text-slate-900">{m.name}</TableCell>
                      <TableCell className="text-slate-600">{m.email}</TableCell>
                      <TableCell>
                        <Badge variant={m.is_active ? "outline" : "destructive"}>
                          {m.is_active ? "Active" : "Disabled"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <ConfirmDialog
                          trigger={
                            <Button variant="ghost" size="sm">
                              Remove
                            </Button>
                          }
                          title={`Remove ${m.name} from ${workspace?.name ?? "this workspace"}?`}
                          description="They immediately lose every VM/Database/Object Storage/Docker/Kubernetes access this workspace grants them. Direct grants elsewhere are unaffected."
                          confirmLabel="Remove"
                          destructive
                          onConfirm={() => handleRemove(m.id)}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>

          <form onSubmit={handleAdd} className="flex items-end gap-2 rounded-lg border border-slate-200 bg-white p-4">
            <div className="flex flex-1 flex-col gap-1.5">
              <Label htmlFor="workspace-access-new-member">Add Member</Label>
              <Select value={newMemberId} onValueChange={(v) => setNewMemberId(v ?? "")} disabled={submitting}>
                <SelectTrigger id="workspace-access-new-member">
                  <SelectValue placeholder={addableMembers.length === 0 ? "No members available to add" : "Select a member"} />
                </SelectTrigger>
                <SelectContent>
                  {addableMembers.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.name} ({u.email})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button type="submit" disabled={submitting || !newMemberId}>
              Add Member
            </Button>
          </form>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </>
      )}
    </div>
  );
}

// --- Monitoring / Logs: docker.monitor+k8s.monitor or docker.logs+k8s.logs,
// scoped to Workspace, one VM/Cluster resource, one Folder, or one
// Dashboard. One shared component drives both tabs -- structurally
// identical, only the permission/feature suffix and route base differ.

type Engine = "DOCKER" | "K8S";
type MonitoringScope = "workspace" | "resource" | "folder" | "dashboard";

function permissionFor(engine: Engine, kind: "MONITORING" | "LOGS"): DockerAccessPermission {
  if (engine === "DOCKER") return kind === "MONITORING" ? "docker.monitor" : "docker.logs";
  return kind === "MONITORING" ? "k8s.monitor" : "k8s.logs";
}
function featureFor(engine: Engine, kind: "MONITORING" | "LOGS"): MonitoringFeature {
  if (engine === "DOCKER") return kind === "MONITORING" ? "DOCKER_MONITORING" : "DOCKER_LOGS";
  return kind === "MONITORING" ? "K8S_MONITORING" : "K8S_LOGS";
}

function MonitoringLogsTab({ kind, members }: { kind: "MONITORING" | "LOGS"; members: UserListItem[] }) {
  const [engine, setEngine] = useState<Engine>("DOCKER");
  const [scope, setScope] = useState<MonitoringScope>("workspace");

  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [vms, setVms] = useState<VM[]>([]);
  const [dockerHosts, setDockerHosts] = useState<DockerHost[]>([]);
  const [clusters, setClusters] = useState<K8sCluster[]>([]);
  const [folders, setFolders] = useState<MonitoringFolder[]>([]);
  const [dashboards, setDashboards] = useState<MonitoringDashboard[]>([]);

  const [workspaceId, setWorkspaceId] = useState("");
  const [resourceId, setResourceId] = useState("");
  const [folderId, setFolderId] = useState("");
  const [dashboardId, setDashboardId] = useState("");
  const [userId, setUserId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [grants, setGrants] = useState<DockerAccessGrant[]>([]);
  const [listError, setListError] = useState<string | null>(null);

  useEffect(() => {
    listWorkspaces().then((res) => setWorkspaces(res.workspaces)).catch(() => setWorkspaces([]));
    listVMs().then((res) => setVms(res.vms)).catch(() => setVms([]));
    listDockerHosts().then((res) => setDockerHosts(res.hosts)).catch(() => setDockerHosts([]));
    listK8sClusters().then((res) => setClusters(res.clusters)).catch(() => setClusters([]));
  }, []);

  const loadGrants = useCallback(() => {
    const relevant: DockerAccessPermission[] = kind === "MONITORING" ? ["docker.monitor", "k8s.monitor"] : ["docker.logs", "k8s.logs"];
    listDockerAccessGrants()
      .then((res) => setGrants(res.grants.filter((g) => relevant.includes(g.permission))))
      .catch(() => setListError("Failed to load grants."));
  }, [kind]);

  useEffect(() => {
    loadGrants();
  }, [loadGrants]);

  useEffect(() => {
    if (scope === "folder" && workspaceId) {
      listMonitoringFolders(featureFor(engine, kind), workspaceId)
        .then((res) => setFolders(res.folders))
        .catch(() => setFolders([]));
    }
  }, [scope, engine, kind, workspaceId]);

  useEffect(() => {
    if (scope === "dashboard" && workspaceId) {
      listMonitoringDashboards(featureFor(engine, kind), { workspace_id: workspaceId })
        .then((res) => setDashboards(res.dashboards))
        .catch(() => setDashboards([]));
    }
  }, [scope, engine, kind, workspaceId]);

  function resetPickers() {
    setResourceId("");
    setFolderId("");
    setDashboardId("");
  }

  const resourceOptions =
    engine === "DOCKER"
      ? [
          ...vms.filter((v) => v.workspace_id === workspaceId).map((v) => ({ id: v.id, name: v.name })),
          ...dockerHosts.filter((h) => h.workspace_id === workspaceId).map((h) => ({ id: h.resource_id, name: `${h.name} (Docker Host)` })),
        ]
      : clusters.filter((c) => c.workspace_id === workspaceId).map((c) => ({ id: c.resource_id, name: c.name }));

  async function handleGrant() {
    setFormError(null);
    if (!workspaceId) {
      setFormError("Select a workspace.");
      return;
    }
    if (scope === "resource" && !resourceId) {
      setFormError(`Select a ${engine === "DOCKER" ? "VM or Docker Host" : "cluster"}.`);
      return;
    }
    if (scope === "folder" && !folderId) {
      setFormError("Select a folder.");
      return;
    }
    if (scope === "dashboard" && !dashboardId) {
      setFormError("Select a dashboard.");
      return;
    }
    if (!userId) {
      setFormError("Select a member.");
      return;
    }
    setSubmitting(true);
    try {
      await grantDockerAccess({
        user_id: userId,
        permission: permissionFor(engine, kind),
        ...(scope === "workspace" ? { workspace_id: workspaceId } : {}),
        ...(scope === "resource" ? { resource_id: resourceId } : {}),
        ...(scope === "folder" ? { folder_id: folderId } : {}),
        ...(scope === "dashboard" ? { dashboard_id: dashboardId } : {}),
      });
      setUserId("");
      resetPickers();
      loadGrants();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Failed to grant access.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRevoke(grantId: string) {
    await revokeDockerAccess(grantId);
    loadGrants();
  }

  function scopeLabel(g: DockerAccessGrant): { name?: string; kind: string } {
    switch (g.scope_type) {
      case "RESOURCE":
        return { name: g.resource_name, kind: "resource" };
      case "FOLDER":
        return { name: g.folder_name, kind: "folder" };
      case "DASHBOARD":
        return { name: g.dashboard_name, kind: "dashboard" };
      default:
        return { name: g.workspace_name, kind: "workspace" };
    }
  }

  return (
    <div className="mt-4 flex flex-col gap-4">
      <div className="flex flex-col gap-4 rounded-lg border border-slate-200 bg-white p-4">
        <div>
          <Label>Engine</Label>
          <Tabs
            value={engine}
            onValueChange={(v) => {
              setEngine((v as Engine | null) ?? "DOCKER");
              resetPickers();
            }}
          >
            <TabsList>
              <TabsTrigger value="DOCKER">Docker</TabsTrigger>
              <TabsTrigger value="K8S">Kubernetes</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor={`${kind}-scope`}>Scope</Label>
            <Select
              value={scope}
              onValueChange={(v) => {
                setScope((v as MonitoringScope | null) ?? "workspace");
                resetPickers();
              }}
            >
              <SelectTrigger id={`${kind}-scope`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="workspace">Whole Workspace</SelectItem>
                <SelectItem value="resource">Specific {engine === "DOCKER" ? "VM or Docker Host" : "Cluster"}</SelectItem>
                <SelectItem value="folder">Specific Folder</SelectItem>
                <SelectItem value="dashboard">Specific Dashboard</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor={`${kind}-workspace`}>Workspace</Label>
            <Select
              value={workspaceId}
              onValueChange={(v) => {
                setWorkspaceId(v ?? "");
                resetPickers();
              }}
            >
              <SelectTrigger id={`${kind}-workspace`}>
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

          {scope === "resource" && (
            <div>
              <Label htmlFor={`${kind}-resource`}>{engine === "DOCKER" ? "VM or Docker Host" : "Cluster"}</Label>
              <Select value={resourceId} onValueChange={(v) => setResourceId(v ?? "")} disabled={!workspaceId}>
                <SelectTrigger id={`${kind}-resource`}>
                  <SelectValue placeholder={workspaceId ? "Select a resource" : "Pick a workspace first"} />
                </SelectTrigger>
                <SelectContent>
                  {resourceOptions.map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {scope === "folder" && (
            <div>
              <Label htmlFor={`${kind}-folder`}>Folder</Label>
              <Select value={folderId} onValueChange={(v) => setFolderId(v ?? "")} disabled={!workspaceId}>
                <SelectTrigger id={`${kind}-folder`}>
                  <SelectValue placeholder={workspaceId ? "Select a folder" : "Pick a workspace first"} />
                </SelectTrigger>
                <SelectContent>
                  {folders.map((f) => (
                    <SelectItem key={f.id} value={f.id}>
                      {f.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {scope === "dashboard" && (
            <div>
              <Label htmlFor={`${kind}-dashboard`}>Dashboard</Label>
              <Select value={dashboardId} onValueChange={(v) => setDashboardId(v ?? "")} disabled={!workspaceId}>
                <SelectTrigger id={`${kind}-dashboard`}>
                  <SelectValue placeholder={workspaceId ? "Select a dashboard" : "Pick a workspace first"} />
                </SelectTrigger>
                <SelectContent>
                  {dashboards.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div>
            <Label htmlFor={`${kind}-member`}>Member</Label>
            <Select value={userId} onValueChange={(v) => setUserId(v ?? "")}>
              <SelectTrigger id={`${kind}-member`}>
                <SelectValue placeholder={members.length === 0 ? "No members available" : "Select a member"} />
              </SelectTrigger>
              <SelectContent>
                {members.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.name} ({m.email})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button onClick={handleGrant} disabled={submitting}>
            Grant Access
          </Button>
          {formError && <p className="text-sm text-red-600">{formError}</p>}
        </div>
      </div>

      {listError && <p className="text-sm text-red-600">{listError}</p>}
      <div className="rounded-lg border border-slate-200 bg-white">
        {grants.length === 0 ? (
          <p className="p-6 text-sm text-slate-500">No {kind === "MONITORING" ? "Monitoring" : "Logs"} access grants yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Member</TableHead>
                <TableHead>Scope</TableHead>
                <TableHead>Permission</TableHead>
                <TableHead>Granted</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {grants.map((g) => {
                const { name, kind: scopeKind } = scopeLabel(g);
                const href = scopeKind === "workspace" ? `/workspaces/${g.workspace_id}` : monitoringScopeHref(g);
                return (
                  <TableRow key={g.id}>
                    <TableCell>
                      <div className="font-medium text-slate-900">{g.user_name}</div>
                      <div className="text-xs text-slate-500">{g.user_email}</div>
                    </TableCell>
                    <TableCell>
                      {scopeKind === "resource" ? (
                        <Badge variant="secondary">{name}</Badge>
                      ) : href ? (
                        <Link href={href} className="text-sky-700 hover:underline">
                          {name}
                        </Link>
                      ) : (
                        name
                      )}
                      <span className="ml-1 text-xs text-slate-400">{scopeKind}</span>
                    </TableCell>
                    <TableCell className="text-slate-600">{PERMISSION_LABELS[g.permission]}</TableCell>
                    <TableCell className="text-slate-500">{new Date(g.created_at).toLocaleString()}</TableCell>
                    <TableCell className="text-right">
                      <ConfirmDialog
                        trigger={
                          <Button variant="ghost" size="sm">
                            Revoke
                          </Button>
                        }
                        title={`Revoke ${PERMISSION_LABELS[g.permission]} for ${g.user_name}?`}
                        description={`They will immediately lose access to ${name}'s ${PERMISSION_LABELS[g.permission]} in this section.`}
                        confirmLabel="Revoke"
                        onConfirm={() => handleRevoke(g.id)}
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}

// --- Resources: direct access to one individual VM, Database, or Object
// Storage -- reuses the existing per-type grant/revoke endpoints and the
// same listPermissions ledger /permissions already reads.

type ResourceKind = "VM" | "DATABASE" | "OBJECT_STORAGE";

function revokeByType(type: ResourceKind, resourceId: string, userId: string) {
  switch (type) {
    case "VM":
      return revokeVMAccess(userId, resourceId);
    case "DATABASE":
      return revokeDatabaseAccess(resourceId, userId);
    case "OBJECT_STORAGE":
      return revokeObjectStorageAccess(resourceId, userId);
  }
}

function defaultPermissionFor(type: ResourceKind): string {
  if (type === "VM") return "vm.view";
  if (type === "DATABASE") return "database.view";
  return "object_storage.view";
}

function ResourcesAccessTab({ members }: { members: UserListItem[] }) {
  const [resourceType, setResourceType] = useState<ResourceKind>("VM");
  const [vms, setVms] = useState<VM[]>([]);
  const [databases, setDatabases] = useState<DatabaseListItem[]>([]);
  const [storages, setStorages] = useState<ObjectStorageListItem[]>([]);
  const [resourceId, setResourceId] = useState("");
  const [permissions, setPermissions] = useState<Set<string>>(new Set(["vm.view"]));
  const [userId, setUserId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [grants, setGrants] = useState<PermissionGrant[]>([]);
  const [listError, setListError] = useState<string | null>(null);

  useEffect(() => {
    listVMs().then((res) => setVms(res.vms)).catch(() => setVms([]));
    listDatabases().then((res) => setDatabases(res.databases)).catch(() => setDatabases([]));
    listObjectStorage().then((res) => setStorages(res.storages)).catch(() => setStorages([]));
  }, []);

  const loadGrants = useCallback(() => {
    listPermissions({ resource_type: resourceType })
      .then((res) => setGrants(res.grants))
      .catch(() => setListError("Failed to load grants."));
  }, [resourceType]);

  useEffect(() => {
    loadGrants();
  }, [loadGrants]);

  function handleTypeChange(type: ResourceKind) {
    setResourceType(type);
    setResourceId("");
    setPermissions(new Set([defaultPermissionFor(type)]));
  }

  const resourceOptions =
    resourceType === "VM"
      ? vms.map((v) => ({ id: v.id, label: `${v.name} (${v.workspace})` }))
      : resourceType === "DATABASE"
        ? databases.map((d) => ({ id: d.id, label: `${d.name ?? d.host} (${d.workspace_name ?? "-"})` }))
        : storages.map((s) => ({ id: s.id, label: `${s.name} (${s.workspace_name ?? "-"})` }));

  const permissionOptions: string[] =
    resourceType === "VM" ? [...VM_PERMISSIONS] : resourceType === "DATABASE" ? ALL_DATABASE_PERMISSIONS : ALL_OBJECT_STORAGE_PERMISSIONS;

  function togglePermission(p: string) {
    setPermissions((prev) => {
      const next = new Set(prev);
      if (next.has(p)) next.delete(p);
      else next.add(p);
      return next;
    });
  }

  async function handleGrant() {
    setFormError(null);
    if (!resourceId) {
      setFormError("Select a resource.");
      return;
    }
    if (!userId) {
      setFormError("Select a member.");
      return;
    }
    if (permissions.size === 0) {
      setFormError("Select at least one permission.");
      return;
    }
    setSubmitting(true);
    try {
      if (resourceType === "VM") await grantVMAccess(userId, resourceId, [...permissions]);
      else if (resourceType === "DATABASE") await grantDatabaseAccess(resourceId, userId, [...permissions]);
      else await grantObjectStorageAccess(resourceId, userId, [...permissions]);
      setResourceId("");
      setUserId("");
      loadGrants();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Failed to grant access.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRevoke(g: PermissionGrant) {
    await revokeByType(g.resource_type, g.resource_id, g.user_id);
    loadGrants();
  }

  return (
    <div className="mt-4 flex flex-col gap-4">
      <div className="flex flex-col gap-4 rounded-lg border border-slate-200 bg-white p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="resources-type">Resource Type</Label>
            <Select value={resourceType} onValueChange={(v) => handleTypeChange((v as ResourceKind | null) ?? "VM")}>
              <SelectTrigger id="resources-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="VM">VM</SelectItem>
                <SelectItem value="DATABASE">Database</SelectItem>
                <SelectItem value="OBJECT_STORAGE">Object Storage</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="resources-resource">Resource</Label>
            <Select value={resourceId} onValueChange={(v) => setResourceId(v ?? "")}>
              <SelectTrigger id="resources-resource">
                <SelectValue placeholder="Select a resource" />
              </SelectTrigger>
              <SelectContent>
                {resourceOptions.map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div>
          <Label>Permissions</Label>
          <div className="mt-1 flex flex-wrap gap-3">
            {permissionOptions.map((p) => (
              <label key={p} className="flex items-center gap-2 text-sm text-slate-700">
                <Checkbox checked={permissions.has(p)} onCheckedChange={() => togglePermission(p)} />
                {p}
              </label>
            ))}
          </div>
        </div>

        <div className="max-w-sm">
          <Label htmlFor="resources-member">Member</Label>
          <Select value={userId} onValueChange={(v) => setUserId(v ?? "")}>
            <SelectTrigger id="resources-member">
              <SelectValue placeholder={members.length === 0 ? "No members available" : "Select a member"} />
            </SelectTrigger>
            <SelectContent>
              {members.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.name} ({m.email})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-3">
          <Button onClick={handleGrant} disabled={submitting}>
            Grant Access
          </Button>
          {formError && <p className="text-sm text-red-600">{formError}</p>}
        </div>
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
              <TableHead>Granted</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {grants.map((g) => (
              <TableRow key={`${g.resource_id}-${g.user_id}-${g.permission}`}>
                <TableCell className="font-mono text-xs">{g.permission}</TableCell>
                <TableCell className="text-slate-600">{g.description}</TableCell>
                <TableCell>
                  <div className="font-medium text-slate-900">{g.resource_name}</div>
                  <div className="text-xs text-slate-500">
                    {g.user_name} ({g.user_email})
                  </div>
                </TableCell>
                <TableCell>
                  <Link href={`/workspaces/${g.workspace_id}`} className="text-sky-700 hover:underline">
                    {g.workspace_name}
                  </Link>
                </TableCell>
                <TableCell className="text-slate-500">{new Date(g.granted_at).toLocaleString()}</TableCell>
                <TableCell className="text-right">
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
            {grants.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-slate-500">
                  No direct permission grants for this resource type.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
