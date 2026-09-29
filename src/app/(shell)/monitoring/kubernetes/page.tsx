"use client";

import { MonitoringBreadcrumb } from "@/components/infrastructure/monitoring-breadcrumb";
import { MonitoringFolderList } from "@/components/infrastructure/monitoring-folder-list";

export default function MonitoringKubernetesPage() {
  return (
    <div className="flex flex-col gap-4">
      <MonitoringBreadcrumb segments={[{ label: "Monitoring" }, { label: "Kubernetes" }]} />
      <MonitoringFolderList
        feature="K8S_MONITORING"
        title="Kubernetes Monitoring"
        description="Organize your Kubernetes dashboards using folders"
        basePath="/monitoring/kubernetes"
      />
    </div>
  );
}
