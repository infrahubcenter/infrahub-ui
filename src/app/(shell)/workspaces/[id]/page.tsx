"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowRight, Check, Pencil, Plus, X } from "lucide-react";
import { RouteGuard } from "@/components/auth/route-guard";
import { useAuth } from "@/components/auth/auth-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ConfirmDialog } from "@/components/infrastructure/confirm-dialog";
import { DeleteResourceDialog } from "@/components/infrastructure/delete-resource-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
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
  deleteWorkspace,
  getUser,
  getWorkspace,
  grantDatabaseAccess,
  grantDockerAccess,
  grantObjectStorageAccess,
  grantVMAccess,
  listDatabases,
  listDockerAccessGrants,
  listDockerHosts,
  listK8sClusters,
  listObjectStorage,
  listUsers,
  listVMs,
  listWorkspaceMembers,
  removeWorkspaceMember,
  revokeDatabaseAccess,
  revokeDockerAccess,
  revokeObjectStorageAccess,
  revokeVMAccess,
  updateWorkspace,
  type DatabaseListItem,
  type DatabasePermission,
  type DockerAccessGrant,
  type DockerAccessPermission,
  type DockerHost,
  type K8sCluster,
  type ObjectStorageListItem,
  type ObjectStoragePermission,
  type UserDetail,
  type UserListItem,
  type VM,
  type Workspace,
  type WorkspaceMember,
  isAdminRole,
} from "@/lib/api";

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

export default function WorkspaceDetailPage() {
  return (
    <RouteGuard requireRole="ADMIN">
      <WorkspaceDetailContent />
    </RouteGuard>
  );
}

