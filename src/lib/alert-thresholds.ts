// Threshold helpers for the New Alert Rule form: which quick-pick values
// to offer for each alert type, its unit, and a one-line explanation.
// Derived from the backend's own template catalog (metric name, default
// condition and threshold), so no alert type is hardcoded here.

import type { AlertCondition, AlertTemplate } from "./api";

export type ThresholdKind = "percent" | "flag" | "number";

// "flag" metrics are yes/no events (unreachable, stopped, public bucket...)
// the backend models as == 1 -- there is no meaningful number to pick.
export function thresholdKind(t: AlertTemplate): ThresholdKind {
  if (t.default_condition === "==" && t.default_threshold === 1) return "flag";
  if (t.metric.toUpperCase().includes("PERCENT")) return "percent";
  return "number";
}

export function thresholdUnit(t: AlertTemplate): string {
  const m = t.metric.toUpperCase();
  if (m.includes("PERCENT")) return "%";
  if (m.endsWith("_MS") || m.includes("_MS_") || m.includes("LATENCY")) return "ms";
  if (m.includes("SECS") || m.includes("SECONDS") || m.includes("LAG")) return "seconds";
  if (m.includes("MILLICORES")) return "millicores";
  if (m.includes("COUNT") || m.includes("LOCKS")) return "";
  return "";
}

// Quick-pick values: 50 / 70 / 90 for percentages; half, the default and
// double the default for other numbers; none for yes/no events.
export function thresholdPresets(t: AlertTemplate): number[] {
  const kind = thresholdKind(t);
  if (kind === "flag") return [];
  if (kind === "percent") return [50, 70, 90];
  const d = t.default_threshold;
  const round = (n: number) => (n >= 10 ? Math.round(n) : Math.round(n * 10) / 10);
  return Array.from(new Set([round(d / 2), round(d), round(d * 2)])).filter((n) => n > 0);
}

const CONDITION_WORDS: Record<AlertCondition, string> = {
  ">": "goes above",
  "<": "drops below",
  ">=": "reaches or goes above",
  "<=": "reaches or drops below",
  "==": "equals",
};

// What this rule will do with the threshold currently entered.
export function thresholdExplanation(t: AlertTemplate, condition: AlertCondition, threshold: string, durationSeconds: string): string {
  const kind = thresholdKind(t);
  const secs = Number(durationSeconds);
  const hold = Number.isFinite(secs) && secs > 0 ? ` and stays that way for ${formatDuration(secs)}` : "";
  if (kind === "flag") {
    return `Raises an alert when this happens${hold} -- no number needed.`;
  }
  const unit = thresholdUnit(t);
  const value = threshold.trim() === "" ? "the threshold" : `${threshold}${unit === "%" ? "%" : unit ? ` ${unit}` : ""}`;
  return `Raises an alert when the value ${CONDITION_WORDS[condition]} ${value}${hold}.`;
}

function formatDuration(secs: number): string {
  if (secs % 3600 === 0) return `${secs / 3600} hour${secs === 3600 ? "" : "s"}`;
  if (secs % 60 === 0) return `${secs / 60} minute${secs === 60 ? "" : "s"}`;
  return `${secs} seconds`;
}
