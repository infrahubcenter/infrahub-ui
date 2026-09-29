"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { DockerContainerStatusBadge } from "@/components/infrastructure/docker-status-badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatBytes, formatAgo } from "@/lib/format";
import type { DockerOverviewContainer } from "@/lib/api";

const ALL = "__all__";

function containerLabel(c: DockerOverviewContainer): string {
  return c.display_name || c.container_name || "App";
}

// Docker Containers table (Monitoring>Docker dashboard's Containers tab)
// -- Name/Container ID/Image/Status/CPU/Memory/Created/Actions, given an
// already-scoped container list (the dashboard's configured selection).
// Sourced from the same docker_access_grants-gated DockerOverviewContainer
// shape the Overview stat cards/charts already use, so a Member without
// vm.view can still see this table (unlike the VM-scoped
// listDockerContainers endpoint, which requires vm.view specifically).
export function DockerContainersTable({ containers, isAdmin }: { containers: DockerOverviewContainer[]; isAdmin: boolean }) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState(ALL);

  const statuses = useMemo(() => [...new Set(containers.map((c) => c.status))].sort(), [containers]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return containers.filter((c) => {
      if (statusFilter !== ALL && c.status !== statusFilter) return false;
      if (!q) return true;
      return containerLabel(c).toLowerCase().includes(q) || c.image.toLowerCase().includes(q);
    });
  }, [containers, search, statusFilter]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input placeholder="Search containers..." className="pl-8" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v ?? ALL)}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="All Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All Status</SelectItem>
            {statuses.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
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
              {isAdmin && <TableHead>Container ID</TableHead>}
              <TableHead>Image</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>CPU</TableHead>
              <TableHead>Memory</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={isAdmin ? 8 : 7} className="text-center text-sm text-slate-500">
                  No containers match.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((c) => (
                <TableRow key={c.container_id}>
                  <TableCell className="font-medium text-slate-900">{containerLabel(c)}</TableCell>
                  {isAdmin && <TableCell className="font-mono text-xs text-slate-500">{c.real_container_id?.slice(0, 12) ?? "—"}</TableCell>}
                  <TableCell className="text-slate-600">
                    {c.image}
                    {c.image_tag ? `:${c.image_tag}` : ""}
                  </TableCell>
                  <TableCell>
                    <DockerContainerStatusBadge status={c.status} />
                  </TableCell>
                  <TableCell>{c.metrics?.cpu_percent !== undefined ? `${c.metrics.cpu_percent.toFixed(0)}%` : "—"}</TableCell>
                  <TableCell>{c.metrics?.memory_usage_bytes !== undefined ? formatBytes(c.metrics.memory_usage_bytes) : "—"}</TableCell>
                  <TableCell className="text-slate-500">{c.created_at_remote ? formatAgo(c.created_at_remote) : "—"}</TableCell>
                  <TableCell className="text-right">
                    {isAdmin && c.vm_resource_id && (
                      <Button variant="outline" size="sm" render={<Link href={`/vms/${c.vm_resource_id}/docker`} />}>
                        View
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
