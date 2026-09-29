"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Boxes, Plus, Search } from "lucide-react";
import { RouteGuard } from "@/components/auth/route-guard";
import { useAuth } from "@/components/auth/auth-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { isAdminRole, ApiError, createWorkspace, listWorkspaces, type Workspace } from "@/lib/api";

// Workspace replaces the old two-tier Project+Group model with one flat
// tier: every VM/Database/Object Storage/Docker/Kubernetes resource is
// created inside exactly one Workspace. List is any authenticated role
// (the picker source for every create flow); Create/Configure/Delete are
// Admin-only, enforced both here (hiding the controls) and server-side.
export default function WorkspacesPage() {
  return (
    <RouteGuard>
      <WorkspacesContent />
    </RouteGuard>
  );
}

function WorkspacesContent() {
  const { user } = useAuth();
  const isAdmin = isAdminRole(user?.role);

  const [workspaces, setWorkspaces] = useState<Workspace[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [showCreate, setShowCreate] = useState(false);

  function load() {
    listWorkspaces()
      .then((res) => setWorkspaces(res.workspaces))
      .catch(() => setError("Failed to load workspaces."));
  }

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    if (!workspaces) return [];
    const q = query.trim().toLowerCase();
    if (!q) return workspaces;
    return workspaces.filter((w) => w.name.toLowerCase().includes(q) || w.description?.toLowerCase().includes(q));
  }, [workspaces, query]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Workspace</h2>
          <p className="text-sm text-slate-500">
            Every VM, Database, Object Storage, Docker, and Kubernetes resource lives inside a Workspace.
          </p>
        </div>
        {isAdmin && (
          <Button onClick={() => setShowCreate((v) => !v)}>
            <Plus className="h-4 w-4" /> Create Workspace
          </Button>
        )}
      </div>

      {isAdmin && showCreate && (
        <CreateWorkspaceForm
          onCreated={() => {
            setShowCreate(false);
            load();
          }}
          onCancel={() => setShowCreate(false)}
        />
      )}

      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input placeholder="Search workspaces" className="pl-8" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {workspaces !== null && filtered.length === 0 && (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center">
          <Boxes className="mx-auto mb-3 h-8 w-8 text-slate-300" />
          <p className="text-sm font-medium text-slate-700">
            {workspaces.length === 0 ? "No workspaces yet." : "No workspaces match your search."}
          </p>
          {workspaces.length === 0 && isAdmin && (
            <p className="mt-1 text-sm text-slate-500">Create your first workspace to start organizing infrastructure.</p>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {filtered.map((workspace) => (
          <div key={workspace.id} className="flex flex-col rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between">
              <h3 className="font-medium text-slate-900">{workspace.name}</h3>
              <Badge variant={workspace.is_active ? "outline" : "secondary"}>
                {workspace.is_active ? "Active" : "Inactive"}
              </Badge>
            </div>
            {workspace.description && <p className="mt-1 text-sm text-slate-500">{workspace.description}</p>}

            <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600">
              <span>{workspace.vm_count} VMs</span>
              <span>{workspace.database_count} Databases</span>
              <span>{workspace.object_storage_count} Object Storage</span>
              <span>{workspace.docker_host_count} Docker Hosts</span>
              <span>{workspace.k8s_cluster_count} K8s Clusters</span>
              <span>{workspace.member_count} Members</span>
            </div>

            {isAdmin && (
              <Button variant="outline" size="sm" className="mt-4 self-start" render={<Link href={`/workspaces/${workspace.id}`} />}>
                Open
              </Button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function CreateWorkspaceForm({ onCreated, onCancel }: { onCreated: () => void; onCancel: () => void }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      await createWorkspace({ name: name.trim(), description: description.trim() || undefined });
      onCreated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create workspace.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="flex flex-1 flex-col gap-1.5">
          <label className="text-sm font-medium text-slate-700" htmlFor="workspace-name">
            Name
          </label>
          <Input id="workspace-name" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Production" />
        </div>
        <div className="flex flex-1 flex-col gap-1.5">
          <label className="text-sm font-medium text-slate-700" htmlFor="workspace-description">
            Description (optional)
          </label>
          <Input
            id="workspace-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What lives here?"
          />
        </div>
      </div>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <div className="flex gap-2">
        <Button type="submit" disabled={!name.trim() || busy}>
          {busy ? "Creating…" : "Create Workspace"}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
