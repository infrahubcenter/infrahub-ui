"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Activity,
  Archive,
  Bell,
  Container,
  Database as DatabaseIcon,
  Lightbulb,
  RefreshCw,
  Server,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useAuth } from "@/components/auth/auth-provider";
import { HealthBadge } from "@/components/infrastructure/health-badge";
import { AvailabilityBadge } from "@/components/infrastructure/availability-badge";
import { SeverityBadge } from "@/components/infrastructure/severity-badge";
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
import { formatAgo, parseDurationSeconds } from "@/lib/format";
import type { MonitoringResourceType } from "@/lib/monitoring";
import { formatMetricOrNA, monitoringResourceHref } from "@/lib/monitoring";
import {
  ApiError,
  getMonitoringOverview,
  getMonitoringTimeline,
  listMonitoringResources,
  listWorkspaces,
  type HealthStatus,
  type MonitoringEvent,
  type MonitoringEventType,
  type MonitoringOverview,
  type MonitoringResource,
  type Workspace,
  isAdminRole,
} from "@/lib/api";

const ALL = "__all__";

// The union of AlertSeverity ("INFO"|"WARNING"|"CRITICAL") and
// RecommendationSeverity ("LOW"|"MEDIUM"|"HIGH"|"CRITICAL"|"UNKNOWN") --
// exactly what SeverityBadge's own Severity union covers -- since a
// timeline event's severity (api.ts's MonitoringEvent.severity, kept as a
// plain `string` there because it's composed from two different source
// types) is always one or the other in practice.
type EventSeverity = "INFO" | "WARNING" | "CRITICAL" | "LOW" | "MEDIUM" | "HIGH" | "UNKNOWN";

const EVENT_TYPE_LABEL: Record<MonitoringEventType, string> = {
  ALERT_TRIGGERED: "Alert triggered",
  ALERT_ACKNOWLEDGED: "Alert acknowledged",
  ALERT_RESOLVED: "Alert resolved",
  RECOMMENDATION_DETECTED: "Recommendation detected",
  RECOMMENDATION_RESOLVED: "Recommendation resolved",
};

// Alert-family events get the Bell icon, Recommendation-family events get
// the Lightbulb icon -- mirrors the summary cards above, which use the same
// two icons for the same two categories.
const EVENT_TYPE_ICON: Record<MonitoringEventType, LucideIcon> = {
  ALERT_TRIGGERED: Bell,
  ALERT_ACKNOWLEDGED: Bell,
  ALERT_RESOLVED: Bell,
  RECOMMENDATION_DETECTED: Lightbulb,
  RECOMMENDATION_RESOLVED: Lightbulb,
};

// Mirrors vms/[id]/monitoring/page.tsx's/object-storage/[id]/page.tsx's own
// constant exactly (decision #8): Overview/Resources poll on this interval
// rather than opening a dashboard-wide socket per resource.
const REFRESH_SECONDS = parseDurationSeconds(process.env.NEXT_PUBLIC_MONITORING_REFRESH, 30);

const RESOURCE_TYPE_LABEL: Record<MonitoringResourceType, string> = {
  VM: "VM",
  DATABASE: "Database",
  OBJECT_STORAGE: "Object Storage",
};

// useSearchParams requires a Suspense boundary at build time -- mirrors
// alerts/page.tsx's AlertsPage/AlertsPageContent split, the one existing
// precedent in this codebase for a URL-synced filter page.
export default function MonitoringPage() {
  return (
    <Suspense fallback={null}>
      <MonitoringPageContent />
    </Suspense>
  );
}

// ---------- Data hooks ----------
// Internally swappable poll->stream without the page changing (decision #8).

function useMonitoringOverview(scope: { workspaceId?: string }): {
  data: MonitoringOverview | null;
  lastUpdated: string | null;
  error: string | null;
  refresh: () => void;
} {
  const [data, setData] = useState<MonitoringOverview | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    getMonitoringOverview({ workspace_id: scope.workspaceId })
      .then((res) => {
        setData(res);
        setLastUpdated(new Date().toISOString());
        setError(null);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load overview."));
  }, [scope.workspaceId]);

  useEffect(() => {
    load();
    const id = setInterval(load, REFRESH_SECONDS * 1000);
    return () => clearInterval(id);
  }, [load]);

  return { data, lastUpdated, error, refresh: load };
}

