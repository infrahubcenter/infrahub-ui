"use client";

import { MonitoringBreadcrumb } from "@/components/infrastructure/monitoring-breadcrumb";
import { MonitoringFolderList } from "@/components/infrastructure/monitoring-folder-list";

export default function LogsDockerPage() {
  return (
    <div className="flex flex-col gap-4">
      <MonitoringBreadcrumb segments={[{ label: "Logs" }, { label: "Docker" }]} />
      <MonitoringFolderList
        feature="DOCKER_LOGS"
        title="Docker Logs"
        description="Organize your Docker log dashboards using folders"
        basePath="/logs/docker"
      />
    </div>
  );
}
