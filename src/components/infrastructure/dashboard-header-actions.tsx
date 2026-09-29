"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EditMonitoringDashboardDialog } from "@/components/infrastructure/edit-monitoring-dashboard-dialog";
import { DeleteResourceDialog } from "@/components/infrastructure/delete-resource-dialog";
import { deleteMonitoringDashboard, type MonitoringDashboard } from "@/lib/api";

// Admin-only Edit/Delete for the Dashboard itself, reused across all 4
// Monitoring/Logs x Docker/Kubernetes dashboard detail pages. Distinct
// from monitoring/docker's own pre-existing "Configure" button (which
// jumps to the bound Docker Host/VM's own settings, not the dashboard's) --
// icon-only here so the two are never confused for the same action.
export function DashboardHeaderActions({
  dashboard,
  onUpdated,
  backHref,
}: {
  dashboard: MonitoringDashboard;
  onUpdated: (dashboard: MonitoringDashboard) => void;
  backHref: string;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);

  return (
    <div className="flex items-center gap-1.5">
      <Button variant="outline" size="sm" onClick={() => setEditing(true)} title="Edit dashboard">
        <Pencil className="h-3.5 w-3.5" />
      </Button>
      <DeleteResourceDialog
        trigger={
          <Button variant="outline" size="sm" title="Delete dashboard">
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        }
        resourceTypeLabel="dashboard"
        resourceName={dashboard.name}
        description="Permanently deletes this dashboard and its saved configuration. This cannot be undone."
        onConfirm={async () => {
          await deleteMonitoringDashboard(dashboard.id);
        }}
        onDeleted={() => router.push(backHref)}
      />
      <EditMonitoringDashboardDialog
        dashboard={dashboard}
        open={editing}
        onOpenChange={setEditing}
        onUpdated={(d) => {
          setEditing(false);
          onUpdated(d);
        }}
      />
    </div>
  );
}
