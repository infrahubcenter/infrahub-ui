"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
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
import { ObjectStorageStatusBadge } from "@/components/infrastructure/object-storage-status-badge";
import { ObjectStorageHealthReasons } from "@/components/infrastructure/object-storage-health-reasons";
import { ObjectStorageSecurityPanel } from "@/components/infrastructure/object-storage-security-panel";
import { ObjectStorageGrowthProjection } from "@/components/infrastructure/object-storage-growth-projection";
import { ObjectStorageBrowserTab } from "@/components/infrastructure/object-storage-browser/browser-tab";
import { EditObjectStorageForm } from "@/components/infrastructure/edit-object-storage-form";
import { DeleteResourceDialog } from "@/components/infrastructure/delete-resource-dialog";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatAgo, formatBytes, parseDurationSeconds } from "@/lib/format";
import {
  ApiError,
  deleteObjectStorage,
  getObjectStorage,
  getObjectStorageMetricsCurrent,
  getObjectStorageMetricsHistory,
  testObjectStorageConnection,
  type ObjectStorageDetail,
  type ObjectStorageMetrics,
  isAdminRole,
} from "@/lib/api";

// Same periodic-refresh convention as vms/[id]/monitoring/page.tsx: read
// whatever the backend collector already stored, never open a connection
// to the bucket itself from the browser.
const REFRESH_SECONDS = parseDurationSeconds(process.env.NEXT_PUBLIC_MONITORING_REFRESH, 30);

const HISTORY_RANGES: { label: string; ms: number }[] = [
  { label: "1h", ms: 60 * 60 * 1000 },
  { label: "6h", ms: 6 * 60 * 60 * 1000 },
  { label: "24h", ms: 24 * 60 * 60 * 1000 },
  { label: "7d", ms: 7 * 24 * 60 * 60 * 1000 },
];

// Detail page shell for Step 17. Overview and Access carry connection/
// credential/access content; Performance carries real fast metrics (Phase 2);
// Overview/Security/header now also carry deep-metrics-derived facts (growth
// projection, security posture, health reasons -- Phase 3). Browser now
// carries the real prefix-tree/object-table/detail-panel UI (Phase 4),
// capability- *and* permission-gated per decision #7 (mirrors the VM
// `permissions.includes(...)` pattern, not the database Browser tab, which
// is always-rendered and only 404s its content). Logs is never wired --
// capabilities.logs is false for every provider in this step (decision #5).
export default function ObjectStorageDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const storageId = params.id;
  const { user } = useAuth();
  const isAdmin = isAdminRole(user?.role);

  const [storage, setStorage] = useState<ObjectStorageDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [testMessage, setTestMessage] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  const load = useCallback(() => {
    getObjectStorage(storageId)
      .then(setStorage)
      .catch((err) =>
        setError(err instanceof ApiError && err.status === 404 ? "Object storage not found." : "Failed to load object storage.")
      );
  }, [storageId]);

  useEffect(() => {
    // Load-on-mount/param-change: no external store to subscribe to.

    load();
  }, [load]);

  async function handleTest() {
    setTesting(true);
    setTestMessage(null);
    try {
      const result = await testObjectStorageConnection(storageId);
      setTestMessage(`Connection test: ${result.connection_status}`);
      load();
    } catch (err) {
      setTestMessage(err instanceof ApiError ? err.message : "Failed to test connection.");
    } finally {
      setTesting(false);
    }
  }

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!storage) return <p className="text-sm text-slate-500">Loading&hellip;</p>;

  // "Hidden not disabled" (spec §41/§62) -- capability AND permission both
  // gate Browser; download additionally requires its own capability so a
  // provider that can't generate presigned URLs never dangles a Download
  // affordance a permission grant alone would otherwise imply.
  const canBrowse = storage.capabilities.browser && storage.permissions.includes("object_storage.browser");
  const canDownload = storage.capabilities.download && storage.permissions.includes("object_storage.download");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link href="/object-storage" className="flex w-fit items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
          <ArrowLeft className="h-4 w-4" /> Back to Object Storage
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
              {storage.name}
              <ObjectStorageStatusBadge status={storage.connection_status} />
            </h2>
            <p className="text-sm text-slate-500">
              {storage.workspace_name ? `${storage.workspace_name} · ` : ""}
              {storage.provider} · {storage.bucket}
            </p>
            <div className="mt-2">
              <ObjectStorageHealthReasons status={storage.health_status} reasons={storage.health_reasons} />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {isAdmin && (
              <Button variant="outline" size="sm" onClick={handleTest} disabled={testing}>
                {testing ? "Testing…" : "Test Connection"}
              </Button>
            )}
            {isAdmin && (
              <Button variant="outline" size="sm" onClick={() => setEditing((v) => !v)}>
                {editing ? "Cancel Edit" : "Edit Connection"}
              </Button>
            )}
            {isAdmin && (
              <DeleteResourceDialog
                trigger={<Button variant="outline" size="sm">Delete</Button>}
                resourceTypeLabel="object storage"
                resourceName={storage.name}
                description="Removes this monitoring registration from Infra Hub Center only -- the real bucket, its objects, prefixes, and policies are never touched or deleted."
                onConfirm={async () => {
                  await deleteObjectStorage(storageId, storage.name);
                }}
                onDeleted={() => router.push("/object-storage")}
              />
            )}
          </div>
        </div>
        {testMessage && (
          <Alert>
            <AlertDescription>{testMessage}</AlertDescription>
          </Alert>
        )}
        {!storage.monitoring_enabled && (
          <p className="text-xs text-slate-500">Monitoring is disabled for this object storage.</p>
        )}
      </div>

      {isAdmin && editing && (
        <EditObjectStorageForm
          storage={storage}
          onCancel={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            load();
          }}
        />
      )}

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="performance">Performance</TabsTrigger>
          {canBrowse && <TabsTrigger value="browser">Browser</TabsTrigger>}
          <TabsTrigger value="security">Security</TabsTrigger>
          <TabsTrigger value="logs">Logs</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <OverviewTab storage={storage} />
        </TabsContent>
        <TabsContent value="performance">
          <PerformanceTab storageId={storage.id} />
        </TabsContent>
        {canBrowse && (
          <TabsContent value="browser">
            <ObjectStorageBrowserTab storageId={storage.id} bucket={storage.bucket} canDownload={canDownload} />
          </TabsContent>
        )}
        <TabsContent value="security">
          <ObjectStorageSecurityPanel security={storage.security} />
        </TabsContent>
        {/* Never wired -- capabilities.logs is false for every provider in this
            step, so this tab stays a placeholder indefinitely unless that changes. */}
        <TabsContent value="logs">
          <ComingSoonTab label="Logs" />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ComingSoonTab({ label }: { label: string }) {
  return (
    <div className="rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center">
      <p className="text-sm text-slate-500">{label} coming soon.</p>
    </div>
  );
}

