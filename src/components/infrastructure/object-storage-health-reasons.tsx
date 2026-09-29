import { HealthBadge } from "@/components/infrastructure/health-badge";
import type { HealthStatus } from "@/lib/api";

// Top-level "is this thing okay" summary for the detail page header: the
// shared HealthBadge (same component VMs/Databases use) plus, only when the
// backend actually returned reasons, a short bulleted list mirroring the
// spec's example structure (badge, then "Reasons:", then a dash list). No
// reasons -- healthy or simply not yet evaluated -- renders no "Reasons:"
// section at all, never an empty label or an invented "No issues" line.
export function ObjectStorageHealthReasons({ status, reasons }: { status?: HealthStatus; reasons?: string[] }) {
  return (
    <div className="flex flex-col gap-1.5">
      <HealthBadge status={status ?? "UNKNOWN"} />
      {reasons && reasons.length > 0 && (
        <div className="text-xs text-slate-500">
          <span className="font-medium text-slate-600">Reasons:</span>
          <ul className="ml-4 list-disc text-slate-600">
            {reasons.map((reason, i) => (
              <li key={i}>{reason}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
