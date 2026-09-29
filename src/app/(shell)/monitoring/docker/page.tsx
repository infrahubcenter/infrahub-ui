"use client";

import { MonitoringBreadcrumb } from "@/components/infrastructure/monitoring-breadcrumb";
import { MonitoringFolderList } from "@/components/infrastructure/monitoring-folder-list";

export default function MonitoringDockerPage() {
  return (
    <div className="flex flex-col gap-4">
      <MonitoringBreadcrumb segments={[{ label: "Monitoring" }, { label: "Docker" }]} />
      <MonitoringFolderList
        feature="DOCKER_MONITORING"
        title="Docker Monitoring"
        description="Organize your Docker dashboards using folders"
        basePath="/monitoring/docker"
      />
    </div>
  );
}
