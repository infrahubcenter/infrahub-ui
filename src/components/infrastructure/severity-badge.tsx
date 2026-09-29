// Recommendation severity (LOW/MEDIUM/HIGH/CRITICAL/UNKNOWN, Step 7) and
// Alert severity (INFO/WARNING/CRITICAL, Step 16) are two different closed
// vocabularies sharing one visual language -- extended into a single union
// here rather than duplicating the badge for alerts.
type Severity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" | "UNKNOWN" | "INFO" | "WARNING";

const SEVERITY_STYLES: Record<Severity, string> = {
  INFO: "bg-sky-50 text-sky-700 ring-sky-600/20",
  LOW: "bg-sky-50 text-sky-700 ring-sky-600/20",
  MEDIUM: "bg-amber-50 text-amber-700 ring-amber-600/20",
  WARNING: "bg-amber-50 text-amber-700 ring-amber-600/20",
  HIGH: "bg-orange-50 text-orange-700 ring-orange-600/20",
  CRITICAL: "bg-red-50 text-red-700 ring-red-600/20",
  UNKNOWN: "bg-slate-100 text-slate-500 ring-slate-400/20",
};

const SEVERITY_LABEL: Record<Severity, string> = {
  INFO: "Info",
  LOW: "Low",
  MEDIUM: "Medium",
  WARNING: "Warning",
  HIGH: "High",
  CRITICAL: "Critical",
  UNKNOWN: "Unknown",
};

export function SeverityBadge({ severity }: { severity: Severity }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${SEVERITY_STYLES[severity]}`}>
      {SEVERITY_LABEL[severity]}
    </span>
  );
}
