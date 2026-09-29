"use client";

import { useCallback, useEffect, useState } from "react";
import { Container, Plug, Trash2 } from "lucide-react";
import { RouteGuard } from "@/components/auth/route-guard";
import { DeleteResourceDialog } from "@/components/infrastructure/delete-resource-dialog";
import { CopyButton } from "@/components/infrastructure/copy-button";
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
  createDockerHost,
  deleteDockerHost,
  listDockerHosts,
  listWorkspaces,
  regenerateDockerHostAgentToken,
  testDockerHostConnection,
  type DockerHost,
  type Workspace,
} from "@/lib/api";

// Configure Docker Hosts -- standalone, agent-only Docker targets, with no
// VM record and no SSH access at all. Mirrors k8s/clusters/page.tsx (the
// Kubernetes Clusters page) exactly: name + workspace connects a new host
// and issues a one-time bearer token; the admin runs the shown `docker
// run` command wherever they want the agent to actually run (a bare
// server, a container host, anywhere with Docker). Independent of the
// per-VM Docker agent, which attaches to an existing InfraHub-managed VM
// and installs over SSH from that VM's own detail page.
export default function DockerHostsPage() {
  return (
    <RouteGuard requireRole="ADMIN">
      <DockerHostsContent />
    </RouteGuard>
  );
}

