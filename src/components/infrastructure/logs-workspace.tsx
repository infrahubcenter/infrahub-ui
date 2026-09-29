"use client";

import { type ReactNode, useState } from "react";
import { AlertTriangle, CheckCircle2, History, Radio } from "lucide-react";
import { LogSearchPanel } from "@/components/infrastructure/log-search-panel";
import { cn } from "@/lib/utils";
import type { LogSearchResult, LogSeverity } from "@/lib/api";

export type LogsMode = "live" | "history" | "errors" | "success";

const MODES: { key: LogsMode; label: string; icon: typeof Radio; description: string }[] = [
  { key: "live", label: "Live Logs", icon: Radio, description: "Real-time tail of what's happening right now" },
  { key: "history", label: "Past Logs", icon: History, description: "Search up to 30 days of captured history" },
  { key: "errors", label: "Error Logs", icon: AlertTriangle, description: "Only errors and critical lines" },
  { key: "success", label: "Success Logs", icon: CheckCircle2, description: "Only lines classified as healthy/successful" },
];

// Shared 4-mode logs UI for both the Docker and Kubernetes Logs pages --
// same modes, same layout, same underlying LogSearchPanel machinery; only
// the live-view component and the `search` function passed in differ
// between Docker (containers) and Kubernetes (pods).
export function LogsWorkspace({
  liveView,
  search,
  initialFilters,
  onFiltersChange,
  onResult,
  initialMode = "live",
}: {
  liveView: ReactNode;
  search: (params: { q?: string; from?: string; to?: string; severity?: LogSeverity; limit: number; offset: number }) => Promise<LogSearchResult>;
  initialFilters?: { q?: string; from?: string; to?: string };
  onFiltersChange?: (filters: { q?: string; from?: string; to?: string }) => void;
  onResult?: (result: LogSearchResult | null) => void;
  // Lets a Dashboard's configured default view (see dashboard-logs-
  // configure.tsx) open straight into a specific mode instead of always
  // starting on Live Logs.
  initialMode?: LogsMode;
}) {
  const [mode, setMode] = useState<LogsMode>(initialMode);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        {MODES.map((m) => {
          const Icon = m.icon;
          const active = mode === m.key;
          return (
            <button
              key={m.key}
              type="button"
              onClick={() => setMode(m.key)}
              title={m.description}
              className={cn(
                "flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors",
                active ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              )}
            >
              <Icon className="h-4 w-4" /> {m.label}
            </button>
          );
        })}
      </div>

      {mode === "live" && liveView}
      {mode === "history" && (
        <LogSearchPanel key="history" search={search} initialFilters={initialFilters} onFiltersChange={onFiltersChange} onResult={onResult} />
      )}
      {mode === "errors" && <LogSearchPanel key="errors" search={search} initialSeverity="ERROR" autoRun onResult={onResult} />}
      {mode === "success" && <LogSearchPanel key="success" search={search} initialSeverity="HEALTHY" autoRun onResult={onResult} />}
    </div>
  );
}
