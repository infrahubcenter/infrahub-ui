import type { ResourceStatus } from "@/lib/api";

const STATUS_STYLES: Record<ResourceStatus, string> = {
  ONLINE: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  OFFLINE: "bg-slate-100 text-slate-600 ring-slate-500/20",
  WARNING: "bg-amber-50 text-amber-700 ring-amber-600/20",
  ERROR: "bg-red-50 text-red-700 ring-red-600/20",
  DISABLED: "bg-slate-100 text-slate-400 ring-slate-400/20",
  UNKNOWN: "bg-slate-100 text-slate-500 ring-slate-400/20",
};

const STATUS_DOT: Record<ResourceStatus, string> = {
  ONLINE: "bg-emerald-500",
  OFFLINE: "bg-slate-400",
  WARNING: "bg-amber-500",
  ERROR: "bg-red-500",
  DISABLED: "bg-slate-300",
  UNKNOWN: "bg-slate-300",
};

function label(status: ResourceStatus): string {
  return status.charAt(0) + status.slice(1).toLowerCase();
}

export function StatusBadge({ status }: { status: ResourceStatus }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${STATUS_STYLES[status]}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[status]}`} />
      {label(status)}
    </span>
  );
}