type MonitoringResourceFilters = {
  resourceType: string;
  workspaceId: string;
  health: string;
  search: string;
};

// Search is a thin passthrough to the backend's `search` param -- never a
// client-side filter over the fetched list (the backend applies
// authorization scoping before matching, so an unauthorized resource's
// name is never returned regardless of what's searched).
function useMonitoringResources(filters: MonitoringResourceFilters): {
  data: MonitoringResource[] | null;
  total: number;
  lastUpdated: string | null;
  error: string | null;
  refresh: () => void;
} {
  const [data, setData] = useState<MonitoringResource[] | null>(null);
  const [total, setTotal] = useState(0);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    listMonitoringResources({
      resource_type: filters.resourceType !== ALL ? (filters.resourceType as MonitoringResourceType) : undefined,
      workspace_id: filters.workspaceId !== ALL ? filters.workspaceId : undefined,
      health: filters.health !== ALL ? (filters.health as HealthStatus) : undefined,
      search: filters.search.trim() || undefined,
    })
      .then((res) => {
        setData(res.resources);
        setTotal(res.total);
        setLastUpdated(new Date().toISOString());
        setError(null);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load resources."));
  }, [filters.resourceType, filters.workspaceId, filters.health, filters.search]);

  useEffect(() => {
    load();
    const id = setInterval(load, REFRESH_SECONDS * 1000);
    return () => clearInterval(id);
  }, [load]);

  return { data, total, lastUpdated, error, refresh: load };
}

// Composed server-side from Alerts + Recommendations timestamps (decision
// #7) via GET /api/monitoring/timeline -- same poll-on-interval shape and
// workspace scope as useMonitoringOverview. This is a "recent events"
// summary, not a full audit trail, so there's no `limit` override here --
// the backend's own default applies.
function useMonitoringEvents(scope: { workspaceId?: string }): {
  data: MonitoringEvent[] | null;
  lastUpdated: string | null;
  error: string | null;
  refresh: () => void;
} {
  const [data, setData] = useState<MonitoringEvent[] | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    getMonitoringTimeline({ workspace_id: scope.workspaceId })
      .then((res) => {
        setData(res.events);
        setLastUpdated(new Date().toISOString());
        setError(null);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load recent events."));
  }, [scope.workspaceId]);

  useEffect(() => {
    load();
    const id = setInterval(load, REFRESH_SECONDS * 1000);
    return () => clearInterval(id);
  }, [load]);

  return { data, lastUpdated, error, refresh: load };
}

// ---------- Page ----------

type SummaryCard = { label: string; icon: LucideIcon; value: number | null; href: string; hint?: string };

