"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, RefreshCw, Zap } from "lucide-react";
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
import { StatusBadge } from "@/components/infrastructure/status-badge";
import { HealthBadge } from "@/components/infrastructure/health-badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatAgo, formatBytes, formatDuration, formatPercent, formatRate, parseDurationSeconds, secondsSince } from "@/lib/format";
import {
  ApiError,
  collectMonitoringNow,
  getMonitoringCurrent,
  getMonitoringHistory,
  getVM,
  type MonitoringCurrent,
  type MonitoringPoint,
  type VMDetail,
  isAdminRole,
} from "@/lib/api";

const REFRESH_SECONDS = parseDurationSeconds(process.env.NEXT_PUBLIC_MONITORING_REFRESH, 30);

export default function VMMonitoringPage() {
  const params = useParams<{ id: string }>();
  const vmId = params.id;
  const { user } = useAuth();

  const [vm, setVm] = useState<VMDetail | null>(null);
  const [current, setCurrent] = useState<MonitoringCurrent | null>(null);
  const [points, setPoints] = useState<MonitoringPoint[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [collecting, setCollecting] = useState(false);
  const [collectMessage, setCollectMessage] = useState<string | null>(null);

  const loadVM = useCallback(() => {
    getVM(vmId)
      .then(setVm)
      .catch((err) => setError(err instanceof ApiError && err.status === 404 ? "VM not found." : "Failed to load VM."));
  }, [vmId]);

  const loadCurrent = useCallback(async () => {
    try {
      setCurrent(await getMonitoringCurrent(vmId));
    } catch {
      setError("Failed to load monitoring data.");
    }
  }, [vmId]);

  const loadHistory = useCallback(async () => {
    try {
      const res = await getMonitoringHistory(vmId);
      // Backend returns newest-first; charts read left-to-right chronologically.
      setPoints([...res.points].reverse());
    } catch {
      setPoints([]);
    }
  }, [vmId]);

  useEffect(() => {
    // Load-on-mount/param-change: no external store to subscribe to.
    void loadVM();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadCurrent();
    void loadHistory();
  }, [loadVM, loadCurrent, loadHistory]);

  useEffect(() => {
    // Periodic refresh reads whatever the backend collector already
    // stored (spec §46) -- never opens a connection to the VM itself.
    const id = setInterval(() => {
      void loadCurrent();
      void loadHistory();
    }, REFRESH_SECONDS * 1000);
    return () => clearInterval(id);
  }, [loadCurrent, loadHistory]);

  async function handleRefresh() {
    setRefreshing(true);
    try {
      await Promise.all([loadCurrent(), loadHistory()]);
    } finally {
      setRefreshing(false);
    }
  }

  async function handleCollectNow() {
    setCollecting(true);
    setCollectMessage(null);
    try {
      const result = await collectMonitoringNow(vmId);
      setCollectMessage(
        result.status === "SUCCESS"
          ? "Collection completed successfully."
          : result.error_summary ?? `Collection ${result.status.toLowerCase()}.`
      );
      await Promise.all([loadCurrent(), loadHistory()]);
    } catch (err) {
      setCollectMessage(err instanceof ApiError ? err.message : "Failed to trigger collection.");
    } finally {
      setCollecting(false);
    }
  }

  const cpuSeries = useMemo(() => points.map((p) => ({ t: chartTime(p.captured_at), v: p.cpu_usage_percent ?? null })), [points]);
  const memorySeries = useMemo(() => points.map((p) => ({ t: chartTime(p.captured_at), v: p.memory_usage_percent ?? null })), [points]);
  const diskSeries = useMemo(() => points.map((p) => ({ t: chartTime(p.captured_at), v: p.storage_usage_percent ?? null })), [points]);
  const networkSeries = useMemo(
    () =>
      points.map((p) => ({
        t: chartTime(p.captured_at),
        rx: p.network_rx_rate_bytes ?? null,
        tx: p.network_tx_rate_bytes ?? null,
      })),
    [points]
  );

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!vm || !current) return <p className="text-sm text-slate-500">Loading&hellip;</p>;

  const stale = current.captured_at !== undefined && secondsSince(current.captured_at) > current.stale_after_seconds;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link href={`/vms/${vmId}`} className="flex w-fit items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
          <ArrowLeft className="h-4 w-4" /> Back to {vm.name}
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold text-slate-900">{vm.name}</h2>
              <StatusBadge status={vm.status} />
              <HealthBadge status={current.status} />
            </div>
            <p className="text-sm text-slate-500">
              Last updated: {formatAgo(current.captured_at)}
              {stale && current.status !== "OFFLINE" && <span className="ml-2 text-amber-600">Metrics may be stale</span>}
              {current.status === "OFFLINE" && <span className="ml-2 text-slate-500">Monitoring unavailable</span>}
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing}>
              <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} /> Refresh
            </Button>
            {isAdminRole(user?.role) && (
              <Button size="sm" onClick={handleCollectNow} disabled={collecting}>
                <Zap className="h-4 w-4" /> {collecting ? "Collecting…" : "Collect Now"}
              </Button>
            )}
          </div>
        </div>
        {collectMessage && (
          <Alert>
            <AlertDescription>{collectMessage}</AlertDescription>
          </Alert>
        )}
        {!current.monitoring_enabled && (
          <Alert variant="destructive">
            <AlertDescription>Monitoring is disabled for this VM. Enable it from the VM details page to resume collection.</AlertDescription>
          </Alert>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <TopCard label="CPU" value={formatPercent(current.cpu?.usage_percent)} sub={current.cpu?.cores !== undefined ? `${current.cpu.cores} cores` : undefined} />
        <TopCard label="Memory" value={formatPercent(current.memory?.usage_percent)} sub={current.memory ? `${formatBytes(current.memory.used_bytes)} / ${formatBytes(current.memory.total_bytes)}` : undefined} />
        <TopCard label="Disk" value={formatPercent(current.storage?.usage_percent)} sub={current.storage ? `${formatBytes(current.storage.used_bytes)} / ${formatBytes(current.storage.total_bytes)}` : undefined} />
        <TopCard
          label="Load"
          value={current.load?.one_minute !== undefined ? current.load.one_minute.toFixed(2) : "—"}
          sub={current.load?.load_per_cpu !== undefined ? `${current.load.load_per_cpu.toFixed(2)} per core` : undefined}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard title="CPU Usage">
          <PercentLineChart data={cpuSeries} color="#0ea5e9" />
        </ChartCard>
        <ChartCard title="Memory Usage">
          <PercentLineChart data={memorySeries} color="#8b5cf6" />
        </ChartCard>
        <ChartCard title="Disk Usage">
          <PercentLineChart data={diskSeries} color="#f59e0b" />
        </ChartCard>
        <ChartCard title="Network Traffic">
          <NetworkLineChart data={networkSeries} />
        </ChartCard>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <h3 className="mb-3 text-sm font-semibold text-slate-900">Filesystem</h3>
        {!current.filesystems || current.filesystems.length === 0 ? (
          <p className="text-sm text-slate-500">Storage information unavailable.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Mount</TableHead>
                <TableHead>Filesystem</TableHead>
                <TableHead>Used</TableHead>
                <TableHead>Available</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Usage</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {current.filesystems.map((fs) => (
                <TableRow key={fs.mount_point}>
                  <TableCell className="font-medium text-slate-900">{fs.mount_point}</TableCell>
                  <TableCell className="text-slate-600">{fs.filesystem ?? "—"}</TableCell>
                  <TableCell className="text-slate-600">{formatBytes(fs.used_bytes)}</TableCell>
                  <TableCell className="text-slate-600">{formatBytes(fs.available_bytes)}</TableCell>
                  <TableCell className="text-slate-600">{formatBytes(fs.total_bytes)}</TableCell>
                  <TableCell className="text-slate-600">{formatPercent(fs.usage_percent)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <h3 className="mb-3 text-sm font-semibold text-slate-900">Network Interfaces</h3>
        {!current.network_interfaces || current.network_interfaces.length === 0 ? (
          <p className="text-sm text-slate-500">No network interfaces reported.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Interface</TableHead>
                <TableHead>RX</TableHead>
                <TableHead>TX</TableHead>
                <TableHead>Errors</TableHead>
                <TableHead>Dropped</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {current.network_interfaces.map((iface) => (
                <TableRow key={iface.name}>
                  <TableCell className="font-medium text-slate-900">{iface.name}</TableCell>
                  <TableCell className="text-slate-600">{formatRate(iface.rx_bytes_per_sec)}</TableCell>
                  <TableCell className="text-slate-600">{formatRate(iface.tx_bytes_per_sec)}</TableCell>
                  <TableCell className="text-slate-600">{iface.rx_errors + iface.tx_errors}</TableCell>
                  <TableCell className="text-slate-600">{iface.rx_dropped + iface.tx_dropped}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <h3 className="mb-3 text-sm font-semibold text-slate-900">Process Summary</h3>
        {!current.process || current.process.total === undefined ? (
          <p className="text-sm text-slate-500">Process information unavailable.</p>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <SummaryStat label="Total" value={String(current.process.total)} />
            <SummaryStat label="Running" value={String(current.process.running ?? 0)} />
            <SummaryStat label="Sleeping" value={String(current.process.sleeping ?? 0)} />
            <SummaryStat label="Zombie" value={String(current.process.zombie ?? 0)} />
          </div>
        )}
        <p className="mt-3 text-xs text-slate-500">Uptime: {formatDuration(current.uptime_seconds)}</p>
        {current.swap && (
          <p className="mt-1 text-xs text-slate-500">
            Swap:{" "}
            {current.swap.configured
              ? `${formatBytes(current.swap.used_bytes)} / ${formatBytes(current.swap.total_bytes)} (${formatPercent(current.swap.usage_percent)})`
              : "Not configured"}
          </p>
        )}
      </div>
    </div>
  );
}

function chartTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function TopCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="text-sm font-medium text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-slate-900">{value}</div>
      {sub && <div className="mt-1 text-xs text-slate-500">{sub}</div>}
    </div>
  );
}

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-slate-500">{label}</div>
      <div className="text-lg font-semibold text-slate-900">{value}</div>
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

function PercentLineChart({ data, color }: { data: { t: string; v: number | null }[]; color: string }) {
  if (data.length === 0) {
    return <div className="flex h-full items-center justify-center text-sm text-slate-400">No history yet.</div>;
  }
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis dataKey="t" fontSize={11} tickLine={false} axisLine={{ stroke: "#e2e8f0" }} />
        <YAxis domain={[0, 100]} fontSize={11} tickLine={false} axisLine={false} width={36} />
        <Tooltip formatter={(value) => (value === null || value === undefined ? "N/A" : `${Number(value).toFixed(1)}%`)} />
        <Line type="monotone" dataKey="v" stroke={color} strokeWidth={2} dot={false} connectNulls={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

function NetworkLineChart({ data }: { data: { t: string; rx: number | null; tx: number | null }[] }) {
  if (data.length === 0) {
    return <div className="flex h-full items-center justify-center text-sm text-slate-400">No history yet.</div>;
  }
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis dataKey="t" fontSize={11} tickLine={false} axisLine={{ stroke: "#e2e8f0" }} />
        <YAxis fontSize={11} tickLine={false} axisLine={false} width={48} tickFormatter={(v: number) => formatBytes(v)} />
        <Tooltip formatter={(value) => (value === null || value === undefined ? "N/A" : formatRate(Number(value)))} />
        <Line type="monotone" dataKey="rx" name="RX" stroke="#0ea5e9" strokeWidth={2} dot={false} connectNulls={false} />
        <Line type="monotone" dataKey="tx" name="TX" stroke="#f97316" strokeWidth={2} dot={false} connectNulls={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}
