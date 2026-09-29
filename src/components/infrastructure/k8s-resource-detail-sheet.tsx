"use client";

import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { formatBytes, formatAgo } from "@/lib/format";
import type {
  K8sNamespaceItem,
  K8sWorkloadItem,
  K8sServiceItem,
  K8sPVCItem,
  K8sWorkloadResourceItem,
  K8sJobItem,
  K8sCronJobItem,
  K8sPVItem,
  K8sStorageClassItem,
  K8sIngressItem,
  K8sNetworkPolicyItem,
  K8sEndpointSliceItem,
  K8sResourceQuotaItem,
  K8sLimitRangeItem,
  K8sPDBItem,
  K8sHPAItem,
} from "@/lib/api";

// Backs every stat card's click-through on the Kubernetes Monitor
// dashboard -- a count alone ("Deployments: 3") isn't useful on its own;
// this shows the actual resource names behind it. Nodes and Pods already
// have their own full tabs, so they're not routed through here.
export type K8sResourceKind =
  | "namespaces"
  | "deployments"
  | "statefulsets"
  | "daemonsets"
  | "services"
  | "pvcs"
  | "replicasets"
  | "jobs"
  | "cronjobs"
  | "pvs"
  | "storageclasses"
  | "ingresses"
  | "networkpolicies"
  | "endpointslices"
  | "resourcequotas"
  | "limitranges"
  | "pdbs"
  | "hpas";

