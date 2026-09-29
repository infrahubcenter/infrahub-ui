import type { K8sOverviewPod } from "@/lib/api";

// A Deployment's replica pods get names like
// "<app>-<replicaset-hash>-<pod-hash>" (or "<app>-<ordinal>" for a
// StatefulSet) -- stripping those trailing Kubernetes-generated segments
// recovers the shared app name, so a pod picker can show one row per app
// ("checkout ×3", one node per replica) instead of one row per
// near-identical pod. Purely a display/selection-grouping heuristic --
// it never changes what's actually persisted (dashboards still store
// whole namespaces), so a fresh replica always shows up too.
export function podAppKey(pod: K8sOverviewPod): string {
  const name = pod.pod_name ?? pod.display_name ?? "";
  // Deployment/ReplicaSet pod: <app>-<9-10 char alnum hash>-<5 char alnum hash>
  const deploymentMatch = name.match(/^(.+)-[a-z0-9]{9,10}-[a-z0-9]{5}$/);
  if (deploymentMatch) return deploymentMatch[1];
  // StatefulSet/DaemonSet-ish pod: <app>-<ordinal>
  const ordinalMatch = name.match(/^(.+)-\d+$/);
  if (ordinalMatch) return ordinalMatch[1];
  return name || pod.pod_id;
}

export type K8sAppGroup = { key: string; label: string; pods: K8sOverviewPod[]; nodes: string[] };

export function groupPodsByApp(pods: K8sOverviewPod[]): K8sAppGroup[] {
  const byKey = new Map<string, K8sOverviewPod[]>();
  for (const p of pods) {
    const key = podAppKey(p);
    const list = byKey.get(key) ?? [];
    list.push(p);
    byKey.set(key, list);
  }
  return [...byKey.entries()]
    .map(([key, groupPods]) => ({
      key,
      label: key,
      pods: groupPods,
      nodes: [...new Set(groupPods.map((p) => p.node_name).filter((n): n is string => Boolean(n)))],
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}
