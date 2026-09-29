import type { HealthStatus } from "@/lib/api";

// Deliberately a different palette/vocabulary from StatusBadge
// (ResourceStatus): monitoring health and connection/resource status are
// independent dimensions (Step 6 spec #35/#36) and must never be visually
// conflated -- a VM can be CONNECTED (StatusBadge: Online) while its
// health is CRITICAL (disk almost full).
const HEALTH_STYLES: Record<HealthStatus, string> = {
  HEALTHY: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  WARNING: "bg-amber-50 text-amber-700 ring-amber-600/20",
  CRITICAL: "bg-red-50 text-red-700 ring-red-600/20",
  UNKNOWN: "bg-slate-100 text-slate-500 ring-slate-400/20",
  OFFLINE: "bg-slate-100 text-slate-600 ring-slate-500/20",
};

const HEALTH_DOT: Record<HealthStatus, string> = {
  HEALTHY: "bg-emerald-500",
  WARNING: "bg-amber-500",
  CRITICAL: "bg-red-500",
  UNKNOWN: "bg-slate-300",
  OFFLINE: "bg-slate-400",
};

const HEALTH_LABEL: Record<HealthStatus, string> = {
  HEALTHY: "Healthy",
  WARNING: "Warning",
  CRITICAL: "Critical",
  UNKNOWN: "Unknown",
  OFFLINE: "Offline",
};

export function HealthBadge({ status }: { status: HealthStatus }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${HEALTH_STYLES[status]}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${HEALTH_DOT[status]}`} />
      {HEALTH_LABEL[status]}
    </span>
  );
}
