"use client";

import { Fragment, Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronDown, ChevronUp, ScrollText } from "lucide-react";
import { RouteGuard } from "@/components/auth/route-guard";
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
import {
  ApiError,
  listAuditLogs,
  getAuditLogsSummary,
  type AuditCategory,
  type AuditLogEntry,
  type AuditLogsSummary,
} from "@/lib/api";

const ALL = "__all__";
const PAGE_SIZE = 50;

const CATEGORIES: AuditCategory[] = [
  "AUTHENTICATION",
  "USERS",
  "PERMISSIONS",
  "PROJECTS",
  "GROUPS",
  "VMS",
  "DOCKER",
  "DATABASES",
  "OBJECT_STORAGE",
  "MONITORING",
  "ALERTS",
  "UPDATES",
  "OPERATIONS",
  "SETTINGS",
  "OTHER",
];

type DateRangePreset = "ALL" | "TODAY" | "7D" | "30D";

function presetToRange(preset: DateRangePreset): { from?: string; to?: string } {
  if (preset === "ALL") return {};
  const now = new Date();
  const from = new Date(now);
  if (preset === "TODAY") {
    from.setHours(0, 0, 0, 0);
  } else if (preset === "7D") {
    from.setDate(from.getDate() - 7);
  } else if (preset === "30D") {
    from.setDate(from.getDate() - 30);
  }
  return { from: from.toISOString(), to: now.toISOString() };
}

export default function AuditLogsPage() {
  return (
    <RouteGuard requireRole="ADMIN">
      <Suspense fallback={<div className="text-sm text-slate-500">Loading audit logs&hellip;</div>}>
        <AuditLogsContent />
      </Suspense>
    </RouteGuard>
  );
}

function AuditLogsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [category, setCategory] = useState(searchParams.get("category") ?? ALL);
  const [search, setSearch] = useState(searchParams.get("search") ?? "");
  const [datePreset, setDatePreset] = useState<DateRangePreset>((searchParams.get("range") as DateRangePreset | null) ?? "ALL");
  const [page, setPage] = useState(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [summary, setSummary] = useState<AuditLogsSummary | null>(null);
  const [logs, setLogs] = useState<AuditLogEntry[] | null>(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    const range = presetToRange(datePreset);
    Promise.all([
      getAuditLogsSummary(),
      listAuditLogs({
        category: category !== ALL ? (category as AuditCategory) : undefined,
        search: search.trim() || undefined,
        from: range.from,
        to: range.to,
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
      }),
    ])
      .then(([summaryRes, listRes]) => {
        setError(null);
        setSummary(summaryRes);
        setLogs(listRes.audit_logs);
        setTotal(listRes.total);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Unable to load audit logs."))
      .finally(() => setLoading(false));
  }, [category, search, datePreset, page]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const params = new URLSearchParams();
    if (category !== ALL) params.set("category", category);
    if (search.trim()) params.set("search", search.trim());
    if (datePreset !== "ALL") params.set("range", datePreset);
    const qs = params.toString();
    router.replace(`/audit-logs${qs ? `?${qs}` : ""}`, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, search, datePreset]);

  function handleFilterChange<T>(setter: (v: T) => void, value: T) {
    setter(value);
    setPage(0);
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const hasFilters = category !== ALL || search.trim() !== "" || datePreset !== "ALL";

  const cards = [
    { label: "Total Events", value: summary?.total },
    { label: "Today", value: summary?.today },
    { label: "Security Events", value: summary?.security_events },
    { label: "User Changes", value: summary?.user_changes },
    { label: "Resource Changes", value: summary?.resource_changes },
    { label: "Operations", value: summary?.operations_events },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Audit Trail</h2>
        <p className="text-sm text-slate-500">
          Security and administrative activity across Infra Hub Center. Read-only -- audit
          records cannot be edited or deleted.
        </p>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-6">
        {cards.map(({ label, value }) => (
          <div key={label} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <span className="text-sm font-medium text-slate-500">{label}</span>
            <div className="mt-2 text-2xl font-semibold text-slate-900 dark:text-slate-100">{value ?? "—"}</div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Select value={category} onValueChange={(v) => handleFilterChange(setCategory, v ?? ALL)}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All categories</SelectItem>
            {CATEGORIES.map((c) => (
              <SelectItem key={c} value={c}>{c.replace(/_/g, " ")}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={datePreset} onValueChange={(v) => handleFilterChange(setDatePreset, (v ?? "ALL") as DateRangePreset)}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Date range" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All time</SelectItem>
            <SelectItem value="TODAY">Today</SelectItem>
            <SelectItem value="7D">Last 7 days</SelectItem>
            <SelectItem value="30D">Last 30 days</SelectItem>
          </SelectContent>
        </Select>
        <Input
          value={search}
          onChange={(e) => handleFilterChange(setSearch, e.target.value)}
          placeholder="Search actor, action, resource…"
          className="w-72"
        />
      </div>

      {loading && logs === null ? (
        <p className="text-sm text-slate-500">Loading audit logs&hellip;</p>
      ) : logs !== null && logs.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center dark:border-slate-700 dark:bg-slate-900">
          {hasFilters ? (
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">No audit events match your filters.</p>
          ) : (
            <>
              <ScrollText className="mx-auto h-8 w-8 text-slate-300 dark:text-slate-600" />
              <p className="mt-2 text-sm font-medium text-slate-700 dark:text-slate-300">No audit events found</p>
              <p className="mt-1 text-sm text-slate-500">Security and administrative activity will appear here.</p>
            </>
          )}
        </div>
      ) : (
        logs !== null && (
          <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Timestamp</TableHead>
                  <TableHead>Actor</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Resource</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((log) => {
                  const isExpanded = expandedId === log.id;
                  return (
                    <Fragment key={log.id}>
                      <TableRow
                        className="cursor-pointer"
                        onClick={() => setExpandedId(isExpanded ? null : log.id)}
                      >
                        <TableCell className="whitespace-nowrap text-slate-600 dark:text-slate-400">
                          {new Date(log.created_at).toLocaleString()}
                        </TableCell>
                        <TableCell className="text-slate-900 dark:text-slate-100">
                          {log.actor_name || log.actor_email || "System"}
                        </TableCell>
                        <TableCell className="font-mono text-xs text-slate-700 dark:text-slate-300">{log.action}</TableCell>
                        <TableCell className="text-slate-600 dark:text-slate-400">{log.category.replace(/_/g, " ")}</TableCell>
                        <TableCell className="text-slate-600 dark:text-slate-400">
                          {log.resource_type ? `${log.resource_type}${log.resource_id ? ` (${log.resource_id.slice(0, 8)}…)` : ""}` : "—"}
                        </TableCell>
                        <TableCell className="text-slate-600 dark:text-slate-400">{log.ip_address || "—"}</TableCell>
                        <TableCell>
                          {isExpanded ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
                        </TableCell>
                      </TableRow>
                      {isExpanded && (
                        <TableRow key={`${log.id}-detail`}>
                          <TableCell colSpan={7} className="bg-slate-50 dark:bg-slate-950">
                            <div className="grid grid-cols-1 gap-2 p-2 text-xs sm:grid-cols-2">
                              <div><span className="font-medium text-slate-500">Event ID:</span> <span className="font-mono">{log.id}</span></div>
                              <div><span className="font-medium text-slate-500">Actor Email:</span> {log.actor_email || "—"}</div>
                              <div><span className="font-medium text-slate-500">User Agent:</span> {log.user_agent || "—"}</div>
                              <div><span className="font-medium text-slate-500">Resource Type:</span> {log.resource_type || "—"}</div>
                              <div className="sm:col-span-2">
                                <span className="font-medium text-slate-500">Metadata:</span>
                                <pre className="mt-1 overflow-x-auto rounded bg-slate-100 p-2 dark:bg-slate-900">
                                  {JSON.stringify(log.metadata, null, 2)}
                                </pre>
                              </div>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )
      )}

      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between text-sm text-slate-600 dark:text-slate-400">
          <span>
            Showing {page * PAGE_SIZE + 1}–{Math.min(total, (page + 1) * PAGE_SIZE)} of {total.toLocaleString()}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}>
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
