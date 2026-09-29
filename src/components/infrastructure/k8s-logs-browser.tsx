"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Layers } from "lucide-react";
import { K8sPodPhaseBadge } from "@/components/infrastructure/k8s-status-badge";
import { K8sLogViewer } from "@/components/infrastructure/k8s-log-viewer";
import { LogSummaryPanel } from "@/components/infrastructure/log-summary-panel";
import { LogsWorkspace, type LogsMode } from "@/components/infrastructure/logs-workspace";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { groupPodsByApp } from "@/lib/k8s-pod-grouping";
import { searchK8sLogs, type K8sOverviewPod, type LogSearchResult } from "@/lib/api";

// display_name is always populated by the backend, but its type stays
// `string` (never guaranteed non-empty at the type level) -- this keeps
// a definite, always-non-empty label for props that require one.
function podLabel(p: K8sOverviewPod): string {
  return p.display_name || p.pod_name || "App";
}

type SearchFilters = { q?: string; from?: string; to?: string };

// The pod picker + Live/Past/Error/Success workspace + Log Summary
// sidebar, given an already-scoped pod list -- shared across every
// Kubernetes Logs dashboard (see app/(shell)/logs/kubernetes/), each one
// already scoped to its own configured namespace selection. Picker is
// grouped Namespace -> App (replicas of the same Deployment/StatefulSet
// collapsed into one row, e.g. "checkout ×3") -> individual pod, so a
// specific replica's logs are always reachable, not just "the app's."
// Mirrors DockerLogsBrowser's overall shape.
export function K8sLogsBrowser({
  pods,
  isAdmin,
  initialPodId,
  initialMode,
}: {
  pods: K8sOverviewPod[];
  isAdmin: boolean;
  // Lets a Logs dashboard's configured default view open straight to a
  // specific pod/mode instead of the "select an app" empty state.
  initialPodId?: string;
  initialMode?: LogsMode;
}) {
  const [selected, setSelected] = useState<K8sOverviewPod | null>(() => pods.find((p) => p.pod_id === initialPodId) ?? null);
  const [searchFilters, setSearchFilters] = useState<SearchFilters>({});
  const [summaryResult, setSummaryResult] = useState<LogSearchResult | null>(null);
  const [expandedApps, setExpandedApps] = useState<Set<string>>(new Set());

  const groupedByNamespace = useMemo(() => {
    const byNamespace = new Map<string, K8sOverviewPod[]>();
    for (const p of pods) {
      const key = isAdmin && p.cluster_name ? `${p.cluster_name} / ${p.namespace ?? "—"}` : (p.namespace ?? p.workspace_name);
      const list = byNamespace.get(key) ?? [];
      list.push(p);
      byNamespace.set(key, list);
    }
    return [...byNamespace.entries()]
      .map(([nsLabel, nsPods]) => ({ nsLabel, apps: groupPodsByApp(nsPods) }))
      .sort((a, b) => a.nsLabel.localeCompare(b.nsLabel));
  }, [pods, isAdmin]);

  function selectPod(p: K8sOverviewPod) {
    setSelected(p);
    setSummaryResult(null);
  }

  function toggleApp(nsLabel: string, appKey: string) {
    const groupKey = `${nsLabel}::${appKey}`;
    setExpandedApps((prev) => {
      const next = new Set(prev);
      if (next.has(groupKey)) next.delete(groupKey);
      else next.add(groupKey);
      return next;
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[320px_1fr]">
        <div className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto rounded-lg border border-slate-200 bg-white p-3">
          {groupedByNamespace.map(({ nsLabel, apps }) => (
            <div key={nsLabel}>
              <div className="mb-1 px-2 text-xs font-semibold text-slate-500">{nsLabel}</div>
              <div className="flex flex-col gap-0.5">
                {apps.map((app) => {
                  const single = app.pods.length === 1;
                  const groupKey = `${nsLabel}::${app.key}`;
                  const expanded = expandedApps.has(groupKey);
                  return (
                    <div key={app.key}>
                      <button
                        type="button"
                        onClick={() => (single ? selectPod(app.pods[0]) : toggleApp(nsLabel, app.key))}
                        className={cn(
                          "flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
                          single && selected?.pod_id === app.pods[0].pod_id
                            ? "bg-slate-900 text-white"
                            : "text-slate-700 hover:bg-slate-100"
                        )}
                      >
                        <span className="flex min-w-0 items-center gap-1">
                          {!single && (expanded ? <ChevronDown className="h-3.5 w-3.5 shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0" />)}
                          <span className="truncate">{podLabel(app.pods[0])}</span>
                          {!single && <span className="shrink-0 text-xs text-slate-400">&times;{app.pods.length}</span>}
                        </span>
                        {single ? (
                          <K8sPodPhaseBadge phase={app.pods[0].phase} />
                        ) : (
                          app.nodes.length > 0 && <span className="shrink-0 text-xs text-slate-400">{app.nodes.length} node{app.nodes.length === 1 ? "" : "s"}</span>
                        )}
                      </button>
                      {!single && expanded && (
                        <div className="ml-5 flex flex-col gap-0.5 border-l border-slate-100 pl-2">
                          {app.pods.map((p) => (
                            <button
                              key={p.pod_id}
                              type="button"
                              onClick={() => selectPod(p)}
                              className={cn(
                                "flex items-center justify-between gap-2 rounded-md px-2 py-1 text-left text-xs transition-colors",
                                selected?.pod_id === p.pod_id ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"
                              )}
                            >
                              <span className="truncate">
                                {p.pod_name ?? p.pod_id}
                                {p.node_name && <span className="ml-1.5 text-slate-400">on {p.node_name}</span>}
                              </span>
                              <K8sPodPhaseBadge phase={p.phase} />
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {selected ? (
          <div className="flex flex-col gap-4 lg:flex-row">
            <div className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white p-4">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h3 className="font-medium text-slate-900">{podLabel(selected)}</h3>
                {isAdmin && selected.cluster_name && (
                  <Badge variant="secondary" className="gap-1">
                    <Layers className="h-3 w-3" /> {selected.cluster_name}
                  </Badge>
                )}
              </div>
              <LogsWorkspace
                key={selected.pod_id}
                liveView={<K8sLogViewer podId={selected.pod_id} podName={podLabel(selected)} />}
                search={(params) => searchK8sLogs(selected.pod_id, params)}
                initialFilters={searchFilters}
                onFiltersChange={setSearchFilters}
                onResult={setSummaryResult}
                initialMode={selected.pod_id === initialPodId ? initialMode : undefined}
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
