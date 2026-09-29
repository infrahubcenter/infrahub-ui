"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Activity, Box, Cpu, Container, Gauge, HardDrive, MemoryStick, Network, Play, Square } from "lucide-react";
import { useAuth } from "@/components/auth/auth-provider";
import { MonitoringBreadcrumb } from "@/components/infrastructure/monitoring-breadcrumb";
import { StatCard, CARD_THEMES } from "@/components/infrastructure/monitor-dashboard-widgets";
import { TimeSeriesChart, type SeriesPoint } from "@/components/infrastructure/time-series-chart";
import { DockerContainersTable } from "@/components/infrastructure/docker-containers-table";
import { DockerImagesTable } from "@/components/infrastructure/docker-images-table";
import { RefreshIntervalControl } from "@/components/infrastructure/refresh-interval-control";
import { DockerResourceDetailSheet, type DockerResourceKind } from "@/components/infrastructure/docker-resource-detail-sheet";
import { DashboardHeaderActions } from "@/components/infrastructure/dashboard-header-actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatBytes } from "@/lib/format";
import {
  getDockerHostResources,
  getDockerHostSystemMetrics,
  getDockerSummary,
  getMonitoringDashboard,
  listDockerHostContainers,
  listDockerOverview,
  updateMonitoringDashboard,
  type DockerHostContainer,
  type DockerHostResources,
  type DockerHostSystemMetrics,
  type DockerOverviewContainer,
  type DockerSummary,
  type MonitoringDashboard,
  isAdminRole,
} from "@/lib/api";

// Adapts a Docker Host's live container list to DockerOverviewContainer's
// shape so DockerContainersTable needs zero changes to render either kind
// of dashboard. vm_resource_id/vm_name are left unset -- the table's own
// `isAdmin && c.vm_resource_id && <Button>View</Button>` guard already
// correctly hides that action for a Docker Host (there's no per-VM Docker
// page to link to).
function toOverviewContainer(c: DockerHostContainer, workspaceName: string): DockerOverviewContainer {
  return {
    container_id: c.container_id,
    container_name: c.name,
    real_container_id: c.container_id,
    display_name: c.name,
    image: c.image,
    status: c.status,
    workspace_name: workspaceName,
    created_at_remote: c.created_at_remote,
    metrics: c.metrics && { container_id: c.container_id, captured_at: new Date().toISOString(), stale: false, ...c.metrics },
  };
}

const MAX_SAMPLES = 60;

