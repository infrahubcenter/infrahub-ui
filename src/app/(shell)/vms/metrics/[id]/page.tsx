"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, RefreshCw, Radio, ScrollText } from "lucide-react";
import { VMLogViewer } from "@/components/infrastructure/vm-log-viewer";
import { LogsWorkspace } from "@/components/infrastructure/logs-workspace";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { usageBarColor } from "@/components/infrastructure/usage-bar";
import { formatBytes, formatDuration, formatAgo } from "@/lib/format";
import {
  ApiError,
  getVM,
  getVMAgentMetricsCurrent,
  vmAgentLogsStreamUrl,
  vmAgentMetricsStreamUrl,
  vmLogsSearchAdapter,
  type VMDetail,
  type VMAgentMetrics,
} from "@/lib/api";

export default function VMMetricsDetailPage() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const vmId = params.id;
  const defaultTab = searchParams.get("view") === "logs" ? "logs" : "metrics";

  const [vm, setVm] = useState<VMDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getVM(vmId)
      .then(setVm)
      .catch((err) => setError(err instanceof ApiError && err.status === 404 ? "VM not found." : "Failed to load VM."));
  }, [vmId]);

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!vm) return <p className="text-sm text-slate-500">Loading&hellip;</p>;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/vms/metrics" className="flex w-fit items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
          <ArrowLeft className="h-4 w-4" /> Back to Host Metrics &amp; Logs
        </Link>
        <h2 className="mt-1 text-lg font-semibold text-slate-900">{vm.name}</h2>
        <p className="text-sm text-slate-500">{vm.workspace}</p>
      </div>

      <Tabs defaultValue={defaultTab}>
        <TabsList>
          <TabsTrigger value="metrics">Metrics</TabsTrigger>
          <TabsTrigger value="logs">Logs</TabsTrigger>
        </TabsList>

        <TabsContent value="metrics" className="flex flex-col gap-4">
          <MetricsSection vmId={vm.id} />
        </TabsContent>

        <TabsContent value="logs">
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900">
              <ScrollText className="h-4 w-4" /> Logs
            </h3>
            <LogsWorkspace
              liveView={<VMLogViewer streamUrl={vmAgentLogsStreamUrl(vm.id)} vmName={vm.name} />}
              search={vmLogsSearchAdapter(vm.id)}
            />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// Off/Live/5s/15s for MetricsSection's header -- Live opens a real
// WebSocket push (vmAgentMetricsStreamUrl), 5s/15s are a plain re-fetch
// on a timer instead. The manual refresh button next to these always
// does one immediate REST fetch regardless of which mode is selected.
type MetricsMode = "off" | "live" | "5s" | "15s";
const MODE_OPTIONS: { key: MetricsMode; label: string }[] = [
  { key: "off", label: "Off" },
  { key: "live", label: "Live" },
  { key: "5s", label: "5s" },
  { key: "15s", label: "15s" },
];

