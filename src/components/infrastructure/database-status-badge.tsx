import type { DatabaseConnectionStatus } from "@/lib/api";

// Standalone databases connect directly over TCP/TLS -- there is no
// installed/running "service status" dimension anymore (that only made
// sense for a VM-attached database reached over SSH). Connection status
// (reachable/authenticated/TLS) is the only status dimension here besides
// HealthStatus (metrics-derived), which reuses HealthBadge unchanged.

const CONNECTION_STYLES: Record<DatabaseConnectionStatus, string> = {
  CONNECTED: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  AUTH_FAILED: "bg-red-50 text-red-700 ring-red-600/20",
  TIMEOUT: "bg-amber-50 text-amber-700 ring-amber-600/20",
  REFUSED: "bg-red-50 text-red-700 ring-red-600/20",
  TLS_ERROR: "bg-red-50 text-red-700 ring-red-600/20",
  UNAVAILABLE: "bg-slate-100 text-slate-600 ring-slate-400/20",
  UNKNOWN: "bg-slate-100 text-slate-500 ring-slate-400/20",
};

const CONNECTION_LABEL: Record<DatabaseConnectionStatus, string> = {
  CONNECTED: "Connected",
  AUTH_FAILED: "Auth Failed",
  TIMEOUT: "Timeout",
  REFUSED: "Refused",
  TLS_ERROR: "TLS Error",
  UNAVAILABLE: "Unavailable",
  UNKNOWN: "Unknown",
};

export function DatabaseConnectionStatusBadge({ status }: { status: DatabaseConnectionStatus }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${CONNECTION_STYLES[status]}`}
    >
      {CONNECTION_LABEL[status]}
    </span>
  );
}
