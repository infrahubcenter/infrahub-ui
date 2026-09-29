"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import {
  AlertTriangle, Boxes, CheckCircle2, Layers, Server, Share2, Briefcase, Clock, Copy,
  HardDrive, Database, Globe, ShieldCheck, Network, Gauge, SlidersHorizontal, ShieldAlert, TrendingUp,
} from "lucide-react";
import { useAuth } from "@/components/auth/auth-provider";
import { MonitoringBreadcrumb } from "@/components/infrastructure/monitoring-breadcrumb";
import { StatCard, CARD_THEMES } from "@/components/infrastructure/monitor-dashboard-widgets";
import { TimeSeriesChart, type SeriesPoint } from "@/components/infrastructure/time-series-chart";
import { K8sPodsTable } from "@/components/infrastructure/k8s-pods-table";
import { K8sNodeCard, K8sUsageBar } from "@/components/infrastructure/k8s-node-card";
import { RefreshIntervalControl } from "@/components/infrastructure/refresh-interval-control";
import { K8sResourceDetailSheet, type K8sResourceKind } from "@/components/infrastructure/k8s-resource-detail-sheet";
import { DashboardHeaderActions } from "@/components/infrastructure/dashboard-header-actions";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatBytes } from "@/lib/format";
import {
  getK8sClusterResources,
  getMonitoringDashboard,
  listK8sOverview,
  updateMonitoringDashboard,
  type K8sClusterResourcesResult,
  type K8sOverviewPod,
  type MonitoringDashboard,
  isAdminRole,
} from "@/lib/api";

const MAX_SAMPLES = 60;