function WorkspaceDetailContent() {
  const { user } = useAuth();
  const isAdmin = isAdminRole(user?.role);
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { id: workspaceId } = params;

  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [newMemberId, setNewMemberId] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  // Resource pools for the per-member "Manage Access" panel below --
  // fetched once here (same lists the rest of the app already uses) and
  // filtered to this workspace's own resources at render time, so the
  // panel only ever offers/shows access scoped to this workspace.
  const [allVMs, setAllVMs] = useState<VM[]>([]);
  const [allDatabases, setAllDatabases] = useState<DatabaseListItem[]>([]);
  const [allObjectStorage, setAllObjectStorage] = useState<ObjectStorageListItem[]>([]);
  const [allClusters, setAllClusters] = useState<K8sCluster[]>([]);
  const [allDockerHosts, setAllDockerHosts] = useState<DockerHost[]>([]);
  const [selectedMember, setSelectedMember] = useState<WorkspaceMember | null>(null);

  // Candidate users for the Add Member picker below -- fetched once, not
  // reloaded on every `load()` (member changes don't change who exists).
  const [allUsers, setAllUsers] = useState<UserListItem[]>([]);
  useEffect(() => {
    listUsers({ limit: 100, sort: "name", order: "asc" })
      .then((res) => setAllUsers(res.users))
      .catch(() => setAllUsers([]));
  }, []);

  const load = useCallback(async () => {
    try {
      const [workspaceRes, membersRes] = await Promise.all([
        getWorkspace(workspaceId),
        listWorkspaceMembers(workspaceId),
      ]);
      setWorkspace(workspaceRes);
      setMembers(membersRes.members);
    } catch {
      setError("Failed to load workspace.");
    }
    listVMs()
      .then((res) => setAllVMs(res.vms))
      .catch(() => {
        /* VM picker is a convenience; a failure here doesn't block the page */
      });
    listDatabases()
      .then((res) => setAllDatabases(res.databases))
      .catch(() => {
        /* Database picker is a convenience; a failure here doesn't block the page */
      });
    listObjectStorage()
      .then((res) => setAllObjectStorage(res.storages))
      .catch(() => {
        /* Object storage picker is a convenience; a failure here doesn't block the page */
      });
    listK8sClusters()
      .then((res) => setAllClusters(res.clusters))
      .catch(() => {
        /* Cluster picker is a convenience; a failure here doesn't block the page */
      });
    listDockerHosts()
      .then((res) => setAllDockerHosts(res.hosts))
      .catch(() => {
        /* Docker Host picker is a convenience; a failure here doesn't block the page */
      });
  }, [workspaceId]);

  useEffect(() => {
    // Load-on-mount/param-change: no external store to subscribe to.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function handleAddMember(e: React.FormEvent) {
    e.preventDefault();
    setAddError(null);
    try {
      await addWorkspaceMember(workspaceId, newMemberId.trim());
      setNewMemberId("");
      await load();
    } catch (err) {
      setAddError(err instanceof ApiError ? err.message : "Failed to add member.");
    }
  }

  async function handleRemoveMember(userId: string) {
    await removeWorkspaceMember(workspaceId, userId);
    await load();
  }

  async function handleToggleActive() {
    if (!workspace) return;
    await updateWorkspace(workspace.id, { is_active: !workspace.is_active });
    await load();
  }

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!workspace) return <p className="text-sm text-slate-500">Loading&hellip;</p>;

  const workspaceVMs = allVMs.filter((vm) => vm.workspace_id === workspaceId);
  const workspaceDatabases = allDatabases.filter((db) => db.workspace_id === workspaceId);
  const workspaceObjectStorage = allObjectStorage.filter((s) => s.workspace_id === workspaceId);
  const workspaceClusters = allClusters.filter((c) => c.workspace_id === workspaceId);
  const workspaceDockerHosts = allDockerHosts.filter((h) => h.workspace_id === workspaceId);
  const memberIds = new Set(members.map((m) => m.id));
  const addableUsers = allUsers.filter((u) => !memberIds.has(u.id));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between">
        <div>
          <div className="mt-1 flex items-center gap-2">
            <h2 className="text-lg font-semibold text-slate-900">{workspace.name}</h2>
            <Badge variant={workspace.is_active ? "outline" : "secondary"}>
              {workspace.is_active ? "Active" : "Inactive"}
            </Badge>
          </div>
          {workspace.description && <p className="text-sm text-slate-500">{workspace.description}</p>}
        </div>
        {isAdmin && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setEditing((v) => !v)}>
              <Pencil className="h-4 w-4" /> Configure
            </Button>
            <ConfirmDialog
              trigger={<Button variant="outline">{workspace.is_active ? "Deactivate" : "Reactivate"}</Button>}
              title={`${workspace.is_active ? "Deactivate" : "Reactivate"} ${workspace.name}?`}
              description={
                workspace.is_active
                  ? "Members will lose workspace-derived access to VMs/Databases/Object Storage here. Direct grants are unaffected, and no history is deleted."
                  : "Members will regain workspace-derived access to everything in this workspace."
              }
              confirmLabel={workspace.is_active ? "Deactivate" : "Reactivate"}
              destructive={workspace.is_active}
              onConfirm={handleToggleActive}
            />
            <DeleteResourceDialog
              trigger={<Button variant="outline">Delete</Button>}
              resourceTypeLabel="workspace"
              resourceName={workspace.name}
              description="Permanently deletes this workspace. Blocked while it still contains any VM, Database, Object Storage, Docker Host, or Kubernetes Cluster -- move or remove those first. Memberships simply end."
              onConfirm={async () => {
                await deleteWorkspace(workspace.id, workspace.name);
              }}
              onDeleted={() => router.push("/workspaces")}
            />
          </div>
        )}
      </div>

      {isAdmin && editing && (
        <ConfigureWorkspaceForm
          workspace={workspace}
          onSaved={() => {
            setEditing(false);
            load();
          }}
          onCancel={() => setEditing(false)}
        />
      )}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="text-sm text-slate-500">VMs</div>
          <div className="mt-1 text-2xl font-semibold text-slate-900">{workspace.vm_count}</div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="text-sm text-slate-500">Databases</div>
          <div className="mt-1 text-2xl font-semibold text-slate-900">{workspace.database_count}</div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="text-sm text-slate-500">Object Storage</div>
          <div className="mt-1 text-2xl font-semibold text-slate-900">{workspace.object_storage_count}</div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="text-sm text-slate-500">Docker Hosts</div>
          <div className="mt-1 text-2xl font-semibold text-slate-900">{workspace.docker_host_count}</div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="text-sm text-slate-500">K8s Clusters</div>
          <div className="mt-1 text-2xl font-semibold text-slate-900">{workspace.k8s_cluster_count}</div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="text-sm text-slate-500">Members</div>
          <div className="mt-1 text-2xl font-semibold text-slate-900">{workspace.member_count}</div>
        </div>
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="resources">Resources</TabsTrigger>
          <TabsTrigger value="members">Members</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="rounded-lg border border-slate-200 bg-white p-6">
          <p className="text-sm text-slate-600">
            {workspace.vm_count} VM{workspace.vm_count === 1 ? "" : "s"}, {workspace.database_count} database
            {workspace.database_count === 1 ? "" : "s"}, {workspace.docker_host_count} Docker host
            {workspace.docker_host_count === 1 ? "" : "s"}, {workspace.k8s_cluster_count} Kubernetes cluster
            {workspace.k8s_cluster_count === 1 ? "" : "s"}, and {workspace.member_count} member
            {workspace.member_count === 1 ? "" : "s"} in this workspace. Members here can view and connect to
            every VM, and reach every Database/Object Storage/Docker/Kubernetes resource created inside it.
          </p>
        </TabsContent>

        <TabsContent value="resources" className="rounded-lg border border-slate-200 bg-white p-6">
          <div className="flex flex-col items-start gap-3">
            <p className="text-sm text-slate-600">
              VMs, databases, and object storage for this workspace are shown in the unified Monitoring
              dashboard, with live health, availability, and alert status.
            </p>
            <Button render={<Link href={`/monitoring?workspace_id=${workspaceId}`} />}>
              View all resources in this workspace <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="members" className="flex flex-col gap-4">
          <div className="rounded-lg border border-slate-200 bg-white">
            {members.length === 0 ? (
              <p className="p-6 text-sm text-slate-500">No members yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Member</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Access Source</TableHead>
                    <TableHead>Status</TableHead>
                    {isAdmin && <TableHead className="text-right">Actions</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {members.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell>
                        <Link href={`/admin/users/${m.id}`} className="font-medium text-sky-700 hover:underline">
                          {m.name}
                        </Link>
                      </TableCell>
                      <TableCell className="text-slate-600">{m.email}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">Workspace</Badge>
                      </TableCell>
                      <TableCell className="text-slate-600">{m.is_active ? "Active" : "Disabled"}</TableCell>
                      {isAdmin && (
                        <TableCell className="text-right">
                          <Button variant="outline" size="sm" onClick={() => setSelectedMember(m)}>
                            Manage Access
                          </Button>{" "}
                          <Button variant="ghost" size="sm" onClick={() => handleRemoveMember(m.id)}>
                            Remove
                          </Button>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>

          {isAdmin && (
            <>
              <form onSubmit={handleAddMember} className="flex items-end gap-2 rounded-lg border border-slate-200 bg-white p-4">
                <div className="flex flex-1 flex-col gap-1.5">
                  <Label htmlFor="member-id">User</Label>
                  <Select value={newMemberId} onValueChange={(v) => setNewMemberId(v ?? "")}>
                    <SelectTrigger id="member-id">
                      <SelectValue placeholder={addableUsers.length === 0 ? "No users available to add" : "Select a user"} />
                    </SelectTrigger>
                    <SelectContent>
                      {addableUsers.map((u) => (
                        <SelectItem key={u.id} value={u.id}>
                          {u.name} ({u.email})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button type="submit" disabled={!newMemberId.trim()}>
                  <Plus className="h-4 w-4" /> Add Member
                </Button>
              </form>
              {addError && <p className="text-sm text-red-600">{addError}</p>}
            </>
          )}
        </TabsContent>
      </Tabs>

      <Sheet
        open={selectedMember !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedMember(null);
        }}
      >
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-2xl">
          {selectedMember && (
            <MemberAccessPanel
              workspaceId={workspaceId}
              member={selectedMember}
              vms={workspaceVMs}
              databases={workspaceDatabases}
              objectStorage={workspaceObjectStorage}
              clusters={workspaceClusters}
              dockerHosts={workspaceDockerHosts}
            />
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function ConfigureWorkspaceForm({
  workspace,
  onSaved,
  onCancel,
}: {
  workspace: Workspace;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(workspace.name);
  const [description, setDescription] = useState(workspace.description ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      await updateWorkspace(workspace.id, { name: name.trim(), description: description.trim() });
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to update workspace.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="flex flex-1 flex-col gap-1.5">
          <label className="text-sm font-medium text-slate-700" htmlFor="edit-workspace-name">
            Name
          </label>
          <Input id="edit-workspace-name" autoFocus value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="flex flex-1 flex-col gap-1.5">
          <label className="text-sm font-medium text-slate-700" htmlFor="edit-workspace-description">
            Description
          </label>
          <Input id="edit-workspace-description" value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
      </div>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <div className="flex gap-2">
        <Button type="submit" disabled={!name.trim() || busy}>
          {busy ? "Saving…" : "Save"}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

// Per-member, per-workspace access management -- the redesigned home for
// what used to be four separate sections on /admin/users/[id] (VM/
// Database/Object Storage/Docker+K8s access), now scoped to just this
// workspace's own resources so an admin grants access exactly where the
// resource lives instead of hunting through a global picker. Fetches the
// member's full UserDetail (same endpoint the old admin page used) purely
// to read their current vm_access/database_access/object_storage_access,
// then filters each down to this workspace before rendering.
function MemberAccessPanel({
  workspaceId,
  member,
  vms,
  databases,
  objectStorage,
  clusters,
  dockerHosts,
}: {
  workspaceId: string;
  member: WorkspaceMember;
  vms: VM[];
  databases: DatabaseListItem[];
  objectStorage: ObjectStorageListItem[];
  clusters: K8sCluster[];
  dockerHosts: DockerHost[];
}) {
  const [detail, setDetail] = useState<UserDetail | null>(null);
  const [dockerGrants, setDockerGrants] = useState<DockerAccessGrant[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    getUser(member.id)
      .then(setDetail)
      .catch(() => setError("Failed to load this member's access."));
    listDockerAccessGrants()
      .then((res) => setDockerGrants(res.grants.filter((g) => g.user_id === member.id)))
      .catch(() => setDockerGrants([]));
  }, [member.id]);

  useEffect(() => {
    load();
  }, [load]);

  // docker.monitor/docker.logs grants can scope to either a VM (its own
  // Docker agent) or a standalone Docker Host resource -- both resource
  // types are valid for those two permissions (see docker_access.go's
  // dockerPermissionResourceTypes on the backend).
  const vmIds = new Set(vms.map((vm) => vm.id));
  const dockerHostResourceIds = new Set(dockerHosts.map((h) => h.resource_id));
  const clusterResourceIds = new Set(clusters.map((c) => c.resource_id));

  const workspaceVMAccess = (detail?.vm_access ?? []).filter((vm) => vm.workspace_id === workspaceId);
  const workspaceDatabaseAccess = (detail?.database_access ?? []).filter((db) => db.workspace_id === workspaceId);
  const workspaceObjectStorageAccess = (detail?.object_storage_access ?? []).filter((s) => s.workspace_id === workspaceId);
  const workspaceDockerGrants = dockerGrants.filter(
    (g) =>
      (g.scope_type === "WORKSPACE" && g.workspace_id === workspaceId) ||
      (g.scope_type === "RESOURCE" &&
        g.resource_id !== undefined &&
        (vmIds.has(g.resource_id) || dockerHostResourceIds.has(g.resource_id) || clusterResourceIds.has(g.resource_id)))
  );

  const dockerResourceOptions: ScopedResourceOption[] = [
    ...vms.map((vm) => ({ id: vm.id, name: vm.name })),
    ...dockerHosts.map((h) => ({ id: h.resource_id, name: `${h.name} (Docker Host)` })),
  ];
  const clusterResourceOptions: ScopedResourceOption[] = clusters.map((c) => ({ id: c.resource_id, name: c.name }));

  return (
    <div className="flex flex-col gap-6 p-4">
      <SheetHeader className="p-0">
        <SheetTitle>{member.name}</SheetTitle>
        <SheetDescription>{member.email} &middot; access within this workspace only</SheetDescription>
      </SheetHeader>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <MemberVMAccessSection userId={member.id} vmAccess={workspaceVMAccess} options={vms} onChange={load} />

      <MemberDatabaseAccessSection
        userId={member.id}
        databaseAccess={workspaceDatabaseAccess}
        options={databases}
        onChange={load}
      />

      <MemberObjectStorageAccessSection
        userId={member.id}
        objectStorageAccess={workspaceObjectStorageAccess}
        options={objectStorage}
        onChange={load}
      />

      <MemberDockerK8sPermissionSection
        title="Docker Monitoring"
        workspaceId={workspaceId}
        userId={member.id}
        permission="docker.monitor"
        resourceLabel="VM or Docker Host"
        grants={workspaceDockerGrants}
        resourceOptions={dockerResourceOptions}
        onChange={load}
      />

      <MemberDockerK8sPermissionSection
        title="Docker Logs"
        workspaceId={workspaceId}
        userId={member.id}
        permission="docker.logs"
        resourceLabel="VM or Docker Host"
        grants={workspaceDockerGrants}
        resourceOptions={dockerResourceOptions}
        onChange={load}
      />

      <MemberDockerK8sPermissionSection
        title="Kubernetes Monitoring"
        workspaceId={workspaceId}
        userId={member.id}
        permission="k8s.monitor"
        resourceLabel="Cluster"
        grants={workspaceDockerGrants}
        resourceOptions={clusterResourceOptions}
        onChange={load}
      />

      <MemberDockerK8sPermissionSection
        title="Kubernetes Logs"
        workspaceId={workspaceId}
        userId={member.id}
        permission="k8s.logs"
        resourceLabel="Cluster"
        grants={workspaceDockerGrants}
        resourceOptions={clusterResourceOptions}
        onChange={load}
      />
    </div>
  );
}

function MemberVMAccessSection({
  userId,
  vmAccess,
  options,
  onChange,
}: {
  userId: string;
  vmAccess: VM[];
  options: VM[];
  onChange: () => void;
}) {
  const [selectedVMId, setSelectedVMId] = useState("");
  const [canView, setCanView] = useState(true);
  const [canConnect, setCanConnect] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGrant(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!selectedVMId) return;
    const permissions = [canView && "vm.view", canConnect && "vm.connect"].filter(Boolean) as string[];
    if (permissions.length === 0) {
      setError("Select at least one permission.");
      return;
    }
    setSubmitting(true);
    try {
      await grantVMAccess(userId, selectedVMId, permissions);
      setSelectedVMId("");
      setCanView(true);
      setCanConnect(false);
      onChange();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to grant access.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRevoke(vmId: string) {
    await revokeVMAccess(userId, vmId);
    onChange();
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <h3 className="mb-3 text-sm font-semibold text-slate-900">VM Access</h3>

      {vmAccess.length === 0 && <p className="text-sm text-slate-500">No VM access in this workspace.</p>}
      <ul className="flex flex-col gap-2">
        {vmAccess.map((vm) => (
          <li key={vm.id} className="flex items-center justify-between rounded-md border border-slate-100 px-3 py-2">
            <div>
              <div className="text-sm font-medium text-slate-900">{vm.name}</div>
              <div className="mt-1 flex items-center gap-3 text-xs text-slate-500">
                <PermissionMark label="View" granted={vm.permissions.includes("vm.view")} />
                <PermissionMark label="Console" granted={vm.permissions.includes("vm.connect")} />
                <Badge variant="secondary">{vm.access_source}</Badge>
              </div>
            </div>
            {vm.access_source === "DIRECT" && (
              <Button variant="ghost" size="sm" onClick={() => handleRevoke(vm.id)}>
                Revoke
              </Button>
            )}
          </li>
        ))}
      </ul>

      {options.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">No VMs in this workspace yet.</p>
      ) : (
        <form onSubmit={handleGrant} className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex flex-1 flex-col gap-1.5">
            <Label htmlFor="vm-select">VM</Label>
            <Select value={selectedVMId} onValueChange={(v) => setSelectedVMId(v ?? "")} disabled={submitting}>
              <SelectTrigger id="vm-select">
                <SelectValue placeholder="Select a VM" />
              </SelectTrigger>
              <SelectContent>
                {options.map((vm) => (
                  <SelectItem key={vm.id} value={vm.id}>
                    {vm.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <Checkbox checked={canView} onCheckedChange={(v) => setCanView(v === true)} />
            vm.view
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <Checkbox checked={canConnect} onCheckedChange={(v) => setCanConnect(v === true)} />
            vm.connect
          </label>
          <Button type="submit" disabled={submitting || !selectedVMId}>
            Grant Access
          </Button>
        </form>
      )}
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}

// `UserDetail.database_access` is a real, always-present field as of Step
// 18 Phase 3 -- `?? []` upstream (MemberAccessPanel) is kept anyway as
// defensive-only safety against a transient shape mismatch.
function MemberDatabaseAccessSection({
  userId,
  databaseAccess,
  options,
  onChange,
}: {
  userId: string;
  databaseAccess: UserDetail["database_access"];
  options: DatabaseListItem[];
  onChange: () => void;
}) {
  const [selectedDatabaseId, setSelectedDatabaseId] = useState("");
  const [selectedPermissions, setSelectedPermissions] = useState<Set<DatabasePermission>>(
    new Set(["database.view"])
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function togglePermission(p: DatabasePermission) {
    setSelectedPermissions((prev) => {
      const next = new Set(prev);
      if (next.has(p)) next.delete(p);
      else next.add(p);
      return next;
    });
  }

  async function handleGrant(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!selectedDatabaseId || selectedPermissions.size === 0) {
      setError("Select a database and at least one permission.");
      return;
    }
    setSubmitting(true);
    try {
      await grantDatabaseAccess(selectedDatabaseId, userId, [...selectedPermissions]);
      setSelectedDatabaseId("");
      setSelectedPermissions(new Set(["database.view"]));
      onChange();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to grant access.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRevoke(databaseId: string) {
    await revokeDatabaseAccess(databaseId, userId);
    onChange();
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <h3 className="mb-3 text-sm font-semibold text-slate-900">Database Access</h3>

      {databaseAccess.length === 0 && <p className="text-sm text-slate-500">No database access in this workspace.</p>}
      <ul className="flex flex-col gap-2">
        {databaseAccess.map((db) => (
          <li key={db.id} className="flex items-center justify-between rounded-md border border-slate-100 px-3 py-2">
            <div>
              <div className="text-sm font-medium text-slate-900">{db.name ?? db.host}</div>
              <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                <PermissionMark label="View" granted={db.permissions.includes("database.view")} />
                <PermissionMark label="Performance" granted={db.permissions.includes("database.performance")} />
                <PermissionMark label="Browser" granted={db.permissions.includes("database.browser")} />
                <PermissionMark label="Logs" granted={db.permissions.includes("database.logs")} />
                <PermissionMark label="Query Details" granted={db.permissions.includes("database.query_details")} />
                <Badge variant="secondary">{db.access_source}</Badge>
              </div>
            </div>
            {db.access_source === "DIRECT" && (
              <Button variant="ghost" size="sm" onClick={() => handleRevoke(db.id)}>
                Revoke
              </Button>
            )}
          </li>
        ))}
      </ul>

      {options.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">No databases in this workspace yet.</p>
      ) : (
        <form onSubmit={handleGrant} className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex flex-1 flex-col gap-1.5">
            <Label htmlFor="database-select">Database</Label>
            <Select value={selectedDatabaseId} onValueChange={(v) => setSelectedDatabaseId(v ?? "")} disabled={submitting}>
              <SelectTrigger id="database-select">
                <SelectValue placeholder="Select a database" />
              </SelectTrigger>
              <SelectContent>
                {options.map((db) => (
                  <SelectItem key={db.id} value={db.id}>
                    {db.name ?? db.host}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-wrap gap-3">
            {ALL_DATABASE_PERMISSIONS.map((p) => (
              <label key={p} className="flex items-center gap-2 text-sm text-slate-700">
                <Checkbox checked={selectedPermissions.has(p)} onCheckedChange={() => togglePermission(p)} disabled={submitting} />
                {p}
              </label>
            ))}
          </div>
          <Button type="submit" disabled={submitting || !selectedDatabaseId}>
            Grant Access
          </Button>
        </form>
      )}
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}

// `UserDetail.object_storage_access` is a real, always-present field as of
// Step 18 Phase 3 -- see the identical note on MemberDatabaseAccessSection above.
function MemberObjectStorageAccessSection({
  userId,
  objectStorageAccess,
  options,
  onChange,
}: {
  userId: string;
  objectStorageAccess: UserDetail["object_storage_access"];
  options: ObjectStorageListItem[];
  onChange: () => void;
}) {
  const [selectedStorageId, setSelectedStorageId] = useState("");
  const [selectedPermissions, setSelectedPermissions] = useState<Set<ObjectStoragePermission>>(
    new Set(["object_storage.view"])
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function togglePermission(p: ObjectStoragePermission) {
    setSelectedPermissions((prev) => {
      const next = new Set(prev);
      if (next.has(p)) next.delete(p);
      else next.add(p);
      return next;
    });
  }

  async function handleGrant(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!selectedStorageId || selectedPermissions.size === 0) {
      setError("Select an object storage and at least one permission.");
      return;
    }
    setSubmitting(true);
    try {
      await grantObjectStorageAccess(selectedStorageId, userId, [...selectedPermissions]);
      setSelectedStorageId("");
      setSelectedPermissions(new Set(["object_storage.view"]));
      onChange();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to grant access.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRevoke(storageId: string) {
    await revokeObjectStorageAccess(storageId, userId);
    onChange();
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <h3 className="mb-3 text-sm font-semibold text-slate-900">Object Storage Access</h3>

      {objectStorageAccess.length === 0 && (
        <p className="text-sm text-slate-500">No object storage access in this workspace.</p>
      )}
      <ul className="flex flex-col gap-2">
        {objectStorageAccess.map((storage) => (
          <li key={storage.id} className="flex items-center justify-between rounded-md border border-slate-100 px-3 py-2">
            <div>
              <div className="text-sm font-medium text-slate-900">{storage.name}</div>
              <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                <PermissionMark label="View" granted={storage.permissions.includes("object_storage.view")} />
                <PermissionMark label="Monitor" granted={storage.permissions.includes("object_storage.monitor")} />
                <PermissionMark label="Browser" granted={storage.permissions.includes("object_storage.browser")} />
                <PermissionMark label="Download" granted={storage.permissions.includes("object_storage.download")} />
                <Badge variant="secondary">{storage.access_source}</Badge>
              </div>
            </div>
            {storage.access_source === "DIRECT" && (
              <Button variant="ghost" size="sm" onClick={() => handleRevoke(storage.id)}>
                Revoke
              </Button>
            )}
          </li>
        ))}
      </ul>

      {options.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">No object storage in this workspace yet.</p>
      ) : (
        <form onSubmit={handleGrant} className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex flex-1 flex-col gap-1.5">
            <Label htmlFor="object-storage-select">Object Storage</Label>
            <Select value={selectedStorageId} onValueChange={(v) => setSelectedStorageId(v ?? "")} disabled={submitting}>
              <SelectTrigger id="object-storage-select">
                <SelectValue placeholder="Select an object storage" />
              </SelectTrigger>
              <SelectContent>
                {options.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-wrap gap-3">
            {ALL_OBJECT_STORAGE_PERMISSIONS.map((p) => (
              <label key={p} className="flex items-center gap-2 text-sm text-slate-700">
                <Checkbox checked={selectedPermissions.has(p)} onCheckedChange={() => togglePermission(p)} disabled={submitting} />
                {p}
              </label>
            ))}
          </div>
          <Button type="submit" disabled={submitting || !selectedStorageId}>
            Grant Access
          </Button>
        </form>
      )}
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}

type ScopedResourceOption = { id: string; name: string };

// One independent section per Docker/Kubernetes permission (Docker
// Monitoring, Docker Logs, Kubernetes Monitoring, Kubernetes Logs) --
// each fixed to its own permission (no dropdown needed) with its own
// clearly-labeled Workspace-wide vs. Specific-resource scope choice, so
// granting e.g. "Docker Logs on just this one VM" never touches
// Kubernetes. "Workspace-wide" always means *this* workspace (no picker
// needed); "Specific resource" only offers this workspace's own
// VMs/Docker Hosts/clusters, as applicable to the permission.
function MemberDockerK8sPermissionSection({
  title,
  workspaceId,
  userId,
  permission,
  resourceLabel,
  grants,
  resourceOptions,
  onChange,
}: {
  title: string;
  workspaceId: string;
  userId: string;
  permission: DockerAccessPermission;
  resourceLabel: string;
  grants: DockerAccessGrant[];
  resourceOptions: ScopedResourceOption[];
  onChange: () => void;
}) {
  const [scopeMode, setScopeMode] = useState<"workspace" | "resource">("workspace");
  const [resourceId, setResourceId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const permissionGrants = grants.filter((g) => g.permission === permission);
  const resourceLabelLower = resourceLabel.toLowerCase();

  async function handleGrant(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (scopeMode === "resource" && !resourceId) {
      setError(`Select a ${resourceLabelLower}.`);
      return;
    }
    setSubmitting(true);
    try {
      await grantDockerAccess(
        scopeMode === "workspace"
          ? { user_id: userId, workspace_id: workspaceId, permission }
          : { user_id: userId, resource_id: resourceId, permission }
      );
      setResourceId("");
      onChange();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to grant access.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRevoke(grantId: string) {
    await revokeDockerAccess(grantId);
    onChange();
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <h3 className="mb-3 text-sm font-semibold text-slate-900">{title}</h3>

      {permissionGrants.length === 0 && (
        <p className="text-sm text-slate-500">No {title.toLowerCase()} access in this workspace.</p>
      )}
      <ul className="flex flex-col gap-2">
        {permissionGrants.map((g) => (
          <li key={g.id} className="flex items-center justify-between rounded-md border border-slate-100 px-3 py-2">
            <div>
              <div className="text-sm font-medium text-slate-900">
                {g.scope_type === "RESOURCE" ? g.resource_name : "Whole workspace"}
              </div>
              <div className="mt-1 text-xs text-slate-500">
                {g.scope_type === "RESOURCE" ? "Specific resource" : "Workspace-wide"}
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={() => handleRevoke(g.id)}>
              Revoke
            </Button>
          </li>
        ))}
      </ul>

      <form onSubmit={handleGrant} className="mt-4 flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${permission}-scope-mode`}>Scope</Label>
          <Select
            value={scopeMode}
            onValueChange={(v) => {
              setScopeMode((v as "workspace" | "resource") ?? "workspace");
              setResourceId("");
            }}
            disabled={submitting}
          >
            <SelectTrigger id={`${permission}-scope-mode`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="workspace">Workspace-wide (every {resourceLabelLower} here)</SelectItem>
              <SelectItem value="resource">Specific {resourceLabelLower}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {scopeMode === "resource" && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${permission}-resource`}>{resourceLabel}</Label>
            <Select value={resourceId} onValueChange={(v) => setResourceId(v ?? "")} disabled={submitting}>
              <SelectTrigger id={`${permission}-resource`}>
                <SelectValue placeholder={`Select a ${resourceLabelLower}`} />
              </SelectTrigger>
              <SelectContent>
                {resourceOptions.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {resourceOptions.length === 0 && (
              <p className="text-xs text-slate-500">No {resourceLabelLower}s in this workspace yet.</p>
            )}
          </div>
        )}

        <Button type="submit" disabled={submitting || (scopeMode === "resource" && !resourceId)} className="w-fit">
          Grant Access
        </Button>
      </form>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}

function PermissionMark({ label, granted }: { label: string; granted: boolean }) {
  return (
    <span className="inline-flex items-center gap-1">
      {granted ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <X className="h-3.5 w-3.5 text-slate-300" />}
      {label}
    </span>
  );
}
