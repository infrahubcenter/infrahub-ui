"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Layers, RefreshCw } from "lucide-react";
import { RouteGuard } from "@/components/auth/route-guard";
import { K8sConnectionStatusBadge } from "@/components/infrastructure/k8s-status-badge";
import { K8sNodeCard } from "@/components/infrastructure/k8s-node-card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ApiError,
  getK8sCluster,
  getK8sClusterResourceSummary,
  listK8sClusterNodes,
  type K8sCluster,
  type K8sClusterResourceSummary,
  type K8sNode,
} from "@/lib/api";

export default function K8sClusterDetailPage() {
  return (
    <RouteGuard requireRole="ADMIN">
      <K8sClusterDetailContent />
    </RouteGuard>
  );
}

function K8sClusterDetailContent() {
  const params = useParams<{ id: string }>();
  const clusterId = params.id;

  const [cluster, setCluster] = useState<K8sCluster | null>(null);
  const [nodes, setNodes] = useState<K8sNode[] | null>(null);
  const [nodesStatus, setNodesStatus] = useState<{ status: string; message?: string } | null>(null);
  const [resources, setResources] = useState<K8sClusterResourceSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(() => {
    return Promise.all([getK8sCluster(clusterId), listK8sClusterNodes(clusterId), getK8sClusterResourceSummary(clusterId)])
      .then(([clusterRes, nodesRes, resourcesRes]) => {
        setCluster(clusterRes);
        setNodes(nodesRes.nodes);
        setNodesStatus({ status: nodesRes.status, message: nodesRes.message });
        setResources(resourcesRes);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load cluster detail."));
  }, [clusterId]);

  useEffect(() => {
    void load();
  }, [load]);

  function handleRefresh() {
    setRefreshing(true);
    void load().finally(() => setRefreshing(false));
  }

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!cluster) return <p className="text-sm text-slate-500">Loading&hellip;</p>;

  const resourceTiles: { label: string; value?: number }[] = [
    { label: "Namespaces", value: resources?.namespaces },
    { label: "Nodes", value: resources?.nodes },
    { label: "Pods", value: resources?.pods },
    { label: "Deployments", value: resources?.deployments },
    { label: "StatefulSets", value: resources?.stateful_sets },
    { label: "DaemonSets", value: resources?.daemon_sets },
    { label: "Services", value: resources?.services },
    { label: "PVCs", value: resources?.persistent_volume_claims },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link href="/k8s/clusters" className="flex w-fit items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
          <ArrowLeft className="h-4 w-4" /> Kubernetes Clusters
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
            <Layers className="h-5 w-5" /> {cluster.name}
          </h2>
          <div className="flex items-center gap-2">
            <K8sConnectionStatusBadge status={cluster.connection_status} />
            <Badge variant={cluster.agent_connected ? "default" : "secondary"}>
              {cluster.agent_connected ? "Agent Connected" : "Agent Not Connected"}
            </Badge>
            <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing}>
              <RefreshCw className={`mr-1 h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} /> Refresh
            </Button>
          </div>
        </div>
        <p className="text-sm text-slate-500">
          Cluster-wide resource inventory and per-node CPU/memory/storage, read live from the connected agent.
        </p>
      </div>

      {!cluster.agent_connected && (
        <Alert variant="destructive">
          <AlertDescription>
            No agent is currently connected for this cluster, so node and resource data below can&apos;t be refreshed
            right now. Install/restart the{" "}
            <a
              href="https://github.com/infrahubcenter/infrahub-k8s-agent"
              target="_blank"
              rel="noreferrer"
              className="underline"
            >
              InfraHub Kubernetes agent
            </a>{" "}
            to reconnect.
          </AlertDescription>
        </Alert>
      )}

      <div>
        <h3 className="mb-2 text-sm font-semibold text-slate-900">Cluster Resources</h3>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
          {resourceTiles.map((tile) => (
            <div key={tile.label} className="rounded-lg border border-slate-200 bg-white p-3 text-center">
              <div className="text-2xl font-semibold text-slate-900">{tile.value ?? "—"}</div>
              <div className="text-xs text-slate-500">{tile.label}</div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-slate-900">Nodes</h3>
        {nodesStatus?.status === "agent_offline" ? (
          <p className="text-sm text-slate-500">{nodesStatus.message}</p>
        ) : !nodes || nodes.length === 0 ? (
          <p className="text-sm text-slate-500">No nodes reported yet.</p>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {nodes.map((node) => (
              <K8sNodeCard key={node.name} node={node} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
