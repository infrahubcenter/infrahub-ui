"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Bell } from "lucide-react";
import { useAuth } from "@/components/auth/auth-provider";
import { SeverityBadge } from "@/components/infrastructure/severity-badge";
import { AlertStatusBadge } from "@/components/infrastructure/alert-status-badge";
import { NotificationConfigTab } from "@/components/infrastructure/notification-config-tab";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatAgo, formatDuration } from "@/lib/format";
import { isAdminRole, ApiError, listAlerts, type Alert, type AlertSeverity, type AlertStatus } from "@/lib/api";
import { AlertRulesContent } from "@/app/(shell)/alert-rules/page";

const ALL = "__all__";
const PAGE_SIZE = 25;

function fmtValue(v?: number): string {
  if (v === undefined || v === null) return "—";
  return Number.isInteger(v) ? String(v) : v.toFixed(2);
}

// useSearchParams requires a Suspense boundary at build time -- mirrors
// vms/new/page.tsx's NewVMPage/NewVMForm split.
export default function AlertsPage() {
  return (
    <Suspense fallback={null}>
      <AlertsPageContent />
    </Suspense>
  );
}

// Notifications (default tab) and Alert Rules are Admin-only; Active
// Alerts is visible to everyone (admins see every resource's alerts,
// members see only the ones for resources they're individually
// authorized on -- enforced by the backend, never filtered here).
function AlertsPageContent() {
  const { user } = useAuth();
  const isAdmin = isAdminRole(user?.role);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
          <Bell className="h-5 w-5" /> Alerts
        </h2>
      </div>

      <Tabs defaultValue={isAdmin ? "notifications" : "active"}>
        <TabsList>
          {isAdmin && <TabsTrigger value="notifications">Notifications</TabsTrigger>}
          {isAdmin && <TabsTrigger value="rules">Alert Rules</TabsTrigger>}
          <TabsTrigger value="active">Active Alerts</TabsTrigger>
        </TabsList>
        {isAdmin && (
          <TabsContent value="notifications">
            <NotificationConfigTab />
          </TabsContent>
        )}
        {isAdmin && (
          <TabsContent value="rules">
            <AlertRulesContent />
          </TabsContent>
        )}
        <TabsContent value="active">
          <ActiveAlertsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// Admins see every resource's alerts; members see only the ones for
// resources they're individually authorized on -- enforced by the backend
// exactly like Step 7's recommendations, never filtered here.
function ActiveAlertsTab() {
  const { user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [statusFilter, setStatusFilter] = useState<string>(searchParams.get("status") ?? ALL);
  const [severityFilter, setSeverityFilter] = useState<string>(searchParams.get("severity") ?? ALL);
  const [search, setSearch] = useState(searchParams.get("search") ?? "");
  const [page, setPage] = useState(0);

  const [alerts, setAlerts] = useState<Alert[] | null>(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    listAlerts({
      status: statusFilter !== ALL ? (statusFilter as AlertStatus) : undefined,
      severity: severityFilter !== ALL ? (severityFilter as AlertSeverity) : undefined,
      search: search.trim() || undefined,
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
    })
      .then((res) => {
        setAlerts(res.alerts);
        setTotal(res.total);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load alerts."));
  }, [statusFilter, severityFilter, search, page]);

  useEffect(() => {
    load();
  }, [load]);

  // Keeps the URL in sync so a deep link from the dashboard's
  // Critical/Warning counts (e.g. /alerts?severity=CRITICAL&status=ACTIVE)
  // is shareable/bookmarkable, and so re-visiting the browser back button
  // restores the filter state.
  useEffect(() => {
    const params = new URLSearchParams();
    if (statusFilter !== ALL) params.set("status", statusFilter);
    if (severityFilter !== ALL) params.set("severity", severityFilter);
    if (search.trim()) params.set("search", search.trim());
    const qs = params.toString();
    router.replace(`/alerts${qs ? `?${qs}` : ""}`, { scroll: false });
    // Only the local filter state should trigger this -- re-running on
    // every searchParams/router identity change would fight the browser's
    // own back/forward navigation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, severityFilter, search]);

  function handleStatusChange(v: string) {
    setStatusFilter(v);
    setPage(0);
  }
  function handleSeverityChange(v: string) {
    setSeverityFilter(v);
    setPage(0);
  }
  function handleSearchChange(v: string) {
    setSearch(v);
    setPage(0);
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-slate-500">
        {isAdminRole(user?.role) ? "Alerts across every monitored VM, database, and container." : "Alerts for resources you're authorized on."}
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <Select value={statusFilter} onValueChange={(v) => handleStatusChange(v ?? ALL)}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All statuses</SelectItem>
            <SelectItem value="ACTIVE">Active</SelectItem>
            <SelectItem value="ACKNOWLEDGED">Acknowledged</SelectItem>
            <SelectItem value="RESOLVED">Resolved</SelectItem>
            <SelectItem value="SUPPRESSED">Suppressed</SelectItem>
          </SelectContent>
        </Select>
        <Select value={severityFilter} onValueChange={(v) => handleSeverityChange(v ?? ALL)}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Severity" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All severities</SelectItem>
            <SelectItem value="CRITICAL">Critical</SelectItem>
            <SelectItem value="WARNING">Warning</SelectItem>
            <SelectItem value="INFO">Info</SelectItem>
          </SelectContent>
        </Select>
        <Input
          value={search}
          onChange={(e) => handleSearchChange(e.target.value)}
          placeholder="Search title or resource…"
          className="w-64"
        />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {alerts !== null && alerts.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center">
          <Bell className="mx-auto mb-3 h-8 w-8 text-slate-300" />
          <p className="text-sm font-medium text-slate-700">No alerts match your filters.</p>
        </div>
      ) : (
        alerts !== null && (
          <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Severity</TableHead>
                  <TableHead>Alert</TableHead>
                  <TableHead>Resource</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Current</TableHead>
                  <TableHead>Threshold</TableHead>
                  <TableHead>Started</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {alerts.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell>
                      <SeverityBadge severity={a.severity} />
                    </TableCell>
                    <TableCell>
                      <Link href={`/alerts/${a.id}`} className="font-medium text-sky-700 hover:underline">
                        {a.title}
                      </Link>
                    </TableCell>
                    <TableCell>
                      {a.resource_type === "VM" ? (
                        <Link href={`/vms/${a.resource_id}`} className="text-sky-700 hover:underline">
                          {a.resource_name}
                        </Link>
                      ) : a.resource_type === "DATABASE" ? (
                        <Link href={`/databases/${a.resource_id}`} className="text-sky-700 hover:underline">
                          {a.resource_name}
                        </Link>
                      ) : (
                        <span className="text-slate-900">{a.resource_name}</span>
                      )}
                      {a.container_name && <span className="block text-xs text-slate-500">{a.container_name}</span>}
                    </TableCell>
                    <TableCell className="text-slate-600">{a.alert_type.replace(/_/g, " ")}</TableCell>
                    <TableCell className="text-slate-600">{fmtValue(a.current_value)}</TableCell>
                    <TableCell className="text-slate-600">{fmtValue(a.threshold)}</TableCell>
                    <TableCell className="text-slate-600">{formatAgo(a.first_seen_at)}</TableCell>
                    <TableCell className="text-slate-600">{formatDuration(a.duration_seconds, true)}</TableCell>
                    <TableCell>
                      <AlertStatusBadge status={a.status} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )
      )}

      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between text-sm text-slate-600">
          <span>
            Showing {page * PAGE_SIZE + 1}–{Math.min(total, (page + 1) * PAGE_SIZE)} of {total}
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