// ---------- Overview ----------

function OverviewTab({ storage }: { storage: ObjectStorageDetail }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <h3 className="mb-3 text-sm font-semibold text-slate-900">Connection</h3>
          <dl className="grid grid-cols-2 gap-y-2 text-sm">
            <dt className="text-slate-500">Provider</dt>
            <dd className="text-slate-900">{storage.provider}</dd>
            <dt className="text-slate-500">Endpoint</dt>
            <dd className="text-slate-900">{storage.endpoint ?? "—"}</dd>
            <dt className="text-slate-500">Region</dt>
            <dd className="text-slate-900">{storage.region ?? "—"}</dd>
            <dt className="text-slate-500">Bucket</dt>
            <dd className="text-slate-900">{storage.bucket}</dd>
            <dt className="text-slate-500">Base Path</dt>
            <dd className="text-slate-900">{storage.base_path ?? "—"}</dd>
            <dt className="text-slate-500">TLS</dt>
            <dd className="text-slate-900">
              {storage.tls_enabled ? (storage.tls_skip_verify ? "Enabled (verification skipped)" : "Enabled") : "Disabled"}
            </dd>
            <dt className="text-slate-500">Last Checked</dt>
            <dd className="text-slate-900">{formatAgo(storage.last_checked_at)}</dd>
          </dl>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <h3 className="mb-3 text-sm font-semibold text-slate-900">Credential</h3>
          <dl className="grid grid-cols-2 gap-y-2 text-sm">
            <dt className="text-slate-500">Access Key ID</dt>
            <dd className="text-slate-900">{storage.access_key_id ?? "—"}</dd>
            <dt className="text-slate-500">Credential Configured</dt>
            <dd>
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${
                  storage.credential_configured
                    ? "bg-emerald-50 text-emerald-700 ring-emerald-600/20"
                    : "bg-slate-100 text-slate-600 ring-slate-400/20"
                }`}
              >
                {storage.credential_configured ? "Yes" : "No"}
              </span>
            </dd>
            <dt className="text-slate-500">Monitoring Enabled</dt>
            <dd>
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${
                  storage.monitoring_enabled
                    ? "bg-emerald-50 text-emerald-700 ring-emerald-600/20"
                    : "bg-slate-100 text-slate-600 ring-slate-400/20"
                }`}
              >
                {storage.monitoring_enabled ? "Yes" : "No"}
              </span>
            </dd>
          </dl>
        </div>
      </div>

      <ObjectStorageGrowthProjection projection={storage.growth_projection} />
    </div>
  );
}

