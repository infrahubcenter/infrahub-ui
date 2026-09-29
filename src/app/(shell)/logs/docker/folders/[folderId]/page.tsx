"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MonitoringBreadcrumb } from "@/components/infrastructure/monitoring-breadcrumb";
import { MonitoringDashboardTable } from "@/components/infrastructure/monitoring-dashboard-table";
import { getMonitoringFolder, type MonitoringFolder } from "@/lib/api";

export default function LogsDockerFolderPage() {
  const params = useParams<{ folderId: string }>();
  const folderId = params.folderId;
  const [folder, setFolder] = useState<MonitoringFolder | null>(null);

  useEffect(() => {
    getMonitoringFolder(folderId)
      .then(setFolder)
      .catch(() => setFolder(null));
  }, [folderId]);

  return (
    <div className="flex flex-col gap-4">
      <MonitoringBreadcrumb segments={[{ label: "Logs", href: "/logs/docker" }, { label: "Docker", href: "/logs/docker" }, { label: folder?.name ?? "Folder" }]} />
      <div>
        <Button variant="ghost" size="sm" render={<Link href="/logs/docker" />} className="mb-1 -ml-2 text-slate-500">
          <ArrowLeft className="h-4 w-4" /> Back to Folders
        </Button>
        <h1 className="text-xl font-semibold text-slate-900">{folder?.name ?? "Folder"}</h1>
      </div>
      <MonitoringDashboardTable feature="DOCKER_LOGS" folderId={folderId} basePath="/logs/docker" />
    </div>
  );
}
