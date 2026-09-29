"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Search, Server } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/infrastructure/status-badge";
import { listVMs, type VM } from "@/lib/api";

// Flat "pick a VM" list shared by the Metrics-and-Logs and Updates trees'
// index pages -- neither needs the full Virtual Machine tab's workspace/
// status filters or "+ Add VM" action, just "search, then open one".
export function VMPickerTable({
  linkPrefix,
  emptyHint,
  linkSuffix = "",
}: {
  linkPrefix: string;
  emptyHint: string;
  // Appended after the VM id in every row's link -- e.g. "?view=logs" so
  // the Metrics-and-Logs Logs tab can deep-link straight into the
  // per-VM page's Logs sub-tab instead of landing on Metrics by default.
  linkSuffix?: string;
}) {
  const [vms, setVms] = useState<VM[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    listVMs()
      .then((res) => setVms(res.vms))
      .catch(() => setError("Failed to load VMs."));
  }, []);

  const filtered = useMemo(() => {
    if (!vms) return [];
    const q = query.trim().toLowerCase();
    if (!q) return vms;
    return vms.filter((vm) => vm.name.toLowerCase().includes(q) || (vm.address ?? "").toLowerCase().includes(q));
  }, [vms, query]);

  return (
    <div className="flex flex-col gap-4">
      <div className="relative w-full max-w-xs">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input placeholder="Search VMs" className="pl-8" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {vms !== null && filtered.length === 0 && (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center">
          <Server className="mx-auto mb-3 h-8 w-8 text-slate-300" />
          <p className="text-sm font-medium text-slate-700">{vms.length === 0 ? "No VMs to show." : "No VMs match your search."}</p>
          {vms.length === 0 && <p className="mt-1 text-sm text-slate-500">{emptyHint}</p>}
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
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((vm) => (
                <TableRow key={vm.id}>
                  <TableCell>
                    <Link href={`${linkPrefix}/${vm.id}${linkSuffix}`} className="font-medium text-sky-700 hover:underline">
                      {vm.name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-slate-600">{vm.workspace}</TableCell>
                  <TableCell className="text-slate-600">{vm.address || "—"}</TableCell>
                  <TableCell>
                    <StatusBadge status={vm.status} />
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
