"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Gauge } from "lucide-react";
import { HealthBadge } from "@/components/infrastructure/health-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatAgo } from "@/lib/format";
import { getDatabasesPerformanceOverview, type DatabasePerformanceOverviewItem } from "@/lib/api";

// Per-database performance overview, scoped server-side to the caller's
// authorized databases with database.performance (mirrors listDatabases'
// scoping exactly) -- replaces the old aggregate-counts dashboard now
// that GET /api/databases/performance returns a per-database list rather
// than global counts.
export default function DatabasesPerformancePage() {
  const [databases, setDatabases] = useState<DatabasePerformanceOverviewItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    getDatabasesPerformanceOverview()
      .then((res) => setDatabases(res.databases))
      .catch(() => setError("Failed to load performance overview."));
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
            <Gauge className="h-5 w-5" /> Database Performance
          </h2>
          <p className="text-sm text-slate-500">Cache hit ratio, lock contention, replication, and p95 latency across every monitored database.</p>
        </div>
        <Link href="/databases" className="text-sm text-sky-700 hover:underline">
          View Databases →
        </Link>
      </div>

      {databases !== null && databases.length === 0 && (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center">
          <p className="text-sm font-medium text-slate-700">No databases with performance data available yet.</p>
        </div>
      )}

      {databases !== null && databases.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Database</TableHead>
                <TableHead>Workspace</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Health</TableHead>
                <TableHead>Cache Hit Ratio</TableHead>
                <TableHead>Locks Blocked</TableHead>
                <TableHead>Replication</TableHead>
                <TableHead>p95 Latency</TableHead>
                <TableHead>Last Metric</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {databases.map((db) => (
                <TableRow key={db.id}>
                  <TableCell>
                    <Link href={`/databases/${db.id}`} className="font-medium text-sky-700 hover:underline">
                      {db.name ?? db.id}
                    </Link>
                  </TableCell>
                  <TableCell className="text-slate-600">{db.workspace_name ?? "—"}</TableCell>
                  <TableCell className="text-slate-600">{db.type}</TableCell>
                  <TableCell>{db.health ? <HealthBadge status={db.health} /> : <span className="text-slate-400">—</span>}</TableCell>
                  <TableCell className="text-slate-600">
                    {db.cache_hit_ratio !== undefined ? `${(db.cache_hit_ratio * 100).toFixed(1)}%` : "—"}
                  </TableCell>
                  <TableCell className={db.locks_blocked ? "font-medium text-red-600" : "text-slate-600"}>
                    {db.locks_blocked ?? "—"}
                  </TableCell>
                  <TableCell className="text-slate-600">{db.replication_status ?? "—"}</TableCell>
                  <TableCell className="text-slate-600">
                    {db.latency_p95_ms !== undefined ? `${db.latency_p95_ms.toFixed(0)} ms` : "—"}
                  </TableCell>
                  <TableCell className="text-slate-600">{formatAgo(db.last_metric_at)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