export function K8sResourceDetailSheet({
  kind,
  namespaceItems,
  deploymentItems,
  statefulSetItems,
  daemonSetItems,
  serviceItems,
  pvcItems,
  replicaSetItems,
  jobItems,
  cronJobItems,
  pvItems,
  storageClassItems,
  ingressItems,
  networkPolicyItems,
  endpointSliceItems,
  resourceQuotaItems,
  limitRangeItems,
  pdbItems,
  hpaItems,
  onClose,
}: {
  kind: K8sResourceKind | null;
  namespaceItems: K8sNamespaceItem[];
  deploymentItems: K8sWorkloadItem[];
  statefulSetItems: K8sWorkloadItem[];
  daemonSetItems: K8sWorkloadItem[];
  serviceItems: K8sServiceItem[];
  pvcItems: K8sPVCItem[];
  replicaSetItems?: K8sWorkloadResourceItem[];
  jobItems?: K8sJobItem[];
  cronJobItems?: K8sCronJobItem[];
  pvItems?: K8sPVItem[];
  storageClassItems?: K8sStorageClassItem[];
  ingressItems?: K8sIngressItem[];
  networkPolicyItems?: K8sNetworkPolicyItem[];
  endpointSliceItems?: K8sEndpointSliceItem[];
  resourceQuotaItems?: K8sResourceQuotaItem[];
  limitRangeItems?: K8sLimitRangeItem[];
  pdbItems?: K8sPDBItem[];
  hpaItems?: K8sHPAItem[];
  onClose: () => void;
}) {
  const title = kind ? KIND_LABELS[kind] : "";
  // The 12 kinds below read from k8s_resources (survive the agent going
  // offline, see k8s_overview.go), unlike the original 6 -- which are
  // live-agent-only -- so the sheet's own subtitle says so accurately
  // per kind instead of always claiming "live."
  const isPersisted = kind !== null && PERSISTED_KINDS.has(kind);

  return (
    <Sheet open={kind !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription>
            {isPersisted
              ? `Every ${kind ? KIND_NOUN[kind] : ""} last seen by this cluster's agent.`
              : `Every ${kind ? KIND_NOUN[kind] : ""} reported by this cluster's connected agent, live.`}
          </SheetDescription>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto px-4 pb-4">
          {kind === "namespaces" && <NamespaceList items={namespaceItems} />}
          {kind === "deployments" && <WorkloadList items={deploymentItems} />}
          {kind === "statefulsets" && <WorkloadList items={statefulSetItems} />}
          {kind === "daemonsets" && <WorkloadList items={daemonSetItems} />}
          {kind === "services" && <ServiceList items={serviceItems} />}
          {kind === "pvcs" && <PVCList items={pvcItems} />}
          {kind === "replicasets" && <WorkloadList items={replicaSetItems ?? []} />}
          {kind === "jobs" && <JobList items={jobItems ?? []} />}
          {kind === "cronjobs" && <CronJobList items={cronJobItems ?? []} />}
          {kind === "pvs" && <PVList items={pvItems ?? []} />}
          {kind === "storageclasses" && <StorageClassList items={storageClassItems ?? []} />}
          {kind === "ingresses" && <IngressList items={ingressItems ?? []} />}
          {kind === "networkpolicies" && <NetworkPolicyList items={networkPolicyItems ?? []} />}
          {kind === "endpointslices" && <EndpointSliceList items={endpointSliceItems ?? []} />}
          {kind === "resourcequotas" && <ResourceQuotaList items={resourceQuotaItems ?? []} />}
          {kind === "limitranges" && <LimitRangeList items={limitRangeItems ?? []} />}
          {kind === "pdbs" && <PDBList items={pdbItems ?? []} />}
          {kind === "hpas" && <HPAList items={hpaItems ?? []} />}
        </div>
      </SheetContent>
    </Sheet>
  );
}

const PERSISTED_KINDS = new Set<K8sResourceKind>([
  "replicasets", "jobs", "cronjobs", "pvs", "storageclasses", "ingresses",
  "networkpolicies", "endpointslices", "resourcequotas", "limitranges", "pdbs", "hpas",
]);

const KIND_LABELS: Record<K8sResourceKind, string> = {
  namespaces: "Namespaces",
  deployments: "Deployments",
  statefulsets: "StatefulSets",
  daemonsets: "DaemonSets",
  services: "Services",
  pvcs: "Persistent Volume Claims",
  replicasets: "ReplicaSets",
  jobs: "Jobs",
  cronjobs: "CronJobs",
  pvs: "Persistent Volumes",
  storageclasses: "Storage Classes",
  ingresses: "Ingresses",
  networkpolicies: "Network Policies",
  endpointslices: "Endpoint Slices",
  resourcequotas: "Resource Quotas",
  limitranges: "Limit Ranges",
  pdbs: "Pod Disruption Budgets",
  hpas: "Horizontal Pod Autoscalers",
};

const KIND_NOUN: Record<K8sResourceKind, string> = {
  namespaces: "namespace",
  deployments: "deployment",
  statefulsets: "statefulset",
  daemonsets: "daemonset",
  services: "service",
  pvcs: "persistent volume claim",
  replicasets: "replicaset",
  jobs: "job",
  cronjobs: "cronjob",
  pvs: "persistent volume",
  storageclasses: "storage class",
  ingresses: "ingress",
  networkpolicies: "network policy",
  endpointslices: "endpoint slice",
  resourcequotas: "resource quota",
  limitranges: "limit range",
  pdbs: "pod disruption budget",
  hpas: "horizontal pod autoscaler",
};

function EmptyRow() {
  return <p className="py-6 text-center text-sm text-slate-500">Nothing reported for this cluster.</p>;
}

// Shown under a persisted-kind item when it has a last_discovered_at --
// mirrors the Pods tab's own "Last Seen" treatment (K8sPodsTable).
function LastSeen({ at }: { at?: string }) {
  if (!at) return null;
  return <span className="text-slate-400"> · seen {formatAgo(at)}</span>;
}

function NamespaceList({ items }: { items: K8sNamespaceItem[] }) {
  if (items.length === 0) return <EmptyRow />;
  return (
    <ul className="divide-y divide-slate-100">
      {items.map((ns) => (
        <li key={ns.name} className="flex items-center justify-between py-2.5">
          <span className="text-sm font-medium text-slate-900">{ns.name}</span>
          <Badge className={ns.status === "Active" ? "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200" : "bg-slate-100 text-slate-600 ring-1 ring-inset ring-slate-200"}>
            {ns.status || "Unknown"}
          </Badge>
        </li>
      ))}
    </ul>
  );
}

function WorkloadList({ items }: { items: K8sWorkloadItem[] | K8sWorkloadResourceItem[] }) {
  if (items.length === 0) return <EmptyRow />;
  return (
    <ul className="divide-y divide-slate-100">
      {items.map((w) => {
        const healthy = w.ready_replicas >= w.desired_replicas && w.desired_replicas > 0;
        const lastSeen = "last_discovered_at" in w ? w.last_discovered_at : undefined;
        return (
          <li key={`${w.namespace}/${w.name}`} className="flex items-center justify-between py-2.5">
            <div>
              <p className="text-sm font-medium text-slate-900">{w.name}</p>
              <p className="text-xs text-slate-500">
                {w.namespace}
                <LastSeen at={lastSeen} />
              </p>
            </div>
            <Badge className={healthy ? "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200" : "bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-200"}>
              {w.ready_replicas}/{w.desired_replicas} ready
            </Badge>
          </li>
        );
      })}
    </ul>
  );
}

function ServiceList({ items }: { items: K8sServiceItem[] }) {
  if (items.length === 0) return <EmptyRow />;
  return (
    <ul className="divide-y divide-slate-100">
      {items.map((svc) => (
        <li key={`${svc.namespace}/${svc.name}`} className="py-2.5">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-slate-900">{svc.name}</p>
            <Badge className="bg-slate-100 text-slate-600 ring-1 ring-inset ring-slate-200">{svc.type}</Badge>
          </div>
          <p className="text-xs text-slate-500">
            {svc.namespace}
            {svc.cluster_ip ? ` · ${svc.cluster_ip}` : ""}
            {svc.ports && svc.ports.length > 0 ? ` · ${svc.ports.join(", ")}` : ""}
          </p>
        </li>
      ))}
    </ul>
  );
}

function PVCList({ items }: { items: K8sPVCItem[] }) {
  if (items.length === 0) return <EmptyRow />;
  return (
    <ul className="divide-y divide-slate-100">
      {items.map((pvc) => (
        <li key={`${pvc.namespace}/${pvc.name}`} className="py-2.5">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-slate-900">{pvc.name}</p>
            <Badge className={pvc.status === "Bound" ? "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200" : "bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-200"}>
              {pvc.status || "Unknown"}
            </Badge>
          </div>
          <p className="text-xs text-slate-500">
            {pvc.namespace}
            {pvc.capacity_bytes !== undefined ? ` · ${formatBytes(pvc.capacity_bytes)}` : ""}
            {pvc.storage_class ? ` · ${pvc.storage_class}` : ""}
          </p>
        </li>
      ))}
    </ul>
  );
}

function JobList({ items }: { items: K8sJobItem[] }) {
  if (items.length === 0) return <EmptyRow />;
  return (
    <ul className="divide-y divide-slate-100">
      {items.map((j) => {
        const done = j.completions !== undefined ? j.succeeded >= j.completions : j.succeeded > 0 && j.active === 0;
        return (
          <li key={`${j.namespace}/${j.name}`} className="flex items-center justify-between py-2.5">
            <div>
              <p className="text-sm font-medium text-slate-900">{j.name}</p>
              <p className="text-xs text-slate-500">
                {j.namespace}
                <LastSeen at={j.last_discovered_at} />
              </p>
            </div>
            <Badge className={j.failed > 0 ? "bg-red-50 text-red-700 ring-1 ring-inset ring-red-200" : done ? "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200" : "bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-200"}>
              {j.succeeded}{j.completions !== undefined ? `/${j.completions}` : ""} succeeded
            </Badge>
          </li>
        );
      })}
    </ul>
  );
}

function CronJobList({ items }: { items: K8sCronJobItem[] }) {
  if (items.length === 0) return <EmptyRow />;
  return (
    <ul className="divide-y divide-slate-100">
      {items.map((cj) => (
        <li key={`${cj.namespace}/${cj.name}`} className="flex items-center justify-between py-2.5">
          <div>
            <p className="text-sm font-medium text-slate-900">{cj.name}</p>
            <p className="text-xs text-slate-500">
              {cj.namespace} · {cj.schedule}
              <LastSeen at={cj.last_discovered_at} />
            </p>
          </div>
          <Badge className={cj.suspended ? "bg-slate-100 text-slate-600 ring-1 ring-inset ring-slate-200" : "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200"}>
            {cj.suspended ? "Suspended" : `${cj.active_jobs} active`}
          </Badge>
        </li>
      ))}
    </ul>
  );
}

function PVList({ items }: { items: K8sPVItem[] }) {
  if (items.length === 0) return <EmptyRow />;
  return (
    <ul className="divide-y divide-slate-100">
      {items.map((pv) => (
        <li key={pv.name} className="py-2.5">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-slate-900">{pv.name}</p>
            <Badge className={pv.status === "Bound" ? "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200" : "bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-200"}>
              {pv.status || "Unknown"}
            </Badge>
          </div>
          <p className="text-xs text-slate-500">
            {pv.capacity_bytes !== undefined ? formatBytes(pv.capacity_bytes) : "—"}
            {pv.storage_class ? ` · ${pv.storage_class}` : ""}
            <LastSeen at={pv.last_discovered_at} />
          </p>
        </li>
      ))}
    </ul>
  );
}

function StorageClassList({ items }: { items: K8sStorageClassItem[] }) {
  if (items.length === 0) return <EmptyRow />;
  return (
    <ul className="divide-y divide-slate-100">
      {items.map((sc) => (
        <li key={sc.name} className="py-2.5">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-slate-900">{sc.name}</p>
            {sc.is_default && <Badge className="bg-sky-50 text-sky-700 ring-1 ring-inset ring-sky-200">Default</Badge>}
          </div>
          <p className="text-xs text-slate-500">
            {sc.provisioner}
            {sc.reclaim_policy ? ` · ${sc.reclaim_policy}` : ""}
            <LastSeen at={sc.last_discovered_at} />
          </p>
        </li>
      ))}
    </ul>
  );
}

function IngressList({ items }: { items: K8sIngressItem[] }) {
  if (items.length === 0) return <EmptyRow />;
  return (
    <ul className="divide-y divide-slate-100">
      {items.map((ing) => (
        <li key={`${ing.namespace}/${ing.name}`} className="py-2.5">
          <p className="text-sm font-medium text-slate-900">{ing.name}</p>
          <p className="text-xs text-slate-500">
            {ing.namespace}
            {ing.class_name ? ` · ${ing.class_name}` : ""}
            {ing.hosts && ing.hosts.length > 0 ? ` · ${ing.hosts.join(", ")}` : ""}
            <LastSeen at={ing.last_discovered_at} />
          </p>
        </li>
      ))}
    </ul>
  );
}

function NetworkPolicyList({ items }: { items: K8sNetworkPolicyItem[] }) {
  if (items.length === 0) return <EmptyRow />;
  return (
    <ul className="divide-y divide-slate-100">
      {items.map((np) => (
        <li key={`${np.namespace}/${np.name}`} className="py-2.5">
          <p className="text-sm font-medium text-slate-900">{np.name}</p>
          <p className="text-xs text-slate-500">
            {np.namespace}
            {np.policy_types && np.policy_types.length > 0 ? ` · ${np.policy_types.join(", ")}` : ""}
            <LastSeen at={np.last_discovered_at} />
          </p>
        </li>
      ))}
    </ul>
  );
}

function EndpointSliceList({ items }: { items: K8sEndpointSliceItem[] }) {
  if (items.length === 0) return <EmptyRow />;
  return (
    <ul className="divide-y divide-slate-100">
      {items.map((es) => (
        <li key={`${es.namespace}/${es.name}`} className="flex items-center justify-between py-2.5">
          <div>
            <p className="text-sm font-medium text-slate-900">{es.name}</p>
            <p className="text-xs text-slate-500">
              {es.namespace} · {es.address_type}
              <LastSeen at={es.last_discovered_at} />
            </p>
          </div>
          <Badge className="bg-slate-100 text-slate-600 ring-1 ring-inset ring-slate-200">{es.endpoint_count} endpoints</Badge>
        </li>
      ))}
    </ul>
  );
}

function ResourceQuotaList({ items }: { items: K8sResourceQuotaItem[] }) {
  if (items.length === 0) return <EmptyRow />;
  return (
    <ul className="divide-y divide-slate-100">
      {items.map((rq) => (
        <li key={`${rq.namespace}/${rq.name}`} className="py-2.5">
          <p className="text-sm font-medium text-slate-900">{rq.name}</p>
          <p className="text-xs text-slate-500">
            {rq.namespace}
            <LastSeen at={rq.last_discovered_at} />
          </p>
          {rq.hard && Object.keys(rq.hard).length > 0 && (
            <p className="mt-1 text-xs text-slate-500">
              {Object.entries(rq.hard).map(([k, v]) => `${k}: ${v}`).join(", ")}
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}

function LimitRangeList({ items }: { items: K8sLimitRangeItem[] }) {
  if (items.length === 0) return <EmptyRow />;
  return (
    <ul className="divide-y divide-slate-100">
      {items.map((lr) => (
        <li key={`${lr.namespace}/${lr.name}`} className="py-2.5">
          <p className="text-sm font-medium text-slate-900">{lr.name}</p>
          <p className="text-xs text-slate-500">
            {lr.namespace}
            {lr.types && lr.types.length > 0 ? ` · ${lr.types.join(", ")}` : ""}
            <LastSeen at={lr.last_discovered_at} />
          </p>
        </li>
      ))}
    </ul>
  );
}

function PDBList({ items }: { items: K8sPDBItem[] }) {
  if (items.length === 0) return <EmptyRow />;
  return (
    <ul className="divide-y divide-slate-100">
      {items.map((pdb) => {
        const healthy = pdb.current_healthy >= pdb.desired_healthy;
        return (
          <li key={`${pdb.namespace}/${pdb.name}`} className="flex items-center justify-between py-2.5">
            <div>
              <p className="text-sm font-medium text-slate-900">{pdb.name}</p>
              <p className="text-xs text-slate-500">
                {pdb.namespace}
                {pdb.min_available ? ` · min available ${pdb.min_available}` : ""}
                {pdb.max_unavailable ? ` · max unavailable ${pdb.max_unavailable}` : ""}
                <LastSeen at={pdb.last_discovered_at} />
              </p>
            </div>
            <Badge className={healthy ? "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200" : "bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-200"}>
              {pdb.current_healthy}/{pdb.desired_healthy} healthy
            </Badge>
          </li>
        );
      })}
    </ul>
  );
}

function HPAList({ items }: { items: K8sHPAItem[] }) {
  if (items.length === 0) return <EmptyRow />;
  return (
    <ul className="divide-y divide-slate-100">
      {items.map((hpa) => (
        <li key={`${hpa.namespace}/${hpa.name}`} className="flex items-center justify-between py-2.5">
          <div>
            <p className="text-sm font-medium text-slate-900">{hpa.name}</p>
            <p className="text-xs text-slate-500">
              {hpa.namespace}
              {hpa.target_cpu_percent !== undefined ? ` · target ${hpa.target_cpu_percent}% CPU` : ""}
              <LastSeen at={hpa.last_discovered_at} />
            </p>
          </div>
          <Badge className="bg-slate-100 text-slate-600 ring-1 ring-inset ring-slate-200">
            {hpa.current_replicas}/{hpa.min_replicas ?? 1}-{hpa.max_replicas}
          </Badge>
        </li>
      ))}
    </ul>
  );
}
