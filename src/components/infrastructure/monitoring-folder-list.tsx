"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Check, Folder, FolderPlus, Pencil, Plus, Trash2, X } from "lucide-react";
import { useAuth } from "@/components/auth/auth-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ConfigureMonitoringDashboardWizard } from "@/components/infrastructure/configure-monitoring-dashboard-wizard";
import { DeleteResourceDialog } from "@/components/infrastructure/delete-resource-dialog";
import {
  ApiError,
  createMonitoringFolder,
  deleteMonitoringFolder,
  listMonitoringDashboards,
  listWorkspaces,
  renameMonitoringFolder,
  type MonitoringDashboard,
  type MonitoringFeature,
  type Workspace,
  isAdminRole,
} from "@/lib/api";

type FolderSummary = { id: string; name: string; count: number };

// Folder list root for one of the four Monitoring/Logs trees (Docker/
// Kubernetes x Monitoring/Logs) -- folder cards derived from the
// caller's accessible dashboards (any-authenticated), grouped by
// monitoring_folder_id, so a Member never needs the Admin-only
// ListFolders endpoint just to browse. Admin additionally gets
// "+ Create Folder", which immediately prompts to add the first
// dashboard so a folder is never left invisibly empty.
export function MonitoringFolderList({
  feature,
  title,
  description,
  basePath,
}: {
  feature: MonitoringFeature;
  title: string;
  description: string;
  basePath: string;
}) {
  const { user } = useAuth();
  const isAdmin = isAdminRole(user?.role);

  const [dashboards, setDashboards] = useState<MonitoringDashboard[] | null>(null);
  const [error, setError] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newFolderId, setNewFolderId] = useState<string | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);

  const load = useCallback(() => {
    listMonitoringDashboards(feature)
      .then((r) => {
        setDashboards(r.dashboards);
        setError(false);
      })
      .catch(() => setError(true));
  }, [feature]);

  useEffect(() => {
    load();
  }, [load]);

  const folders = useMemo<FolderSummary[]>(() => {
    if (!dashboards) return [];
    const byFolder = new Map<string, FolderSummary>();
    for (const d of dashboards) {
      if (!d.monitoring_folder_id) continue;
      const existing = byFolder.get(d.monitoring_folder_id);
      if (existing) {
        existing.count += 1;
      } else {
        byFolder.set(d.monitoring_folder_id, { id: d.monitoring_folder_id, name: d.folder_name ?? "Folder", count: 1 });
      }
    }
    return [...byFolder.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [dashboards]);

  if (error) return <p className="text-sm text-red-600">Failed to load {title.toLowerCase()}.</p>;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">{title}</h1>
          <p className="text-sm text-slate-500">{description}</p>
        </div>
        {isAdmin && (
          <Button onClick={() => setCreating(true)}>
            <FolderPlus className="h-4 w-4" /> Create Folder
          </Button>
        )}
      </div>

      {isAdmin && creating && (
        <CreateFolderForm
          feature={feature}
          onCancel={() => setCreating(false)}
          onCreated={(folderId) => {
            setCreating(false);
            setNewFolderId(folderId);
            setWizardOpen(true);
          }}
        />
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {!dashboards ? (
          <p className="text-sm text-slate-500">Loading&hellip;</p>
        ) : (
          <>
            {folders.map((f) => (
              <FolderCard key={f.id} folder={f} basePath={basePath} isAdmin={isAdmin} onChanged={load} />
            ))}
            {isAdmin && (
              <button
                type="button"
                onClick={() => setCreating(true)}
                className="flex min-h-[104px] flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-slate-300 text-sm text-slate-500 hover:border-slate-400 hover:text-slate-700"
              >
                <Plus className="h-5 w-5" /> Create New Folder
              </button>
            )}
            {folders.length === 0 && !isAdmin && <p className="text-sm text-slate-500">No folders available yet.</p>}
          </>
        )}
      </div>

      {newFolderId && (
        <ConfigureMonitoringDashboardWizard
          feature={feature}
          folderId={newFolderId}
          open={wizardOpen}
          onOpenChange={setWizardOpen}
          onCreated={() => load()}
        />
      )}
    </div>
  );
}

// One folder card: the whole card is a Link to browse in, plus (admin-only)
// hover-revealed Edit/Delete controls rendered as siblings of that Link
// (not nested inside it -- an <a> can't validly contain <button>s).
function FolderCard({
  folder,
  basePath,
  isAdmin,
  onChanged,
}: {
  folder: FolderSummary;
  basePath: string;
  isAdmin: boolean;
  onChanged: () => void;
}) {
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(folder.name);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    const trimmed = name.trim();
    if (trimmed === "" || saving) return;
    if (trimmed === folder.name) {
      setRenaming(false);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await renameMonitoringFolder(folder.id, trimmed);
      setRenaming(false);
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to rename folder.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="group relative flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4 transition-colors hover:border-slate-300 hover:bg-slate-50">
      {isAdmin && !renaming && (
        <div className="absolute right-2 top-2 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          <button
            type="button"
            title="Rename folder"
            onClick={() => {
              setName(folder.name);
              setError(null);
              setRenaming(true);
            }}
            className="flex h-7 w-7 items-center justify-center rounded-md text-slate-500 hover:bg-slate-200 hover:text-slate-900"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <DeleteResourceDialog
            trigger={
              <button
                type="button"
                title="Delete folder"
                className="flex h-7 w-7 items-center justify-center rounded-md text-slate-500 hover:bg-red-100 hover:text-red-700"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            }
            resourceTypeLabel="folder"
            resourceName={folder.name}
            description={
              folder.count > 0
                ? `Permanently deletes this folder and the ${folder.count} dashboard${folder.count === 1 ? "" : "s"} inside it. This cannot be undone.`
                : "Permanently deletes this empty folder. This cannot be undone."
            }
            onConfirm={async () => {
              await deleteMonitoringFolder(folder.id);
            }}
            onDeleted={onChanged}
          />
        </div>
      )}

      {renaming ? (
        <div className="flex flex-col gap-2" onClick={(e) => e.preventDefault()}>
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-amber-50 text-amber-600">
            <Folder className="h-5 w-5" />
          </div>
          <Input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleSave();
              } else if (e.key === "Escape") {
                setRenaming(false);
              }
            }}
            disabled={saving}
          />
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex gap-2">
            <Button type="button" size="sm" disabled={saving || name.trim() === ""} onClick={handleSave}>
              <Check className="h-3.5 w-3.5" /> Save
            </Button>
            <Button type="button" size="sm" variant="outline" disabled={saving} onClick={() => setRenaming(false)}>
              <X className="h-3.5 w-3.5" /> Cancel
            </Button>
          </div>
        </div>
      ) : (
        <Link href={`${basePath}/folders/${folder.id}`} className="flex flex-col gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-amber-50 text-amber-600">
            <Folder className="h-5 w-5" />
          </div>
          <div>
            <p className="pr-12 font-medium text-slate-900">{folder.name}</p>
            <p className="text-xs text-slate-500">
              {folder.count} dashboard{folder.count === 1 ? "" : "s"}
            </p>
          </div>
        </Link>
      )}
    </div>
  );
}

function CreateFolderForm({
  feature,
  onCancel,
  onCreated,
}: {
  feature: MonitoringFeature;
  onCancel: () => void;
  onCreated: (folderId: string) => void;
}) {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [workspaceId, setWorkspaceId] = useState("");
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listWorkspaces()
      .then((r) => setWorkspaces(r.workspaces))
      .catch(() => setWorkspaces([]));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!workspaceId || name.trim() === "") return;
    setSubmitting(true);
    setError(null);
    try {
      const folder = await createMonitoringFolder(feature, workspaceId, name);
      onCreated(folder.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create the folder.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <Label>Workspace *</Label>
          <Select value={workspaceId} onValueChange={(v) => setWorkspaceId(v ?? "")}>
            <SelectTrigger>
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
        <div>
          <Label>Folder Name *</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Production" />
        </div>
      </div>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel} disabled={submitting}>
          Cancel
        </Button>
        <Button type="submit" disabled={submitting || !workspaceId || name.trim() === ""}>
          {submitting ? "Creating…" : "Create Folder"}
        </Button>
      </div>
    </form>
  );
}
