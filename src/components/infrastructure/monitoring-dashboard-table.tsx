"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useAuth } from "@/components/auth/auth-provider";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ConfigureMonitoringDashboardWizard } from "@/components/infrastructure/configure-monitoring-dashboard-wizard";
import { EditMonitoringDashboardDialog } from "@/components/infrastructure/edit-monitoring-dashboard-dialog";
import { DeleteResourceDialog } from "@/components/infrastructure/delete-resource-dialog";
import { formatAgo } from "@/lib/format";
import { deleteMonitoringDashboard, isAdminRole, listMonitoringDashboards, type MonitoringDashboard, type MonitoringFeature } from "@/lib/api";

// A folder's dashboard table (Name/Description/Last Updated/Actions) --
// reused across all 4 Monitoring/Logs trees' folder pages.
export function MonitoringDashboardTable({
  feature,
  folderId,
  basePath,
}: {
  feature: MonitoringFeature;
  folderId: string;
  basePath: string;
}) {
  const { user } = useAuth();
  const isAdmin = isAdminRole(user?.role);

  const [dashboards, setDashboards] = useState<MonitoringDashboard[] | null>(null);
  const [error, setError] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [editingDashboard, setEditingDashboard] = useState<MonitoringDashboard | null>(null);

  const load = useCallback(() => {
    listMonitoringDashboards(feature, { monitoring_folder_id: folderId })
      .then((r) => {
        setDashboards(r.dashboards);
        setError(false);
      })
      .catch(() => setError(true));
  }, [feature, folderId]);

  useEffect(() => {
    load();
  }, [load]);

  if (error) return <p className="text-sm text-red-600">Failed to load dashboards.</p>;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">{dashboards ? `${dashboards.length} dashboard${dashboards.length === 1 ? "" : "s"}` : "Loading…"}</p>
        {isAdmin && (
          <Button onClick={() => setWizardOpen(true)}>
            <Plus className="h-4 w-4" /> Create Dashboard
          </Button>
        )}
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Last Updated</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {!dashboards ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-sm text-slate-500">
                  Loading&hellip;
                </TableCell>
              </TableRow>
            ) : dashboards.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-sm text-slate-500">
                  No dashboards in this folder yet.
                </TableCell>
              </TableRow>
            ) : (
              dashboards.map((d) => (
                <TableRow key={d.id}>
                  <TableCell className="font-medium text-slate-900">{d.name}</TableCell>
                  <TableCell className="text-slate-500">{d.description || "—"}</TableCell>
                  <TableCell className="text-slate-500">{formatAgo(d.created_at)}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" size="sm" render={<Link href={`${basePath}/dashboards/${d.id}`} />}>
                        View
                      </Button>
                      {isAdmin && (
                        <>
                          <Button variant="outline" size="sm" onClick={() => setEditingDashboard(d)} title="Configure dashboard">
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <DeleteResourceDialog
                            trigger={
                              <Button variant="outline" size="sm" title="Delete dashboard">
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            }
                            resourceTypeLabel="dashboard"
                            resourceName={d.name}
                            description="Permanently deletes this dashboard and its saved configuration. This cannot be undone."
                            onConfirm={async () => {
                              await deleteMonitoringDashboard(d.id);
                            }}
                            onDeleted={load}
                          />
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <ConfigureMonitoringDashboardWizard feature={feature} folderId={folderId} open={wizardOpen} onOpenChange={setWizardOpen} onCreated={load} />
      {editingDashboard && (
        <EditMonitoringDashboardDialog
          dashboard={editingDashboard}
          open={editingDashboard !== null}
          onOpenChange={(v) => !v && setEditingDashboard(null)}
          onUpdated={() => {
            setEditingDashboard(null);
            load();
          }}
        />
      )}
    </div>
  );
}
