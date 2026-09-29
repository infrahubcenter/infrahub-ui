"use client";

import type { ComponentType } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

// Small, shared dashboard widgets for the top-level Docker/Kubernetes/VM
// Monitoring pages -- built entirely from data already returned by
// /api/docker/overview, /api/k8s/overview, etc. (no new backend
// endpoints), so every number here is real, just aggregated/visualized
// rather than shown as a per-container/per-pod list only.

// The same colored-top-border + colored-icon-badge treatment the main
// Dashboard page (app/(shell)/page.tsx) already uses for its own stat
// cards -- hoisted here so every Monitoring dashboard's StatCard grid can
// share one definition instead of each page (or nobody) inventing its
// own. Optional on StatCard: omitting `theme` keeps the original flat
// look, so no existing caller is forced to adopt a color.
export type CardTheme = { badgeBg: string; badgeText: string; border: string };

// Grouped by resource *category* (not arbitrary) so color carries some
// meaning across Docker/K8s/VM alike -- e.g. every workload-family count
// (Deployments/Jobs/...) reads as the same color everywhere it appears.
export const CARD_THEMES = {
  indigo: { badgeBg: "bg-indigo-100", badgeText: "text-indigo-600", border: "border-t-indigo-400" },
  sky: { badgeBg: "bg-sky-100", badgeText: "text-sky-600", border: "border-t-sky-400" },
  emerald: { badgeBg: "bg-emerald-100", badgeText: "text-emerald-600", border: "border-t-emerald-400" },
  amber: { badgeBg: "bg-amber-100", badgeText: "text-amber-600", border: "border-t-amber-400" },
  cyan: { badgeBg: "bg-cyan-100", badgeText: "text-cyan-600", border: "border-t-cyan-400" },
  violet: { badgeBg: "bg-violet-100", badgeText: "text-violet-600", border: "border-t-violet-400" },
  rose: { badgeBg: "bg-rose-100", badgeText: "text-rose-600", border: "border-t-rose-400" },
} as const satisfies Record<string, CardTheme>;

export function StatCard({
  label,
  value,
  sublabel,
  icon: Icon,
  onClick,
  theme,
}: {
  label: string;
  value: string | number;
  sublabel?: string;
  icon: ComponentType<{ className?: string }>;
  // When provided, the whole card becomes a button -- used for stat
  // cards that can drill into the actual list behind the count (e.g.
  // "Namespaces: 6" -> the 6 namespace names).
  onClick?: () => void;
  // Colored top border + icon badge (see CARD_THEMES) -- omit to keep
  // the original flat grey/white/black look.
  theme?: CardTheme;
}) {
  if (theme) {
    const themedClassName = `rounded-lg border border-t-4 border-slate-200 bg-white p-4 shadow-sm transition-shadow ${onClick ? "text-left hover:shadow-md" : ""} ${theme.border}`;
    const themedContent = (
      <>
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-slate-500">{label}</span>
          <span className={`flex h-8 w-8 items-center justify-center rounded-full ${theme.badgeBg}`}>
            <Icon className={`h-4 w-4 ${theme.badgeText}`} />
          </span>
        </div>
        <div className="mt-2 text-2xl font-semibold text-slate-900">{value}</div>
        {sublabel && <p className="mt-1 text-xs text-slate-400">{sublabel}</p>}
      </>
    );
    return onClick ? (
      <button type="button" onClick={onClick} className={themedClassName}>
        {themedContent}
      </button>
    ) : (
      <div className={themedClassName}>{themedContent}</div>
    );
  }

  const content = (
    <>
      <div>
        <p className="text-xs font-medium text-slate-500">{label}</p>
        <p className="mt-1 text-2xl font-semibold text-slate-900">{value}</p>
        {sublabel && <p className="mt-1 text-xs text-slate-400">{sublabel}</p>}
      </div>
      <Icon className="h-5 w-5 text-slate-300" />
    </>
  );
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="flex items-start justify-between rounded-lg border border-slate-200 bg-white p-4 text-left transition hover:border-slate-300 hover:shadow-sm"
      >
        {content}
      </button>
    );
  }
  return <div className="flex items-start justify-between rounded-lg border border-slate-200 bg-white p-4">{content}</div>;
}

const GAUGE_TRACK = "#e2e8f0";

// A single-value "how full is this" donut -- e.g. average CPU/Memory usage
// across every app in scope right now.
export function GaugeDonut({ label, percent, color }: { label: string; percent: number; color: string }) {
  const clamped = Math.max(0, Math.min(100, percent));
  const data = [
    { name: label, value: clamped },
    { name: "remainder", value: 100 - clamped },
  ];
  return (
    <div className="flex flex-col items-center rounded-lg border border-slate-200 bg-white p-4">
      <div className="relative h-32 w-32">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="value" innerRadius={42} outerRadius={58} startAngle={90} endAngle={-270} stroke="none">
              <Cell fill={color} />
              <Cell fill={GAUGE_TRACK} />
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="text-lg font-semibold text-slate-900">{clamped.toFixed(0)}%</span>
        </div>
      </div>
      <p className="mt-2 text-xs font-medium text-slate-600">{label}</p>
    </div>
  );
}

export type DonutSlice = { name: string; value: number; color: string };

// A multi-category breakdown donut -- e.g. apps by status.
export function BreakdownDonut({ title, data }: { title: string; data: DonutSlice[] }) {
  const total = data.reduce((sum, d) => sum + d.value, 0);
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <p className="mb-2 text-xs font-medium text-slate-600">{title}</p>
      <div className="flex items-center gap-4">
        <div className="relative h-28 w-28 shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={data} dataKey="value" nameKey="name" innerRadius={38} outerRadius={52} stroke="none">
                {data.map((slice) => (
                  <Cell key={slice.name} fill={slice.color} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <span className="text-sm font-semibold text-slate-900">{total}</span>
          </div>
        </div>
        <ul className="flex flex-1 flex-col gap-1">
          {data
            .filter((d) => d.value > 0)
            .map((d) => (
              <li key={d.name} className="flex items-center justify-between gap-2 text-xs">
                <span className="flex items-center gap-1.5 text-slate-600">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: d.color }} />
                  {d.name}
                </span>
                <span className="font-medium text-slate-900">{d.value}</span>
              </li>
            ))}
        </ul>
      </div>
    </div>
  );
}
