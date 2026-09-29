"use client";

import { useEffect, useMemo, useState } from "react";
import { Check } from "lucide-react";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { DockerContainerPicker, K8sNamespacePicker } from "@/components/infrastructure/resource-selection-pickers";
import {
  ApiError,
  createMonitoringDashboard,
  getMonitoringFolder,
  listDockerHostContainers,
  listDockerHosts,
  listK8sClusters,
  listK8sOverview,
  setMonitoringDashboardResourceSelection,
  type DockerHost,
  type DockerHostContainer,
  type K8sCluster,
  type K8sOverviewPod,
  type MonitoringDashboard,
  type MonitoringDashboardFilter,
  type MonitoringFeature,
} from "@/lib/api";

type Step = "basic" | "resources" | "review";

export function isDockerFeature(feature: MonitoringFeature): boolean {
  return feature === "DOCKER_MONITORING" || feature === "DOCKER_LOGS";
}
export function isLogsFeature(feature: MonitoringFeature): boolean {
  return feature === "DOCKER_LOGS" || feature === "K8S_LOGS";
}

// The "Configure Dashboard" wizard reached from a folder's "+ Create
// Dashboard" button -- parameterized by `feature` so the same component
// drives all four trees, but the two trees now genuinely differ in
// shape based on real usage feedback: a *_MONITORING dashboard always
// tracks its whole target (no resource picking, no widget picking --
// just name it, pick the host/cluster, done: Basic -> Review), while a
// *_LOGS dashboard still needs to know which containers/namespaces to
// show a log picker for, so it keeps a Resources step. Docker dashboards
// of either kind are Docker-Host-only (a VM's own Docker section already
// covers per-VM container detail, and this avoids the "VM or Docker
// Host" target choice entirely). Neither kind asks for a refresh
// interval at creation time anymore -- that's now a dashboard-view-level
// control (see RefreshIntervalControl), changeable any time without
// re-running this wizard. Admin-only, matching every mutation endpoint
// this calls.
export function ConfigureMonitoringDashboardWizard({
  feature,
  folderId,
  open,
  onOpenChange,
  onCreated,
}: {
  feature: MonitoringFeature;
  folderId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (dashboard: MonitoringDashboard) => void;
}) {
  const docker = isDockerFeature(feature);
  const logs = isLogsFeature(feature);
  const steps: Step[] = logs ? ["basic", "resources", "review"] : ["basic", "review"];

  const [stepIndex, setStepIndex] = useState(0);
  const step = steps[stepIndex];

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [resourceId, setResourceId] = useState("");

  // The folder's own workspace -- a dashboard's workspace is always
  // derived server-side from its bound resource (never trusted from the
  // client), and Create rejects a resource whose workspace doesn't match
  // the target folder's. Resolving this up front and filtering the
  // pickers below to it means that rejection becomes unreachable from
  // this UI, instead of a cryptic validation error at submit time.
  const [folderWorkspaceId, setFolderWorkspaceId] = useState<string | null>(null);

  const [clusters, setClusters] = useState<K8sCluster[]>([]);
  const [dockerHosts, setDockerHosts] = useState<DockerHost[]>([]);

  const [hostContainers, setHostContainers] = useState<DockerHostContainer[]>([]);
  const [selectedContainerIds, setSelectedContainerIds] = useState<string[]>([]);
  // "Select all" submits an EMPTY resource-selection filter rather than
  // every currently-known id -- the dashboard view already treats an
  // empty CONTAINER/NAMESPACE filter as "no filter, show everything"
  // (see monitoring/docker & monitoring/kubernetes dashboard pages' own
  // scopedContainers/scopedPods), so this is also how a container/pod
  // created *after* the dashboard is set up still shows up automatically,
  // not just whatever existed at wizard time. The checklist stays fully
  // visible either way (every row shown checked-and-locked while active)
  // -- ticking the box was never meant to hide what you're now tracking.
  const [selectAllContainers, setSelectAllContainers] = useState(false);
  const [pods, setPods] = useState<K8sOverviewPod[]>([]);
  const [selectedNamespaces, setSelectedNamespaces] = useState<string[]>([]);
  const [selectAllNamespaces, setSelectAllNamespaces] = useState(false);
  const [resourcesLoading, setResourcesLoading] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    getMonitoringFolder(folderId)
      .then((f) => setFolderWorkspaceId(f.workspace_id))
      .catch(() => setFolderWorkspaceId(null));
    if (docker) {
      listDockerHosts()
        .then((r) => setDockerHosts(r.hosts))
        .catch(() => setDockerHosts([]));
    } else {
      listK8sClusters()
        .then((r) => setClusters(r.clusters))
        .catch(() => setClusters([]));
    }
  }, [open, docker, folderId]);

  // Scoped to the folder's own workspace -- every Docker Host/Cluster
  // listed here is guaranteed to pass Create's workspace-match check, so
  // there's no way to pick an incompatible one in the first place.
  const scopedDockerHosts = useMemo(
    () => (folderWorkspaceId ? dockerHosts.filter((h) => h.workspace_id === folderWorkspaceId) : dockerHosts),
    [dockerHosts, folderWorkspaceId]
  );
  const scopedClusters = useMemo(
    () => (folderWorkspaceId ? clusters.filter((c) => c.workspace_id === folderWorkspaceId) : clusters),
    [clusters, folderWorkspaceId]
  );

  // resourcesRefreshKey bumps on every manual "Refresh" click so the
  // effect below re-runs even though resourceId hasn't changed -- picks
  // up a container/namespace that appeared *after* the wizard was opened
  // without needing to close and reopen it.
  const [resourcesRefreshKey, setResourcesRefreshKey] = useState(0);

  useEffect(() => {
    if (!open || !resourceId || !logs) return;
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
  }, [open, resourceId, docker, logs, resourcesRefreshKey]);


  function reset() {
    setStepIndex(0);
    setName("");
    setDescription("");
    setResourceId("");
    setSelectedContainerIds([]);
    setSelectAllContainers(false);
    setSelectedNamespaces([]);
    setSelectAllNamespaces(false);
    setError(null);
  }

  function close() {
    onOpenChange(false);
    reset();
  }

  const canProceedFromBasic = name.trim() !== "" && resourceId !== "";
  const canProceedFromResources = docker
    ? selectAllContainers || selectedContainerIds.length > 0
    : selectAllNamespaces || selectedNamespaces.length > 0;

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      const dashboard = await createMonitoringDashboard({
        feature,
        name,
        description: description || undefined,
        monitoring_folder_id: folderId,
        vm_resource_id: docker ? resourceId : undefined,
        k8s_cluster_resource_id: docker ? undefined : resourceId,
      });

      if (logs) {
        const filters: MonitoringDashboardFilter[] = docker
          ? selectAllContainers
            ? []
            : selectedContainerIds.map((id) => ({ type: "CONTAINER", value: id }))
          : selectAllNamespaces
            ? []
            : selectedNamespaces.map((n) => ({ type: "NAMESPACE" as const, value: n }));
        await setMonitoringDashboardResourceSelection(dashboard.id, filters);
      } else {
        // Monitoring dashboards always track everything on their target
        // -- an explicit empty filter, same "no filter" meaning the view
        // pages already give it.
        await setMonitoringDashboardResourceSelection(dashboard.id, []);
      }

      onCreated(dashboard);
      close();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create the dashboard.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={(v) => (v ? onOpenChange(v) : close())}>
      <AlertDialogContent className="max-w-4xl data-[size=default]:max-w-4xl sm:data-[size=default]:max-w-4xl">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-lg">Configure {docker ? "Docker" : "Kubernetes"} Dashboard</AlertDialogTitle>
          <AlertDialogDescription>
            {logs ? "Set up a new log dashboard." : "Set up a new monitoring dashboard."}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="flex items-center gap-3 text-sm">
          {steps.map((s, i) => (
            <div key={s} className="flex items-center gap-3">
              <div
                className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-medium",
                  i < stepIndex ? "bg-emerald-600 text-white" : i === stepIndex ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-500"
                )}
              >
                {i < stepIndex ? <Check className="h-4 w-4" /> : i + 1}
              </div>
              <span className={cn("capitalize", i === stepIndex ? "font-medium text-slate-900" : "text-slate-500")}>{s}</span>
              {i < steps.length - 1 && <div className="h-px w-10 bg-slate-200" />}
            </div>
          ))}
        </div>

        <div className="max-h-[65vh] overflow-y-auto px-1 py-2">
          {step === "basic" && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Label htmlFor="dash-name">Dashboard Name *</Label>
                <Input id="dash-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Backend Production" />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="dash-desc">Description</Label>
                <Textarea id="dash-desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
              </div>
              <div className="sm:col-span-2">
                <Label>{docker ? "Docker Host" : "Cluster"} *</Label>
                <Select value={resourceId} onValueChange={(v) => setResourceId(v ?? "")}>
                  <SelectTrigger>
                    <SelectValue placeholder={`Select a ${docker ? "Docker Host" : "cluster"}`} />
                  </SelectTrigger>
                  <SelectContent>
                    {docker
                      ? scopedDockerHosts.map((h) => (
                          <SelectItem key={h.resource_id} value={h.resource_id}>
                            {h.name}
                          </SelectItem>
                        ))
                      : scopedClusters.map((c) => (
                          <SelectItem key={c.resource_id} value={c.resource_id}>
                            {c.name}
                          </SelectItem>
                        ))}
                  </SelectContent>
                </Select>
                {folderWorkspaceId &&
                  ((docker && scopedDockerHosts.length === 0) || (!docker && scopedClusters.length === 0)) && (
                    <p className="mt-1.5 text-xs text-amber-600">
                      None found in this folder&rsquo;s workspace -- a dashboard can only be bound to a resource in the same
                      workspace as its folder.
                    </p>
                  )}
                {!logs && (
                  <p className="mt-1.5 text-xs text-slate-500">
                    {docker
                      ? "Tracks every container on this host -- no picking, and refresh cadence is a control on the dashboard itself once it's created."
                      : "Tracks the whole cluster -- every node and pod, no picking. Refresh cadence is a control on the dashboard itself once it's created."}
                  </p>
                )}
              </div>
            </div>
          )}

          {step === "resources" && docker && (
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

          {step === "resources" && !docker && (
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

          {step === "review" && (
            <dl className="grid grid-cols-3 gap-y-2 text-sm">
              <dt className="text-slate-500">Name</dt>
              <dd className="col-span-2 text-slate-900">{name}</dd>
              <dt className="text-slate-500">{docker ? "Docker Host" : "Cluster"}</dt>
              <dd className="col-span-2 text-slate-900">
                {docker ? dockerHosts.find((h) => h.resource_id === resourceId)?.name : clusters.find((c) => c.resource_id === resourceId)?.name}
              </dd>
              {logs && (
                <>
                  <dt className="text-slate-500">{docker ? "Containers" : "Namespaces"}</dt>
                  <dd className="col-span-2 text-slate-900">
                    {docker
                      ? selectAllContainers
                        ? "All containers (including future ones)"
                        : `${selectedContainerIds.length} selected`
                      : selectAllNamespaces
                        ? "All namespaces (including future ones)"
                        : `${selectedNamespaces.length} selected`}
                  </dd>
                </>
              )}
              {!logs && (
                <>
                  <dt className="text-slate-500">Scope</dt>
                  <dd className="col-span-2 text-slate-900">Everything on this {docker ? "host" : "cluster"} -- no picking needed.</dd>
                </>
              )}
            </dl>
          )}

          {error && (
            <Alert variant="destructive" className="mt-3">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </div>

        <AlertDialogFooter>
          <Button variant="outline" onClick={close} disabled={submitting}>
            Cancel
          </Button>
          {stepIndex > 0 && (
            <Button variant="outline" onClick={() => setStepIndex((i) => i - 1)} disabled={submitting}>
              Back
            </Button>
          )}
          {step !== "review" ? (
            <Button
              onClick={() => setStepIndex((i) => i + 1)}
              disabled={(step === "basic" && !canProceedFromBasic) || (step === "resources" && !canProceedFromResources)}
            >
              Next →
            </Button>
          ) : (
            <Button onClick={handleSubmit} disabled={submitting}>
              {submitting ? "Creating…" : "Create Dashboard"}
            </Button>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