// ---------- Performance ----------
// Fast metrics only (Step 17 Phase 2): object-count/size + reachability/
// latency/requests/errors. No live WebSocket stream exists for object
// storage (unlike databases' MetricsTab) -- this polls the same cached
// current-metrics endpoint on a timer instead, mirroring
// vms/[id]/monitoring/page.tsx's refresh convention.
function PerformanceTab({ storageId }: { storageId: string }) {
  const [current, setCurrent] = useState<ObjectStorageMetrics | null>(null);
  const [rangeIndex, setRangeIndex] = useState(2);
  const [history, setHistory] = useState<(ObjectStorageMetrics & { captured_at: string })[] | null>(null);

  const loadCurrent = useCallback(() => {
    getObjectStorageMetricsCurrent(storageId)
      .then(setCurrent)
      .catch(() => setCurrent(null));
  }, [storageId]);

  const loadHistory = useCallback(() => {
    const to = new Date();
    const from = new Date(to.getTime() - HISTORY_RANGES[rangeIndex].ms);
    getObjectStorageMetricsHistory(storageId, { from: from.toISOString(), to: to.toISOString() })
      .then((res) => setHistory(res.points))
      .catch(() => setHistory(null));
  }, [storageId, rangeIndex]);

  useEffect(() => {
    loadCurrent();
    loadHistory();
  }, [loadCurrent, loadHistory]);

  useEffect(() => {
    const id = setInterval(loadCurrent, REFRESH_SECONDS * 1000);
    return () => clearInterval(id);
  }, [loadCurrent]);

  // "Never monitored yet" -- every field absent, not merely zero/false --
  // and a genuine fetch failure (404/network) are shown identically since
  // there is nothing honest to render either way.
  const hasAnyMetric =
    current !== null &&
    (current.object_count !== undefined ||
      current.total_size_bytes !== undefined ||
      current.requests_per_min !== undefined ||
      current.error_count !== undefined ||
      current.bucket_reachable !== undefined ||
      current.request_latency_ms !== undefined);

  const historyData = useMemo(
    () =>
      (history ?? []).map((p) => ({
        t: chartTime(p.captured_at),
        requests: p.requests_per_min ?? null,
        errors: p.error_count ?? null,
      })),
    [history]
  );

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-slate-500">{current?.captured_at ? `Last checked ${formatAgo(current.captured_at)}` : ""}</p>

      {!hasAnyMetric ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
          No metrics collected yet.
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          <TopCard label="Objects" value={formatCount(current?.object_count)} />
          <TopCard label="Storage Size" value={current?.total_size_bytes !== undefined ? formatBytes(current.total_size_bytes) : "N/A"} />
          <TopCard
            label="Requests"
            value={current?.requests_per_min !== undefined ? `${current.requests_per_min.toFixed(1)}/min` : "N/A"}
          />
          <TopCard label="Errors" value={formatCount(current?.error_count)} />
          <TopCard
            label="Reachability"
            value=""
            sub={current?.request_latency_ms !== undefined ? `${current.request_latency_ms.toFixed(0)} ms latency` : undefined}
            custom={
              current?.bucket_reachable === undefined ? (
                <span className="text-slate-400">N/A</span>
              ) : current.bucket_reachable ? (
                <span className="text-emerald-600">Reachable</span>
              ) : (
                <span className="text-red-600">Unreachable</span>
              )
            }
          />
        </div>
      )}

      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-slate-900">History</h3>
          <div className="flex gap-1">
            {HISTORY_RANGES.map((r, i) => (
              <Button key={r.label} size="sm" variant={rangeIndex === i ? "default" : "outline"} onClick={() => setRangeIndex(i)}>
                {r.label}
              </Button>
            ))}
          </div>
        </div>
        <div className="h-56">
          {historyData.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-slate-400">No metrics collected in this range yet.</div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={historyData} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="t" fontSize={11} tickLine={false} axisLine={{ stroke: "#e2e8f0" }} />
                <YAxis fontSize={11} tickLine={false} axisLine={false} width={36} />
                <Tooltip formatter={(value) => (value === null || value === undefined ? "N/A" : Number(value).toFixed(1))} />
                <Line
                  type="monotone"
                  dataKey="requests"
                  name="Requests/min"
                  stroke="#0ea5e9"
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                  connectNulls={false}
                />
                <Line
                  type="monotone"
                  dataKey="errors"
                  name="Errors"
                  stroke="#ef4444"
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                  connectNulls={false}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  );
}

function chartTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function formatCount(v?: number): string {
  return v === undefined || v === null ? "N/A" : v.toLocaleString();
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

