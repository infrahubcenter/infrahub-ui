"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Lightbulb, Play, Square } from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useAuth } from "@/components/auth/auth-provider";
import { HealthBadge } from "@/components/infrastructure/health-badge";
import { RangeSelector } from "@/components/infrastructure/range-selector";
import { DatabaseConnectionStatusBadge } from "@/components/infrastructure/database-status-badge";
import { ConfirmDialog } from "@/components/infrastructure/confirm-dialog";
import { DeleteResourceDialog } from "@/components/infrastructure/delete-resource-dialog";
import { DatabaseOperationDialog } from "@/components/infrastructure/database-operation-dialog";
import { OperationStatusBadge } from "@/components/infrastructure/operation-status-badge";
import { SeverityBadge } from "@/components/infrastructure/severity-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { formatAgo, formatBytes, formatDuration } from "@/lib/format";
import { RANGE_OPTIONS } from "@/lib/monitoring";
import {
  ApiError,
  databaseMetricsStreamUrl,
  databasePerformanceStreamUrl,
  deleteDatabase,
  deleteDatabaseOperation,
  getDatabase,
  getDatabaseCatalog,
  getDatabaseConnections,
  getDatabaseLocks,
  getDatabaseLogs,
  getDatabaseMetricsCurrent,
  getDatabaseMetricsHistory,
  getDatabaseMonitoringHealth,
  getDatabaseOperationCapabilities,
  getDatabasePerformance,
  getDatabasePerformanceHistory,
  getDatabaseQueryDetail,
  getDatabaseReplication,
  getDatabaseSchemas,
  getDatabaseStorage,
  getDatabaseStorageHistory,
  getDatabaseTables,
  getTableColumns,
  getTableIndexes,
  getTableRows,
  listDatabaseOperations,
  listDatabaseQueries,
  listRecommendations,
  searchTableData,
  testDatabaseConnection,
  updateDatabase,
  type CatalogData,
  type ColumnItem,
  type DatabaseCommonMetrics,
  type DatabaseDetail,
  type DatabaseMetricPoint,
  type DatabaseMonitoringHealthTier,
  type DatabaseOperation,
  type DatabaseOperationCapability,
  type DatabasePerformance,
  type DatabasePerformancePoint,
  type DatabaseQuery,
  type DatabaseSession,
  type HealthStatus,
  type IndexItem,
  type LogEntry,
  type Recommendation,
  type TableListItem,
  isAdminRole,
} from "@/lib/api";

const MAX_LIVE_SAMPLES = 120;
// Shared 15m/1h/6h/24h/7d/30d presets (components/infrastructure/range-selector.tsx
// + lib/monitoring.ts) -- used by Metrics/Performance/Storage/Logs below
// instead of each tab keeping its own near-identical inline copy.
const HISTORY_RANGES = RANGE_OPTIONS;

