"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { K8sPodPhaseBadge } from "@/components/infrastructure/k8s-status-badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatBytes, formatAgo } from "@/lib/format";
import type { K8sOverviewPod } from "@/lib/api";

const ALL = "__all__";

function podLabel(p: K8sOverviewPod): string {
  return p.display_name || p.pod_name || "App";
}

// Kubernetes Pods table (Monitoring>Kubernetes dashboard's Pods tab) --
// Name/Namespace/Status/Node/Restarts/CPU/Memory/Age, given an
// already-scoped pod list (the dashboard's configured namespace/resource
// selection). Mirrors DockerContainersTable exactly.
//
// agentOffline surfaces a real gap: this table's `pods` prop always comes
// straight from the DB (see k8s_overview.go's own doc comment), never a
// live agent call, so a pod row keeps showing its last-known phase (e.g.
// "Running") even while the cluster's agent is currently offline and
// nothing has been confirmed since. Rather than implying that status is
// current, show a banner plus a per-row "Last Seen" column whenever the
// agent is offline right now.
export function K8sPodsTable({ pods, isAdmin, agentOffline }: { pods: K8sOverviewPod[]; isAdmin: boolean; agentOffline?: boolean }) {
  const [search, setSearch] = useState("");
  const [namespaceFilter, setNamespaceFilter] = useState(ALL);
  const [statusFilter, setStatusFilter] = useState(ALL);

  const namespaces = useMemo(
    () => [...new Set(pods.map((p) => p.namespace).filter((n): n is string => Boolean(n)))].sort(),
    [pods]
  );
  const phases = useMemo(() => [...new Set(pods.map((p) => p.phase))].sort(), [pods]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return pods.filter((p) => {
      if (namespaceFilter !== ALL && p.namespace !== namespaceFilter) return false;
      if (statusFilter !== ALL && p.phase !== statusFilter) return false;
      if (!q) return true;
      return podLabel(p).toLowerCase().includes(q);
    });
  }, [pods, search, namespaceFilter, statusFilter]);

  return (
    <div className="flex flex-col gap-3">
      {agentOffline && (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Agent offline — statuses below are each pod&rsquo;s last known state, not live, see &ldquo;Last Seen&rdquo;.
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input placeholder="Search pods..." className="pl-8" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        {isAdmin && (
          <Select value={namespaceFilter} onValueChange={(v) => setNamespaceFilter(v ?? ALL)}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="All Namespaces" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All Namespaces</SelectItem>
              {namespaces.map((n) => (
                <SelectItem key={n} value={n}>
                  {n}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v ?? ALL)}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="All Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All Status</SelectItem>
            {phases.map((p) => (
              <SelectItem key={p} value={p}>
                {p}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              {isAdmin && <TableHead>Namespace</TableHead>}
              <TableHead>Status</TableHead>
              {isAdmin && <TableHead>Node</TableHead>}
              <TableHead>Restarts</TableHead>
              <TableHead>CPU</TableHead>
              <TableHead>Memory</TableHead>
              <TableHead>Age</TableHead>
              {agentOffline && <TableHead>Last Seen</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={(isAdmin ? 8 : 6) + (agentOffline ? 1 : 0)} className="text-center text-sm text-slate-500">
                  No pods match.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((p) => (
                <TableRow key={p.pod_id}>
                  <TableCell className="font-medium text-slate-900">{podLabel(p)}</TableCell>
                  {isAdmin && <TableCell className="text-slate-600">{p.namespace ?? "—"}</TableCell>}
                  <TableCell>
                    <K8sPodPhaseBadge phase={p.phase} />
                  </TableCell>
                  {isAdmin && <TableCell className="text-slate-600">{p.node_name ?? "—"}</TableCell>}
                  <TableCell>{p.restart_count ?? "—"}</TableCell>
                  <TableCell>{p.cpu_usage_millicores !== undefined ? `${(p.cpu_usage_millicores / 1000).toFixed(2)} cores` : "—"}</TableCell>
                  <TableCell>{p.memory_usage_bytes !== undefined ? formatBytes(p.memory_usage_bytes) : "—"}</TableCell>
                  <TableCell className="text-slate-500">{p.started_at ? formatAgo(p.started_at) : "—"}</TableCell>
                  {agentOffline && (
                    <TableCell className="text-amber-700">{p.last_discovered_at ? formatAgo(p.last_discovered_at) : "—"}</TableCell>
                  )}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
