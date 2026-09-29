import type { ObjectStorageDetail } from "@/lib/api";
import { formatBytes } from "@/lib/format";

// Renders nothing at all -- not a "Growth: N/A" placeholder card -- when the
// backend hasn't computed a projection yet (fewer than 7 days of history).
// Absence of the section is the honest signal here, not a fabricated zero.
export function ObjectStorageGrowthProjection({ projection }: { projection: ObjectStorageDetail["growth_projection"] }) {
  if (!projection) return null;

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <h3 className="mb-3 text-sm font-semibold text-slate-900">Growth Projection</h3>
      <dl className="grid grid-cols-2 gap-y-2 text-sm">
        <dt className="text-slate-500">Current</dt>
        <dd className="text-slate-900">{formatBytes(projection.current_bytes)}</dd>
        <dt className="text-slate-500">Growth</dt>
        <dd className="text-slate-900">{formatBytes(projection.growth_bytes_per_day)}/day</dd>
        <dt className="text-slate-500">Estimated 30-day growth</dt>
        <dd className="text-slate-900">{formatBytes(projection.estimated_30d_growth_bytes)}</dd>
      </dl>
      <p className="mt-3 text-xs text-slate-500">Projection based on recent historical growth.</p>
    </div>
  );
}
