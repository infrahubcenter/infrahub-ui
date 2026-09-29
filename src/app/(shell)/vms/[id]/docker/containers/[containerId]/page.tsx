"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Play, Square } from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { DockerContainerStatusBadge, DockerHealthBadge } from "@/components/infrastructure/docker-status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatAgo, formatBytes, formatPercent, formatRate } from "@/lib/format";
import {
  ApiError,
  dockerContainerStatsStreamUrl,
  getDockerContainer,
  getDockerContainerMetricsCurrent,
  type DockerContainer,
  type DockerContainerMetric,
} from "@/lib/api";

// Rolling client-side window for the live chart -- bounded so a
// long-running live-metrics session never grows memory unbounded (spec:
// "rolling charts capped at 60-120 client-side samples").
const MAX_LIVE_SAMPLES = 120;

export default function VMDockerContainerPage() {
  const params = useParams<{ id: string; containerId: string }>();
  const vmId = params.id;
  const containerId = params.containerId;

  const [container, setContainer] = useState<DockerContainer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [latest, setLatest] = useState<DockerContainerMetric | null>(null);
  const [live, setLive] = useState(false);
  const [liveSamples, setLiveSamples] = useState<DockerContainerMetric[]>([]);
  const [connectionState, setConnectionState] = useState<"idle" | "connecting" | "open" | "closed">("idle");
  const wsRef = useRef<WebSocket | null>(null);

  const loadContainer = useCallback(() => {
    getDockerContainer(vmId, containerId)
      .then(setContainer)
      .catch((err) => setError(err instanceof ApiError && err.status === 404 ? "Container not found." : "Failed to load container."));
  }, [vmId, containerId]);

  const loadCurrent = useCallback(() => {
    getDockerContainerMetricsCurrent(vmId, containerId)
      .then(setLatest)
      .catch(() => setLatest(null));
  }, [vmId, containerId]);

  useEffect(() => {
    // Load-on-mount/param-change: no external store to subscribe to.

    loadContainer();
    loadCurrent();
  }, [loadContainer, loadCurrent]);

  // The WebSocket connection is entirely owned by this effect: toggling
  // `live` off (or navigating away) always closes it, so a viewer never
  // leaves a stale connection open. This never opens a new SSH
  // connection or duplicates the backend's collector -- it only reads
  // the shared DockerMetricsCache the backend's own scheduler already
  // populates (see docs/docker-monitoring.md).
  useEffect(() => {
    if (!live) {
      wsRef.current?.close();
      wsRef.current = null;
      // Resets the connection-state label back to "idle" the moment the
      // viewer toggles live metrics off; there is no external system to
      // subscribe to in this branch, only a teardown.
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
    const ws = new WebSocket(dockerContainerStatsStreamUrl(vmId, containerId));
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
        const data = JSON.parse(ev.data as string) as DockerContainerMetric & { type?: string };
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
  }, [live, vmId, containerId]);

  const cpuSeries = useMemo(() => liveSamples.map((s) => ({ t: chartTime(s.captured_at), v: s.cpu_percent ?? null })), [liveSamples]);
  const memorySeries = useMemo(() => liveSamples.map((s) => ({ t: chartTime(s.captured_at), v: s.memory_percent ?? null })), [liveSamples]);
  const networkSeries = useMemo(
    () => liveSamples.map((s) => ({ t: chartTime(s.captured_at), rx: s.network_rx_bytes ?? null, tx: s.network_tx_bytes ?? null })),
    [liveSamples]
  );

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!container) return <p className="text-sm text-slate-500">Loading&hellip;</p>;

  const display = liveSamples.length > 0 ? liveSamples[liveSamples.length - 1] : latest;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link href={`/vms/${vmId}/docker`} className="flex w-fit items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
          <ArrowLeft className="h-4 w-4" /> Back to Docker
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
              {container.name}
              <DockerContainerStatusBadge status={container.status} />
              {container.health && <DockerHealthBadge health={container.health} />}
            </h2>
            <p className="text-sm text-slate-500">
              {container.image}
              {container.image_tag ? `:${container.image_tag}` : ""}
              {container.command ? ` · ${container.command}` : ""}
            </p>
          </div>
          <Button
            size="sm"
            variant={live ? "outline" : "default"}
            onClick={() => setLive((v) => !v)}
            disabled={container.status !== "RUNNING"}
          >
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
        {live && (
          <p className="text-xs text-slate-500">
            {connectionState === "connecting" && "Connecting…"}
            {connectionState === "open" && "Streaming live metrics."}
            {connectionState === "closed" && "Connection closed."}
          </p>
        )}
        {container.status !== "RUNNING" && <p className="text-xs text-slate-500">Metrics are only collected for running containers.</p>}
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <TopCard label="CPU" value={formatPercent(display?.cpu_percent)} />
        <TopCard
          label="Memory"
          value={formatPercent(display?.memory_percent)}
          sub={display?.memory_usage_bytes !== undefined ? formatBytes(display.memory_usage_bytes) : undefined}
        />
        <TopCard label="Network RX/TX" value={`${formatRate(display?.network_rx_bytes)} / ${formatRate(display?.network_tx_bytes)}`} />
        <TopCard label="PIDs" value={display?.pids !== undefined ? String(display.pids) : "—"} />
      </div>

      {display?.stale && <p className="text-xs text-amber-600">Metrics may be stale (last captured {formatAgo(display.captured_at)}).</p>}

      {live && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <ChartCard title="CPU %">
            <PercentLineChart data={cpuSeries} color="#0ea5e9" />
          </ChartCard>
          <ChartCard title="Memory %">
            <PercentLineChart data={memorySeries} color="#8b5cf6" />
          </ChartCard>
          <ChartCard title="Network I/O (cumulative)">
            <NetworkLineChart data={networkSeries} />
          </ChartCard>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <h3 className="mb-3 text-sm font-semibold text-slate-900">Ports</h3>
          {!container.ports || container.ports.length === 0 ? (
            <p className="text-sm text-slate-500">No published ports.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Container</TableHead>
                  <TableHead>Host</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {container.ports.map((p, i) => (
                  <TableRow key={i}>
                    <TableCell className="text-slate-600">
                      {p.container_port}/{p.protocol}
                    </TableCell>
                    <TableCell className="text-slate-600">{p.host_port ? `${p.host_ip ?? "0.0.0.0"}:${p.host_port}` : "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <h3 className="mb-3 text-sm font-semibold text-slate-900">Networks</h3>
          {!container.networks || container.networks.length === 0 ? (
            <p className="text-sm text-slate-500">No network attachments.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Network</TableHead>
                  <TableHead>IP Address</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {container.networks.map((n) => (
                  <TableRow key={n.network_name}>
                    <TableCell className="text-slate-600">{n.network_name}</TableCell>
                    <TableCell className="text-slate-600">{n.ip_address ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <h3 className="mb-3 text-sm font-semibold text-slate-900">Mounts</h3>
        {!container.mounts || container.mounts.length === 0 ? (
          <p className="text-sm text-slate-500">No mounts.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Source</TableHead>
                <TableHead>Destination</TableHead>
                <TableHead>Read Only</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {container.mounts.map((m, i) => (
                <TableRow key={i}>
                  <TableCell className="font-mono text-xs text-slate-500">{m.source}</TableCell>
                  <TableCell className="font-mono text-xs text-slate-500">{m.destination}</TableCell>
                  <TableCell>{m.read_only ? <Badge variant="secondary">Yes</Badge> : <Badge variant="outline">No</Badge>}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}

function chartTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
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
    return <div className="flex h-full items-center justify-center text-sm text-slate-400">Waiting for data&hellip;</div>;
  }
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis dataKey="t" fontSize={11} tickLine={false} axisLine={{ stroke: "#e2e8f0" }} />
        <YAxis domain={[0, 100]} fontSize={11} tickLine={false} axisLine={false} width={36} />
        <Tooltip formatter={(value) => (value === null || value === undefined ? "N/A" : `${Number(value).toFixed(1)}%`)} />
        <Line type="monotone" dataKey="v" stroke={color} strokeWidth={2} dot={false} isAnimationActive={false} connectNulls={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

function NetworkLineChart({ data }: { data: { t: string; rx: number | null; tx: number | null }[] }) {
  if (data.length === 0) {
    return <div className="flex h-full items-center justify-center text-sm text-slate-400">Waiting for data&hellip;</div>;
  }
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis dataKey="t" fontSize={11} tickLine={false} axisLine={{ stroke: "#e2e8f0" }} />
        <YAxis fontSize={11} tickLine={false} axisLine={false} width={48} tickFormatter={(v: number) => formatBytes(v)} />
        <Tooltip formatter={(value) => (value === null || value === undefined ? "N/A" : formatBytes(Number(value)))} />
        <Line type="monotone" dataKey="rx" name="RX" stroke="#0ea5e9" strokeWidth={2} dot={false} isAnimationActive={false} connectNulls={false} />
        <Line type="monotone" dataKey="tx" name="TX" stroke="#f97316" strokeWidth={2} dot={false} isAnimationActive={false} connectNulls={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}
