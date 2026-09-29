import type { MonitoringAvailability } from "@/lib/api";

// Decision #6 (Step 19): a normalized field distinct from HealthStatus --
// VM/Database/Object Storage each have their own connection-status
// vocabulary (ResourceStatus, the 7-value ConnectionTestStatus, the
// 8-value ObjectStorageConnectionStatus), collapsed by the backend into
// this one closed AVAILABLE/UNAVAILABLE/UNKNOWN union so the unified
// resource table's Availability column never has to branch per type.
// Deliberately its own badge (not a reuse of HealthBadge/StatusBadge) --
// availability and health are independent dimensions of a resource, same
// reasoning as HealthBadge's own comment about not conflating with
// StatusBadge.
const AVAILABILITY_STYLES: Record<MonitoringAvailability, string> = {
  AVAILABLE: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  UNAVAILABLE: "bg-red-50 text-red-700 ring-red-600/20",
  UNKNOWN: "bg-slate-100 text-slate-500 ring-slate-400/20",
};

const AVAILABILITY_DOT: Record<MonitoringAvailability, string> = {
  AVAILABLE: "bg-emerald-500",
  UNAVAILABLE: "bg-red-500",
  UNKNOWN: "bg-slate-300",
};

const AVAILABILITY_LABEL: Record<MonitoringAvailability, string> = {
  AVAILABLE: "Available",
  UNAVAILABLE: "Unavailable",
  UNKNOWN: "Unknown",
};

export function AvailabilityBadge({ availability }: { availability: MonitoringAvailability }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${AVAILABILITY_STYLES[availability]}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${AVAILABILITY_DOT[availability]}`} />
      {AVAILABILITY_LABEL[availability]}
    </span>
  );
}
