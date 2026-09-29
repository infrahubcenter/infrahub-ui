import type { ObjectStorageConnectionStatus } from "@/lib/api";

// Object storage's connection status is an 8-value enum, distinct from
// DatabaseConnectionStatus's 7 values (ACCESS_DENIED/NOT_FOUND replace
// REFUSED) -- kept as its own map/component rather than reusing
// DatabaseConnectionStatusBadge, mirroring that component's exact styling
// convention (rounded pill, ring-inset, no dot indicator).

const CONNECTION_STYLES: Record<ObjectStorageConnectionStatus, string> = {
  CONNECTED: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  AUTH_FAILED: "bg-red-50 text-red-700 ring-red-600/20",
  ACCESS_DENIED: "bg-red-50 text-red-700 ring-red-600/20",
  UNAVAILABLE: "bg-red-50 text-red-700 ring-red-600/20",
  TLS_ERROR: "bg-red-50 text-red-700 ring-red-600/20",
  TIMEOUT: "bg-amber-50 text-amber-700 ring-amber-600/20",
  NOT_FOUND: "bg-amber-50 text-amber-700 ring-amber-600/20",
  UNKNOWN: "bg-slate-100 text-slate-500 ring-slate-400/20",
};

const CONNECTION_LABEL: Record<ObjectStorageConnectionStatus, string> = {
  CONNECTED: "Connected",
  AUTH_FAILED: "Auth Failed",
  ACCESS_DENIED: "Access Denied",
  NOT_FOUND: "Not Found",
  TIMEOUT: "Timeout",
  TLS_ERROR: "TLS Error",
  UNAVAILABLE: "Unavailable",
  UNKNOWN: "Unknown",
};

export function ObjectStorageStatusBadge({ status }: { status: ObjectStorageConnectionStatus }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${CONNECTION_STYLES[status]}`}
    >
      {CONNECTION_LABEL[status]}
    </span>
  );
}
