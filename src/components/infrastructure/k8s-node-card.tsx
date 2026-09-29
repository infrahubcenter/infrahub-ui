"use client";

import { Server } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatBytes, formatPercent } from "@/lib/format";
import type { K8sNode } from "@/lib/api";

// Per-node CPU/Memory/Storage/Pods detail card -- shared by the standalone
// admin Cluster Detail page (/k8s/clusters/[id]) and the Monitoring>
// Kubernetes dashboard's Nodes tab, so "all resources in the cluster with
// detailed usage" looks and reads identically in both places.
export function K8sNodeCard({ node }: { node: K8sNode }) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2 font-medium text-slate-900">
            <Server className="h-4 w-4" /> {node.name}
          </div>
          {node.roles && node.roles.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1">
              {node.roles.map((role) => (
                <Badge key={role} variant="secondary" className="text-[10px]">
                  {role}
                </Badge>
              ))}
            </div>
          )}
        </div>
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${
            node.ready ? "bg-emerald-50 text-emerald-700 ring-emerald-600/20" : "bg-red-50 text-red-700 ring-red-600/20"
          }`}
        >
          {node.ready ? "Ready" : "Not Ready"}
        </span>
      </div>

      <K8sUsageBar
        label="CPU"
        percent={node.cpu_usage_percent}
        detail={`${(node.cpu_usage_millicores ?? 0) / 1000}/${(node.cpu_allocatable_millicores / 1000).toFixed(1)} cores`}
      />
      <K8sUsageBar
        label="Memory"
        percent={node.memory_usage_percent}
        detail={`${formatBytes(node.memory_usage_bytes)} / ${formatBytes(node.memory_allocatable_bytes)}`}
      />
      <K8sUsageBar
        label="Storage"
        percent={node.storage_usage_percent}
        detail={node.storage_usage_bytes !== undefined ? `${formatBytes(node.storage_usage_bytes)} / ${formatBytes(node.storage_capacity_bytes)}` : "Not available"}
      />

      <div className="flex items-center justify-between text-xs text-slate-500">
        <span>
          Pods: {node.pod_count}
          {node.pod_capacity ? ` / ${node.pod_capacity}` : ""}
        </span>
        {node.kubelet_version && <span>kubelet {node.kubelet_version}</span>}
      </div>
    </div>
  );
}

export function K8sUsageBar({ label, percent, detail }: { label: string; percent?: number; detail?: string }) {
  const pct = percent === undefined ? undefined : Math.max(0, Math.min(100, percent));
  const barColor = pct === undefined ? "bg-slate-200" : pct >= 90 ? "bg-red-500" : pct >= 75 ? "bg-amber-500" : "bg-emerald-500";
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs text-slate-600">
        <span>{label}</span>
        <span>{formatPercent(pct)}</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full rounded-full ${barColor}`} style={{ width: `${pct ?? 0}%` }} />
      </div>
      {detail && <div className="mt-0.5 text-[11px] text-slate-400">{detail}</div>}
    </div>
  );
}
