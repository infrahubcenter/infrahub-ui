import type { K8sClusterConnectionStatus, K8sOverviewPod } from "@/lib/api";

// Mirrors docker-status-badge.tsx's palette/shape -- dedicated small
// badges per K8s-specific status dimension.

const POD_PHASE_STYLES: Record<K8sOverviewPod["phase"], string> = {
  RUNNING: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  PENDING: "bg-amber-50 text-amber-700 ring-amber-600/20",
  SUCCEEDED: "bg-sky-50 text-sky-700 ring-sky-600/20",
  FAILED: "bg-red-50 text-red-700 ring-red-600/20",
  UNKNOWN: "bg-slate-100 text-slate-500 ring-slate-400/20",
};

export function K8sPodPhaseBadge({ phase }: { phase: K8sOverviewPod["phase"] }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium capitalize ring-1 ring-inset ${POD_PHASE_STYLES[phase]}`}>
      {phase.toLowerCase()}
    </span>
  );
}

const CONNECTION_STYLES: Record<K8sClusterConnectionStatus, string> = {
  CONNECTED: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  AUTH_FAILED: "bg-red-50 text-red-700 ring-red-600/20",
  TIMEOUT: "bg-amber-50 text-amber-700 ring-amber-600/20",
  REFUSED: "bg-red-50 text-red-700 ring-red-600/20",
  TLS_ERROR: "bg-red-50 text-red-700 ring-red-600/20",
  UNAVAILABLE: "bg-red-50 text-red-700 ring-red-600/20",
  UNKNOWN: "bg-slate-100 text-slate-500 ring-slate-400/20",
};

const CONNECTION_LABEL: Record<K8sClusterConnectionStatus, string> = {
  CONNECTED: "Connected",
  AUTH_FAILED: "Auth Failed",
  TIMEOUT: "Timeout",
  REFUSED: "Refused",
  TLS_ERROR: "TLS Error",
  UNAVAILABLE: "Unavailable",
  UNKNOWN: "Unknown",
};

export function K8sConnectionStatusBadge({ status }: { status: K8sClusterConnectionStatus }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${CONNECTION_STYLES[status]}`}>
      {CONNECTION_LABEL[status]}
    </span>
  );
}