export default function MonitoringDockerDashboardPage() {
  const params = useParams<{ dashboardId: string }>();
  const dashboardId = params.dashboardId;
  const { user } = useAuth();
  const isAdmin = isAdminRole(user?.role);
  const router = useRouter();

  const [dashboard, setDashboard] = useState<MonitoringDashboard | null>(null);
  const [containers, setContainers] = useState<DockerOverviewContainer[]>([]);
  const [summary, setSummary] = useState<DockerSummary | null>(null);
  const [samples, setSamples] = useState<SeriesPoint[]>([]);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [error, setError] = useState(false);
  // Local, editable copy of the dashboard's refresh cadence -- seeded
  // from the stored value but changeable live from the header without
  // reopening the wizard; handleRefreshIntervalChange persists it back.
  const [refreshSeconds, setRefreshSeconds] = useState(30);
  const [manualRefreshKey, setManualRefreshKey] = useState(0);
  const [hostResources, setHostResources] = useState<DockerHostResources | null>(null);
  const [systemMetrics, setSystemMetrics] = useState<DockerHostSystemMetrics | null>(null);
  const [detailKind, setDetailKind] = useState<DockerResourceKind | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    getMonitoringDashboard(dashboardId)
      .then((d) => {
        setDashboard(d);
        setRefreshSeconds(d.refresh_interval_seconds);
      })
      .catch(() => setError(true));
  }, [dashboardId]);

  const isDockerHost = dashboard?.bound_resource_type === "DOCKER_HOST";

  useEffect(() => {
    if (!dashboard) return;
    let cancelled = false;

    async function poll() {
      setRefreshing(true);
      try {
        // Monitoring dashboards always track every container on the
        // target -- no resource_selection scoping here (that concept is
        // Logs-dashboard-only now; see the wizard's own doc comment).
        const overviewContainers = isDockerHost
          ? (await listDockerHostContainers(dashboard!.vm_resource_id!)).containers.map((c) =>
              toOverviewContainer(c, dashboard!.workspace_name)
            )
          : (await listDockerOverview(dashboard!.vm_resource_id)).containers;
        if (cancelled) return;
        setContainers(overviewContainers);
        setLastUpdated(new Date());

        const cpu = overviewContainers.reduce((sum, c) => sum + (c.metrics?.cpu_percent ?? 0), 0);
        const memBytes = overviewContainers.reduce((sum, c) => sum + (c.metrics?.memory_usage_bytes ?? 0), 0);
        const rx = overviewContainers.reduce((sum, c) => sum + (c.metrics?.network_rx_bytes ?? 0), 0);
        const tx = overviewContainers.reduce((sum, c) => sum + (c.metrics?.network_tx_bytes ?? 0), 0);
        const t = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
        setSamples((prev) => [...prev, { t, cpu, mem: memBytes / (1024 * 1024), rx, tx }].slice(-MAX_SAMPLES));
      } catch {
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setRefreshing(false);
      }
    }

    void poll();
    if (isAdmin && dashboard.vm_resource_id && !isDockerHost) {
      getDockerSummary(dashboard.vm_resource_id)
        .then((s) => !cancelled && setSummary(s))
        .catch(() => !cancelled && setSummary(null));
    }
    if (isDockerHost && dashboard.vm_resource_id) {
      getDockerHostResources(dashboard.vm_resource_id)
        .then((r) => !cancelled && setHostResources(r))
        .catch(() => !cancelled && setHostResources(null));
      getDockerHostSystemMetrics(dashboard.vm_resource_id)
        .then((m) => !cancelled && setSystemMetrics(m))
        .catch(() => !cancelled && setSystemMetrics(null));
    }
    const interval = setInterval(poll, Math.max(5, refreshSeconds) * 1000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
    // manualRefreshKey is a trigger only -- bumping it re-runs this effect
    // to force one immediate poll(), same as the interval firing early.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dashboard?.id, dashboard?.vm_resource_id, isAdmin, isDockerHost, refreshSeconds, manualRefreshKey]);

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

  const runningCount = containers.filter((c) => c.status === "RUNNING").length;
  const stoppedCount = containers.length - runningCount;
  const totalCpuPercent = containers.reduce((sum, c) => sum + (c.metrics?.cpu_percent ?? 0), 0);
  const totalMemoryBytes = containers.reduce((sum, c) => sum + (c.metrics?.memory_usage_bytes ?? 0), 0);

  if (error) return <p className="text-sm text-red-600">Failed to load this dashboard.</p>;
  if (!dashboard) return <p className="text-sm text-slate-500">Loading&hellip;</p>;

  return (
    <div className="flex flex-col gap-4">
      <MonitoringBreadcrumb
        segments={[
          { label: "Monitoring", href: "/monitoring/docker" },
          { label: "Docker", href: "/monitoring/docker" },
          ...(dashboard.folder_name ? [{ label: dashboard.folder_name, href: `/monitoring/docker/folders/${dashboard.monitoring_folder_id}` }] : []),
          { label: dashboard.name },
        ]}
      />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold text-slate-900">{dashboard.name}</h1>
            <Badge className="gap-1 bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200">Live</Badge>
          </div>
          <p className="text-xs text-slate-500">
            {isDockerHost ? "Docker Host" : "VM"}: {dashboard.bound_resource_name}
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
            <button
              type="button"
              onClick={() => router.push(isDockerHost ? "/docker/hosts" : `/vms/${dashboard.vm_resource_id}/docker`)}
              className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800"
            >
              {isDockerHost ? "Manage Host" : "Manage VM"}
            </button>
          )}
          {isAdmin && (
            <DashboardHeaderActions
              dashboard={dashboard}
              onUpdated={setDashboard}
              backHref={dashboard.monitoring_folder_id ? `/monitoring/docker/folders/${dashboard.monitoring_folder_id}` : "/monitoring/docker"}
            />
          )}
        </div>
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="containers">Containers</TabsTrigger>
          {isAdmin && !isDockerHost && <TabsTrigger value="images">Images</TabsTrigger>}
        </TabsList>

        <TabsContent value="overview" className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            <StatCard label="Containers" value={containers.length} icon={Container} theme={CARD_THEMES.emerald} />
            <StatCard label="Running" value={runningCount} icon={Play} theme={CARD_THEMES.emerald} />
            <StatCard label="Stopped" value={stoppedCount} icon={Square} theme={CARD_THEMES.amber} />
            <StatCard label="Docker Total CPU" value={`${totalCpuPercent.toFixed(1)}%`} icon={Cpu} theme={CARD_THEMES.emerald} />
            <StatCard label="Docker Total Memory" value={formatBytes(totalMemoryBytes)} icon={MemoryStick} theme={CARD_THEMES.emerald} />
            {!isDockerHost && (
              <>
                <StatCard label="Images" value={summary ? summary.images_total : "—"} icon={Box} theme={CARD_THEMES.cyan} />
                <StatCard label="Volumes" value={summary ? summary.volumes_total : "—"} icon={HardDrive} theme={CARD_THEMES.cyan} />
                <StatCard label="Networks" value={summary ? summary.networks_total : "—"} icon={Network} theme={CARD_THEMES.sky} />
              </>
            )}
            {isDockerHost && (
              <>
                <StatCard
                  label="Images"
                  value={hostResources?.images ? hostResources.images.length : "—"}
                  sublabel={hostResources?.total_images_size_bytes !== undefined ? formatBytes(hostResources.total_images_size_bytes) : undefined}
                  icon={Box}
                  onClick={() => setDetailKind("images")}
                  theme={CARD_THEMES.cyan}
                />
                <StatCard
                  label="Volumes"
                  value={hostResources?.volumes ? hostResources.volumes.length : "—"}
                  sublabel={hostResources?.total_volumes_size_bytes !== undefined ? formatBytes(hostResources.total_volumes_size_bytes) : undefined}
                  icon={HardDrive}
                  onClick={() => setDetailKind("volumes")}
                  theme={CARD_THEMES.cyan}
                />
                <StatCard
                  label="Networks"
                  value={hostResources?.networks ? hostResources.networks.length : "—"}
                  icon={Network}
                  onClick={() => setDetailKind("networks")}
                  theme={CARD_THEMES.sky}
                />
                <StatCard
                  label="Build Cache"
                  value={hostResources?.build_cache ? hostResources.build_cache.length : "—"}
                  sublabel={hostResources?.total_build_cache_size_bytes !== undefined ? formatBytes(hostResources.total_build_cache_size_bytes) : undefined}
                  icon={HardDrive}
                  onClick={() => setDetailKind("build_cache")}
                  theme={CARD_THEMES.cyan}
                />
              </>
            )}
          </div>

          {isDockerHost && hostResources?.agent_connected === false && (
            <Alert>
              <AlertDescription>
                No agent is currently connected for this host, so image/volume/network/build-cache inventory can&rsquo;t
                be read right now. &ldquo;Docker Total CPU/Memory&rdquo; above reflects the last successful container poll.
              </AlertDescription>
            </Alert>
          )}

          {isDockerHost && (
            <div className="flex flex-col gap-3">
              <div>
                <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Docker Host Machine</h2>
                <p className="text-xs text-slate-500">
                  The whole machine -- host OS, Docker itself, and every container combined. Compare against
                  &ldquo;Docker Total CPU/Memory&rdquo; above, which counts containers only.
                </p>
              </div>

              {systemMetrics && !systemMetrics.available && (
                <Alert>
                  <AlertDescription>
                    {systemMetrics.agent_connected
                      ? "Host system metrics aren't available from this agent yet -- reinstall it (Manage Host → Regenerate Agent Token) to pick up the two additional read-only mounts this feature needs."
                      : "No agent is currently connected for this host, so host system metrics can't be read right now."}
                  </AlertDescription>
                </Alert>
              )}

              {systemMetrics?.available && (
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                  <StatCard
                    label="Host CPU"
                    value={`${(systemMetrics.cpu_percent ?? 0).toFixed(1)}%`}
                    sublabel={systemMetrics.cpu_cores !== undefined ? `of ${systemMetrics.cpu_cores} core${systemMetrics.cpu_cores === 1 ? "" : "s"}` : undefined}
                    icon={Cpu}
                    theme={CARD_THEMES.sky}
                  />
                  <StatCard
                    label="Host Memory"
                    value={formatBytes(systemMetrics.memory_used_bytes ?? 0)}
                    sublabel={systemMetrics.memory_total_bytes !== undefined ? `of ${formatBytes(systemMetrics.memory_total_bytes)}` : undefined}
                    icon={MemoryStick}
                    theme={CARD_THEMES.sky}
                  />
                  <StatCard
                    label="Load Average"
                    value={(systemMetrics.load_avg_1 ?? 0).toFixed(2)}
                    sublabel={
                      systemMetrics.load_avg_5 !== undefined && systemMetrics.load_avg_15 !== undefined
                        ? `${systemMetrics.load_avg_5.toFixed(2)} / ${systemMetrics.load_avg_15.toFixed(2)} (5m/15m)`
                        : undefined
                    }
                    icon={Activity}
                    theme={CARD_THEMES.sky}
                  />
                  <StatCard
                    label="Host Disk"
                    value={formatBytes(systemMetrics.disk_used_bytes ?? 0)}
                    sublabel={systemMetrics.disk_total_bytes !== undefined ? `of ${formatBytes(systemMetrics.disk_total_bytes)} total` : undefined}
                    icon={Gauge}
                    theme={CARD_THEMES.sky}
                  />
                </div>
              )}

              {hostResources?.agent_connected && (
                <p className="text-xs text-slate-500">
                  Docker itself (images + volumes + build cache, excluding containers&rsquo; own writable layers) is
                  using{" "}
                  <span className="font-medium text-slate-700 dark:text-slate-300">
                    {formatBytes(
                      (hostResources.total_images_size_bytes ?? 0) +
                        (hostResources.total_volumes_size_bytes ?? 0) +
                        (hostResources.total_build_cache_size_bytes ?? 0)
                    )}
                  </span>
                  {systemMetrics?.available && systemMetrics.disk_total_bytes !== undefined && (
                    <> of the host&rsquo;s {formatBytes(systemMetrics.disk_total_bytes)} total disk</>
                  )}
                  .
                </p>
              )}
            </div>
          )}

          {isDockerHost && (
            <DockerResourceDetailSheet
              kind={detailKind}
              images={hostResources?.images ?? []}
              volumes={hostResources?.volumes ?? []}
              networks={hostResources?.networks ?? []}
              buildCache={hostResources?.build_cache ?? []}
              onClose={() => setDetailKind(null)}
            />
          )}

          <p className="text-xs text-slate-400">
            Live data only, refreshed every {refreshSeconds}s — historical Docker charts aren&rsquo;t persisted per dashboard yet.
          </p>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <ChartCard title="CPU Usage">
              <TimeSeriesChart data={samples} series={[{ dataKey: "cpu", name: "CPU %", color: "#2563eb" }]} yDomain={[0, 100]} emptyMessage="Collecting data…" />
            </ChartCard>
            <ChartCard title="Memory Usage">
              <TimeSeriesChart
                data={samples}
                series={[{ dataKey: "mem", name: "Memory (MB)", color: "#16a34a" }]}
                yTickFormatter={(v) => `${v.toFixed(0)}MB`}
                tooltipFormatter={(v) => `${v.toFixed(0)} MB`}
                emptyMessage="Collecting data…"
              />
            </ChartCard>
            <ChartCard title="Network I/O">
              <TimeSeriesChart
                data={samples}
                series={[
                  { dataKey: "rx", name: "RX", color: "#0ea5e9" },
                  { dataKey: "tx", name: "TX", color: "#f97316" },
                ]}
                yTickFormatter={(v) => formatBytes(v)}
                tooltipFormatter={(v) => formatBytes(v)}
                emptyMessage="Collecting data…"
              />
            </ChartCard>
          </div>
        </TabsContent>

        <TabsContent value="containers">
          <DockerContainersTable containers={containers} isAdmin={isAdmin} />
        </TabsContent>

        {isAdmin && !isDockerHost && (
          <TabsContent value="images">
            <DockerImagesTable vmId={dashboard.vm_resource_id!} />
          </TabsContent>
        )}
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