function MonitoringPageContent() {
  const { user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [resourceType, setResourceType] = useState(searchParams.get("resource_type") ?? ALL);
  const [workspaceId, setWorkspaceId] = useState(searchParams.get("workspace_id") ?? ALL);
  const [health, setHealth] = useState(searchParams.get("health") ?? ALL);
  const [search, setSearch] = useState(searchParams.get("search") ?? "");

  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);

  // Keeps the URL in sync so a scoped deep link -- e.g. /monitoring?workspace_id=X
  // from the Workspace detail page's "Resources" section, or a dashboard
  // widget's pre-filtered link -- is shareable/bookmarkable, and the
  // browser back button restores filter state. Structurally identical to
  // alerts/page.tsx's own sync effect. GET /api/monitoring/resources
  // doesn't paginate (decision #4), so there's no `page` param here.
  useEffect(() => {
    const params = new URLSearchParams();
    if (resourceType !== ALL) params.set("resource_type", resourceType);
    if (workspaceId !== ALL) params.set("workspace_id", workspaceId);
    if (health !== ALL) params.set("health", health);
    if (search.trim()) params.set("search", search.trim());
    const qs = params.toString();
    router.replace(`/monitoring${qs ? `?${qs}` : ""}`, { scroll: false });
    // Only the local filter state should trigger this -- re-running on
    // every searchParams/router identity change would fight the browser's
    // own back/forward navigation (mirrors alerts/page.tsx).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resourceType, workspaceId, health, search]);

  useEffect(() => {
    listWorkspaces()
      .then((res) => setWorkspaces(res.workspaces))
      .catch(() => setWorkspaces([]));
  }, []);

  const overview = useMonitoringOverview({
    workspaceId: workspaceId !== ALL ? workspaceId : undefined,
  });
  const resources = useMonitoringResources({ resourceType, workspaceId, health, search });
  const events = useMonitoringEvents({
    workspaceId: workspaceId !== ALL ? workspaceId : undefined,
  });

  // Builds a /monitoring link that preserves the current workspace scope --
  // used by the Infrastructure Health widgets and the "View all" links
  // below, so clicking one never silently drops an active workspace filter.
  function buildMonitoringHref(overrides: { resourceType?: MonitoringResourceType; health?: HealthStatus }): string {
    const params = new URLSearchParams();
    if (overrides.resourceType) params.set("resource_type", overrides.resourceType);
    if (workspaceId !== ALL) params.set("workspace_id", workspaceId);
    if (overrides.health) params.set("health", overrides.health);
    const qs = params.toString();
    return `/monitoring${qs ? `?${qs}` : ""}`;
  }

  // The widgets below render <Link> (so a fresh load or ctrl+click/new-tab
  // gets the right filters straight from the URL) but this page never
  // unmounts on a same-route navigation, so its own useState-seeded filter
  // state wouldn't otherwise pick up the new query params -- this keeps
  // the in-page filter bar/table in sync immediately on click, while the
  // href stays correct for every other way of following the link.
  function applyWidgetFilter(overrides: { resourceType?: MonitoringResourceType; health?: HealthStatus }) {
    setResourceType(overrides.resourceType ?? ALL);
    setHealth(overrides.health ?? ALL);
  }

  const cards: SummaryCard[] = [
    { label: "VMs", icon: Server, value: overview.data?.vms.total ?? null, href: "/vms" },
    // Docker's cross-VM aggregate (Step 19 Phase 3) is now always present
    // on GET /api/monitoring/overview. Headline number is containers_total
    // rather than hosts -- "Docker" as a summary card is really about how
    // many containers are being tracked, mirroring how the VM/Database/
    // Object Storage cards headline a resource count, not a host count.
    { label: "Docker", icon: Container, value: overview.data?.docker.containers_total ?? null, href: "/vms" },
    { label: "Databases", icon: DatabaseIcon, value: overview.data?.databases.total ?? null, href: "/databases" },
    { label: "Object Storage", icon: Archive, value: overview.data?.object_storage.total ?? null, href: "/object-storage" },
    { label: "Alerts", icon: Bell, value: overview.data?.alerts.active ?? null, href: "/alerts" },
    { label: "Recommendations", icon: Lightbulb, value: overview.data?.recommendations.total ?? null, href: "/recommendations" },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
            <Activity className="h-5 w-5" /> Monitoring
          </h2>
          <p className="text-sm text-slate-500">
            {isAdminRole(user?.role)
              ? "A unified view of every authorized VM, database, and object storage bucket."
              : "A unified view of the resources you're authorized on."}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-500">
            Last updated: {overview.lastUpdated ? formatAgo(overview.lastUpdated) : "—"}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              overview.refresh();
              resources.refresh();
              events.refresh();
            }}
          >
            <RefreshCw className="h-4 w-4" /> Refresh
          </Button>
        </div>
      </div>

      {overview.error && <p className="text-sm text-red-600">{overview.error}</p>}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {cards.map(({ label, icon: Icon, value, href, hint }) => (
          <Link key={label} href={href}>
            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-slate-500">{label}</span>
                <Icon className="h-4 w-4 text-slate-400" />
              </div>
              <div className="mt-2 text-2xl font-semibold text-slate-900">{value ?? "—"}</div>
              {hint && <div className="mt-1 text-[11px] text-slate-400">{hint}</div>}
            </div>
          </Link>
        ))}
      </div>

      {/* Infrastructure Health widgets: one per-type health-bucket widget
          (VM/Database/Object Storage), mirroring the Admin dashboard's
          Alerts/Object-Storage widgets' markup (rounded-lg card,
          grid-cols-2 sm:grid-cols-4 health-bucket links, hover-border
          convention), plus a 4th Docker widget. Docker isn't a
          resource_type in the unified table (per the "Unified resource
          table" decision) and its bucket has a different shape (hosts/
          containers/images rather than a health-bucket total/healthy/
          warning/critical/unknown), so it renders as its own
          DockerWidgetCard rather than reusing HealthWidgetCard. */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <HealthWidgetCard
          title="VM Health"
          icon={Server}
          viewAllHref={buildMonitoringHref({ resourceType: "VM" })}
          onViewAll={() => applyWidgetFilter({ resourceType: "VM" })}
          stats={
            overview.data
              ? [
                  {
                    label: "Healthy",
                    value: overview.data.vms.healthy,
                    color: "emerald",
                    href: buildMonitoringHref({ resourceType: "VM", health: "HEALTHY" }),
                    onClick: () => applyWidgetFilter({ resourceType: "VM", health: "HEALTHY" }),
                  },
                  {
                    label: "Warning",
                    value: overview.data.vms.warning,
                    color: "amber",
                    href: buildMonitoringHref({ resourceType: "VM", health: "WARNING" }),
                    onClick: () => applyWidgetFilter({ resourceType: "VM", health: "WARNING" }),
                  },
                  {
                    label: "Critical",
                    value: overview.data.vms.critical,
                    color: "red",
                    href: buildMonitoringHref({ resourceType: "VM", health: "CRITICAL" }),
                    onClick: () => applyWidgetFilter({ resourceType: "VM", health: "CRITICAL" }),
                  },
                  {
                    label: "Offline",
                    value: overview.data.vms.offline ?? 0,
                    color: "slate",
                    href: buildMonitoringHref({ resourceType: "VM", health: "OFFLINE" }),
                    onClick: () => applyWidgetFilter({ resourceType: "VM", health: "OFFLINE" }),
                  },
                ]
              : null
          }
        />
        <HealthWidgetCard
          title="Database Health"
          icon={DatabaseIcon}
          viewAllHref={buildMonitoringHref({ resourceType: "DATABASE" })}
          onViewAll={() => applyWidgetFilter({ resourceType: "DATABASE" })}
          stats={
            overview.data
              ? [
                  {
                    label: "Healthy",
                    value: overview.data.databases.healthy,
                    color: "emerald",
                    href: buildMonitoringHref({ resourceType: "DATABASE", health: "HEALTHY" }),
                    onClick: () => applyWidgetFilter({ resourceType: "DATABASE", health: "HEALTHY" }),
                  },
                  {
                    label: "Warning",
                    value: overview.data.databases.warning,
                    color: "amber",
                    href: buildMonitoringHref({ resourceType: "DATABASE", health: "WARNING" }),
                    onClick: () => applyWidgetFilter({ resourceType: "DATABASE", health: "WARNING" }),
                  },
                  {
                    label: "Critical",
                    value: overview.data.databases.critical,
                    color: "red",
                    href: buildMonitoringHref({ resourceType: "DATABASE", health: "CRITICAL" }),
                    onClick: () => applyWidgetFilter({ resourceType: "DATABASE", health: "CRITICAL" }),
                  },
                  {
                    label: "Unknown",
                    value: overview.data.databases.unknown ?? 0,
                    color: "slate",
                    href: buildMonitoringHref({ resourceType: "DATABASE", health: "UNKNOWN" }),
                    onClick: () => applyWidgetFilter({ resourceType: "DATABASE", health: "UNKNOWN" }),
                  },
                ]
              : null
          }
        />
        <HealthWidgetCard
          title="Object Storage Health"
          icon={Archive}
          viewAllHref={buildMonitoringHref({ resourceType: "OBJECT_STORAGE" })}
          onViewAll={() => applyWidgetFilter({ resourceType: "OBJECT_STORAGE" })}
          stats={
            overview.data
              ? [
                  {
                    label: "Healthy",
                    value: overview.data.object_storage.healthy,
                    color: "emerald",
                    href: buildMonitoringHref({ resourceType: "OBJECT_STORAGE", health: "HEALTHY" }),
                    onClick: () => applyWidgetFilter({ resourceType: "OBJECT_STORAGE", health: "HEALTHY" }),
                  },
                  {
                    label: "Warning",
                    value: overview.data.object_storage.warning,
                    color: "amber",
                    href: buildMonitoringHref({ resourceType: "OBJECT_STORAGE", health: "WARNING" }),
                    onClick: () => applyWidgetFilter({ resourceType: "OBJECT_STORAGE", health: "WARNING" }),
                  },
                  {
                    label: "Critical",
                    value: overview.data.object_storage.critical,
                    color: "red",
                    href: buildMonitoringHref({ resourceType: "OBJECT_STORAGE", health: "CRITICAL" }),
                    onClick: () => applyWidgetFilter({ resourceType: "OBJECT_STORAGE", health: "CRITICAL" }),
                  },
                  // Deliberately not linked to a `health=` value: the
                  // Overview's object_storage bucket's "unavailable" count
                  // comes from the dedicated GetObjectStorageSummaryCounts
                  // query, not from tallying the merged resource table's
                  // Health field -- per the backend plan, that single
                  // Health field "doesn't correctly split
                  // critical-vs-unavailable" the way this bucket does, so
                  // no HealthStatus value is guaranteed to select exactly
                  // this row set in the table below. Filtering by resource
                  // type only avoids linking to a filter that could under-
                  // or over-select. Revisit once the real backend response
                  // confirms which Health value (if any) unavailable
                  // storages report.
                  {
                    label: "Unavailable",
                    value: overview.data.object_storage.unavailable ?? 0,
                    color: "slate",
                    href: buildMonitoringHref({ resourceType: "OBJECT_STORAGE" }),
                    onClick: () => applyWidgetFilter({ resourceType: "OBJECT_STORAGE" }),
                  },
                ]
              : null
          }
        />
        <DockerWidgetCard data={overview.data?.docker} />
      </div>

      {/* Unified resource table */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <Select value={resourceType} onValueChange={(v) => setResourceType(v ?? ALL)}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Resource type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All types</SelectItem>
              <SelectItem value={"VM" satisfies MonitoringResourceType}>VM</SelectItem>
              <SelectItem value={"DATABASE" satisfies MonitoringResourceType}>Database</SelectItem>
              <SelectItem value={"OBJECT_STORAGE" satisfies MonitoringResourceType}>Object Storage</SelectItem>
            </SelectContent>
          </Select>
          <Select value={workspaceId} onValueChange={(v) => setWorkspaceId(v ?? ALL)}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Workspace" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All workspaces</SelectItem>
              {workspaces.map((w) => (
                <SelectItem key={w.id} value={w.id}>
                  {w.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={health} onValueChange={(v) => setHealth(v ?? ALL)}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Health" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All health</SelectItem>
              <SelectItem value="HEALTHY">Healthy</SelectItem>
              <SelectItem value="WARNING">Warning</SelectItem>
              <SelectItem value="CRITICAL">Critical</SelectItem>
              <SelectItem value="UNKNOWN">Unknown</SelectItem>
              <SelectItem value="OFFLINE">Offline</SelectItem>
            </SelectContent>
          </Select>
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search resources…"
            className="w-64"
          />
        </div>

        {resources.error && <p className="text-sm text-red-600">{resources.error}</p>}

        {resources.data !== null && resources.data.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center">
            <p className="text-sm font-medium text-slate-700">No resources found.</p>
          </div>
        ) : (
          resources.data !== null && (
            <div className="flex flex-col gap-2">
              <span className="text-xs text-slate-500">
                Showing {resources.data.length} of {resources.total} resource{resources.total === 1 ? "" : "s"}
              </span>
              <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Resource</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Workspace</TableHead>
                      <TableHead>Health</TableHead>
                      <TableHead>CPU</TableHead>
                      <TableHead>Memory</TableHead>
                      <TableHead>Storage</TableHead>
                      <TableHead>Availability</TableHead>
                      <TableHead>Active Alerts</TableHead>
                      <TableHead>Last Updated</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {resources.data.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell>
                          <Link
                            href={monitoringResourceHref(r.resource_type, r.id)}
                            className="font-medium text-sky-700 hover:underline"
                          >
                            {r.name}
                          </Link>
                        </TableCell>
                        <TableCell className="text-slate-600">{RESOURCE_TYPE_LABEL[r.resource_type]}</TableCell>
                        <TableCell className="text-slate-600">{r.workspace_name}</TableCell>
                        <TableCell>
                          <HealthBadge status={r.health} />
                        </TableCell>
                        {/* CPU/Memory/Storage percentages aren't in this
                            contract yet (Step 19 Phase 2's Resources DTO
                            has no cpu_percent/memory_percent/
                            storage_percent fields) -- render "N/A"
                            unconditionally rather than fabricate a value. */}
                        <TableCell className="text-slate-600">{formatMetricOrNA(undefined)}</TableCell>
                        <TableCell className="text-slate-600">{formatMetricOrNA(undefined)}</TableCell>
                        <TableCell className="text-slate-600">{formatMetricOrNA(undefined)}</TableCell>
                        <TableCell>
                          <AvailabilityBadge availability={r.availability} />
                        </TableCell>
                        <TableCell className="text-slate-600">{r.active_alert_severity ?? "—"}</TableCell>
                        <TableCell className="text-slate-600">{formatAgo(r.last_seen_at)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )
        )}
      </div>

      {/* Trends (Step 19 "Time-series (Trends) section" frontend phase): a
          single-resource picker + the shared RangeSelector/TimeSeriesChart/
          ChartCard components (already extracted to
          components/infrastructure/) dispatching to each resource type's
          own existing history endpoint. Not rendered yet. */}
      <SectionPlaceholder
        title="Trends"
        note="Pick a resource to chart once the Trends phase wires the shared chart components."
      />

      {/* Events / Recent Activity: composed server-side from Alerts +
          Recommendations timestamps via GET /api/monitoring/timeline
          (decision #7) -- an explicitly "recent events" summary, not a
          general audit log, so no client-side pagination beyond the
          backend's own `limit` default. */}
      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <Activity className="h-4 w-4" /> Recent Activity
          </h3>
          <span className="text-xs text-slate-500">
            Last updated: {events.lastUpdated ? formatAgo(events.lastUpdated) : "—"}
          </span>
        </div>
        {events.error && <p className="text-sm text-red-600">{events.error}</p>}
        {events.data === null ? (
          <p className="text-sm text-slate-500">Loading&hellip;</p>
        ) : events.data.length === 0 ? (
          // A completely quiet, healthy infrastructure is a normal, good
          // state for an authorized user -- not an error, so this isn't
          // styled like one.
          <p className="text-sm text-slate-500">No recent events.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {events.data.map((e, i) => {
              const Icon = EVENT_TYPE_ICON[e.type];
              return (
                <li
                  key={`${e.type}-${e.resource_id}-${e.timestamp}-${i}`}
                  className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2 text-sm last:border-0 last:pb-0"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Icon className="h-4 w-4 shrink-0 text-slate-400" />
                    <span className="text-xs font-medium text-slate-500">{EVENT_TYPE_LABEL[e.type]}</span>
                    <Link
                      href={monitoringResourceHref(e.resource_type, e.resource_id)}
                      className="font-medium text-sky-700 hover:underline"
                    >
                      {e.resource_name}
                    </Link>
                    <span className="text-slate-600">{e.description}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {e.severity && <SeverityBadge severity={e.severity as EventSeverity} />}
                    <span className="text-xs text-slate-400">{formatAgo(e.timestamp)}</span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

// ---------- Infrastructure Health widget ----------

const HOVER_COLOR_CLASSES: Record<"emerald" | "amber" | "red" | "slate", string> = {
  emerald: "hover:border-emerald-300 hover:bg-emerald-50",
  amber: "hover:border-amber-300 hover:bg-amber-50",
  red: "hover:border-red-300 hover:bg-red-50",
  slate: "hover:border-slate-300 hover:bg-slate-50",
};

const TEXT_COLOR_CLASSES: Record<"emerald" | "amber" | "red" | "slate", string> = {
  emerald: "text-emerald-600",
  amber: "text-amber-600",
  red: "text-red-600",
  slate: "text-slate-600",
};

type HealthStat = {
  label: string;
  value: number;
  color: "emerald" | "amber" | "red" | "slate";
  href: string;
  onClick: () => void;
};

// Mirrors the Admin dashboard's ((shell)/page.tsx) Alerts/Object-Storage
// widget markup exactly: rounded-lg card, grid-cols-2 sm:grid-cols-4
// hover-bordered stat links, a "Loading…" fallback while data hasn't
// arrived yet.
function HealthWidgetCard({
  title,
  icon: Icon,
  viewAllHref,
  onViewAll,
  stats,
}: {
  title: string;
  icon: LucideIcon;
  viewAllHref: string;
  onViewAll: () => void;
  stats: HealthStat[] | null;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
          <Icon className="h-4 w-4" /> {title}
        </h3>
        <Link href={viewAllHref} onClick={onViewAll} className="text-xs text-sky-700 hover:underline">
          View all
        </Link>
      </div>
      {stats ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {stats.map((s) => (
            <Link
              key={s.label}
              href={s.href}
              onClick={s.onClick}
              className={`rounded-md border border-slate-200 p-3 transition-colors ${HOVER_COLOR_CLASSES[s.color]}`}
            >
              <div className="text-xs text-slate-500">{s.label}</div>
              <div className={`mt-1 text-2xl font-semibold ${TEXT_COLOR_CLASSES[s.color]}`}>{s.value}</div>
            </Link>
          ))}
        </div>
      ) : (
        <p className="text-sm text-slate-500">Loading&hellip;</p>
      )}
    </div>
  );
}

// Docker's bucket shape (hosts/containers/images) doesn't fit the
// total/healthy/warning/critical/unknown health-bucket shape the other
// three widgets share, so it gets its own component rather than being
// coerced through HealthWidgetCard's `HealthStat` shape. Only "Hosts"
// links anywhere (to /vms, since Docker hosts are VMs and there's no
// cross-VM container list page) -- the container counts have no sensible
// resource_type=DOCKER filter to link to (decision: Docker isn't a
// resource_type in the unified table), so they render as plain,
// non-interactive stat blocks. Visual shell (rounded-lg card, header row,
// grid-cols-2 sm:grid-cols-4 stat blocks, "Loading…" fallback) mirrors
// HealthWidgetCard for a consistent look across all four widgets.
function DockerWidgetCard({ data }: { data: MonitoringOverview["docker"] | undefined }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
          <Container className="h-4 w-4" /> Docker
        </h3>
        <Link href="/vms" className="text-xs text-sky-700 hover:underline">
          View all
        </Link>
      </div>
      {data ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Link
            href="/vms"
            className={`rounded-md border border-slate-200 p-3 transition-colors ${HOVER_COLOR_CLASSES.slate}`}
          >
            <div className="text-xs text-slate-500">Hosts</div>
            <div className={`mt-1 text-2xl font-semibold ${TEXT_COLOR_CLASSES.slate}`}>{data.hosts}</div>
          </Link>
          <div className="rounded-md border border-slate-200 p-3">
            <div className="text-xs text-slate-500">Running</div>
            <div className={`mt-1 text-2xl font-semibold ${TEXT_COLOR_CLASSES.emerald}`}>
              {data.containers_running}
            </div>
          </div>
          <div className="rounded-md border border-slate-200 p-3">
            <div className="text-xs text-slate-500">Stopped</div>
            <div className={`mt-1 text-2xl font-semibold ${TEXT_COLOR_CLASSES.amber}`}>
              {data.containers_stopped}
            </div>
          </div>
          <div className="rounded-md border border-slate-200 p-3">
            <div className="text-xs text-slate-500">Unhealthy</div>
            <div className={`mt-1 text-2xl font-semibold ${TEXT_COLOR_CLASSES.red}`}>
              {data.containers_unhealthy}
            </div>
          </div>
        </div>
      ) : (
        <p className="text-sm text-slate-500">Loading&hellip;</p>
      )}
    </div>
  );
}

function SectionPlaceholder({ title, note }: { title: string; note: string }) {
  return (
    <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center">
      <h3 className="mb-1 text-sm font-semibold text-slate-900">{title}</h3>
      <p className="text-sm text-slate-500">{note}</p>
    </div>
  );
}