// The push-based VM Agent's own series (vm_agent_metric_snapshots) --
// the only metrics source in this section (see migrations/052_vm_agent.sql
// -- no SSH-collected "Collector Metrics" here at all, this section is
// purely agent/Docker-based, same as Docker Host/K8s Cluster). 404 means
// no sample has ever arrived yet (agent not installed, or installed but
// hasn't pushed its first sample) -- never fabricated.
function MetricsSection({ vmId }: { vmId: string }) {
  const [current, setCurrent] = useState<VMAgentMetrics | null>(null);
  const [notYetCollected, setNotYetCollected] = useState(false);
  const [error, setError] = useState(false);
  const [mode, setMode] = useState<MetricsMode>("off");
  const [refreshing, setRefreshing] = useState(false);
  const [liveState, setLiveState] = useState<"connecting" | "open" | "closed">("closed");
  const wsRef = useRef<WebSocket | null>(null);

  const load = useCallback(
    (opts?: { manual?: boolean }) => {
      if (opts?.manual) setRefreshing(true);
      return getVMAgentMetricsCurrent(vmId)
        .then((res) => {
          setCurrent(res);
          setError(false);
          setNotYetCollected(false);
        })
        .catch((err) => {
          if (err instanceof ApiError && err.status === 404) setNotYetCollected(true);
          else setError(true);
        })
        .finally(() => {
          if (opts?.manual) setRefreshing(false);
        });
    },
    [vmId]
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  // 5s/15s: plain re-fetch on a timer.
  useEffect(() => {
    const ms = mode === "5s" ? 5000 : mode === "15s" ? 15000 : 0;
    if (!ms) return;
    const id = setInterval(load, ms);
    return () => clearInterval(id);
  }, [mode, load]);

  // Live: a real WebSocket push (see vmAgentMetricsStreamUrl's own doc
  // comment) -- only open while "live" is selected; switching to any
  // other mode tears the connection down.
  useEffect(() => {
    if (mode !== "live") return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLiveState("connecting");
    const ws = new WebSocket(vmAgentMetricsStreamUrl(vmId));
    wsRef.current = ws;
    ws.onopen = () => {
      if (cancelled) return;
      setLiveState("open");
    };
    ws.onmessage = (ev) => {
      if (cancelled) return;
      try {
        const data = JSON.parse(ev.data as string) as VMAgentMetrics;
        setCurrent(data);
        setError(false);
        setNotYetCollected(false);
      } catch {
        // Malformed frame -- ignore rather than crash the panel.
      }
    };
    ws.onclose = () => {
      if (cancelled) return;
      setLiveState("closed");
    };
    ws.onerror = () => {
      // No usable detail on this event -- onclose above covers it.
    };
    return () => {
      cancelled = true;
      ws.close();
      wsRef.current = null;
    };
  }, [mode, vmId]);

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
          <Radio className="h-4 w-4" /> Metrics
          {mode === "live" && (
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${
                liveState === "open" ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : "bg-slate-100 text-slate-600 ring-slate-200"
              }`}
            >
              {liveState === "connecting" ? "Connecting…" : liveState === "open" ? "Live" : "Disconnected"}
            </span>
          )}
        </h3>
        <div className="flex flex-wrap items-center gap-1">
          <Button variant="outline" size="sm" onClick={() => void load({ manual: true })} disabled={refreshing} title="Refresh now">
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
          </Button>
          <span className="ml-1 text-xs text-slate-500">Refresh</span>
          {MODE_OPTIONS.map((opt) => (
            <Button key={opt.key} size="sm" variant={mode === opt.key ? "default" : "outline"} onClick={() => setMode(opt.key)}>
              {opt.label}
            </Button>
          ))}
        </div>
      </div>
      {error && <p className="text-sm text-slate-500">Failed to load metrics.</p>}
      {notYetCollected && <p className="text-sm text-slate-500">No metrics yet -- install the VM Agent from the Configure tab, then wait a few seconds for its first push.</p>}
      {!error && !notYetCollected && !current && <p className="text-sm text-slate-500">Loading&hellip;</p>}
      {current && (
        <>
          {(current.agent_hostname || current.agent_os) && (
            <p className="mb-3 text-xs text-slate-500">
              {current.agent_hostname && <span className="font-medium text-slate-700">{current.agent_hostname}</span>}
              {current.agent_hostname && (current.agent_os_version || current.agent_kernel_version) && " · "}
              {current.agent_os_version ?? osFamilyLabel(current.agent_os)}
              {current.agent_kernel_version && ` · kernel ${current.agent_kernel_version}`}
            </p>
          )}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <ResourceStat
              label="CPU"
              percent={current.cpu_percent}
              detail={current.cpu_cores !== undefined ? `${current.cpu_cores} cores` : undefined}
            />
            <ResourceStat label="Memory" used={current.memory_used_bytes} total={current.memory_total_bytes} />
            <ResourceStat label="Storage" used={current.storage_used_bytes} total={current.storage_total_bytes} />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <MetricStat label="Load (1m/5m/15m)" value={formatLoad({ one_minute: current.load_1m, five_minutes: current.load_5m, fifteen_minutes: current.load_15m })} />
            <MetricStat label="Uptime" value={formatDuration(current.uptime_seconds, true)} />
            <MetricStat label="Network RX" value={current.network_rx_rate_bytes !== undefined ? `${formatBytes(current.network_rx_rate_bytes)}/s` : "—"} />
            <MetricStat label="Network TX" value={current.network_tx_rate_bytes !== undefined ? `${formatBytes(current.network_tx_rate_bytes)}/s` : "—"} />
          </div>
          <p className="mt-3 text-xs text-slate-500">Last pushed: {formatAgo(current.captured_at)}</p>
        </>
      )}
    </div>
  );
}

// Fallback when the agent reports an OS family but no human-readable
// platform+version string (older agent binary, or a version-lookup
// failure the agent chose not to fail the whole sample over).
function osFamilyLabel(agentOS?: string): string | undefined {
  switch (agentOS) {
    case "windows":
      return "Windows";
    case "linux":
      return "Linux";
    case "darwin":
      return "macOS";
    default:
      return undefined;
  }
}

function formatLoad(load?: { one_minute?: number; five_minutes?: number; fifteen_minutes?: number }): string {
  if (!load || load.one_minute === undefined) return "—";
  const fmt = (n?: number) => (n !== undefined ? n.toFixed(2) : "—");
  return `${fmt(load.one_minute)} / ${fmt(load.five_minutes)} / ${fmt(load.fifteen_minutes)}`;
}

// Total/used/available breakdown for one resource dimension -- not just a
// bare percentage, so an admin can see the real numbers (e.g. "6.2 GB
// used of 8.0 GB") behind the percent at a glance.
function ResourceStat({
  label,
  percent,
  used,
  total,
  available,
  detail,
}: {
  label: string;
  percent?: number;
  used?: number;
  total?: number;
  available?: number;
  detail?: string;
}) {
  const derivedPercent = percent ?? (total !== undefined && total > 0 && used !== undefined ? (used / total) * 100 : undefined);
  const derivedAvailable = available ?? (total !== undefined && used !== undefined ? total - used : undefined);
  return (
    <div className="rounded-md border border-slate-100 bg-slate-50 p-3">
      <div className="flex items-baseline justify-between">
        <span className="text-xs font-medium text-slate-500">{label}</span>
        <span className="text-lg font-semibold text-slate-900">{derivedPercent !== undefined ? `${derivedPercent.toFixed(0)}%` : "—"}</span>
      </div>
      {/* Fill bar: green up to 70%, light orange 70-80%, orange 80-90%,
          red above 90% -- see usageBarColor's own doc comment. */}
      <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-slate-200">
        <div className={`h-full rounded-full transition-all ${usageBarColor(derivedPercent)}`} style={{ width: `${derivedPercent ?? 0}%` }} />
      </div>
      {(used !== undefined || total !== undefined) && (
        <dl className="mt-2 grid grid-cols-3 gap-x-2 text-xs">
          <div>
            <dt className="text-slate-400">Used</dt>
            <dd className="font-medium text-slate-700">{formatBytes(used)}</dd>
          </div>
          <div>
            <dt className="text-slate-400">Available</dt>
            <dd className="font-medium text-slate-700">{formatBytes(derivedAvailable)}</dd>
          </div>
          <div>
            <dt className="text-slate-400">Total</dt>
            <dd className="font-medium text-slate-700">{formatBytes(total)}</dd>
          </div>
        </dl>
      )}
      {detail && <p className="mt-2 text-xs text-slate-500">{detail}</p>}
    </div>
  );
}

function MetricStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-slate-500">{label}</div>
      <div className="text-lg font-semibold text-slate-900">{value}</div>
    </div>
  );
}
