import type { OSUpdateStatus, RebootStatus } from "@/lib/api";

// Mirrors docker-status-badge.tsx's shape (Step 8) -- a dedicated small
// badge per Update Center status dimension, since OS-update status and
// reboot status are independent concepts (a VM can be fully UP_TO_DATE
// while still REQUIRED to reboot from an earlier kernel update).

const OS_STATUS_STYLES: Record<OSUpdateStatus, string> = {
  UP_TO_DATE: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  UPDATE_AVAILABLE: "bg-amber-50 text-amber-700 ring-amber-600/20",
  BLOCKED: "bg-red-50 text-red-700 ring-red-600/20",
  UNKNOWN: "bg-slate-100 text-slate-500 ring-slate-400/20",
};

const OS_STATUS_LABEL: Record<OSUpdateStatus, string> = {
  UP_TO_DATE: "Up to Date",
  UPDATE_AVAILABLE: "Update Available",
  BLOCKED: "Blocked",
  UNKNOWN: "Unknown",
};

export function OSUpdateStatusBadge({ status }: { status: OSUpdateStatus }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${OS_STATUS_STYLES[status]}`}>
      {OS_STATUS_LABEL[status]}
    </span>
  );
}

const REBOOT_STYLES: Record<RebootStatus, string> = {
  REQUIRED: "bg-red-50 text-red-700 ring-red-600/20",
  NOT_REQUIRED: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  UNKNOWN: "bg-slate-100 text-slate-500 ring-slate-400/20",
};

const REBOOT_LABEL: Record<RebootStatus, string> = {
  REQUIRED: "Reboot Required",
  NOT_REQUIRED: "No Reboot Needed",
  UNKNOWN: "Unknown",
};

export function RebootStatusBadge({ status }: { status: RebootStatus }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${REBOOT_STYLES[status]}`}>
      {REBOOT_LABEL[status]}
    </span>
  );
}
