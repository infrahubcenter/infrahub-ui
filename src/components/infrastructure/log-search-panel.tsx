"use client";

import { useCallback, useEffect, useState } from "react";
import { Search, SlidersHorizontal } from "lucide-react";
import { LogSeverityBadge } from "@/components/infrastructure/log-severity-badge";
import { ColorizedLogLine } from "@/components/infrastructure/colorized-log-line";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError, type LogSearchResult, type LogSeverity } from "@/lib/api";

const PAGE_SIZE = 100;

// Same left-border accent per severity as the live viewers (Docker/K8s)
// -- a Past/Error/Success search result should look and read identically
// to a line that arrived live.
const SEVERITY_BORDER: Record<LogSeverity, string> = {
  HEALTHY: "border-l-emerald-500/50",
  WARNING: "border-l-amber-500/60",
  ERROR: "border-l-red-500/60",
  CRITICAL: "border-l-red-500/90",
};

// Off/5s/15s auto re-run of the current search -- shared by every Logs
// page this panel is embedded in (Docker/K8s/Database/VM), so it only
// needs to be built once here rather than per-resource-type.
const REFRESH_OPTIONS: { label: string; ms: number }[] = [
  { label: "Off", ms: 0 },
  { label: "5s", ms: 5000 },
  { label: "15s", ms: 15000 },
];

const SEVERITY_TABS: { key: LogSeverity | "ALL"; label: string }[] = [
  { key: "ALL", label: "All" },
  { key: "HEALTHY", label: "Healthy" },
  { key: "WARNING", label: "Warning" },
  { key: "ERROR", label: "Errors" },
  { key: "CRITICAL", label: "Critical" },
];

export type LogSearchQuery = { q?: string; from?: string; to?: string; limit: number; offset: number };

