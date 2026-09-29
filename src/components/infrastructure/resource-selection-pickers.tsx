"use client";

import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { groupPodsByApp } from "@/lib/k8s-pod-grouping";
import { formatAgo } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { DockerHostContainer, K8sOverviewPod } from "@/lib/api";

// A Refresh button that actually looks like it's doing something: a
// spinning icon + disabled state + "Refreshing…" label while `loading` is
// true, instead of an instant, feedback-free click.
function RefreshButton({ loading, onRefresh }: { loading: boolean; onRefresh: () => void }) {
  return (
    <Button type="button" variant="outline" size="sm" onClick={onRefresh} disabled={loading}>
      <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
      {loading ? "Refreshing…" : "Refresh"}
    </Button>
  );
}

// Shared with both the create wizard (ConfigureMonitoringDashboardWizard)
// and the edit dialog (EditMonitoringDashboardDialog) -- "Select all"
// means an EMPTY resource-selection filter, not every currently-known id,
// so a container/pod that appears *after* this is saved still shows up
// automatically (see the dashboard view pages' own scopedContainers/
// scopedPods, which treat an empty CONTAINER/NAMESPACE filter as "no
// filter, show everything").

export function DockerContainerPicker({
  containers,
  loading,
  selectedIds,
  onSelectedIdsChange,
  selectAll,
  onSelectAllChange,
  onRefresh,
}: {
  containers: DockerHostContainer[];
  loading: boolean;
  selectedIds: string[];
  onSelectedIdsChange: (ids: string[]) => void;
  selectAll: boolean;
  onSelectAllChange: (v: boolean) => void;
  onRefresh: () => void;
}) {
  if (loading && containers.length === 0) return <p className="text-sm text-slate-500">Loading&hellip;</p>;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <Label>Containers *</Label>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-xs text-slate-600">
            <Checkbox checked={selectAll} onCheckedChange={(v) => onSelectAllChange(v === true)} />
            Select all (includes future containers)
          </label>
          <RefreshButton loading={loading} onRefresh={onRefresh} />
        </div>
      </div>
      {selectAll && (
        <p className="text-xs text-slate-500">
          Tracking all {containers.length} container{containers.length === 1 ? "" : "s"} on this host -- any new one will
          appear here automatically, no need to re-select.
        </p>
      )}
      {containers.length === 0 ? (
        <p className="text-sm text-slate-500">No containers reported by this host&apos;s agent yet. Click Refresh once one starts.</p>
      ) : (
        <div className={cn("flex max-h-72 flex-col gap-1.5 overflow-y-auto rounded-md border border-slate-200 p-2", loading && "opacity-60")}>
          {containers.map((c) => (
            <label key={c.container_id} className="flex items-center gap-2 rounded px-1 py-1 text-sm hover:bg-slate-50">
              <Checkbox
                checked={selectAll || selectedIds.includes(c.container_id)}
                disabled={selectAll}
                onCheckedChange={(v) =>
                  onSelectedIdsChange(v === true ? [...selectedIds, c.container_id] : selectedIds.filter((id) => id !== c.container_id))
                }
              />
              <span>{c.name}</span>
              <span className="text-xs text-slate-400">{c.image}</span>
              {c.first_seen_at && (
                <span className="ml-auto shrink-0 text-xs text-slate-400" title="When InfraHub first saw this container">
                  connected {formatAgo(c.first_seen_at)}
                </span>
              )}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

export function K8sNamespacePicker({
  pods,
  loading,
  selectedNamespaces,
  onSelectedNamespacesChange,
  selectAll,
  onSelectAllChange,
  onRefresh,
}: {
  pods: K8sOverviewPod[];
  loading: boolean;
  selectedNamespaces: string[];
  onSelectedNamespacesChange: (namespaces: string[]) => void;
  selectAll: boolean;
  onSelectAllChange: (v: boolean) => void;
  onRefresh: () => void;
}) {
  const namespaces = [...new Set(pods.map((p) => p.namespace).filter((n): n is string => Boolean(n)))].sort();
  const podsByNamespace = new Map<string, K8sOverviewPod[]>();
  for (const p of pods) {
    if (!p.namespace) continue;
    const list = podsByNamespace.get(p.namespace) ?? [];
    list.push(p);
    podsByNamespace.set(p.namespace, list);
  }

  if (loading && namespaces.length === 0) return <p className="text-sm text-slate-500">Loading&hellip;</p>;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <Label>Namespaces *</Label>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-xs text-slate-600">
            <Checkbox checked={selectAll} onCheckedChange={(v) => onSelectAllChange(v === true)} />
            Select all (includes future namespaces)
          </label>
          <RefreshButton loading={loading} onRefresh={onRefresh} />
        </div>
      </div>
      {selectAll && <p className="text-xs text-slate-500">Tracking all namespaces -- any new one will appear here automatically.</p>}
      {namespaces.length === 0 ? (
        <p className="text-sm text-slate-500">No namespaces discovered on this cluster yet. Click Refresh to try again.</p>
      ) : (
        <div className={cn("flex flex-col gap-2", loading && "opacity-60")}>
          {namespaces.map((ns) => {
            const nsPods = podsByNamespace.get(ns) ?? [];
            const apps = groupPodsByApp(nsPods);
            const checked = selectAll || selectedNamespaces.includes(ns);
            return (
              <div key={ns} className="rounded-md border border-slate-200 p-2">
                <label className="flex items-center gap-2 text-sm font-medium">
                  <Checkbox
                    checked={checked}
                    disabled={selectAll}
                    onCheckedChange={(v) =>
                      onSelectedNamespacesChange(v === true ? [...selectedNamespaces, ns] : selectedNamespaces.filter((x) => x !== ns))
                    }
                  />
                  {ns}
                  <span className="text-xs font-normal text-slate-400">
                    {apps.length} app{apps.length === 1 ? "" : "s"}
                  </span>
                </label>
                {apps.length > 0 && (
                  <div className="mt-1.5 ml-6 flex flex-col gap-1">
                    {apps.map((a) => (
                      <div key={a.key} className="flex items-center gap-2 text-xs text-slate-500">
                        <span className="text-slate-700">{a.label}</span>
                        {a.pods.length > 1 && <span>&times;{a.pods.length}</span>}
                        {a.nodes.length > 0 && <span>on {a.nodes.join(", ")}</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