function DockerHostsContent() {
  const [hosts, setHosts] = useState<DockerHost[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    listDockerHosts()
      .then((res) => setHosts(res.hosts))
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load Docker hosts."));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleDelete(host: DockerHost) {
    await deleteDockerHost(host.id, host.name);
    load();
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
          <Container className="h-5 w-5" /> Docker Host Onboarding
        </h2>
        <p className="text-sm text-slate-500">
          Connect a standalone Docker host by running the agent as a container -- no VM record and no SSH access
          required at all. Once the agent container is running, this host shows as Connected below.
        </p>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <ConnectDockerHostForm onConnected={load} />

      <div className="rounded-lg border border-slate-200 bg-white">
        {hosts.length === 0 ? (
          <p className="p-6 text-sm text-slate-500">No Docker hosts connected yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Host</TableHead>
                <TableHead>Workspace</TableHead>
                <TableHead>Agent</TableHead>
                <TableHead>Engine Version</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {hosts.map((h) => (
                <HostRow key={h.id} host={h} onChanged={load} onDelete={() => handleDelete(h)} />
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}

function AgentStatusBadge({ host }: { host: DockerHost }) {
  if (host.agent_connected) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
        Connected
      </span>
    );
  }
  if (host.agent_token_configured) {
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

function HostRow({
  host,
  onChanged,
  onDelete,
}: {
  host: DockerHost;
  onChanged: () => void;
  onDelete: () => Promise<void>;
}) {
  const [regenerating, setRegenerating] = useState(false);
  const [regenError, setRegenError] = useState<string | null>(null);
  const [reveal, setReveal] = useState<{ token: string; runCommand: string } | null>(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  async function handleTest() {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await testDockerHostConnection(host.id);
      setTestResult(
        result.status === "connected"
          ? `Connected -- Docker Engine ${result.engine_version ?? "unknown version"}${result.latency_ms !== undefined ? ` (${result.latency_ms} ms)` : ""}.`
          : (result.message ?? "Connection failed.")
      );
    } catch (err) {
      setTestResult(err instanceof ApiError ? err.message : "Connection test failed.");
    } finally {
      setTesting(false);
      onChanged();
    }
  }

  async function handleRegenerateToken() {
    if (
      host.agent_token_configured &&
      !window.confirm("This immediately invalidates the currently running agent container's token. Continue?")
    ) {
      return;
    }
    setRegenerating(true);
    setRegenError(null);
    try {
      const res = await regenerateDockerHostAgentToken(host.id);
      setReveal({ token: res.agent_token, runCommand: res.run_command });
    } catch (err) {
      setRegenError(err instanceof ApiError ? err.message : "Failed to regenerate the agent token.");
    } finally {
      setRegenerating(false);
      onChanged();
    }
  }

  return (
    <>
      <TableRow>
        <TableCell className="font-medium text-slate-900">{host.name}</TableCell>
        <TableCell>
          <Badge variant="secondary">{host.workspace_name}</Badge>
        </TableCell>
        <TableCell>
          <AgentStatusBadge host={host} />
        </TableCell>
        <TableCell className="text-slate-600">{host.engine_version ?? "—"}</TableCell>
        <TableCell className="text-right">
          <div className="flex items-center justify-end gap-1">
            <Button variant="ghost" size="sm" onClick={handleTest} disabled={testing}>
              <Plug className="mr-1 h-3.5 w-3.5" /> {testing ? "Testing…" : "Test Connection"}
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
              resourceTypeLabel="Docker host"
              resourceName={host.name}
              description="This disconnects the host from monitoring and revokes its agent token. The real Docker daemon/containers are never touched -- you'll still need to stop the agent container yourself."
              onConfirm={onDelete}
            />
          </div>
        </TableCell>
      </TableRow>
      {testResult && (
        <TableRow>
          <TableCell colSpan={5} className="border-t-0 py-1">
            <p className="text-xs text-slate-500">{testResult}</p>
          </TableCell>
        </TableRow>
      )}
      {regenError && (
        <TableRow>
          <TableCell colSpan={5} className="border-t-0 py-1">
            <p className="text-xs text-red-600">{regenError}</p>
          </TableCell>
        </TableRow>
      )}
      {reveal && (
        <TableRow>
          <TableCell colSpan={5} className="border-t-0 bg-slate-50 py-3">
            <AgentTokenReveal hostName={host.name} token={reveal.token} runCommand={reveal.runCommand} onDismiss={() => setReveal(null)} />
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

// Shown exactly once right after a token is issued/regenerated -- the
// backend only ever stores its hash, so this is the admin's only chance
// to copy it (or the ready-made docker run command that already embeds
// it) before it's gone for good.
function AgentTokenReveal({
  hostName,
  token,
  runCommand,
  onDismiss,
}: {
  hostName: string;
  token: string;
  runCommand: string;
  onDismiss: () => void;
}) {
  return (
    <Alert>
      <AlertDescription>
        <p className="mb-2">
          Agent token for <strong>{hostName}</strong> (shown once -- it cannot be retrieved again):
        </p>
        <div className="flex items-center gap-2">
          <code className="block flex-1 break-all rounded bg-slate-100 p-2 text-xs">{token}</code>
          <CopyButton value={token} />
        </div>
        <p className="mt-2 text-xs text-slate-500">
          Run this on any machine with Docker, wherever you want to monitor from:
        </p>
        <div className="mt-1 flex items-start gap-2">
          <pre className="flex-1 overflow-x-auto whitespace-pre-wrap break-all rounded bg-slate-900 p-2 text-xs text-slate-100">
            {runCommand}
          </pre>
          <CopyButton value={runCommand} />
        </div>
        <Button variant="ghost" size="sm" className="mt-2" onClick={onDismiss}>
          Dismiss
        </Button>
      </AlertDescription>
    </Alert>
  );
}

function ConnectDockerHostForm({ onConnected }: { onConnected: () => void }) {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);

  const [name, setName] = useState("");
  const [workspaceId, setWorkspaceId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState<{ name: string; token: string; runCommand: string } | null>(null);

  useEffect(() => {
    listWorkspaces()
      .then((res) => setWorkspaces(res.workspaces))
      .catch(() => setWorkspaces([]));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim() || !workspaceId) {
      setError("Give the host a name and pick a workspace.");
      return;
    }
    setSubmitting(true);
    try {
      const created = await createDockerHost({ workspace_id: workspaceId, name: name.trim() });
      setConnected({ name: created.name, token: created.agent_token, runCommand: created.run_command });
      setName("");
      setWorkspaceId("");
      onConnected();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to connect host.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <h3 className="mb-3 text-sm font-semibold text-slate-900">Connect Docker Host</h3>

      {connected && (
        <div className="mb-4">
          <AgentTokenReveal
            hostName={connected.name}
            token={connected.token}
            runCommand={connected.runCommand}
            onDismiss={() => setConnected(null)}
          />
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="docker-host-name">Host Name</Label>
            <Input
              id="docker-host-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="build-server-01"
              disabled={submitting}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="docker-host-workspace">Workspace</Label>
            <Select value={workspaceId} onValueChange={(v) => setWorkspaceId(v ?? "")} disabled={submitting}>
              <SelectTrigger id="docker-host-workspace">
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
        <p className="text-xs text-slate-500">
          Connecting issues a one-time agent token below plus the exact <code>docker run</code> command to paste --
          nothing to build or download by hand.
        </p>
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <Button type="submit" disabled={submitting || !name.trim() || !workspaceId} className="w-fit">
          {submitting ? "Connecting…" : "Connect Host"}
        </Button>
      </form>
    </div>
  );
}
