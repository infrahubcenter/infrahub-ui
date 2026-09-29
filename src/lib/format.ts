// Shared formatting helpers for infrastructure data (bytes, durations,
// rates, relative timestamps). Extracted so the VM detail page and the
// monitoring dashboard render identical numbers the identical way.

export function formatBytes(bytes?: number | null): string {
  if (bytes === undefined || bytes === null) return "Not discovered";
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value.toFixed(1)} ${units[unit]}`;
}

export function formatRate(bytesPerSec?: number | null): string {
  if (bytesPerSec === undefined || bytesPerSec === null) return "—";
  return `${formatBytes(bytesPerSec)}/s`;
}

export function formatPercent(pct?: number | null): string {
  if (pct === undefined || pct === null) return "—";
  return `${pct.toFixed(0)}%`;
}

// "3 days 14 hours 22 minutes" (Step 6 spec §17) for a lone uptime value;
// callers that need the compact "3d 14h" form (spec §61's VM summary
// card) can pass compact: true.
export function formatDuration(totalSeconds?: number | null, compact = false): string {
  if (totalSeconds === undefined || totalSeconds === null || totalSeconds < 0) return "Unknown";
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);

  if (compact) {
    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  }

  const parts: string[] = [];
  if (days > 0) parts.push(`${days} day${days === 1 ? "" : "s"}`);
  if (hours > 0 || days > 0) parts.push(`${hours} hour${hours === 1 ? "" : "s"}`);
  parts.push(`${minutes} minute${minutes === 1 ? "" : "s"}`);
  return parts.join(" ");
}

// "42 seconds ago" / "3 minutes ago" -- Step 6 spec §34's staleness
// indicator. Pure function of two Dates so it's trivially testable and
// doesn't need a ticking clock of its own; callers re-render on their own
// refresh interval (spec §46).
export function formatAgo(isoTimestamp?: string | null, now: Date = new Date()): string {
  if (!isoTimestamp) return "Never";
  const then = new Date(isoTimestamp);
  const seconds = Math.max(0, Math.floor((now.getTime() - then.getTime()) / 1000));
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds} seconds ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

export function secondsSince(isoTimestamp?: string | null, now: Date = new Date()): number {
  if (!isoTimestamp) return Number.POSITIVE_INFINITY;
  return Math.max(0, Math.floor((now.getTime() - new Date(isoTimestamp).getTime()) / 1000));
}

// Parses a Go-style duration string (30s, 5m, 1h) or a bare number of
// seconds -- matches how the backend's own env vars are written (Step 6
// spec §46: "make both configurable"), so NEXT_PUBLIC_MONITORING_REFRESH
// can be set the same way VM_MONITOR_INTERVAL is.
export function parseDurationSeconds(input: string | undefined, fallbackSeconds: number): number {
  if (!input) return fallbackSeconds;
  const trimmed = input.trim();
  if (/^\d+$/.test(trimmed)) return Number(trimmed);
  const match = /^(\d+)(ms|s|m|h)$/.exec(trimmed);
  if (!match) return fallbackSeconds;
  const value = Number(match[1]);
  switch (match[2]) {
    case "ms":
      return value / 1000;
    case "s":
      return value;
    case "m":
      return value * 60;
    case "h":
      return value * 3600;
    default:
      return fallbackSeconds;
  }
}
