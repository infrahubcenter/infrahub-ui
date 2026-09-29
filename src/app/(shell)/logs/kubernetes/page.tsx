"use client";

import { MonitoringBreadcrumb } from "@/components/infrastructure/monitoring-breadcrumb";
import { MonitoringFolderList } from "@/components/infrastructure/monitoring-folder-list";

export default function LogsKubernetesPage() {
  return (
    <div className="flex flex-col gap-4">
      <MonitoringBreadcrumb segments={[{ label: "Logs" }, { label: "Kubernetes" }]} />
      <MonitoringFolderList
        feature="K8S_LOGS"
        title="Kubernetes Logs"
        description="Organize your Kubernetes log dashboards using folders"
        basePath="/logs/kubernetes"
      />
    </div>
  );
}
