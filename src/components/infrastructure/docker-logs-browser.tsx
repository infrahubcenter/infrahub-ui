"use client";

import { useMemo, useState } from "react";
import { Server } from "lucide-react";
import { DockerContainerStatusBadge } from "@/components/infrastructure/docker-status-badge";
import { DockerLogViewer } from "@/components/infrastructure/docker-log-viewer";
import { LogSummaryPanel } from "@/components/infrastructure/log-summary-panel";
import { LogsWorkspace, type LogsMode } from "@/components/infrastructure/logs-workspace";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  dockerHostContainerLogsStreamUrl,
  dockerHostLogsSearchAdapter,
  dockerLogsStreamUrl,
  searchDockerLogs,
  type DockerOverviewContainer,
  type LogSearchResult,
} from "@/lib/api";

// display_name is always populated by the backend, but its type stays
// `string` (never guaranteed non-empty at the type level) -- this keeps
// a definite, always-non-empty label for props that require one.
function containerLabel(c: DockerOverviewContainer): string {
  return c.display_name || c.container_name || "App";
}

type SearchFilters = { q?: string; from?: string; to?: string };

// The container picker + Live/Past/Error/Success workspace + Log
// Summary sidebar, given an already-scoped container list -- shared
// across every Docker Logs dashboard (see app/(shell)/logs/docker/),
// each one already scoped to its own configured container selection.
export function DockerLogsBrowser({
  containers,
  isAdmin,
  initialContainerId,
  initialMode,
  hostId,
}: {
  containers: DockerOverviewContainer[];
  isAdmin: boolean;
  // Lets a Logs dashboard's configured default view open straight to a
  // specific container/mode instead of the "select an app" empty state.
  initialContainerId?: string;
  initialMode?: LogsMode;
  // Set when this browser is showing a Docker Host's (not a VM's)
  // containers -- live-only, so both the live-tail stream and the "past
  // logs" search route through the Docker Host endpoints instead of the
  // VM-backed/persisted ones.
  hostId?: string;
}) {
  const [selected, setSelected] = useState<DockerOverviewContainer | null>(
    () => containers.find((c) => c.container_id === initialContainerId) ?? null
  );
  const [searchFilters, setSearchFilters] = useState<SearchFilters>({});
  const [summaryResult, setSummaryResult] = useState<LogSearchResult | null>(null);

  const grouped = useMemo(() => {
    const byWorkspace = new Map<string, DockerOverviewContainer[]>();
    for (const c of containers) {
      const key = c.workspace_name;
      const list = byWorkspace.get(key) ?? [];
      list.push(c);
      byWorkspace.set(key, list);
    }
    return [...byWorkspace.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [containers]);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[300px_1fr]">
        <div className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto rounded-lg border border-slate-200 bg-white p-3">
          {grouped.map(([groupLabel, items]) => (
            <div key={groupLabel}>
              <div className="mb-1 px-2 text-xs font-semibold text-slate-500">{groupLabel}</div>
              <div className="flex flex-col gap-0.5">
                {items.map((c) => (
                  <button
                    key={c.container_id}
                    onClick={() => {
                      setSelected(c);
                      setSummaryResult(null);
                    }}
                    className={cn(
                      "flex flex-col gap-1 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
                      selected?.container_id === c.container_id ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-100"
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate">{containerLabel(c)}</span>
                      <DockerContainerStatusBadge status={c.status} />
                    </div>
                    {isAdmin && c.vm_name && (
                      <span
                        className={cn(
                          "inline-flex w-fit items-center gap-1 rounded px-1.5 py-0.5 text-[11px]",
                          selected?.container_id === c.container_id ? "bg-white/10 text-white" : "bg-slate-100 text-slate-600"
                        )}
                      >
                        <Server className="h-2.5 w-2.5" /> {c.vm_name}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        {selected ? (
          <div className="flex flex-col gap-4 lg:flex-row">
            <div className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white p-4">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h3 className="font-medium text-slate-900">{containerLabel(selected)}</h3>
                {isAdmin && selected.vm_name && (
                  <Badge variant="secondary" className="gap-1">
                    <Server className="h-3 w-3" /> {selected.vm_name}
                  </Badge>
                )}
              </div>
              <LogsWorkspace
                key={selected.container_id}
                liveView={
                  <DockerLogViewer
                    streamUrl={
                      hostId
                        ? dockerHostContainerLogsStreamUrl(hostId, selected.container_id)
                        : dockerLogsStreamUrl(selected.container_id)
                    }
                    containerName={containerLabel(selected)}
                  />
                }
                search={hostId ? dockerHostLogsSearchAdapter(hostId, selected.container_id) : (params) => searchDockerLogs(selected.container_id, params)}
                initialFilters={searchFilters}
                onFiltersChange={setSearchFilters}
                onResult={setSummaryResult}
                initialMode={selected.container_id === initialContainerId ? initialMode : undefined}
              />
            </div>
            <LogSummaryPanel result={summaryResult} windowLabel="Most recent page of matching lines" />
          </div>
        ) : (
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <p className="text-sm text-slate-500">Select an app on the left to view its logs.</p>
          </div>
        )}
      </div>
    </div>
  );
}
