"use client";

// Shared "how full is this" fill bar -- CPU/Memory/Storage alike, used
// wherever a percentage needs to be more than just a number: colored by
// a 4-tier severity scale rather than a single color, so a glance at the
// bar alone already tells you whether something needs attention.
//   <=70%        green  (healthy)
//   >70% - 80%   light orange/amber (getting full)
//   >80% - 90%   orange (full)
//   >90%         red    (critical)
export function usageBarColor(percent?: number): string {
  if (percent === undefined) return "bg-slate-200";
  if (percent > 90) return "bg-red-500";
  if (percent > 80) return "bg-orange-500";
  if (percent > 70) return "bg-amber-400";
  return "bg-emerald-500";
}

export function UsageBar({
  label,
  percent,
  detail,
  size = "md",
}: {
  label: string;
  percent?: number;
  // Pre-formatted "1.4 GB / 3.7 GB" style text shown under the bar --
  // callers already have the right unit (bytes/cores/etc.), so this
  // stays a plain string rather than this component reaching for a
  // specific formatter.
  detail?: string;
  size?: "sm" | "md";
}) {
  const pct = percent === undefined ? undefined : Math.max(0, Math.min(100, percent));
  const barHeight = size === "sm" ? "h-1.5" : "h-2";
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="font-medium text-slate-600">{label}</span>
        <span className="font-semibold text-slate-900">{pct !== undefined ? `${pct.toFixed(0)}%` : "—"}</span>
      </div>
      <div className={`${barHeight} w-full overflow-hidden rounded-full bg-slate-100`}>
        <div className={`h-full rounded-full transition-all ${usageBarColor(pct)}`} style={{ width: `${pct ?? 0}%` }} />
      </div>
      {detail && <div className="mt-1 text-[11px] text-slate-500">{detail}</div>}
    </div>
  );
}
