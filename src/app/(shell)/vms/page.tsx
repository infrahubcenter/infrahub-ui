"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Plus, Search, Server, Settings } from "lucide-react";
import { useAuth } from "@/components/auth/auth-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StatusBadge } from "@/components/infrastructure/status-badge";
import { isAdminRole, listVMs, type ResourceStatus, type VM } from "@/lib/api";

const ALL = "__all__";

export default function VMsPage() {
  const { user } = useAuth();
  const [vms, setVms] = useState<VM[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [workspaceFilter, setWorkspaceFilter] = useState(ALL);
  const [statusFilter, setStatusFilter] = useState<string>(ALL);

  useEffect(() => {
    listVMs()
      .then((res) => setVms(res.vms))
      .catch(() => setError("Failed to load VMs."));
  }, []);

  const workspaces = useMemo(() => [...new Set((vms ?? []).map((v) => v.workspace))].sort(), [vms]);

  const filtered = useMemo(() => {
    if (!vms) return [];
    const q = query.trim().toLowerCase();
    return vms.filter((vm) => {
      if (q && !vm.name.toLowerCase().includes(q) && !vm.address.toLowerCase().includes(q)) return false;
      if (workspaceFilter !== ALL && vm.workspace !== workspaceFilter) return false;
      if (statusFilter !== ALL && vm.status !== statusFilter) return false;
      return true;
    });
  }, [vms, query, workspaceFilter, statusFilter]);

  const statuses: ResourceStatus[] = ["UNKNOWN", "ONLINE", "OFFLINE", "WARNING", "ERROR", "DISABLED"];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Virtual Machines</h2>
          <p className="text-sm text-slate-500">
            {isAdminRole(user?.role) ? "Every registered VM." : "VMs you have access to."}
          </p>
        </div>
        {isAdminRole(user?.role) && (
          <Button render={<Link href="/vms/new" />}>
            <Plus className="h-4 w-4" /> Add VM
          </Button>
        )}
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input placeholder="Search" className="pl-8" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <Select value={workspaceFilter} onValueChange={(v) => setWorkspaceFilter(v ?? ALL)}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Workspace" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All workspaces</SelectItem>
            {workspaces.map((w) => (
              <SelectItem key={w} value={w}>
                {w}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v ?? ALL)}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All statuses</SelectItem>
            {statuses.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {vms !== null && filtered.length === 0 && (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center">
          <Server className="mx-auto mb-3 h-8 w-8 text-slate-300" />
          <p className="text-sm font-medium text-slate-700">
            {vms.length === 0 ? "No VMs to show." : "No VMs match your filters."}
          </p>
          {vms.length === 0 && user?.role === "MEMBER" && (
            <p className="mt-1 text-sm text-slate-500">Contact an administrator to request access.</p>
          )}
        </div>
      )}

      {filtered.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>VM</TableHead>
                <TableHead>Workspace</TableHead>
                <TableHead>Address</TableHead>
                <TableHead>OS</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last Seen</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((vm) => (
                <TableRow key={vm.id}>
                  <TableCell>
                    <Link href={`/vms/${vm.id}/console`} className="font-medium text-sky-700 hover:underline">
                      {vm.name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-slate-600">{vm.workspace}</TableCell>
                  <TableCell className="text-slate-600">{vm.address || "Agent-only"}</TableCell>
                  <TableCell className="text-slate-600">
                    {vm.os_name ? `${vm.os_name} ${vm.os_version ?? ""}` : "Not discovered"}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={vm.status} />
                  </TableCell>
                  <TableCell className="text-slate-600">
                    {vm.last_seen_at ? new Date(vm.last_seen_at).toLocaleString() : "Never"}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button variant="outline" size="sm" render={<Link href={`/vms/${vm.id}/console`} />}>
                        Console
                      </Button>
                      <Button variant="outline" size="sm" render={<Link href={`/vms/${vm.id}`} />}>
                        <Settings className="h-3.5 w-3.5" /> Configure
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
