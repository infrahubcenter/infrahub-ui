// Shared, non-component monitoring helpers for the central /monitoring
// dashboard (Step 19). Kept separate from the chart components in
// components/infrastructure/ so plain data/routing helpers don't require a
// React import.

// A strict superset of both existing detail pages' own range arrays --
// vms/[id]/monitoring/page.tsx has no explicit range selector (it's a
// straight rolling history), databases/[id]/page.tsx's HISTORY_RANGES is
// 15m/1h/6h/24h/7d, and object-storage/[id]/page.tsx's is 1h/6h/24h/7d.
// Neither existing array includes 30d.
export const RANGE_OPTIONS = [
  { label: "15m", ms: 15 * 60 * 1000 },
  { label: "1h", ms: 60 * 60 * 1000 },
  { label: "6h", ms: 6 * 60 * 60 * 1000 },
  { label: "24h", ms: 24 * 60 * 60 * 1000 },
  { label: "7d", ms: 7 * 24 * 60 * 60 * 1000 },
  { label: "30d", ms: 30 * 24 * 60 * 60 * 1000 },
] as const;

export type MonitoringResourceType = "VM" | "DATABASE" | "OBJECT_STORAGE";

// Routes to the resource's own existing detail page -- no new detail route
// is introduced by Step 19 (decision #3).
export function monitoringResourceHref(resourceType: MonitoringResourceType, id: string): string {
  switch (resourceType) {
    case "VM":
      return `/vms/${id}`;
    case "DATABASE":
      return `/databases/${id}`;
    case "OBJECT_STORAGE":
      return `/object-storage/${id}`;
  }
}

// Renders the literal string "N/A" for a metric that doesn't apply to a
// resource type (e.g. CPU for Object Storage) -- deliberately distinct
// from other "missing value" conventions elsewhere in this app (e.g.
// formatPercent's "—"), per Step 19's explicit "never fabricate a metric"
// requirement.
export function formatMetricOrNA(v: number | null | undefined): string {
  return v === null || v === undefined ? "N/A" : `${v.toFixed(0)}%`;
}
