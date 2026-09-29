"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { useAuth } from "@/components/auth/auth-provider";
import { MonitoringBreadcrumb } from "@/components/infrastructure/monitoring-breadcrumb";
import { DockerLogsBrowser } from "@/components/infrastructure/docker-logs-browser";
import { DashboardHeaderActions } from "@/components/infrastructure/dashboard-header-actions";
import { Badge } from "@/components/ui/badge";
import {
  isAdminRole,
  getMonitoringDashboard,
  listDockerHostContainers,
  listDockerOverview,
  type DockerHostContainer,
  type DockerOverviewContainer,
  type MonitoringDashboard,
} from "@/lib/api";

// Mirrors monitoring/docker/dashboards/[dashboardId]/page.tsx's own
// toOverviewContainer adapter -- see that file's comment for why
// vm_resource_id/vm_name are left unset.
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

export default function LogsDockerDashboardPage() {
  const params = useParams<{ dashboardId: string }>();
  const dashboardId = params.dashboardId;
  const { user } = useAuth();
  const isAdmin = isAdminRole(user?.role);

  const [dashboard, setDashboard] = useState<MonitoringDashboard | null>(null);
  const [containers, setContainers] = useState<DockerOverviewContainer[]>([]);
  const [error, setError] = useState(false);

  useEffect(() => {
    getMonitoringDashboard(dashboardId)
      .then(async (d) => {
        setDashboard(d);
        if (d.bound_resource_type === "DOCKER_HOST") {
          const r = await listDockerHostContainers(d.vm_resource_id!);
          return r.containers.map((c) => toOverviewContainer(c, d.workspace_name));
        }
        return (await listDockerOverview(d.vm_resource_id)).containers;
      })
      .then(setContainers)
      .catch(() => setError(true));
  }, [dashboardId]);

  const selectedContainerIds = useMemo(
    () => new Set((dashboard?.resource_selection ?? []).filter((f) => f.type === "CONTAINER").map((f) => f.value)),
    [dashboard]
  );
  const scopedContainers = useMemo(
    () => containers.filter((c) => selectedContainerIds.size === 0 || selectedContainerIds.has(c.container_id)),
    [containers, selectedContainerIds]
  );

  if (error) return <p className="text-sm text-red-600">Failed to load this dashboard.</p>;
  if (!dashboard) return <p className="text-sm text-slate-500">Loading&hellip;</p>;

  return (
    <div className="flex flex-col gap-4">
      <MonitoringBreadcrumb
        segments={[
          { label: "Logs", href: "/logs/docker" },
          { label: "Docker", href: "/logs/docker" },
          ...(dashboard.folder_name ? [{ label: dashboard.folder_name, href: `/logs/docker/folders/${dashboard.monitoring_folder_id}` }] : []),
          { label: dashboard.name },
        ]}
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-semibold text-slate-900">{dashboard.name}</h1>
          <Badge className="gap-1 bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200">Live</Badge>
        </div>
        {isAdmin && (
          <DashboardHeaderActions
            dashboard={dashboard}
            onUpdated={setDashboard}
            backHref={dashboard.monitoring_folder_id ? `/logs/docker/folders/${dashboard.monitoring_folder_id}` : "/logs/docker"}
          />
        )}
      </div>
      <DockerLogsBrowser
        containers={scopedContainers}
        isAdmin={isAdmin}
        hostId={dashboard.bound_resource_type === "DOCKER_HOST" ? dashboard.vm_resource_id : undefined}
      />
    </div>
  );
}