export default function DatabaseDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const databaseId = params.id;
  const { user } = useAuth();
  const isAdmin = isAdminRole(user?.role);

  const [db, setDb] = useState<DatabaseDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [testMessage, setTestMessage] = useState<string | null>(null);

  const load = useCallback(() => {
    getDatabase(databaseId)
      .then(setDb)
      .catch((err) => setError(err instanceof ApiError && err.status === 404 ? "Database not found." : "Failed to load database."));
  }, [databaseId]);

  useEffect(() => {
    // Load-on-mount/param-change: no external store to subscribe to.

    load();
  }, [load]);

  async function handleTest() {
    setTesting(true);
    setTestMessage(null);
    try {
      const result = await testDatabaseConnection(databaseId);
      setTestMessage(`Connection test: ${result.connection_status}`);
      load();
    } catch (err) {
      setTestMessage(err instanceof ApiError ? err.message : "Failed to test connection.");
    } finally {
      setTesting(false);
    }
  }

  async function handleToggleMonitoring(enabled: boolean) {
    await updateDatabase(databaseId, { monitoring_enabled: enabled });
    load();
  }

  async function handleDelete(confirmationName: string) {
    await deleteDatabase(databaseId, confirmationName);
    router.push("/databases");
  }

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!db) return <p className="text-sm text-slate-500">Loading&hellip;</p>;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link href="/databases" className="flex w-fit items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
          <ArrowLeft className="h-4 w-4" /> Back to Databases
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
              {db.name || db.database_name || db.host}
              <DatabaseConnectionStatusBadge status={db.connection_status} />
            </h2>
            <p className="text-sm text-slate-500">
              {db.workspace_name ? `${db.workspace_name} · ` : ""}
              {db.type} · {db.host}:{db.port}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {isAdmin && (
              <Button variant="outline" size="sm" onClick={handleTest} disabled={testing}>
                {testing ? "Testing…" : "Test Connection"}
              </Button>
            )}
            {isAdmin && (
              <label className="flex items-center gap-2 rounded-md border border-slate-200 px-3 py-1.5 text-sm text-slate-600">
                <Checkbox checked={db.monitoring_enabled} onCheckedChange={(v) => handleToggleMonitoring(v === true)} />
                Monitoring
              </label>
            )}
            {isAdmin && (
              <DeleteResourceDialog
                trigger={<Button variant="outline" size="sm">Delete</Button>}
                resourceTypeLabel="database"
                resourceName={db.name ?? ""}
                description="Removes this monitoring configuration from Infra Hub Center only -- the external database itself, and its data, are never touched or dropped. Historical metrics are retained per the retention policy."
                onConfirm={() => handleDelete(db.name ?? "")}
              />
            )}
          </div>
        </div>
        {testMessage && (
          <Alert>
            <AlertDescription>{testMessage}</AlertDescription>
          </Alert>
        )}
        {!db.monitoring_enabled && (
          <p className="text-xs text-slate-500">Monitoring is disabled for this database -- enable it above to collect metrics.</p>
        )}
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="metrics">Metrics</TabsTrigger>
          <TabsTrigger value="performance">Performance</TabsTrigger>
          <TabsTrigger value="queries">Queries</TabsTrigger>
          <TabsTrigger value="storage">Storage</TabsTrigger>
          <TabsTrigger value="browser">Browser</TabsTrigger>
          <TabsTrigger value="logs">Logs</TabsTrigger>
          {isAdmin && <TabsTrigger value="operations">Operations</TabsTrigger>}
        </TabsList>

        <TabsContent value="overview">
          <OverviewTab db={db} isAdmin={isAdmin} onSaved={load} />
        </TabsContent>
        <TabsContent value="metrics">
          <MetricsTab databaseId={databaseId} monitoringEnabled={db.monitoring_enabled} dbType={db.type} />
        </TabsContent>
        <TabsContent value="performance">
          <PerformanceTab databaseId={databaseId} monitoringEnabled={db.monitoring_enabled} isAdmin={isAdmin} />
        </TabsContent>
        <TabsContent value="queries">
          <QueriesTab databaseId={databaseId} />
        </TabsContent>
        <TabsContent value="storage">
          <StorageTab databaseId={databaseId} />
        </TabsContent>
        <TabsContent value="browser">
          <BrowserTab databaseId={databaseId} defaultDatabaseName={db.database_name} />
        </TabsContent>
        <TabsContent value="logs">
          <LogsTab databaseId={databaseId} />
        </TabsContent>
        {isAdmin && (
          <TabsContent value="operations">
            <OperationsTab databaseId={databaseId} resourceId={db.resource_id} />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}

// ---------- Overview ----------

// Surfaces *why* Performance/Metrics might still be empty even with
// monitoring on -- the backend already records a failure reason per
// cycle per tier (FAST/DEEP), but nothing showed it until this panel.
// Renders nothing when there's nothing wrong to report (no tiers yet, or
// every tier's most recent result was a success).
function MonitoringHealthPanel({ databaseId }: { databaseId: string }) {
  const [tiers, setTiers] = useState<DatabaseMonitoringHealthTier[] | null>(null);

  useEffect(() => {
    getDatabaseMonitoringHealth(databaseId)
      .then((res) => setTiers(res.tiers))
      .catch(() => setTiers(null));
  }, [databaseId]);

  const failing = (tiers ?? []).filter(
    (t) => t.last_error && (!t.last_success_at || (t.last_failure_at && t.last_failure_at > t.last_success_at))
  );
  if (failing.length === 0) return null;

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
      <h3 className="mb-2 text-sm font-semibold text-amber-900">Collection is having trouble</h3>
      <ul className="flex flex-col gap-1 text-sm text-amber-800">
        {failing.map((t) => (
          <li key={t.tier}>
            <span className="font-medium">{t.tier === "DEEP" ? "Performance/Queries" : "Metrics"}:</span> {t.last_error}
            {t.last_failure_at && <span className="text-amber-600"> ({formatAgo(t.last_failure_at)})</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}

function OverviewTab({ db, isAdmin, onSaved }: { db: DatabaseDetail; isAdmin: boolean; onSaved: () => void }) {
  const [showCredentialForm, setShowCredentialForm] = useState(false);

  return (
    <div className="flex flex-col gap-4">
      {db.monitoring_enabled && <MonitoringHealthPanel databaseId={db.id} />}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <h3 className="mb-3 text-sm font-semibold text-slate-900">Connection</h3>
          <dl className="grid grid-cols-2 gap-y-2 text-sm">
            <dt className="text-slate-500">Host</dt>
            <dd className="text-slate-900">{db.host}</dd>
            <dt className="text-slate-500">Port</dt>
            <dd className="text-slate-900">{db.port}</dd>
            <dt className="text-slate-500">Database</dt>
            <dd className="text-slate-900">{db.database_name ?? "—"}</dd>
            <dt className="text-slate-500">Type</dt>
            <dd className="text-slate-900">{db.type}</dd>
            <dt className="text-slate-500">Provider</dt>
            <dd className="text-slate-900">{db.provider ?? "—"}</dd>
            <dt className="text-slate-500">Region</dt>
            <dd className="text-slate-900">{db.region ?? "—"}</dd>
            <dt className="text-slate-500">Cluster Identifier</dt>
            <dd className="text-slate-900">{db.cluster_identifier ?? "—"}</dd>
            <dt className="text-slate-500">Endpoint</dt>
            <dd className="text-slate-900">{db.endpoint ?? "—"}</dd>
            <dt className="text-slate-500">TLS</dt>
            <dd className="text-slate-900">{db.tls_enabled ? (db.tls_skip_verify ? "Enabled (verification skipped)" : "Enabled") : "Disabled"}</dd>
            <dt className="text-slate-500">Last Metrics</dt>
            <dd className="text-slate-900">{formatAgo(db.last_metrics_at)}</dd>
          </dl>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900">Monitoring Credential</h3>
            {isAdmin && (
              <Button variant="outline" size="sm" onClick={() => setShowCredentialForm((v) => !v)}>
                {db.credential_configured ? "Replace" : "Configure"}
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className={`h-2 w-2 rounded-full ${db.credential_configured ? "bg-emerald-500" : "bg-slate-300"}`} />
            {db.credential_configured ? (
              <span className="text-slate-700">
                {db.credential_username} <span className="text-slate-400">••••••••</span>
              </span>
            ) : (
              <span className="text-slate-500">Not configured</span>
            )}
          </div>
          {isAdmin && showCredentialForm && (
            <CredentialForm
              databaseId={db.id}
              db={db}
              onSaved={() => {
                setShowCredentialForm(false);
                onSaved();
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function CredentialForm({ databaseId, db, onSaved }: { databaseId: string; db: DatabaseDetail; onSaved: () => void }) {
  const [username, setUsername] = useState(db.credential_username ?? "");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!username.trim() || !password) {
      setError("Username and password are both required.");
      return;
    }
    setSubmitting(true);
    try {
      await updateDatabase(databaseId, { username, password });
      setPassword("");
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save credential.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-2">
      <Label>Username</Label>
      <Input value={username} onChange={(e) => setUsername(e.target.value)} disabled={submitting} autoComplete="off" />
      <Label>Password</Label>
      <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} disabled={submitting} autoComplete="new-password" />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div>
        <Button type="submit" size="sm" disabled={submitting}>
          {submitting ? "Saving…" : "Save"}
        </Button>
      </div>
    </form>
  );
}

// ---------- Metrics ----------

type LiveMetricFrame = { captured_at: string; health?: HealthStatus; metrics_status?: string; common?: DatabaseCommonMetrics; details?: Record<string, unknown> };

function MetricsTab({ databaseId, monitoringEnabled, dbType }: { databaseId: string; monitoringEnabled: boolean; dbType: string }) {
  // Postgres/MySQL/MariaDB have no SQL-queryable server memory usage or
  // error-count metric, and their "throughput" is only ever reported as
  // Txns/sec (xact_commit+xact_rollback) -- Ops/sec is a Mongo/Redis-only
  // concept (their own command counters). Rather than a bare "--" that
  // looks identical to "not collected yet", say so plainly for these
  // three cards so it reads as permanent-by-engine, not broken.
  const isRelational = dbType === "POSTGRESQL" || dbType === "MYSQL" || dbType === "MARIADB";
  const [current, setCurrent] = useState<Awaited<ReturnType<typeof getDatabaseMetricsCurrent>> | null>(null);
  const [currentLoading, setCurrentLoading] = useState(true);
  const [currentError, setCurrentError] = useState<string | null>(null);
  const [live, setLive] = useState(false);
  const [liveSamples, setLiveSamples] = useState<LiveMetricFrame[]>([]);
  const [connectionState, setConnectionState] = useState<"idle" | "connecting" | "open" | "closed">("idle");
  const wsRef = useRef<WebSocket | null>(null);

  const [rangeIndex, setRangeIndex] = useState(1);
  const [history, setHistory] = useState<DatabaseMetricPoint[] | null>(null);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState<string | null>(null);

  const loadCurrent = useCallback(() => {
    setCurrentLoading(true);
    getDatabaseMetricsCurrent(databaseId)
      .then((res) => {
        setCurrent(res);
        setCurrentError(null);
      })
      .catch((err) => {
        setCurrent(null);
        setCurrentError(err instanceof ApiError ? err.message : "Failed to load metrics.");
      })
      .finally(() => setCurrentLoading(false));
  }, [databaseId]);

  const loadHistory = useCallback(() => {
    setHistoryLoading(true);
    const to = new Date();
    const from = new Date(to.getTime() - HISTORY_RANGES[rangeIndex].ms);
    getDatabaseMetricsHistory(databaseId, { from: from.toISOString(), to: to.toISOString() })
      .then((res) => {
        setHistory(res.points);
        setHistoryError(null);
      })
      .catch((err) => {
        setHistory(null);
        setHistoryError(err instanceof ApiError ? err.message : "Failed to load metrics history.");
      })
      .finally(() => setHistoryLoading(false));
  }, [databaseId, rangeIndex]);

  // Both callbacks set their own "loading" flag synchronously before the
  // async fetch, so a re-run (e.g. rangeIndex changing) visibly shows
  // "Loading…" again rather than silently keeping stale data on screen.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadCurrent();
    loadHistory();
  }, [loadCurrent, loadHistory]);

  useEffect(() => {
    if (!live) {
      wsRef.current?.close();
      wsRef.current = null;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setConnectionState("idle");
      return;
    }

    setConnectionState("connecting");
    // Guards every handler below against a stale connection -- React
    // StrictMode (dev only, which is how this app is currently being
    // served) double-invokes this effect on mount, and the first
    // WebSocket's late close/error event can otherwise land after the
    // second (real) connection has already opened, stomping "open" back
    // to "closed" even though the live connection is fine.
    let cancelled = false;
    const ws = new WebSocket(databaseMetricsStreamUrl(databaseId));
    wsRef.current = ws;

    ws.onopen = () => {
      if (cancelled) return;
      setConnectionState("open");
    };
    ws.onclose = () => {
      if (cancelled) return;
      setConnectionState("closed");
    };
    ws.onerror = () => {
      if (cancelled) return;
      setConnectionState("closed");
    };
    ws.onmessage = (ev) => {
      if (cancelled) return;
      try {
        const data = JSON.parse(ev.data as string) as LiveMetricFrame & { type?: string };
        if (data.type === "waiting") return;
        setLiveSamples((prev) => [...prev.slice(-(MAX_LIVE_SAMPLES - 1)), data]);
      } catch {
        // Malformed frame -- ignore rather than crash the chart.
      }
    };

    return () => {
      cancelled = true;
      ws.close();
      wsRef.current = null;
    };
  }, [live, databaseId]);

  const connectionsSeries = useMemo(
    () => liveSamples.map((s) => ({ t: chartTime(s.captured_at), v: s.common?.connections ?? null })),
    [liveSamples]
  );
  const opsSeries = useMemo(
    () => liveSamples.map((s) => ({ t: chartTime(s.captured_at), v: s.common?.operations_per_second ?? null })),
    [liveSamples]
  );

  const display = liveSamples.length > 0 ? liveSamples[liveSamples.length - 1] : undefined;
  const common = display?.common ?? current?.common;
  const noData = current?.status === "NO_DATA" && !display;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-slate-500">
          {live
            ? connectionState === "connecting"
              ? "Connecting…"
              : connectionState === "open"
                ? "Streaming live metrics."
                : "Connection closed."
            : current?.captured_at
              ? `Last updated ${formatAgo(current.captured_at)}`
              : ""}
        </p>
        <Button size="sm" variant={live ? "outline" : "default"} onClick={() => setLive((v) => !v)} disabled={!monitoringEnabled}>
          {live ? (
            <>
              <Square className="h-4 w-4" /> Stop Live Metrics
            </>
          ) : (
            <>
              <Play className="h-4 w-4" /> Live Metrics
            </>
          )}
        </Button>
      </div>

      {currentLoading && !display ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">Loading&hellip;</div>
      ) : currentError && !display ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-8 text-center text-sm text-red-700">{currentError}</div>
      ) : noData ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">No data yet.</div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <TopCard
              label="Connections"
              value={formatCount(common?.active_connections ?? common?.connections)}
              sub={common?.max_connections ? `of ${common.max_connections} max` : undefined}
            />
            <TopCard
              label="Memory"
              value={formatBytes(common?.memory_usage_bytes)}
              sub={common?.memory_usage_bytes === undefined && isRelational ? "Not exposed via SQL for this engine" : undefined}
            />
            <TopCard label="Database Size" value={formatBytes(common?.database_size_bytes)} />
            <TopCard
              label="Ops/sec"
              value={formatRateValue(common?.operations_per_second)}
              sub={common?.operations_per_second === undefined && isRelational ? "See Txns/sec for this engine" : undefined}
            />
            <TopCard label="Txns/sec" value={formatRateValue(common?.transactions_per_second)} />
            <TopCard
              label="Errors"
              value={formatCount(common?.errors)}
              sub={common?.errors === undefined && isRelational ? "Not exposed via SQL for this engine" : undefined}
            />
            <TopCard label="Uptime" value={formatDuration(common?.uptime_seconds, true)} />
            <TopCard label="Health" value="" custom={display?.health ?? current?.health ? <HealthBadge status={(display?.health ?? current?.health) as HealthStatus} /> : <span className="text-slate-400">—</span>} />
          </div>

          {current?.metrics_status === "PARTIAL" && (
            <p className="text-xs text-amber-600">Some metrics could not be collected on the last cycle -- values above reflect what was available.</p>
          )}

          {live && (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <ChartCard title="Connections">
                <ValueLineChart data={connectionsSeries} color="#0ea5e9" />
              </ChartCard>
              <ChartCard title="Operations / sec">
                <ValueLineChart data={opsSeries} color="#8b5cf6" />
              </ChartCard>
            </div>
          )}
        </>
      )}

      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-slate-900">History</h3>
          <RangeSelector options={HISTORY_RANGES} selectedIndex={rangeIndex} onSelect={setRangeIndex} />
        </div>
        <div className="h-56">
          {historyLoading ? (
            <div className="flex h-full items-center justify-center text-sm text-slate-400">Loading&hellip;</div>
          ) : historyError ? (
            <div className="flex h-full items-center justify-center text-sm text-red-600">{historyError}</div>
          ) : (
            <MetricsHistoryChart points={history} />
          )}
        </div>
      </div>
    </div>
  );
}

function MetricsHistoryChart({ points }: { points: DatabaseMetricPoint[] | null }) {
  if (!points || points.length === 0) {
    return <div className="flex h-full items-center justify-center text-sm text-slate-400">No metrics collected in this range yet.</div>;
  }
  const data = points.map((p) => ({ t: chartTime(p.captured_at), connections: p.connections ?? null, ops: p.operations_per_second ?? null }));
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis dataKey="t" fontSize={11} tickLine={false} axisLine={{ stroke: "#e2e8f0" }} />
        <YAxis fontSize={11} tickLine={false} axisLine={false} width={36} />
        <Tooltip formatter={(value) => (value === null || value === undefined ? "N/A" : Number(value).toFixed(1))} />
        <Line type="monotone" dataKey="connections" name="Connections" stroke="#0ea5e9" strokeWidth={2} dot={false} isAnimationActive={false} connectNulls={false} />
        <Line type="monotone" dataKey="ops" name="Ops/sec" stroke="#8b5cf6" strokeWidth={2} dot={false} isAnimationActive={false} connectNulls={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

// ---------- Performance ----------

function PerformanceTab({ databaseId, monitoringEnabled, isAdmin }: { databaseId: string; monitoringEnabled: boolean; isAdmin: boolean }) {
  const [perf, setPerf] = useState<DatabasePerformance | null>(null);
  const [live, setLive] = useState(false);
  const [connectionState, setConnectionState] = useState<"idle" | "connecting" | "open" | "closed">("idle");
  const wsRef = useRef<WebSocket | null>(null);
  const [rangeIndex, setRangeIndex] = useState(1);
  const [history, setHistory] = useState<DatabasePerformancePoint[] | null>(null);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [locks, setLocks] = useState<{ waiting?: number; blocked?: number } | null>(null);
  const [replication, setReplication] = useState<{ status: string; lag_seconds?: number; replica_count?: number } | null>(null);
  const [connections, setConnections] = useState<{ sessions?: DatabaseSession[] } | null>(null);
  const [capabilities, setCapabilities] = useState<DatabaseOperationCapability[]>([]);
  // Performance/Locks/Replication/Connections are four separate HTTP
  // calls but all read the same backend deep-metrics cache
  // (internal/handlers/database_performance.go) -- they succeed or fail
  // together in practice, sharing one root cause, so one loading/error
  // pair covers all four rather than four near-identical ones.
  const [deepLoading, setDeepLoading] = useState(true);
  const [deepError, setDeepError] = useState<string | null>(null);

  const loadDeep = useCallback(() => {
    setDeepLoading(true);
    Promise.all([getDatabasePerformance(databaseId), getDatabaseLocks(databaseId), getDatabaseReplication(databaseId), getDatabaseConnections(databaseId)])
      .then(([perfRes, locksRes, replicationRes, connectionsRes]) => {
        setPerf(perfRes);
        setLocks(locksRes.locks ?? null);
        setReplication(replicationRes.replication ?? null);
        setConnections(connectionsRes);
        setDeepError(null);
      })
      .catch((err) => {
        setPerf(null);
        setLocks(null);
        setReplication(null);
        setConnections(null);
        setDeepError(err instanceof ApiError ? err.message : "Failed to load performance data.");
      })
      .finally(() => setDeepLoading(false));
  }, [databaseId]);

  const loadHistory = useCallback(() => {
    setHistoryLoading(true);
    const to = new Date();
    const from = new Date(to.getTime() - HISTORY_RANGES[rangeIndex].ms);
    getDatabasePerformanceHistory(databaseId, { from: from.toISOString(), to: to.toISOString() })
      .then((res) => {
        setHistory(res.points);
        setHistoryError(null);
      })
      .catch((err) => {
        setHistory(null);
        setHistoryError(err instanceof ApiError ? err.message : "Failed to load performance history.");
      })
      .finally(() => setHistoryLoading(false));
  }, [databaseId, rangeIndex]);

  // See the identical comment in MetricsTab's initial-load effect above.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadDeep();
    loadHistory();
  }, [loadDeep, loadHistory]);

  // Session actions (Cancel Query/Terminate Session) are Admin-only,
  // full stop -- Step 14 grants no Member access to this feature at all.
  useEffect(() => {
    if (!isAdmin) return;
    getDatabaseOperationCapabilities(databaseId)
      .then((res) => setCapabilities(res.capabilities))
      .catch(() => setCapabilities([]));
  }, [databaseId, isAdmin]);

  useEffect(() => {
    if (!live) {
      wsRef.current?.close();
      wsRef.current = null;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setConnectionState("idle");
      return;
    }

    setConnectionState("connecting");
    // See the live-metrics effect above for why this guard is needed
    // (React StrictMode dev-mode double-invoke + a stale close event
    // race -- this app is currently served via `next dev`).
    let cancelled = false;
    const ws = new WebSocket(databasePerformanceStreamUrl(databaseId));
    wsRef.current = ws;

    ws.onopen = () => {
      if (cancelled) return;
      setConnectionState("open");
    };
    ws.onclose = () => {
      if (cancelled) return;
      setConnectionState("closed");
    };
    ws.onerror = () => {
      if (cancelled) return;
      setConnectionState("closed");
    };
    ws.onmessage = (ev) => {
      if (cancelled) return;
      try {
        const data = JSON.parse(ev.data as string) as DatabasePerformance & { type?: string };
        if (data.type === "waiting") return;
        setPerf(data);
      } catch {
        // Malformed frame -- ignore rather than crash the panel.
      }
    };

    return () => {
      cancelled = true;
      ws.close();
      wsRef.current = null;
    };
  }, [live, databaseId]);

  const noData = perf?.status === "NO_DATA";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-slate-500">
          {live
            ? connectionState === "connecting"
              ? "Connecting…"
              : connectionState === "open"
                ? "Streaming live performance data."
                : "Connection closed."
            : perf?.captured_at
              ? `Last updated ${formatAgo(perf.captured_at)}`
              : ""}
        </p>
        <Button size="sm" variant={live ? "outline" : "default"} onClick={() => setLive((v) => !v)} disabled={!monitoringEnabled}>
          {live ? (
            <>
              <Square className="h-4 w-4" /> Stop Live Updates
            </>
          ) : (
            <>
              <Play className="h-4 w-4" /> Live Updates
            </>
          )}
        </Button>
      </div>

      {deepLoading && !perf ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">Loading&hellip;</div>
      ) : deepError && !perf ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-8 text-center text-sm text-red-700">{deepError}</div>
      ) : noData || !perf ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">No data yet.</div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <TopCard label="Cache Hit Ratio" value={perf.cache_hit_ratio !== undefined ? `${perf.cache_hit_ratio.toFixed(1)}%` : "—"} />
          <TopCard label="p50 Latency" value={perf.latency_p50_ms !== undefined ? `${perf.latency_p50_ms.toFixed(1)} ms` : "—"} />
          <TopCard label="p95 Latency" value={perf.latency_p95_ms !== undefined ? `${perf.latency_p95_ms.toFixed(1)} ms` : "—"} />
          <TopCard label="p99 Latency" value={perf.latency_p99_ms !== undefined ? `${perf.latency_p99_ms.toFixed(1)} ms` : "—"} />
        </div>
      )}

      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-slate-900">History</h3>
          <RangeSelector options={HISTORY_RANGES} selectedIndex={rangeIndex} onSelect={setRangeIndex} />
        </div>
        <div className="h-56">
          {historyLoading ? (
            <div className="flex h-full items-center justify-center text-sm text-slate-400">Loading&hellip;</div>
          ) : historyError ? (
            <div className="flex h-full items-center justify-center text-sm text-red-600">{historyError}</div>
          ) : (
            <PerformanceHistoryChart points={history} />
          )}
        </div>
      </div>

      {deepError && (
        <p className="text-xs text-red-600">{deepError}</p>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <h3 className="mb-3 text-sm font-semibold text-slate-900">Locks &amp; Waits</h3>
          <dl className="grid grid-cols-2 gap-y-2 text-sm">
            <dt className="text-slate-500">Waiting</dt>
            <dd className="text-slate-900">{locks?.waiting ?? (deepLoading ? "…" : "—")}</dd>
            <dt className="text-slate-500">Blocked</dt>
            <dd className={locks?.blocked ? "font-medium text-red-600" : "text-slate-900"}>{locks?.blocked ?? (deepLoading ? "…" : "—")}</dd>
          </dl>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <h3 className="mb-3 text-sm font-semibold text-slate-900">Replication</h3>
          <dl className="grid grid-cols-2 gap-y-2 text-sm">
            <dt className="text-slate-500">Status</dt>
            <dd className="text-slate-900">{replication?.status ?? (deepLoading ? "…" : "UNKNOWN")}</dd>
            <dt className="text-slate-500">Lag</dt>
            <dd className="text-slate-900">{replication?.lag_seconds !== undefined ? `${replication.lag_seconds.toFixed(1)}s` : "—"}</dd>
            <dt className="text-slate-500">Replicas</dt>
            <dd className="text-slate-900">{replication?.replica_count ?? "—"}</dd>
          </dl>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <h3 className="mb-3 text-sm font-semibold text-slate-900">Sessions</h3>
          {deepLoading ? (
            <p className="text-sm text-slate-400">Loading&hellip;</p>
          ) : !connections?.sessions || connections.sessions.length === 0 ? (
            <p className="text-sm text-slate-500">No active sessions.</p>
          ) : (
            <p className="text-sm text-slate-900">{connections.sessions.length} active session(s)</p>
          )}
        </div>
      </div>

      {connections?.sessions && connections.sessions.length > 0 && (
        <SessionsTable sessions={connections.sessions} databaseId={databaseId} capabilities={isAdmin ? capabilities : []} />
      )}
    </div>
  );
}

// Cancel Query/Terminate Session actions are driven directly by whichever
// target-scoped capabilities the backend actually returns for this
// database's engine -- never hardcoded, since not every engine supports
// both (e.g. Redis has no CANCEL_QUERY). Confirming navigates straight to
// the new operation's detail view (the dialog's default behavior) so the
// admin immediately sees live output; the sessions list itself refreshes
// next time this tab is visited.
function SessionsTable({
  sessions,
  databaseId,
  capabilities,
}: {
  sessions: DatabaseSession[];
  databaseId: string;
  capabilities: DatabaseOperationCapability[];
}) {
  const targetCapabilities = capabilities.filter(
    (c) => c.requires_target_id && (c.type === "CANCEL_QUERY" || c.type === "TERMINATE_SESSION")
  );

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>PID</TableHead>
            <TableHead>Database</TableHead>
            <TableHead>User</TableHead>
            <TableHead>Duration</TableHead>
            <TableHead>State</TableHead>
            <TableHead>Wait Event</TableHead>
            <TableHead>Application</TableHead>
            {targetCapabilities.length > 0 && <TableHead>Actions</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {sessions.map((s) => (
            <TableRow key={s.pid}>
              <TableCell className="font-mono text-xs text-slate-600">{s.pid}</TableCell>
              <TableCell className="text-slate-600">{s.database ?? "—"}</TableCell>
              <TableCell className="text-slate-600">{s.user ?? "—"}</TableCell>
              <TableCell className="text-slate-600">{formatDuration(s.duration_seconds, true)}</TableCell>
              <TableCell className="text-slate-600">{s.state ?? "—"}</TableCell>
              <TableCell className="text-slate-600">{s.wait_event ? `${s.wait_event_type ?? ""}/${s.wait_event}` : "—"}</TableCell>
              <TableCell className="text-slate-600">{s.application_name ?? "—"}</TableCell>
              {targetCapabilities.length > 0 && (
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {targetCapabilities.map((cap) => (
                      <DatabaseOperationDialog
                        key={cap.type}
                        databaseId={databaseId}
                        operationType={cap.type}
                        operationLabel={cap.label}
                        destructive={cap.destructive}
                        impactDescription={cap.impact_description}
                        parameters={{ target_id: String(s.pid) }}
                        trigger={
                          <Button variant="outline" size="xs">
                            {cap.label}
                          </Button>
                        }
                      />
                    ))}
                  </div>
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function PerformanceHistoryChart({ points }: { points: DatabasePerformancePoint[] | null }) {
  if (!points || points.length === 0) {
    return <div className="flex h-full items-center justify-center text-sm text-slate-400">No performance data collected in this range yet.</div>;
  }
  const data = points.map((p) => ({
    t: chartTime(p.captured_at),
    cache: p.cache_hit_ratio ?? null,
    latency: p.latency_p95_ms ?? null,
  }));
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis dataKey="t" fontSize={11} tickLine={false} axisLine={{ stroke: "#e2e8f0" }} />
        <YAxis fontSize={11} tickLine={false} axisLine={false} width={36} />
        <Tooltip formatter={(value) => (value === null || value === undefined ? "N/A" : Number(value).toFixed(1))} />
        <Line type="monotone" dataKey="cache" name="Cache Hit %" stroke="#0ea5e9" strokeWidth={2} dot={false} isAnimationActive={false} connectNulls={false} />
        <Line type="monotone" dataKey="latency" name="p95 Latency (ms)" stroke="#f97316" strokeWidth={2} dot={false} isAnimationActive={false} connectNulls={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

// ---------- Queries ----------

function QueriesTab({ databaseId }: { databaseId: string }) {
  const [queries, setQueries] = useState<DatabaseQuery[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<Awaited<ReturnType<typeof getDatabaseQueryDetail>> | null>(null);

  useEffect(() => {
    listDatabaseQueries(databaseId)
      .then((res) => setQueries(res.queries))
      .catch((err) => setError(err instanceof ApiError && err.status === 404 ? "You don't have access to query statistics for this database." : "Failed to load queries."));
  }, [databaseId]);

  useEffect(() => {
    if (!selected) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDetail(null);
      return;
    }
    getDatabaseQueryDetail(databaseId, selected)
      .then(setDetail)
      .catch(() => setDetail(null));
  }, [databaseId, selected]);

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!queries) return <p className="text-sm text-slate-500">Loading&hellip;</p>;

  return (
    <div className="flex flex-col gap-4">
      {queries.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
          No query statistics collected yet.
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fingerprint</TableHead>
                <TableHead>Calls</TableHead>
                <TableHead>Avg Latency</TableHead>
                <TableHead>Total Time</TableHead>
                <TableHead>Database</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {queries.map((q) => (
                <TableRow key={q.fingerprint}>
                  <TableCell className="font-mono text-xs text-slate-600">{q.fingerprint.slice(0, 16)}</TableCell>
                  <TableCell className="text-slate-600">{q.calls ?? "—"}</TableCell>
                  <TableCell className="text-slate-600">{q.avg_time_ms !== undefined ? `${q.avg_time_ms.toFixed(1)} ms` : "—"}</TableCell>
                  <TableCell className="text-slate-600">{q.total_time_ms !== undefined ? `${(q.total_time_ms / 1000).toFixed(1)} s` : "—"}</TableCell>
                  <TableCell className="text-slate-600">{q.database_name ?? "—"}</TableCell>
                  <TableCell>
                    <Button variant="ghost" size="sm" onClick={() => setSelected(q.fingerprint)}>
                      View Details
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {selected && (
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900">Query Detail</h3>
            <Button variant="ghost" size="sm" onClick={() => setSelected(null)}>
              Close
            </Button>
          </div>
          {!detail ? (
            <p className="text-sm text-slate-500">Loading&hellip;</p>
          ) : (
            <div className="flex flex-col gap-3">
              <div>
                <div className="text-xs font-medium text-slate-500">Query Text</div>
                {detail.query.normalized_text ? (
                  <pre className="mt-1 overflow-x-auto rounded-md bg-slate-50 p-3 text-xs text-slate-800">{detail.query.normalized_text}</pre>
                ) : (
                  <p className="mt-1 text-sm text-slate-500">Query text not available.</p>
                )}
              </div>
              <dl className="grid grid-cols-2 gap-y-2 text-sm sm:grid-cols-4">
                <dt className="text-slate-500">Calls</dt>
                <dd className="text-slate-900">{detail.query.calls ?? "—"}</dd>
                <dt className="text-slate-500">Rows</dt>
                <dd className="text-slate-900">{detail.query.rows ?? "—"}</dd>
                <dt className="text-slate-500">First Seen</dt>
                <dd className="text-slate-900">{formatAgo(detail.first_seen_at)}</dd>
                <dt className="text-slate-500">User</dt>
                <dd className="text-slate-900">{detail.query.database_user ?? "—"}</dd>
              </dl>
              {detail.history.length > 0 && (
                <div className="h-40">
                  <QueryHistoryChart points={detail.history} />
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function QueryHistoryChart({ points }: { points: { captured_at: string; calls?: number; total_time_ms?: number; avg_time_ms?: number }[] }) {
  const data = points.map((p) => ({ t: chartTime(p.captured_at), v: p.avg_time_ms ?? null }));
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis dataKey="t" fontSize={11} tickLine={false} axisLine={{ stroke: "#e2e8f0" }} />
        <YAxis fontSize={11} tickLine={false} axisLine={false} width={36} />
        <Tooltip formatter={(value) => (value === null || value === undefined ? "N/A" : `${Number(value).toFixed(1)} ms`)} />
        <Line type="monotone" dataKey="v" name="Avg Latency" stroke="#8b5cf6" strokeWidth={2} dot={false} isAnimationActive={false} connectNulls={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

// ---------- Storage ----------

function StorageTab({ databaseId }: { databaseId: string }) {
  const [storage, setStorage] = useState<Awaited<ReturnType<typeof getDatabaseStorage>> | null>(null);
  const [rangeIndex, setRangeIndex] = useState(3);
  const [history, setHistory] = useState<{ captured_at: string; database_size_bytes?: number }[] | null>(null);

  const loadHistory = useCallback(() => {
    const to = new Date();
    const from = new Date(to.getTime() - HISTORY_RANGES[rangeIndex].ms);
    getDatabaseStorageHistory(databaseId, { from: from.toISOString(), to: to.toISOString() })
      .then((res) => setHistory(res.points))
      .catch(() => setHistory(null));
  }, [databaseId, rangeIndex]);

  useEffect(() => {
    getDatabaseStorage(databaseId).then(setStorage).catch(() => setStorage(null));
    loadHistory();
  }, [databaseId, loadHistory]);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-2">
        <TopCard label="Database Size" value={formatBytes(storage?.database_size_bytes)} />
        <TopCard
          label="Growth"
          value={storage?.growth_bytes_per_day !== undefined ? `${formatBytes(storage.growth_bytes_per_day)}/day` : "—"}
          sub={storage?.growth_bytes_per_day === undefined ? "Needs 1h+ of monitoring history to compute" : undefined}
        />
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-slate-900">Size History</h3>
          <RangeSelector options={HISTORY_RANGES} selectedIndex={rangeIndex} onSelect={setRangeIndex} />
        </div>
        <div className="h-56">
          {!history || history.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-slate-400">No storage history collected in this range yet.</div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={history.map((p) => ({ t: chartTime(p.captured_at), v: p.database_size_bytes ?? null }))}
                margin={{ top: 4, right: 8, left: -16, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="t" fontSize={11} tickLine={false} axisLine={{ stroke: "#e2e8f0" }} />
                <YAxis fontSize={11} tickLine={false} axisLine={false} width={56} tickFormatter={(v: number) => formatBytes(v)} />
                <Tooltip formatter={(value) => (value === null || value === undefined ? "N/A" : formatBytes(Number(value)))} />
                <Line type="monotone" dataKey="v" stroke="#0ea5e9" strokeWidth={2} dot={false} isAnimationActive={false} connectNulls={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------- Browser ----------

function BrowserTab({ databaseId, defaultDatabaseName }: { databaseId: string; defaultDatabaseName?: string }) {
  const [catalog, setCatalog] = useState<CatalogData | null>(null);
  // undefined = this resource's own configured database. A cluster/server
  // credential often reaches several logical databases, same as pointing
  // pgAdmin at one server and picking which database to open -- selecting
  // a different entry from "Databases in This Cluster" below re-browses
  // that one instead, without needing a second InfraHub database resource.
  const [selectedDatabase, setSelectedDatabase] = useState<string | undefined>(undefined);
  const [schemas, setSchemas] = useState<string[] | null>(null);
  const [selectedSchema, setSelectedSchema] = useState<string | undefined>(undefined);
  const [tables, setTables] = useState<TableListItem[] | null>(null);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getDatabaseCatalog(databaseId)
      .then(setCatalog)
      .catch((err) => {
        if (err instanceof ApiError && err.status === 404) setForbidden(true);
        else setError("Failed to load catalog.");
      });
  }, [databaseId]);

  useEffect(() => {
    // Re-fetches whenever the target database changes, resetting schema
    // and table selection -- a schema/table picked in one database has no
    // meaning in another.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelectedSchema(undefined);
    setSelectedTable(null);
    getDatabaseSchemas(databaseId, selectedDatabase)
      .then((res) => setSchemas(res.schemas))
      .catch(() => setSchemas([]));
  }, [databaseId, selectedDatabase]);

  const loadTables = useCallback(
    (schema?: string) => {
      getDatabaseTables(databaseId, schema, selectedDatabase)
        .then((res) => setTables(res.tables))
        .catch((err) => {
          if (err instanceof ApiError && err.status === 404) setForbidden(true);
          else setError("Failed to load tables.");
        });
    },
    [databaseId, selectedDatabase]
  );

  useEffect(() => {
    loadTables(selectedSchema);
  }, [loadTables, selectedSchema]);

  if (forbidden) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
        You don&apos;t have browser access to this database.
      </div>
    );
  }
  if (error) return <p className="text-sm text-red-600">{error}</p>;

  return (
    <div className="flex flex-col gap-4">
      {catalog && catalog.databases.length > 0 && (
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <h3 className="mb-2 text-sm font-semibold text-slate-900">
            Databases in This Cluster ({catalog.databases.length})
          </h3>
          <p className="mb-2 text-xs text-slate-500">
            This connection reaches every database below. Select one to browse it -- the rest of this tab always
            reflects whichever is selected.
          </p>
          <div className="flex flex-wrap gap-2">
            {catalog.databases.map((d) => {
              const isSelected = (selectedDatabase ?? defaultDatabaseName) === d.name;
              return (
                <button
                  key={d.name}
                  type="button"
                  onClick={() => setSelectedDatabase(d.name === defaultDatabaseName ? undefined : d.name)}
                  className={`rounded-full px-2 py-0.5 text-xs ${
                    isSelected ? "bg-sky-100 text-sky-700 ring-1 ring-sky-300" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                  }`}
                >
                  {d.name}
                  {d.name === defaultDatabaseName && <span className="ml-1 text-slate-400">(configured)</span>}
                  <span className="ml-1.5 text-slate-500">
                    {d.connection_count} connection{d.connection_count === 1 ? "" : "s"}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        {schemas && schemas.length > 0 && (
          <div className="flex items-center gap-2">
            <Label className="text-xs text-slate-500">Schema</Label>
            <Select value={selectedSchema ?? "__default__"} onValueChange={(v) => setSelectedSchema(v && v !== "__default__" ? v : undefined)}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Default" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__default__">Default</SelectItem>
                {schemas.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-lg border border-slate-200 bg-white p-4 lg:col-span-1">
          <h3 className="mb-3 text-sm font-semibold text-slate-900">Tables</h3>
          {!tables || tables.length === 0 ? (
            <p className="text-sm text-slate-500">No tables found.</p>
          ) : (
            <ul className="flex max-h-96 flex-col gap-1 overflow-y-auto">
              {tables.map((t) => (
                <li key={t.name}>
                  <button
                    type="button"
                    onClick={() => setSelectedTable(t.name)}
                    className={`w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-slate-50 ${
                      selectedTable === t.name ? "bg-sky-50 text-sky-700" : "text-slate-700"
                    }`}
                  >
                    {t.name}
                    {t.row_count !== undefined && <span className="ml-2 text-xs text-slate-400">{t.row_count} rows</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="lg:col-span-2">
          {selectedTable ? (
            <TableDetailPanel databaseId={databaseId} tableId={selectedTable} schema={selectedSchema} database={selectedDatabase} />
          ) : (
            <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-slate-300 bg-white p-8 text-sm text-slate-500">
              Select a table to view its columns and data.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function TableDetailPanel({
  databaseId,
  tableId,
  schema,
  database,
}: {
  databaseId: string;
  tableId: string;
  schema?: string;
  database?: string;
}) {
  const [columns, setColumns] = useState<ColumnItem[] | null>(null);
  const [indexes, setIndexes] = useState<IndexItem[] | null>(null);
  const [rows, setRows] = useState<Record<string, unknown>[] | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [searchColumn, setSearchColumn] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const pageSize = 25;

  const loadRows = useCallback(
    (nextOffset: number) => {
      getTableRows(databaseId, tableId, pageSize, nextOffset, schema, database)
        .then((res) => {
          setRows(res.rows);
          setHasMore(res.has_more);
          setOffset(nextOffset);
        })
        .catch(() => {
          setRows(null);
          setHasMore(false);
        });
    },
    [databaseId, tableId, schema, database]
  );

  useEffect(() => {
    // Resets local search state when the selected table changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSearching(false);
    setSearchQuery("");
    getTableColumns(databaseId, tableId, schema, database).then((res) => setColumns(res.columns)).catch(() => setColumns([]));
    getTableIndexes(databaseId, tableId, schema, database).then((res) => setIndexes(res.indexes)).catch(() => setIndexes([]));
    loadRows(0);
  }, [databaseId, tableId, schema, database, loadRows]);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!searchColumn.trim() || !searchQuery.trim()) return;
    setSearching(true);
    try {
      const res = await searchTableData(databaseId, tableId, searchColumn.trim(), searchQuery.trim(), pageSize, 0, schema, database);
      setRows(res.rows);
      setHasMore(res.has_more);
      setOffset(0);
    } finally {
      setSearching(false);
    }
  }


  const columnNames = useMemo(() => (columns ?? []).map((c) => c.name), [columns]);
  const rowColumns = rows && rows.length > 0 ? Object.keys(rows[0]) : columnNames;

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <h3 className="mb-3 text-sm font-semibold text-slate-900">{tableId}</h3>
        {columns && columns.length > 0 && (
          <div className="mb-4 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Column</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Nullable</TableHead>
                  <TableHead>Default</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {columns.map((c) => (
                  <TableRow key={c.name}>
                    <TableCell className="font-mono text-xs text-slate-700">{c.name}</TableCell>
                    <TableCell className="text-slate-600">{c.type}</TableCell>
                    <TableCell className="text-slate-600">{c.nullable ? "Yes" : "No"}</TableCell>
                    <TableCell className="text-slate-600">{c.default ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {indexes && indexes.length > 0 && (
          <div className="mb-4">
            <h4 className="mb-2 text-xs font-semibold text-slate-500">Indexes</h4>
            <div className="flex flex-wrap gap-2">
              {indexes.map((idx) => (
                <span key={idx.name} className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
                  {idx.name} ({idx.columns.join(", ")}){idx.is_primary ? " · PK" : idx.is_unique ? " · unique" : ""}
                </span>
              ))}
            </div>
          </div>
        )}

        <form onSubmit={handleSearch} className="mb-4 flex flex-wrap items-end gap-2">
          <div className="flex flex-col gap-1">
            <Label className="text-xs">Column</Label>
            <Input value={searchColumn} onChange={(e) => setSearchColumn(e.target.value)} className="w-36" placeholder="column" />
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs">Search value</Label>
            <Input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-48" placeholder="value" />
          </div>
          <Button type="submit" size="sm" disabled={searching}>
            Search
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => loadRows(0)}>
            Reset
          </Button>
        </form>

        {!rows || rows.length === 0 ? (
          <p className="text-sm text-slate-500">No rows to show.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  {rowColumns.map((c) => (
                    <TableHead key={c}>{c}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row, i) => (
                  <TableRow key={i}>
                    {rowColumns.map((c) => (
                      <TableCell key={c} className="max-w-[16rem] truncate text-xs text-slate-600">
                        {formatCellValue(row[c])}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        <div className="mt-3 flex items-center justify-between">
          <Button variant="outline" size="sm" disabled={offset === 0} onClick={() => loadRows(Math.max(0, offset - pageSize))}>
            Previous
          </Button>
          <span className="text-xs text-slate-500">Offset {offset}</span>
          <Button variant="outline" size="sm" disabled={!hasMore} onClick={() => loadRows(offset + pageSize)}>
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}

function formatCellValue(v: unknown): string {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

// ---------- Logs ----------

// datetime-local inputs want "YYYY-MM-DDTHH:mm" in the viewer's own local
// time (no seconds/timezone) -- new Date(thatString).toISOString() before
// it's sent to the API converts it back to a real, unambiguous instant.
function toDatetimeLocalValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function LogsTab({ databaseId }: { databaseId: string }) {
  const [logs, setLogs] = useState<LogEntry[] | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [rangeIndex, setRangeIndex] = useState<number | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    const fromIso = from ? new Date(from).toISOString() : undefined;
    const toIso = to ? new Date(to).toISOString() : undefined;
    getDatabaseLogs(databaseId, undefined, fromIso, toIso, 100)
      .then((res) => {
        setLogs(res.logs);
        setHasMore(res.has_more);
        setError(null);
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 404) setForbidden(true);
        else setError(err instanceof ApiError ? err.message : "Failed to load logs.");
      });
  }, [databaseId, from, to]);

  useEffect(() => {
    load();
  }, [load]);

  function selectRange(index: number) {
    setRangeIndex(index);
    const toDate = new Date();
    const fromDate = new Date(toDate.getTime() - HISTORY_RANGES[index].ms);
    setFrom(toDatetimeLocalValue(fromDate));
    setTo(toDatetimeLocalValue(toDate));
  }

  if (forbidden) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
        You don&apos;t have log access to this database.
      </div>
    );
  }
  if (error) return <p className="text-sm text-red-600">{error}</p>;

  return (
    <div className="flex flex-col gap-4">
      <RangeSelector options={HISTORY_RANGES} selectedIndex={rangeIndex ?? -1} onSelect={selectRange} />
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setRangeIndex(null);
          load();
        }}
        className="flex flex-wrap items-end gap-2"
      >
        <div className="flex flex-col gap-1">
          <Label className="text-xs">From</Label>
          <Input
            type="datetime-local"
            value={from}
            onChange={(e) => {
              setRangeIndex(null);
              setFrom(e.target.value);
            }}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs">To</Label>
          <Input
            type="datetime-local"
            value={to}
            onChange={(e) => {
              setRangeIndex(null);
              setTo(e.target.value);
            }}
          />
        </div>
        <Button type="submit" size="sm">
          Filter
        </Button>
      </form>

      {!logs || logs.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">No log entries.</div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Time</TableHead>
                <TableHead>Severity</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Message</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.map((l, i) => (
                <TableRow key={i}>
                  <TableCell className="text-slate-600">{new Date(l.timestamp).toLocaleString()}</TableCell>
                  <TableCell className="text-slate-600">{l.severity}</TableCell>
                  <TableCell className="text-slate-600">{l.source}</TableCell>
                  <TableCell className="max-w-xl truncate text-slate-600">{l.message}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      {hasMore && <p className="text-xs text-slate-500">More log entries are available -- narrow the time range to see them.</p>}
    </div>
  );
}

// ---------- Operations (Step 14) ----------

function opDuration(startedAt?: string, endAt?: string): string {
  if (!startedAt || !endAt) return "—";
  const seconds = Math.max(0, Math.round((new Date(endAt).getTime() - new Date(startedAt).getTime()) / 1000));
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

// Mirrors the operation detail page's own TERMINAL set -- only a completed
// operation (nothing left that a worker could still be executing) can be
// deleted from the ledger.
const OPERATION_TERMINAL_STATUSES = new Set(["SUCCESS", "FAILED", "CANCELLED", "TIMEOUT"]);

function OperationsTab({ databaseId, resourceId }: { databaseId: string; resourceId: string }) {
  const [capabilities, setCapabilities] = useState<DatabaseOperationCapability[] | null>(null);
  const [operations, setOperations] = useState<DatabaseOperation[] | null>(null);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [recommendations, setRecommendations] = useState<Recommendation[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pageSize = 20;

  const loadOperations = useCallback(
    (nextOffset: number) => {
      listDatabaseOperations(databaseId, { limit: pageSize, offset: nextOffset })
        .then((res) => {
          setOperations(res.operations);
          setTotal(res.total);
          setOffset(nextOffset);
        })
        .catch(() => setError("Failed to load operation history."));
    },
    [databaseId]
  );

  useEffect(() => {
    getDatabaseOperationCapabilities(databaseId)
      .then((res) => setCapabilities(res.capabilities))
      .catch(() => setCapabilities([]));
    loadOperations(0);
    // Non-resolved/dismissed recommendations scoped to this database only
    // -- the global /recommendations page (all types/severities, its own
    // filter UI) is out of scope here; this panel is a separate, small
    // piece of UI scoped to a single resource_id.
    listRecommendations({ resource_id: resourceId, page_size: 50 })
      .then((res) => setRecommendations(res.recommendations.filter((r) => r.status === "NEW" || r.status === "ACKNOWLEDGED")))
      .catch(() => setRecommendations([]));
  }, [databaseId, resourceId, loadOperations]);

  const maintenanceCapabilities = (capabilities ?? []).filter((c) => !c.requires_target_id);

  async function handleDelete(operationId: string) {
    await deleteDatabaseOperation(databaseId, operationId);
    loadOperations(offset);
  }

  return (
    <div className="flex flex-col gap-4">
      {recommendations && recommendations.length > 0 && (
        <RecommendationsPanel databaseId={databaseId} recommendations={recommendations} capabilities={capabilities ?? []} />
      )}

      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <h3 className="mb-3 text-sm font-semibold text-slate-900">Maintenance Operations</h3>
        {!capabilities ? (
          <p className="text-sm text-slate-500">Loading&hellip;</p>
        ) : maintenanceCapabilities.length === 0 ? (
          <p className="text-sm text-slate-500">No maintenance operations are available for this database engine.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {maintenanceCapabilities.map((cap) => (
              <DatabaseOperationDialog
                key={cap.type}
                databaseId={databaseId}
                operationType={cap.type}
                operationLabel={cap.label}
                destructive={cap.destructive}
                impactDescription={cap.impact_description}
                trigger={
                  <Button variant={cap.destructive ? "outline" : "default"} size="sm">
                    {cap.label}
                  </Button>
                }
              />
            ))}
          </div>
        )}
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <h3 className="mb-3 text-sm font-semibold text-slate-900">Operation History</h3>
        {error && <p className="mb-2 text-sm text-red-600">{error}</p>}
        {!operations ? (
          <p className="text-sm text-slate-500">Loading&hellip;</p>
        ) : operations.length === 0 ? (
          <p className="text-sm text-slate-500">No operations have been run against this database yet.</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Operation</TableHead>
                    <TableHead>Requested By</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Started</TableHead>
                    <TableHead>Duration</TableHead>
                    <TableHead>Result</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {operations.map((op) => (
                    <TableRow key={op.id}>
                      <TableCell>
                        <Link
                          href={`/databases/${databaseId}/operations/${op.id}`}
                          className="font-medium text-sky-700 hover:underline"
                        >
                          {op.operation_type.replace(/_/g, " ")}
                        </Link>
                      </TableCell>
                      <TableCell className="text-slate-600">{op.requested_by ?? "—"}</TableCell>
                      <TableCell>
                        <OperationStatusBadge status={op.status} />
                      </TableCell>
                      <TableCell className="text-slate-600">{op.started_at ? formatAgo(op.started_at) : "—"}</TableCell>
                      <TableCell className="text-slate-600">{opDuration(op.started_at, op.completed_at)}</TableCell>
                      <TableCell className="max-w-xs truncate text-slate-600">
                        {op.result_summary ?? op.error_summary ?? "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        {OPERATION_TERMINAL_STATUSES.has(op.status) && (
                          <ConfirmDialog
                            trigger={
                              <Button variant="ghost" size="sm">
                                Delete
                              </Button>
                            }
                            title="Delete this operation?"
                            description={`Permanently removes this ${op.operation_type.replace(/_/g, " ").toLowerCase()} entry from the history below. This does not affect the database itself.`}
                            confirmLabel="Delete"
                            destructive
                            onConfirm={() => handleDelete(op.id)}
                          />
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="mt-3 flex items-center justify-between">
              <Button variant="outline" size="sm" disabled={offset === 0} onClick={() => loadOperations(Math.max(0, offset - pageSize))}>
                Previous
              </Button>
              <span className="text-xs text-slate-500">
                {total === 0 ? 0 : offset + 1}–{Math.min(offset + pageSize, total)} of {total}
              </span>
              <Button variant="outline" size="sm" disabled={offset + pageSize >= total} onClick={() => loadOperations(offset + pageSize)}>
                Next
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

type OperationSuggestion =
  | { kind: "operation"; capability: DatabaseOperationCapability; parameters?: { target_id?: string } }
  | { kind: "link"; href: string }
  | { kind: "none" };

// There is no rigid backend-side "recommendation -> operation" mapping API
// -- this is a deliberately simple, best-effort default per recommendation
// type, falling back to "no direct action, review manually" for anything
// unrecognized. Not meant to be exhaustive.
function suggestActionFor(databaseId: string, r: Recommendation, capabilities: DatabaseOperationCapability[]): OperationSuggestion {
  const find = (type: string) => capabilities.find((c) => c.type === type);
  switch (r.type) {
    case "DATABASE_LOCK_CONTENTION": {
      const cap = find("TERMINATE_SESSION");
      const raw = r.metadata?.blocking_pid ?? r.metadata?.pid;
      const targetId = typeof raw === "string" || typeof raw === "number" ? String(raw) : undefined;
      if (cap && targetId) return { kind: "operation", capability: cap, parameters: { target_id: targetId } };
      return { kind: "link", href: `/databases/${databaseId}` };
    }
    case "DATABASE_SLOW_QUERY":
      return { kind: "link", href: `/databases/${databaseId}` };
    case "DATABASE_HIGH_BLOAT":
    case "DATABASE_VACUUM_NEEDED": {
      const cap = find("VACUUM");
      return cap ? { kind: "operation", capability: cap } : { kind: "none" };
    }
    case "DATABASE_STALE_STATISTICS":
      return find("ANALYZE") ? { kind: "operation", capability: find("ANALYZE")! } : { kind: "none" };
    default:
      return { kind: "none" };
  }
}

function RecommendationsPanel({
  databaseId,
  recommendations,
  capabilities,
}: {
  databaseId: string;
  recommendations: Recommendation[];
  capabilities: DatabaseOperationCapability[];
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900">
        <Lightbulb className="h-4 w-4" /> Open Recommendations
      </h3>
      <ul className="flex flex-col gap-3">
        {recommendations.map((r) => {
          const suggestion = suggestActionFor(databaseId, r, capabilities);
          return (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3 last:border-0 last:pb-0">
              <div>
                <div className="flex items-center gap-2">
                  <SeverityBadge severity={r.severity} />
                  <span className="text-sm font-medium text-slate-900">{r.title}</span>
                </div>
                {r.description && <p className="mt-0.5 text-xs text-slate-500">{r.description}</p>}
              </div>
              {suggestion.kind === "operation" ? (
                <DatabaseOperationDialog
                  databaseId={databaseId}
                  operationType={suggestion.capability.type}
                  operationLabel={suggestion.capability.label}
                  destructive={suggestion.capability.destructive}
                  impactDescription={suggestion.capability.impact_description}
                  parameters={suggestion.parameters}
                  recommendationId={r.id}
                  trigger={<Button size="sm">Review</Button>}
                />
              ) : suggestion.kind === "link" ? (
                <Link href={suggestion.href}>
                  <Button variant="outline" size="sm">
                    Review
                  </Button>
                </Link>
              ) : (
                <span className="text-xs text-slate-400">No direct action -- review manually</span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ---------- Shared helpers ----------

function chartTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function formatCount(v?: number): string {
  return v === undefined || v === null ? "—" : String(v);
}

function formatRateValue(v?: number): string {
  return v === undefined || v === null ? "—" : `${v.toFixed(1)}/s`;
}

function TopCard({ label, value, sub, custom }: { label: string; value: string; sub?: string; custom?: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="text-sm font-medium text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-slate-900">{custom ?? value}</div>
      {sub && <div className="mt-1 text-xs text-slate-500">{sub}</div>}
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <h3 className="mb-2 text-sm font-semibold text-slate-900">{title}</h3>
      <div className="h-56">{children}</div>
    </div>
  );
}

function ValueLineChart({ data, color }: { data: { t: string; v: number | null }[]; color: string }) {
  if (data.length === 0) {
    return <div className="flex h-full items-center justify-center text-sm text-slate-400">Waiting for data&hellip;</div>;
  }
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis dataKey="t" fontSize={11} tickLine={false} axisLine={{ stroke: "#e2e8f0" }} />
        <YAxis fontSize={11} tickLine={false} axisLine={false} width={36} />
        <Tooltip formatter={(value) => (value === null || value === undefined ? "N/A" : Number(value).toFixed(1))} />
        <Line type="monotone" dataKey="v" stroke={color} strokeWidth={2} dot={false} isAnimationActive={false} connectNulls={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}
