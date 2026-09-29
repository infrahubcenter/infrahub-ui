"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { useAuth } from "@/components/auth/auth-provider";
import { MonitoringBreadcrumb } from "@/components/infrastructure/monitoring-breadcrumb";
import { K8sLogsBrowser } from "@/components/infrastructure/k8s-logs-browser";
import { DashboardHeaderActions } from "@/components/infrastructure/dashboard-header-actions";
import { Badge } from "@/components/ui/badge";
import { isAdminRole, getMonitoringDashboard, listK8sOverview, type K8sOverviewPod, type MonitoringDashboard } from "@/lib/api";

export default function LogsKubernetesDashboardPage() {
  const params = useParams<{ dashboardId: string }>();
  const dashboardId = params.dashboardId;
  const { user } = useAuth();
  const isAdmin = isAdminRole(user?.role);

  const [dashboard, setDashboard] = useState<MonitoringDashboard | null>(null);
  const [pods, setPods] = useState<K8sOverviewPod[]>([]);
  const [error, setError] = useState(false);

  useEffect(() => {
    getMonitoringDashboard(dashboardId)
      .then((d) => {
        setDashboard(d);
        return listK8sOverview(d.k8s_cluster_resource_id);
      })
      .then((r) => setPods(r.pods))
      .catch(() => setError(true));
  }, [dashboardId]);

  const selectedNamespaces = useMemo(
    () => new Set((dashboard?.resource_selection ?? []).filter((f) => f.type === "NAMESPACE").map((f) => f.value)),
    [dashboard]
  );
  const scopedPods = useMemo(
    () => pods.filter((p) => selectedNamespaces.size === 0 || (p.namespace && selectedNamespaces.has(p.namespace))),
    [pods, selectedNamespaces]
  );

  if (error) return <p className="text-sm text-red-600">Failed to load this dashboard.</p>;
  if (!dashboard) return <p className="text-sm text-slate-500">Loading&hellip;</p>;

  return (
    <div className="flex flex-col gap-4">
      <MonitoringBreadcrumb
        segments={[
          { label: "Logs", href: "/logs/kubernetes" },
          { label: "Kubernetes", href: "/logs/kubernetes" },
          ...(dashboard.folder_name ? [{ label: dashboard.folder_name, href: `/logs/kubernetes/folders/${dashboard.monitoring_folder_id}` }] : []),
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
            backHref={dashboard.monitoring_folder_id ? `/logs/kubernetes/folders/${dashboard.monitoring_folder_id}` : "/logs/kubernetes"}
          />
        )}
      </div>
      <K8sLogsBrowser pods={scopedPods} isAdmin={isAdmin} />
    </div>
  );
}
