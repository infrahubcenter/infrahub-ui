"use client";

import { useEffect, useState } from "react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { DockerContainerPicker, K8sNamespacePicker } from "@/components/infrastructure/resource-selection-pickers";
import { isDockerFeature, isLogsFeature } from "@/components/infrastructure/configure-monitoring-dashboard-wizard";
import {
  ApiError,
  listDockerHostContainers,
  listK8sOverview,
  setMonitoringDashboardResourceSelection,
  updateMonitoringDashboard,
  type DockerHostContainer,
  type K8sOverviewPod,
  type MonitoringDashboard,
} from "@/lib/api";

// Editing an existing Dashboard -- unlike the create wizard, the bound
// Docker Host/Cluster is fixed here (rebinding is delete + recreate, see
// services/monitoring_dashboards.go), so there's no "basic" host-picker
// step: just name/description, and -- for a *_LOGS dashboard -- the same
// container/namespace picker as creation, prefilled from the dashboard's
// current resource_selection, so adding one more container later is a
// normal edit instead of a rebuild.
export function EditMonitoringDashboardDialog({
  dashboard,
  open,
  onOpenChange,
  onUpdated,
}: {
  dashboard: MonitoringDashboard;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdated: (dashboard: MonitoringDashboard) => void;
}) {
  const docker = isDockerFeature(dashboard.feature);
  const logs = isLogsFeature(dashboard.feature);
  const resourceId = dashboard.vm_resource_id ?? dashboard.k8s_cluster_resource_id ?? "";

  const [name, setName] = useState(dashboard.name);
  const [description, setDescription] = useState(dashboard.description ?? "");

  const containerFilters = dashboard.resource_selection.filter((f) => f.type === "CONTAINER").map((f) => f.value);
  const namespaceFilters = dashboard.resource_selection.filter((f) => f.type === "NAMESPACE").map((f) => f.value);
  const [selectedContainerIds, setSelectedContainerIds] = useState<string[]>(containerFilters);
  const [selectAllContainers, setSelectAllContainers] = useState(dashboard.resource_selection.length === 0);
  const [selectedNamespaces, setSelectedNamespaces] = useState<string[]>(namespaceFilters);
  const [selectAllNamespaces, setSelectAllNamespaces] = useState(dashboard.resource_selection.length === 0);

  const [hostContainers, setHostContainers] = useState<DockerHostContainer[]>([]);
  const [pods, setPods] = useState<K8sOverviewPod[]>([]);
  const [resourcesLoading, setResourcesLoading] = useState(false);
  const [resourcesRefreshKey, setResourcesRefreshKey] = useState(0);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Re-sync every editable field from the dashboard prop whenever a
  // *different* dashboard is opened for editing (not on every re-render --
  // the admin's in-progress edits shouldn't be clobbered by an unrelated
  // parent re-fetch while this dialog is open).
  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setName(dashboard.name);
    setDescription(dashboard.description ?? "");
    setSelectedContainerIds(dashboard.resource_selection.filter((f) => f.type === "CONTAINER").map((f) => f.value));
    setSelectAllContainers(dashboard.resource_selection.length === 0);
    setSelectedNamespaces(dashboard.resource_selection.filter((f) => f.type === "NAMESPACE").map((f) => f.value));
    setSelectAllNamespaces(dashboard.resource_selection.length === 0);
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, dashboard.id]);

  useEffect(() => {
    if (!open || !logs || !resourceId) return;
    let cancelled = false;
    async function load() {
      setResourcesLoading(true);
      try {
        if (docker) {
          const r = await listDockerHostContainers(resourceId);
          if (!cancelled) setHostContainers(r.containers);
        } else {
          const r = await listK8sOverview(resourceId);
          if (!cancelled) setPods(r.pods);
        }
      } catch {
        if (!cancelled) {
          if (docker) setHostContainers([]);
          else setPods([]);
        }
      } finally {
        if (!cancelled) setResourcesLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [open, logs, docker, resourceId, resourcesRefreshKey]);

  const canSave = name.trim() !== "" && (!logs || (docker ? selectAllContainers || selectedContainerIds.length > 0 : selectAllNamespaces || selectedNamespaces.length > 0));

  async function handleSave() {
    if (!canSave || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      // Always send description explicitly, even "" -- the backend's
      // PATCH treats an OMITTED description as "leave unchanged" (so a
      // rename-only request doesn't wipe it), which means an omitted
      // field can never clear it. This form has no "leave unchanged"
      // state of its own, so it must always send the field it's showing.
      const updated = await updateMonitoringDashboard(dashboard.id, {
        name: name.trim(),
        description,
      });
      if (logs) {
        const filters = docker
          ? selectAllContainers
            ? []
            : selectedContainerIds.map((id) => ({ type: "CONTAINER" as const, value: id }))
          : selectAllNamespaces
            ? []
            : selectedNamespaces.map((n) => ({ type: "NAMESPACE" as const, value: n }));
        const withSelection = await setMonitoringDashboardResourceSelection(dashboard.id, filters);
        onUpdated(withSelection);
      } else {
        onUpdated(updated);
      }
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save changes.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={(v) => !submitting && onOpenChange(v)}>
      <AlertDialogContent className="max-w-3xl data-[size=default]:max-w-3xl sm:data-[size=default]:max-w-3xl">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-lg">Configure Dashboard</AlertDialogTitle>
          <AlertDialogDescription>
            {logs
              ? "Update the name/description, or add/remove what this dashboard tracks."
              : "Update the name and description. The bound host/cluster can't be changed here -- delete and recreate to point at a different one."}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="flex max-h-[65vh] flex-col gap-4 overflow-y-auto px-1 py-2">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label htmlFor="edit-dash-name">Dashboard Name *</Label>
              <Input id="edit-dash-name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="edit-dash-desc">Description</Label>
              <Textarea id="edit-dash-desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
            </div>
            <div className="sm:col-span-2">
              <Label>{docker ? "Docker Host" : "Cluster"}</Label>
              <p className="mt-1.5 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
                {dashboard.bound_resource_name}
              </p>
            </div>
          </div>

          {logs && docker && (
            <DockerContainerPicker
              containers={hostContainers}
              loading={resourcesLoading}
              selectedIds={selectedContainerIds}
              onSelectedIdsChange={setSelectedContainerIds}
              selectAll={selectAllContainers}
              onSelectAllChange={setSelectAllContainers}
              onRefresh={() => setResourcesRefreshKey((k) => k + 1)}
            />
          )}
          {logs && !docker && (
            <K8sNamespacePicker
              pods={pods}
              loading={resourcesLoading}
              selectedNamespaces={selectedNamespaces}
              onSelectedNamespacesChange={setSelectedNamespaces}
              selectAll={selectAllNamespaces}
              onSelectAllChange={setSelectAllNamespaces}
              onRefresh={() => setResourcesRefreshKey((k) => k + 1)}
            />
          )}

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </div>

        <AlertDialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!canSave || submitting}>
            {submitting ? "Saving…" : "Save Changes"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
