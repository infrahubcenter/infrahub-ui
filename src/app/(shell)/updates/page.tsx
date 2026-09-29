"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpCircle, ShieldAlert } from "lucide-react";
import { useAuth } from "@/components/auth/auth-provider";
import { OSUpdateStatusBadge, RebootStatusBadge } from "@/components/infrastructure/update-status-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  getUpdatesOverview,
  type GlobalUpdateTotals,
  type OSUpdateStatus,
  type RebootStatus,
  type VMUpdateSummaryRow,
  isAdminRole,
} from "@/lib/api";

// Admins see every VM's update status; members see only VMs they're
// individually authorized on, and the summary cards are computed by the
// backend from that same restricted set -- never a client-side filter,
// never a separately-fetched global count (spec §44/§46).
export default function UpdatesPage() {
  const { user } = useAuth();
  const [vms, setVms] = useState<VMUpdateSummaryRow[] | null>(null);
  const [totals, setTotals] = useState<GlobalUpdateTotals | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    getUpdatesOverview()
      .then((res) => {
        setVms(res.vms);
        setTotals(res.totals);
      })
      .catch(() => setError("Failed to load updates."));
  }, []);

  useEffect(() => {
    // Load-on-mount: no external store to subscribe to.

    load();
  }, [load]);

  if (error) return <p className="text-sm text-red-600">{error}</p>;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
            <ArrowUpCircle className="h-5 w-5" /> Update Center
          </h2>
          <p className="text-sm text-slate-500">
            {isAdminRole(user?.role) ? "OS, kernel, and package update status across every VM." : "Update status for VMs you're authorized on."}
          </p>
        </div>
        <Link href="/update-operations" className="text-sm text-sky-700 hover:underline">
          View Update Operations →
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
        <SummaryCard label="VMs With Updates" value={totals?.vms_with_updates} />
        <SummaryCard
          label="Security Updates"
          value={totals?.security_updates}
          tone={totals && totals.security_updates > 0 ? "text-red-600" : undefined}
          icon={<ShieldAlert className="h-4 w-4 text-red-500" />}
        />
        <SummaryCard label="Package Updates" value={totals?.package_updates} />
        <SummaryCard label="OS Updates" value={totals?.os_updates} />
        <SummaryCard
          label="Reboots Required"
          value={totals?.reboots_required}
          tone={totals && totals.reboots_required > 0 ? "text-amber-600" : undefined}
        />
      </div>

      {vms !== null && vms.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center">
          <ArrowUpCircle className="mx-auto mb-3 h-8 w-8 text-slate-300" />
          <p className="text-sm font-medium text-slate-700">
            {isAdminRole(user?.role) ? "No VMs found." : "No VMs authorized for you yet."}
          </p>
        </div>
      ) : (
        vms !== null && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>VM</TableHead>
                <TableHead>OS</TableHead>
                <TableHead>Package Updates</TableHead>
                <TableHead>Security Updates</TableHead>
                <TableHead>Reboot</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {vms.map((vm) => (
                <TableRow key={vm.vm_id}>
                  <TableCell>
                    <Link href={`/vms/${vm.vm_id}/updates`} className="font-medium text-sky-700 hover:underline">
                      {vm.vm_name}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <OSUpdateStatusBadge status={(vm.os_status || "UNKNOWN") as OSUpdateStatus} />
                  </TableCell>
                  <TableCell className="text-slate-600">{vm.package_update_count}</TableCell>
                  <TableCell className="text-slate-600">{vm.security_update_count}</TableCell>
                  <TableCell>
                    <RebootStatusBadge status={(vm.reboot_status || "UNKNOWN") as RebootStatus} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )
      )}
    </div>
  );
}

function SummaryCard({ label, value, tone, icon }: { label: string; value?: number; tone?: string; icon?: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex items-center gap-1.5 text-sm text-slate-500">
        {icon}
        {label}
      </div>
      <div className={`mt-1 text-2xl font-semibold ${tone ?? "text-slate-900"}`}>{value ?? "—"}</div>
    </div>
  );
}
