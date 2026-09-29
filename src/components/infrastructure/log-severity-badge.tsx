import type { LogSeverity } from "@/lib/api";

// Shared Healthy/Warning/Error/Critical palette -- used by both the log
// history search panel and the live-tail views (Docker + K8s), so a line
// looks the same whether it arrived live or was found in history.

const SEVERITY_STYLES: Record<LogSeverity, string> = {
  HEALTHY: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  WARNING: "bg-amber-50 text-amber-700 ring-amber-600/20",
  ERROR: "bg-red-50 text-red-700 ring-red-600/20",
  CRITICAL: "bg-red-100 text-red-800 ring-red-700/30",
};

const SEVERITY_LABEL: Record<LogSeverity, string> = {
  HEALTHY: "Healthy",
  WARNING: "Warning",
  ERROR: "Error",
  CRITICAL: "Critical",
};

export function LogSeverityBadge({ severity }: { severity: LogSeverity }) {
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium uppercase ring-1 ring-inset ${SEVERITY_STYLES[severity]}`}>
      {SEVERITY_LABEL[severity]}
    </span>
  );
}
