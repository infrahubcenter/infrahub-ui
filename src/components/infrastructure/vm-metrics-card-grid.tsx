"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Search, Server } from "lucide-react";
import { Input } from "@/components/ui/input";
import { CARD_THEMES, type CardTheme } from "@/components/infrastructure/monitor-dashboard-widgets";
import { UsageBar } from "@/components/infrastructure/usage-bar";
import { formatBytes } from "@/lib/format";
import { listVMs, getVMAgentMetricsCurrent, getVMAgentStatus, type VM } from "@/lib/api";

// Colorful per-VM card grid for the Metrics tab's landing view -- replaces
// a bare "pick a VM from a name list" table with something that actually
// shows something at a glance (live health + a quick CPU/Mem/Storage
// read), matching the same CARD_THEMES system already used on the main
// Dashboard and the Docker/Kubernetes/VM-detail Monitoring pages. Color
// is assigned by live health/agent-connection rather than arbitrarily,
// so it carries meaning: a VM in trouble visually stands out in the grid
// without having to open it.
// OS family values as the VM Agent itself reports them (protocol.go's
// `os` field) -- "ALL" is this filter row's own extra option, not an
// agent-reported value. A VM whose agent has never pushed a sample (no
// agent_os yet) only ever matches "ALL".
const OS_FILTER_TABS: { key: "ALL" | "linux" | "windows" | "darwin"; label: string }[] = [
  { key: "ALL", label: "All OS" },
  { key: "windows", label: "Windows" },
  { key: "linux", label: "Linux" },
  { key: "darwin", label: "Mac" },
];

function osLabel(agentOS: string | undefined): string | null {
  switch (agentOS) {
    case "windows":
      return "Windows";
    case "linux":
      return "Linux";
    case "darwin":
      return "Mac";
    default:
      return null;
  }
}

export function VMMetricsCardGrid() {
  const [vms, setVms] = useState<VM[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [osFilter, setOsFilter] = useState<(typeof OS_FILTER_TABS)[number]["key"]>("ALL");

  useEffect(() => {
    listVMs()
      .then((res) => setVms(res.vms))
      .catch(() => setError("Failed to load VMs."));
  }, []);

  const filtered = useMemo(() => {
    if (!vms) return [];
    const q = query.trim().toLowerCase();
    return vms
      .filter((vm) => !q || vm.name.toLowerCase().includes(q) || (vm.address ?? "").toLowerCase().includes(q))
      .filter((vm) => osFilter === "ALL" || vm.agent_os === osFilter);
  }, [vms, query, osFilter]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input placeholder="Search VMs" className="pl-8" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {OS_FILTER_TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setOsFilter(tab.key)}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                osFilter === tab.key ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {vms !== null && filtered.length === 0 && (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center">
          <Server className="mx-auto mb-3 h-8 w-8 text-slate-300" />
          <p className="text-sm font-medium text-slate-700">{vms.length === 0 ? "No VMs to show." : "No VMs match your search."}</p>
          {vms.length === 0 && <p className="mt-1 text-sm text-slate-500">Connect a VM from the Configure tab, or register one from the Virtual Machine tab.</p>}
        </div>
      )}

      {filtered.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((vm) => (
            <VMMetricsCard key={vm.id} vm={vm} />
          ))}
        </div>
      )}
    </div>
  );
}

// The shape the VM Agent's push-based series gets normalized into before
// rendering.
type QuickMetrics = {
  cpuPercent?: number;
  cpuCores?: number;
  memUsed?: number;
  memTotal?: number;
  storageUsed?: number;
  storageTotal?: number;
};

function VMMetricsCard({ vm }: { vm: VM }) {
  const [metrics, setMetrics] = useState<QuickMetrics | null>(null);
  const [theme, setTheme] = useState<CardTheme>(CARD_THEMES.sky);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // Every card in this section is agent/Docker-based, regardless of
    // whether the underlying VM also happens to have SSH configured
    // elsewhere (the Virtual Machine tab) -- this section never reads
    // the SSH-collected series. Card color reflects the agent's own
    // connection state.
    Promise.all([getVMAgentMetricsCurrent(vm.id).catch(() => null), getVMAgentStatus(vm.id).catch(() => null)]).then(([current, status]) => {
      if (cancelled) return;
      setMetrics(
        current && {
          cpuPercent: current.cpu_percent,
          cpuCores: current.cpu_cores,
          memUsed: current.memory_used_bytes,
          memTotal: current.memory_total_bytes,
          storageUsed: current.storage_used_bytes,
          storageTotal: current.storage_total_bytes,
        }
      );
      setTheme(status?.connected ? CARD_THEMES.emerald : status?.installed ? CARD_THEMES.amber : CARD_THEMES.sky);
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [vm.id]);

  return (
    <Link
      href={`/vms/metrics/${vm.id}`}
      className={`flex flex-col gap-3 rounded-lg border border-t-4 border-slate-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md ${theme.border}`}
    >
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-1.5">
            <p className="font-medium text-slate-900">{vm.name}</p>
            {osLabel(vm.agent_os) && (
              <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">{osLabel(vm.agent_os)}</span>
            )}
          </div>
          <p className="text-xs text-slate-500">{vm.workspace}</p>
        </div>
        <span className={`flex h-8 w-8 items-center justify-center rounded-full ${theme.badgeBg}`}>
          <Server className={`h-4 w-4 ${theme.badgeText}`} />
        </span>
      </div>

      {!loaded && <p className="text-xs text-slate-400">Loading&hellip;</p>}
      {loaded && !metrics && <p className="text-xs text-slate-400">No metrics yet</p>}
      {metrics && (
        <div className="flex flex-col gap-2">
          <UsageBar label="CPU" percent={metrics.cpuPercent} detail={metrics.cpuCores !== undefined ? `${metrics.cpuCores} cores` : undefined} size="sm" />
          <UsageBar
            label="Memory"
            percent={metrics.memUsed !== undefined && metrics.memTotal ? (metrics.memUsed / metrics.memTotal) * 100 : undefined}
            detail={metrics.memUsed !== undefined && metrics.memTotal !== undefined ? `${formatBytes(metrics.memUsed)} / ${formatBytes(metrics.memTotal)}` : undefined}
            size="sm"
          />
          <UsageBar
            label="Storage"
            percent={metrics.storageUsed !== undefined && metrics.storageTotal ? (metrics.storageUsed / metrics.storageTotal) * 100 : undefined}
            detail={
              metrics.storageUsed !== undefined && metrics.storageTotal !== undefined
                ? `${formatBytes(metrics.storageUsed)} / ${formatBytes(metrics.storageTotal)}`
                : undefined
            }
            size="sm"
          />
        </div>
      )}
    </Link>
  );
}