// Searches a container's/pod's background-captured log history (bounded to
// the retention window the backend enforces) -- distinct from the live-tail
// view: this looks at what's already been captured, going back up to that
// window, rather than what's streaming right now. Used identically for
// Docker and K8s; only the search function passed in differs.
//
// Every line is classified server-side (Healthy/Warning/Error/Critical,
// see services.ClassifyLogLine) -- the tabs below split history into those
// buckets, with a plain-English suggested next step shown under any
// flagged line, so tracking down "what broke and what do I do about it" is
// a filter click away instead of a manual scroll through raw text.
//
// initialFilters/onFiltersChange let a saved view (see saved-views.tsx)
// pre-fill and track the current keyword/time-range so it can be named and
// saved from the page that embeds this panel.
export function LogSearchPanel({
  search,
  initialFilters,
  onFiltersChange,
  initialSeverity,
  autoRun,
  advancedDefault,
  onResult,
}: {
  search: (params: {
    q?: string;
    from?: string;
    to?: string;
    severity?: LogSeverity;
    limit: number;
    offset: number;
  }) => Promise<LogSearchResult>;
  initialFilters?: { q?: string; from?: string; to?: string };
  onFiltersChange?: (filters: { q?: string; from?: string; to?: string }) => void;
  // Pre-selects a severity tab -- used by the "Error Logs" mode to start
  // narrowed to errors/critical instead of everything.
  initialSeverity?: LogSeverity;
  // Runs the search immediately on mount instead of waiting for the user
  // to press Search -- used by "Error Logs" so it shows results right away.
  autoRun?: boolean;
  // Starts with the From/To advanced filters expanded -- used by the
  // "Filter Logs" mode, where advanced filtering is the whole point.
  advancedDefault?: boolean;
  // Lifts the latest search result up to the embedding page, e.g. to feed
  // a "Log Summary" sidebar -- called with null when the panel unmounts.
  onResult?: (result: LogSearchResult | null) => void;
}) {
  const [query, setQuery] = useState(initialFilters?.q ?? "");
  const [from, setFrom] = useState(initialFilters?.from ?? "");
  const [to, setTo] = useState(initialFilters?.to ?? "");
  const [severity, setSeverity] = useState<LogSeverity | "ALL">(initialSeverity ?? "ALL");
  const [showAdvanced, setShowAdvanced] = useState(Boolean(advancedDefault || initialFilters?.from || initialFilters?.to));
  const [result, setResult] = useState<LogSearchResult | null>(null);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);
  const [refreshMs, setRefreshMs] = useState(0);

  // Wrapped in useCallback (keyed on the actual query/filters, not just
  // identity) so the auto-refresh effect below always re-runs the *latest*
  // search instead of a stale closure from whenever refresh was turned on.
  const runSearch = useCallback(
    async (nextOffset: number, nextSeverity: LogSeverity | "ALL" = severity) => {
      setLoading(true);
      setError(null);
      const filters = {
        q: query.trim() || undefined,
        from: from ? new Date(from).toISOString() : undefined,
        to: to ? new Date(to).toISOString() : undefined,
      };
      try {
        const res = await search({
          ...filters,
          severity: nextSeverity === "ALL" ? undefined : nextSeverity,
          limit: PAGE_SIZE,
          offset: nextOffset,
        });
        setResult(res);
        onResult?.(res);
        setOffset(nextOffset);
        setSeverity(nextSeverity);
        setSearched(true);
        onFiltersChange?.(filters);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Failed to search logs.");
      } finally {
        setLoading(false);
      }
    },
    [query, from, to, search, severity, onResult, onFiltersChange]
  );

  useEffect(() => {
    // Only ever auto-run once, right after mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (autoRun) void runSearch(0, initialSeverity ?? "ALL");
    return () => onResult?.(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Only fires while parked on the newest page (offset 0) -- auto-
  // refreshing mid-pagination would yank an "Older" page back to page 1
  // underneath whoever's reading it. runSearch's own identity changes
  // whenever query/from/to/severity change (see its useCallback deps
  // above), so this always re-establishes the timer against the latest
  // search rather than a stale one.
  useEffect(() => {
    if (!refreshMs || offset !== 0) return;
    const id = setInterval(() => {
      void runSearch(0, severity);
    }, refreshMs);
    return () => clearInterval(id);
  }, [refreshMs, offset, severity, runSearch]);

  const counts = result?.counts;

  return (
    <div className="flex flex-col gap-3">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void runSearch(0);
        }}
        className="flex flex-col gap-2"
      >
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search log history (leave blank to list everything captured)"
              className="pl-8"
            />
          </div>
          <Button type="button" variant="outline" size="icon" onClick={() => setShowAdvanced((v) => !v)} aria-label="Advanced filters">
            <SlidersHorizontal className="h-4 w-4" />
          </Button>
          <Button type="submit" disabled={loading}>
            {loading ? "Searching…" : "Search"}
          </Button>
        </div>

        {showAdvanced && (
          <div className="flex flex-wrap items-end gap-3 rounded-md border border-slate-200 bg-slate-50 p-3">
            <div className="flex flex-col gap-1">
              <Label htmlFor="log-search-from" className="text-xs">
                From
              </Label>
              <Input id="log-search-from" type="datetime-local" value={from} onChange={(e) => setFrom(e.target.value)} className="h-8 text-xs" />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="log-search-to" className="text-xs">
                To
              </Label>
              <Input id="log-search-to" type="datetime-local" value={to} onChange={(e) => setTo(e.target.value)} className="h-8 text-xs" />
            </div>
            {(from || to) && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setFrom("");
                  setTo("");
                }}
              >
                Clear range
              </Button>
            )}
          </div>
        )}
      </form>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {searched && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-1.5">
            {SEVERITY_TABS.map((tab) => {
              const count = counts && tab.key !== "ALL" ? counts[tab.key.toLowerCase() as keyof typeof counts] : undefined;
              const active = severity === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => void runSearch(0, tab.key)}
                  disabled={loading}
                  className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                    active ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {tab.label}
                  {count !== undefined && <span className="ml-1 opacity-70">({count})</span>}
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-1" title={offset !== 0 ? "Auto-refresh pauses while viewing an older page" : undefined}>
            <span className="text-xs text-slate-500">Refresh</span>
            {REFRESH_OPTIONS.map((opt) => (
              <Button key={opt.label} size="sm" variant={refreshMs === opt.ms ? "default" : "outline"} onClick={() => setRefreshMs(opt.ms)}>
                {opt.label}
              </Button>
            ))}
          </div>
        </div>
      )}

      {result && (
        <>
          <p className="text-xs text-slate-500">
            {result.total} matching line{result.total === 1 ? "" : "s"} since{" "}
            {new Date(result.retention_cutoff).toLocaleString()} (retention limit)
          </p>
          <div className="h-[55vh] w-full overflow-y-auto rounded-lg border border-slate-200 bg-slate-950 p-3 font-mono text-xs text-slate-200">
            {result.lines.length === 0 ? (
              <p className="text-slate-500">No matching log lines in the retained history.</p>
            ) : (
              [...result.lines].reverse().map((line) => (
                <div key={line.id} className={`border-b border-l-2 border-slate-800/60 py-1 pl-2 last:border-b-0 ${SEVERITY_BORDER[line.severity]}`}>
                  <div className="flex flex-wrap items-start gap-2 whitespace-pre-wrap break-all">
                    <span className="shrink-0 text-slate-500">{new Date(line.logged_at).toLocaleString()}</span>
                    <LogSeverityBadge severity={line.severity} />
                    <span>
                      <ColorizedLogLine text={line.line} />
                    </span>
                  </div>
                  {line.suggestion && (
                    <p className="ml-1 mt-1 text-[11px] font-sans text-amber-300/90">Suggested next step: {line.suggestion}</p>
                  )}
                </div>
              ))
            )}
          </div>
          <div className="flex items-center justify-between text-xs text-slate-500">
            <Button variant="outline" size="sm" disabled={loading || offset === 0} onClick={() => void runSearch(Math.max(0, offset - PAGE_SIZE))}>
              Newer
            </Button>
            <span>
              Showing {result.lines.length === 0 ? 0 : offset + 1}–{offset + result.lines.length} of {result.total}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={loading || offset + PAGE_SIZE >= result.total}
              onClick={() => void runSearch(offset + PAGE_SIZE)}
            >
              Older
            </Button>
          </div>
        </>
      )}

      {!result && !searched && <p className="text-sm text-slate-500">Search across up to the last 30 days of captured logs.</p>}
    </div>
  );
}
