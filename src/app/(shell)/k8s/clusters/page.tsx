"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Layers, Plug, RefreshCw, Trash2 } from "lucide-react";
import { RouteGuard } from "@/components/auth/route-guard";
import { DeleteResourceDialog } from "@/components/infrastructure/delete-resource-dialog";
import { CopyButton } from "@/components/infrastructure/copy-button";
import { InstallNotes } from "@/components/infrastructure/install-notes";
import { K8S_PERMISSION_NOTES } from "@/lib/agent-install-command";
import { K8sConnectionStatusBadge } from "@/components/infrastructure/k8s-status-badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ApiError,
  createK8sCluster,
  deleteK8sCluster,
  K8S_AGENT_MANIFEST_URL,
  k8sAgentConnectUrl,
  listK8sClusters,
  listWorkspaces,
  regenerateK8sAgentToken,
  scanK8sCluster,
  testK8sConnection,
  type K8sCluster,
  type Workspace,
} from "@/lib/api";

export default function K8sClustersPage() {
  return (
    <RouteGuard requireRole="ADMIN">
      <K8sClustersContent />
    </RouteGuard>
  );
}

function K8sClustersContent() {
  const [clusters, setClusters] = useState<K8sCluster[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    listK8sClusters()
      .then((res) => setClusters(res.clusters))
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load Kubernetes clusters."));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleDelete(cluster: K8sCluster) {
    await deleteK8sCluster(cluster.id, cluster.name);
    load();
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
          <Layers className="h-5 w-5" /> Kubernetes Cluster Onboarding
        </h2>
        <p className="text-sm text-slate-500">
          Connect a standalone Kubernetes cluster by installing InfraHub&apos;s in-cluster agent -- no kubeconfig is ever
          uploaded here. Once the agent is running, the cluster&apos;s pods appear in Kubernetes Monitoring/Logs for
          anyone granted access on the cluster&apos;s workspace.
        </p>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <ConnectClusterForm onConnected={load} />

      <div className="rounded-lg border border-slate-200 bg-white">
        {clusters.length === 0 ? (
          <p className="p-6 text-sm text-slate-500">No clusters connected yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cluster</TableHead>
                <TableHead>Scope</TableHead>
                <TableHead>Agent</TableHead>
                <TableHead>Last Test</TableHead>
                <TableHead>Kubernetes Version</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {clusters.map((c) => (
                <ClusterRow key={c.id} cluster={c} onChanged={load} onDelete={() => handleDelete(c)} />
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}

function AgentStatusBadge({ cluster }: { cluster: K8sCluster }) {
  if (cluster.agent_connected) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
        Connected
      </span>
    );
  }
  if (cluster.agent_token_configured) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 ring-1 ring-inset ring-amber-600/20">
        Not Connected
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500 ring-1 ring-inset ring-slate-400/20">
      No Token Issued
    </span>
  );
}

function ClusterRow({
  cluster,
  onChanged,
  onDelete,
}: {
  cluster: K8sCluster;
  onChanged: () => void;
  onDelete: () => Promise<void>;
}) {
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [newToken, setNewToken] = useState<{ token: string; backendUrl: string } | null>(null);
  const [regenerating, setRegenerating] = useState(false);

  async function handleTest() {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await testK8sConnection(cluster.id);
      setTestResult(
        result.status === "connected"
          ? `Connected${result.kubernetes_version ? ` -- Kubernetes ${result.kubernetes_version}` : ""}`
          : (result.message ?? "Connection failed.")
      );
    } catch (err) {
      setTestResult(err instanceof ApiError ? err.message : "Connection test failed.");
    } finally {
      setTesting(false);
      onChanged();
    }
  }

  async function handleScan() {
    setScanning(true);
    try {
      await scanK8sCluster(cluster.id);
    } catch {
      // Errors here are non-fatal (rate limit / in progress) -- the status
      // badge/last-connection fields on the next load reflect the real
      // outcome either way.
    } finally {
      setScanning(false);
      onChanged();
    }
  }

  async function handleRegenerateToken() {
    if (
      cluster.agent_token_configured &&
      !window.confirm("This immediately invalidates the currently installed agent's token. Continue?")
    ) {
      return;
    }
    setRegenerating(true);
    try {
      const res = await regenerateK8sAgentToken(cluster.id);
      setNewToken({ token: res.agent_token, backendUrl: res.backend_url ?? k8sAgentConnectUrl() });
    } catch (err) {
      setTestResult(err instanceof ApiError ? err.message : "Failed to regenerate the agent token.");
    } finally {
      setRegenerating(false);
      onChanged();
    }
  }

  return (
    <>
      <TableRow>
        <TableCell>
          <Link href={`/k8s/clusters/${cluster.id}`} className="font-medium text-slate-900 hover:underline">
            {cluster.name}
          </Link>
        </TableCell>
        <TableCell>
          <Badge variant="secondary">{cluster.workspace_name}</Badge>
        </TableCell>
        <TableCell>
          <AgentStatusBadge cluster={cluster} />
        </TableCell>
        <TableCell>
          <K8sConnectionStatusBadge status={cluster.connection_status} />
        </TableCell>
        <TableCell className="text-slate-600">{cluster.kubernetes_version ?? "—"}</TableCell>
        <TableCell className="text-right">
          <div className="flex items-center justify-end gap-1">
            <Button variant="ghost" size="sm" onClick={handleTest} disabled={testing}>
              <Plug className="mr-1 h-3.5 w-3.5" /> {testing ? "Testing…" : "Test"}
            </Button>
            <Button variant="ghost" size="sm" onClick={handleScan} disabled={scanning}>
              <RefreshCw className="mr-1 h-3.5 w-3.5" /> {scanning ? "Scanning…" : "Scan"}
            </Button>
            <Button variant="ghost" size="sm" onClick={handleRegenerateToken} disabled={regenerating}>
              {regenerating ? "Regenerating…" : "Regenerate Token"}
            </Button>
            <DeleteResourceDialog
              trigger={
                <Button variant="ghost" size="sm">
                  <Trash2 className="h-3.5 w-3.5 text-red-600" />
                </Button>
              }
              resourceTypeLabel="Kubernetes cluster"
              resourceName={cluster.name}
              description="This disconnects the cluster from monitoring and revokes its agent token. The real cluster itself is never touched -- you'll still need to remove the agent deployment from the cluster yourself."
              onConfirm={onDelete}
            />
          </div>
        </TableCell>
      </TableRow>
      {testResult && (
        <TableRow>
          <TableCell colSpan={6} className="border-t-0 py-1">
            <p className="text-xs text-slate-500">{testResult}</p>
          </TableCell>
        </TableRow>
      )}
      {newToken && (
        <TableRow>
          <TableCell colSpan={6} className="border-t-0 bg-slate-50 py-3">
            <AgentTokenReveal
              clusterName={cluster.name}
              token={newToken.token}
              backendUrl={newToken.backendUrl}
              onDismiss={() => setNewToken(null)}
            />
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

// Shown exactly once right after a token is issued/regenerated -- the
// backend only ever stores its hash, so this is the admin's only chance
// to copy it into the agent's Secret before it's gone for good.
function AgentTokenReveal({
  clusterName,
  token,
  backendUrl,
  onDismiss,
}: {
  clusterName: string;
  token: string;
  backendUrl: string;
  onDismiss: () => void;
}) {
  const k8sInstallCommand =
    `kubectl create namespace infrahub-agent\n` +
    `kubectl create secret generic infrahub-k8s-agent -n infrahub-agent \\\n` +
    `  --from-literal=backend-url='${backendUrl}' \\\n` +
    `  --from-literal=agent-token='${token}'\n` +
    `kubectl apply -f ${K8S_AGENT_MANIFEST_URL}\n` +
    `kubectl -n infrahub-agent rollout status deploy/infrahub-k8s-agent`;
  return (
    <Alert>
      <AlertDescription>
        <p className="mb-2">
          Agent token for <strong>{clusterName}</strong> (shown once -- it cannot be retrieved again):
        </p>
        <div className="flex items-center gap-2">
          <code className="block flex-1 break-all rounded bg-slate-100 p-2 text-xs">{token}</code>
          <CopyButton value={token} />
        </div>
        <p className="mt-2 text-xs text-slate-500">
          Run this on any machine with <code>kubectl</code> pointed at the target cluster -- no local checkout of
          this app needed, the manifest is applied straight from its public repo:
        </p>
        <div className="mt-1 flex items-start gap-2">
          <pre className="flex-1 overflow-x-auto rounded bg-slate-900 p-2 text-xs text-slate-100">{k8sInstallCommand}</pre>
          <CopyButton value={k8sInstallCommand} />
        </div>
        <InstallNotes notes={K8S_PERMISSION_NOTES} />
        <p className="mt-2 text-xs text-slate-500">
          Already ran this before and got &quot;AlreadyExists&quot; on the namespace/secret? That&apos;s fine to
          ignore -- just make sure the last <code>kubectl apply -f …manifest.yaml</code> line above actually ran;
          that&apos;s the step that installs the agent itself.
        </p>
        <p className="mt-2 text-xs text-slate-500">
          Testing against a <strong>local</strong> cluster (Docker Desktop Kubernetes, minikube, kind) with this
          backend running on your own machine: replace <code>localhost</code> in the backend-url above with{" "}
          <code>host.docker.internal</code> (Docker Desktop Kubernetes) or your tool&apos;s own host-alias --{" "}
          <code>localhost</code> inside a pod means the pod itself, never your machine.
        </p>
        <Button variant="ghost" size="sm" className="mt-2" onClick={onDismiss}>
          Dismiss
        </Button>
      </AlertDescription>
    </Alert>
  );
}

function ConnectClusterForm({ onConnected }: { onConnected: () => void }) {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);

  const [name, setName] = useState("");
  const [workspaceId, setWorkspaceId] = useState("");
  const [namespaceFilter, setNamespaceFilter] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState<{ name: string; token: string; backendUrl: string } | null>(null);

  useEffect(() => {
    listWorkspaces()
      .then((res) => setWorkspaces(res.workspaces))
      .catch(() => setWorkspaces([]));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim() || !workspaceId) {
      setError("Give the cluster a name and pick a workspace.");
      return;
    }
    setSubmitting(true);
    try {
      const created = await createK8sCluster({
        workspace_id: workspaceId,
        name: name.trim(),
        namespace_filter: namespaceFilter.trim() || undefined,
      });
      setConnected({ name: created.name, token: created.agent_token, backendUrl: created.backend_url ?? k8sAgentConnectUrl() });
      setName("");
      setWorkspaceId("");
      setNamespaceFilter("");
      onConnected();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to connect cluster.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <h3 className="mb-3 text-sm font-semibold text-slate-900">Connect Cluster</h3>

      {connected && (
        <div className="mb-4">
          <AgentTokenReveal
            clusterName={connected.name}
            token={connected.token}
            backendUrl={connected.backendUrl}
            onDismiss={() => setConnected(null)}
          />
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="k8s-cluster-name">Cluster Name</Label>
            <Input id="k8s-cluster-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="production-cluster" disabled={submitting} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="k8s-cluster-workspace">Workspace</Label>
            <Select value={workspaceId} onValueChange={(v) => setWorkspaceId(v ?? "")} disabled={submitting}>
              <SelectTrigger id="k8s-cluster-workspace">
                <SelectValue placeholder="Select a workspace" />
              </SelectTrigger>
              <SelectContent>
                {workspaces.map((w) => (
                  <SelectItem key={w.id} value={w.id}>
                    {w.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="k8s-cluster-namespace">Namespace filter (optional)</Label>
          <Input
            id="k8s-cluster-namespace"
            value={namespaceFilter}
            onChange={(e) => setNamespaceFilter(e.target.value)}
            placeholder="Leave blank to discover pods across every namespace"
            disabled={submitting}
          />
        </div>
        <p className="text-xs text-slate-500">
          Registering the cluster issues a one-time agent token below -- no kubeconfig is uploaded. Apply the{" "}
          <a
            href="https://github.com/infrahubcenter/infrahub-k8s-agent"
            target="_blank"
            rel="noreferrer"
            className="text-sky-700 hover:underline"
          >
            InfraHub Kubernetes agent
          </a>{" "}
          manifest inside the target cluster with that token to connect it.
        </p>
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <Button type="submit" disabled={submitting || !name.trim() || !workspaceId} className="w-fit">
          {submitting ? "Connecting…" : "Connect Cluster"}
        </Button>
      </form>
    </div>
  );
}
