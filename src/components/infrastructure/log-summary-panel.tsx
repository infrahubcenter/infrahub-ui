"use client";

import { useMemo } from "react";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import type { LogSearchResult } from "@/lib/api";

const SEVERITY_COLOR: Record<"healthy" | "warning" | "error" | "critical", string> = {
  healthy: "#10b981",
  warning: "#f59e0b",
  error: "#ef4444",
  critical: "#991b1b",
};

// A category is only set on flagged (non-healthy) lines -- see
// services.ClassifyLogLine on the backend (CRASH, AUTH_SECURITY,
// HTTP_404_NOT_FOUND, etc). Tallying it client-side over the currently
// loaded page of lines gives an honest "what kind of trouble is showing up
// most" breakdown without inventing data the backend doesn't have.
function topCategories(result: LogSearchResult, max = 5): { category: string; count: number }[] {
  const tally = new Map<string, number>();
  for (const line of result.lines) {
    if (!line.category) continue;
    tally.set(line.category, (tally.get(line.category) ?? 0) + 1);
  }
  return [...tally.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, max)
    .map(([category, count]) => ({ category, count }));
}

// Buckets the currently loaded page of lines into evenly-sized time
// windows spanning their timestamps -- a lightweight "activity over time"
// view computed entirely client-side from what's already on screen (the
// search endpoint has no time-bucketed aggregate of its own), so it always
// reflects the current page rather than the full matching set.
function activityBuckets(result: LogSearchResult, bucketCount = 10) {
  if (result.lines.length === 0) return [];
  const times = result.lines.map((l) => new Date(l.logged_at).getTime());
  const min = Math.min(...times);
  const max = Math.max(...times);
  const span = Math.max(max - min, 1);
  const buckets = Array.from({ length: bucketCount }, () => ({
    label: "",
    healthy: 0,
    warning: 0,
    error: 0,
    critical: 0,
  }));
  for (const line of result.lines) {
    const t = new Date(line.logged_at).getTime();
    const idx = Math.min(bucketCount - 1, Math.floor(((t - min) / span) * bucketCount));
    const key = line.severity.toLowerCase() as "healthy" | "warning" | "error" | "critical";
    buckets[idx][key] += 1;
  }
  return buckets;
}

export function LogSummaryPanel({ result, windowLabel }: { result: LogSearchResult | null; windowLabel: string }) {
  const categories = useMemo(() => (result ? topCategories(result) : []), [result]);
  const activity = useMemo(() => (result ? activityBuckets(result) : []), [result]);

  return (
    <div className="flex w-full flex-col gap-4 rounded-lg border border-slate-200 bg-white p-4 lg:w-70">
      <div>
        <h3 className="text-sm font-semibold text-slate-900">Log Summary</h3>
        <p className="text-xs text-slate-500">{windowLabel}</p>
      </div>

      {!result ? (
        <p className="text-xs text-slate-500">Run a search in Log History, Error Logs, or Filter Logs to see a summary here.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2">
            <SummaryTile label="Total" value={result.total} />
            <SummaryTile label="Healthy" value={result.counts.healthy} color="text-emerald-600" />
            <SummaryTile label="Warnings" value={result.counts.warning} color="text-amber-600" />
            <SummaryTile label="Errors" value={result.counts.error + result.counts.critical} color="text-red-600" />
          </div>

          <div>
            <p className="mb-2 text-xs font-medium text-slate-600">Activity (this page)</p>
            <div className="h-24 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={activity} barCategoryGap={2}>
                  <XAxis dataKey="label" hide />
                  <Tooltip cursor={{ fill: "rgba(15, 23, 42, 0.04)" }} labelFormatter={() => ""} />
                  <Bar dataKey="healthy" stackId="a" fill={SEVERITY_COLOR.healthy} />
                  <Bar dataKey="warning" stackId="a" fill={SEVERITY_COLOR.warning} />
                  <Bar dataKey="error" stackId="a" fill={SEVERITY_COLOR.error} />
                  <Bar dataKey="critical" stackId="a" fill={SEVERITY_COLOR.critical} radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-medium text-slate-600">Top Categories</p>
            {categories.length === 0 ? (
              <p className="text-xs text-slate-400">No flagged lines on this page.</p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {categories.map((c) => (
                  <li key={c.category} className="flex items-center justify-between text-xs">
                    <span className="truncate text-slate-600">{c.category.replaceAll("_", " ")}</span>
                    <span className="font-medium text-slate-900">{c.count}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function SummaryTile({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div className="rounded-md border border-slate-100 bg-slate-50 p-2">
      <p className="text-[11px] text-slate-500">{label}</p>
      <p className={`text-base font-semibold ${color ?? "text-slate-900"}`}>{value}</p>
    </div>
  );
}