export default function MonitoringKubernetesDashboardPage() {
  const params = useParams<{ dashboardId: string }>();
  const dashboardId = params.dashboardId;
  const { user } = useAuth();
  const isAdmin = isAdminRole(user?.role);

  const [dashboard, setDashboard] = useState<MonitoringDashboard | null>(null);
  const [pods, setPods] = useState<K8sOverviewPod[]>([]);
  const [resources, setResources] = useState<K8sClusterResourcesResult | null>(null);
  const [samples, setSamples] = useState<SeriesPoint[]>([]);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [error, setError] = useState(false);
  // Local, editable copy of the dashboard's refresh cadence -- seeded
  // from the stored value but changeable live from the header without
  // reopening the wizard; handleRefreshIntervalChange persists it back.
  const [refreshSeconds, setRefreshSeconds] = useState(30);
  const [manualRefreshKey, setManualRefreshKey] = useState(0);
  const [detailKind, setDetailKind] = useState<K8sResourceKind | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    getMonitoringDashboard(dashboardId)
      .then((d) => {
        setDashboard(d);
        setRefreshSeconds(d.refresh_interval_seconds);
      })
      .catch(() => setError(true));
  }, [dashboardId]);

  useEffect(() => {
    if (!dashboard) return;
    let cancelled = false;

    async function poll() {
      setRefreshing(true);
      try {
        const [podRes, resourceRes] = await Promise.all([
          listK8sOverview(dashboard!.k8s_cluster_resource_id),
          getK8sClusterResources(dashboard!.k8s_cluster_resource_id!),
        ]);
        if (cancelled) return;
        setPods(podRes.pods);
        setResources(resourceRes);
        setLastUpdated(new Date());

        const nodes = resourceRes.nodes ?? [];
        const avgCPU = nodes.length ? nodes.reduce((sum, n) => sum + (n.cpu_usage_percent ?? 0), 0) / nodes.length : 0;
        const avgMem = nodes.length ? nodes.reduce((sum, n) => sum + (n.memory_usage_percent ?? 0), 0) / nodes.length : 0;
        const t = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
        setSamples((prev) => [...prev, { t, cpu: avgCPU, mem: avgMem }].slice(-MAX_SAMPLES));
      } catch {
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setRefreshing(false);
      }
    }

    void poll();
    const interval = setInterval(poll, Math.max(5, refreshSeconds) * 1000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
    // manualRefreshKey is a trigger only -- bumping it re-runs this effect
    // to force one immediate poll(), same as the interval firing early.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dashboard?.id, dashboard?.k8s_cluster_resource_id, refreshSeconds, manualRefreshKey]);

  async function handleRefreshIntervalChange(seconds: number) {
    setRefreshSeconds(seconds);
    if (isAdmin && dashboard) {
      try {
        await updateMonitoringDashboard(dashboard.id, { refresh_interval_seconds: seconds });
      } catch {
        // Non-fatal -- the client-side poll cadence above already changed;
        // worst case the choice doesn't survive a reload.
      }
    }
  }

  // Monitoring dashboards always track every pod on the cluster -- no
  // resource_selection scoping here (that concept is Logs-dashboard-only
  // now; see the wizard's own doc comment).
  const runningCount = pods.filter((p) => p.phase === "RUNNING").length;
  const failedCount = pods.filter((p) => p.phase === "FAILED").length;

  if (error) return <p className="text-sm text-red-600">Failed to load this dashboard.</p>;
  if (!dashboard) return <p className="text-sm text-slate-500">Loading&hellip;</p>;

  const agentStatus = resources?.status ?? "failed";
  const nodes = resources?.nodes ?? [];
  const clusterCpuCapacity = nodes.reduce((sum, n) => sum + n.cpu_capacity_millicores, 0);
  const clusterCpuUsed = nodes.reduce((sum, n) => sum + (n.cpu_usage_millicores ?? 0), 0);
  const clusterMemCapacity = nodes.reduce((sum, n) => sum + n.memory_capacity_bytes, 0);
  const clusterMemUsed = nodes.reduce((sum, n) => sum + (n.memory_usage_bytes ?? 0), 0);
  const nodesWithStorage = nodes.filter((n) => n.storage_capacity_bytes !== undefined);
  const clusterStorageCapacity = nodesWithStorage.reduce((sum, n) => sum + (n.storage_capacity_bytes ?? 0), 0);
  const clusterStorageUsed = nodesWithStorage.reduce((sum, n) => sum + (n.storage_usage_bytes ?? 0), 0);

  return (
    <div className="flex flex-col gap-4">
      <MonitoringBreadcrumb
        segments={[
          { label: "Monitoring", href: "/monitoring/kubernetes" },
          { label: "Kubernetes", href: "/monitoring/kubernetes" },
          ...(dashboard.folder_name ? [{ label: dashboard.folder_name, href: `/monitoring/kubernetes/folders/${dashboard.monitoring_folder_id}` }] : []),
          { label: dashboard.name },
        ]}
      />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold text-slate-900">{dashboard.name}</h1>
            {agentStatus === "ok" ? (
              <Badge className="gap-1 bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200">Healthy</Badge>
            ) : agentStatus === "agent_offline" ? (
              <Badge className="gap-1 bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-200">Agent Offline</Badge>
            ) : (
              <Badge className="gap-1 bg-slate-100 text-slate-600 ring-1 ring-inset ring-slate-200">Unknown</Badge>
            )}
          </div>
          <p className="text-xs text-slate-500">
            Cluster: {dashboard.bound_resource_name}
            {lastUpdated && ` · Last updated ${lastUpdated.toLocaleTimeString()}`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <RefreshIntervalControl
            seconds={refreshSeconds}
            onChange={isAdmin ? handleRefreshIntervalChange : undefined}
            onRefreshNow={() => setManualRefreshKey((k) => k + 1)}
            editable={isAdmin}
            refreshing={refreshing}
          />
          {isAdmin && (
            <DashboardHeaderActions
              dashboard={dashboard}
              onUpdated={setDashboard}
              backHref={dashboard.monitoring_folder_id ? `/monitoring/kubernetes/folders/${dashboard.monitoring_folder_id}` : "/monitoring/kubernetes"}
            />
          )}
        </div>
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="pods">Pods</TabsTrigger>
          <TabsTrigger value="nodes">Nodes</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="flex flex-col gap-4">
          {agentStatus !== "ok" && (
            <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              {resources?.message ?? "No agent is currently connected for this cluster."}
            </p>
          )}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            <StatCard label="Namespaces" value={resources?.namespaces ?? "—"} icon={Boxes} onClick={() => setDetailKind("namespaces")} theme={CARD_THEMES.emerald} />
            <StatCard label="Nodes" value={resources?.node_count ?? "—"} icon={Server} theme={CARD_THEMES.emerald} />
            <StatCard label="Pods" value={pods.length} icon={Boxes} theme={CARD_THEMES.emerald} />
            <StatCard label="Running" value={runningCount} icon={CheckCircle2} theme={CARD_THEMES.emerald} />
            <StatCard label="Failed" value={failedCount} icon={AlertTriangle} theme={CARD_THEMES.rose} />
            <StatCard label="Deployments" value={resources?.deployments ?? "—"} icon={Layers} onClick={() => setDetailKind("deployments")} theme={CARD_THEMES.indigo} />
            <StatCard label="StatefulSets" value={resources?.stateful_sets ?? "—"} icon={Layers} onClick={() => setDetailKind("statefulsets")} theme={CARD_THEMES.indigo} />
            <StatCard label="DaemonSets" value={resources?.daemon_sets ?? "—"} icon={Layers} onClick={() => setDetailKind("daemonsets")} theme={CARD_THEMES.indigo} />
            <StatCard label="ReplicaSets" value={resources?.replica_sets ?? "—"} icon={Copy} onClick={() => setDetailKind("replicasets")} theme={CARD_THEMES.indigo} />
            <StatCard label="Jobs" value={resources?.jobs ?? "—"} icon={Briefcase} onClick={() => setDetailKind("jobs")} theme={CARD_THEMES.indigo} />
            <StatCard label="CronJobs" value={resources?.cron_jobs ?? "—"} icon={Clock} onClick={() => setDetailKind("cronjobs")} theme={CARD_THEMES.indigo} />
            <StatCard label="Services" value={resources?.services ?? "—"} icon={Share2} onClick={() => setDetailKind("services")} theme={CARD_THEMES.sky} />
            <StatCard label="Ingresses" value={resources?.ingresses ?? "—"} icon={Globe} onClick={() => setDetailKind("ingresses")} theme={CARD_THEMES.sky} />
            <StatCard label="Network Policies" value={resources?.network_policies ?? "—"} icon={ShieldCheck} onClick={() => setDetailKind("networkpolicies")} theme={CARD_THEMES.sky} />
            <StatCard label="Endpoint Slices" value={resources?.endpoint_slices ?? "—"} icon={Network} onClick={() => setDetailKind("endpointslices")} theme={CARD_THEMES.sky} />
            <StatCard label="PVCs" value={resources?.persistent_volume_claims ?? "—"} icon={Server} onClick={() => setDetailKind("pvcs")} theme={CARD_THEMES.cyan} />
            <StatCard label="Persistent Volumes" value={resources?.persistent_volumes ?? "—"} icon={HardDrive} onClick={() => setDetailKind("pvs")} theme={CARD_THEMES.cyan} />
            <StatCard label="Storage Classes" value={resources?.storage_classes ?? "—"} icon={Database} onClick={() => setDetailKind("storageclasses")} theme={CARD_THEMES.cyan} />
            <StatCard label="Resource Quotas" value={resources?.resource_quotas ?? "—"} icon={Gauge} onClick={() => setDetailKind("resourcequotas")} theme={CARD_THEMES.violet} />
            <StatCard label="Limit Ranges" value={resources?.limit_ranges ?? "—"} icon={SlidersHorizontal} onClick={() => setDetailKind("limitranges")} theme={CARD_THEMES.violet} />
            <StatCard label="Pod Disruption Budgets" value={resources?.pod_disruption_budgets ?? "—"} icon={ShieldAlert} onClick={() => setDetailKind("pdbs")} theme={CARD_THEMES.violet} />
            <StatCard label="HPAs" value={resources?.horizontal_pod_autoscalers ?? "—"} icon={TrendingUp} onClick={() => setDetailKind("hpas")} theme={CARD_THEMES.violet} />
          </div>

          <K8sResourceDetailSheet
            kind={detailKind}
            namespaceItems={resources?.namespace_items ?? []}
            deploymentItems={resources?.deployment_items ?? []}
            statefulSetItems={resources?.stateful_set_items ?? []}
            daemonSetItems={resources?.daemon_set_items ?? []}
            serviceItems={resources?.service_items ?? []}
            pvcItems={resources?.pvc_items ?? []}
            replicaSetItems={resources?.replica_set_items}
            jobItems={resources?.job_items}
            cronJobItems={resources?.cron_job_items}
            pvItems={resources?.pv_items}
            storageClassItems={resources?.storage_class_items}
            ingressItems={resources?.ingress_items}
            networkPolicyItems={resources?.network_policy_items}
            endpointSliceItems={resources?.endpoint_slice_items}
            resourceQuotaItems={resources?.resource_quota_items}
            limitRangeItems={resources?.limit_range_items}
            pdbItems={resources?.pdb_items}
            hpaItems={resources?.hpa_items}
            onClose={() => setDetailKind(null)}
          />

          {nodes.length > 0 && (
            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <p className="mb-3 text-sm font-medium text-slate-700">Cluster Totals</p>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <K8sUsageBar
                  label="CPU"
                  percent={clusterCpuCapacity ? (clusterCpuUsed / clusterCpuCapacity) * 100 : undefined}
                  detail={`${(clusterCpuUsed / 1000).toFixed(2)} / ${(clusterCpuCapacity / 1000).toFixed(1)} cores`}
                />
                <K8sUsageBar
                  label="Memory"
                  percent={clusterMemCapacity ? (clusterMemUsed / clusterMemCapacity) * 100 : undefined}
                  detail={`${formatBytes(clusterMemUsed)} / ${formatBytes(clusterMemCapacity)}`}
                />
                <K8sUsageBar
                  label="Storage"
                  percent={clusterStorageCapacity ? (clusterStorageUsed / clusterStorageCapacity) * 100 : undefined}
                  detail={clusterStorageCapacity ? `${formatBytes(clusterStorageUsed)} / ${formatBytes(clusterStorageCapacity)}` : "Not available"}
                />
              </div>
            </div>
          )}

          <p className="text-xs text-slate-400">
            Live data only, refreshed every {refreshSeconds}s — historical Kubernetes metrics aren&rsquo;t collected yet.
          </p>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <ChartCard title="CPU Usage">
              <TimeSeriesChart data={samples} series={[{ dataKey: "cpu", name: "CPU %", color: "#2563eb" }]} yDomain={[0, 100]} emptyMessage="Collecting data…" />
            </ChartCard>
            <ChartCard title="Memory Usage">
              <TimeSeriesChart data={samples} series={[{ dataKey: "mem", name: "Memory %", color: "#16a34a" }]} yDomain={[0, 100]} emptyMessage="Collecting data…" />
            </ChartCard>
          </div>
        </TabsContent>

        <TabsContent value="pods">
          <K8sPodsTable pods={pods} isAdmin={isAdmin} agentOffline={agentStatus !== "ok"} />
        </TabsContent>

        <TabsContent value="nodes">
          {nodes.length === 0 ? (
            <p className="text-sm text-slate-500">No nodes reported yet.</p>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {nodes.map((node) => (
                <K8sNodeCard key={node.name} node={node} />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <p className="mb-2 text-sm font-medium text-slate-700">{title}</p>
      <div className="h-56">{children}</div>
    </div>
  );
}
