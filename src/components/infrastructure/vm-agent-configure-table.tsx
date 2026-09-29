"use client";

import { useCallback, useEffect, useState } from "react";
import { Search, Server, Settings2, Trash2 } from "lucide-react";
import { useAuth } from "@/components/auth/auth-provider";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { CopyButton } from "@/components/infrastructure/copy-button";
import { DeleteResourceDialog } from "@/components/infrastructure/delete-resource-dialog";
import { VMAgentInstallSection } from "@/components/infrastructure/vm-agent-install-section";
import { buildAgentInstallCommand, defaultInstallMethodFor, vmAgentPermissionNotes, type AgentOS, type AgentInstallMethod } from "@/lib/agent-install-command";
import { InstallNotes } from "@/components/infrastructure/install-notes";
import {
  ApiError,
  listVMs,
  listWorkspaces,
  getVMAgentStatus,
  createAgentOnlyVM,
  deleteVM,
  isAdminRole,
  type VM,
  type VMAgentStatus,
  type Workspace,
} from "@/lib/api";
import { formatAgo } from "@/lib/format";

// Configure tab (Metrics-and-Logs section) -- one row per registered VM,
// each with a "Configure" button opening a Sheet containing that VM's
// VMAgentInstallSection (install/reinstall, manual command, Test
// Connection) without navigating away, mirroring how the Docker Hosts
// list page keeps every action inline per row. "Connect OS" above the
// table creates a brand new, agent-only VM (no SSH at all) and reveals
// the right per-OS install command immediately -- mirrors Docker Host's
// own Connect flow (ConnectDockerHostForm/AgentTokenReveal in
// docker/hosts/page.tsx), extended with an OS picker since this agent now
// ships native Windows/macOS binaries alongside the original Linux
// container image (see agent-install-command.ts).
export function VMAgentConfigureTable() {
  const { user } = useAuth();
  const isAdmin = isAdminRole(user?.role);
  const [vms, setVms] = useState<VM[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [openVM, setOpenVM] = useState<VM | null>(null);

  const load = useCallback(() => {
    listVMs()
      .then((res) => setVms(res.vms))
      .catch(() => setError("Failed to load VMs."));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = (vms ?? []).filter((vm) => {
    const q = query.trim().toLowerCase();
    return !q || vm.name.toLowerCase().includes(q) || (vm.address ?? "").toLowerCase().includes(q);
  });

  return (
    <div className="flex flex-col gap-4">
      {isAdmin && <ConnectOSForm onConnected={load} />}

      <div className="relative w-full max-w-xs">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input placeholder="Search VMs" className="pl-8" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {vms !== null && filtered.length === 0 && (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center">
          <Server className="mx-auto mb-3 h-8 w-8 text-slate-300" />
          <p className="text-sm font-medium text-slate-700">{vms.length === 0 ? "No VMs to show." : "No VMs match your search."}</p>
          {vms.length === 0 && <p className="mt-1 text-sm text-slate-500">Connect an OS above, or register one from the Virtual Machine tab.</p>}
        </div>
      )}

      {filtered.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>VM</TableHead>
                <TableHead>Workspace</TableHead>
                <TableHead>Agent</TableHead>
                <TableHead>Last Heartbeat</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((vm) => (
                <VMAgentConfigureRow key={vm.id} vm={vm} isAdmin={isAdmin} onConfigure={() => setOpenVM(vm)} onDeleted={load} />
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Sheet open={openVM !== null} onOpenChange={(open) => !open && setOpenVM(null)}>
        <SheetContent side="right" className="w-full sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>{openVM?.name}</SheetTitle>
            <SheetDescription>View status, get the install command, or test the VM Agent&rsquo;s connection.</SheetDescription>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto px-4 pb-4">{openVM && <VMAgentInstallSection vmId={openVM.id} />}</div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function VMAgentConfigureRow({
  vm,
  isAdmin,
  onConfigure,
  onDeleted,
}: {
  vm: VM;
  isAdmin: boolean;
  onConfigure: () => void;
  onDeleted: () => void;
}) {
  const [status, setStatus] = useState<VMAgentStatus | null>(null);

  useEffect(() => {
    getVMAgentStatus(vm.id)
      .then(setStatus)
      .catch(() => setStatus(null));
  }, [vm.id]);

  const badge = !status
    ? { text: "—", tone: "bg-slate-100 text-slate-600 ring-slate-200" }
    : status.connected
      ? { text: "Connected", tone: "bg-emerald-50 text-emerald-700 ring-emerald-200" }
      : { text: "Disconnected", tone: "bg-slate-100 text-slate-600 ring-slate-200" };

  return (
    <TableRow>
      <TableCell className="font-medium text-slate-900">{vm.name}</TableCell>
      <TableCell className="text-slate-600">{vm.workspace}</TableCell>
      <TableCell>
        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${badge.tone}`}>{badge.text}</span>
      </TableCell>
      <TableCell className="text-slate-600">{status?.last_heartbeat_at ? formatAgo(status.last_heartbeat_at) : "Never"}</TableCell>
      <TableCell className="text-right">
        <div className="flex items-center justify-end gap-1">
          <Button variant="ghost" size="sm" onClick={onConfigure}>
            <Settings2 className="mr-1 h-3.5 w-3.5" /> Configure
          </Button>
          {isAdmin && (
            <DeleteResourceDialog
              trigger={
                <Button variant="ghost" size="sm" className="text-red-600 hover:text-red-700">
                  <Trash2 className="mr-1 h-3.5 w-3.5" /> Delete
                </Button>
              }
              resourceTypeLabel="VM"
              resourceName={vm.name}
              description="Removes this VM's resource/configuration from Infra Hub Center only -- the real machine and its running agent are never touched. Historical audit and metrics history are preserved."
              onConfirm={async () => {
                await deleteVM(vm.id, vm.name);
              }}
              onDeleted={onDeleted}
            />
          )}
        </div>
      </TableCell>
    </TableRow>
  );
}

const OS_OPTIONS: { value: AgentOS; label: string }[] = [
  { value: "LINUX", label: "Linux" },
  { value: "WINDOWS", label: "Windows" },
  { value: "MAC", label: "Mac" },
];

// Install method options and their listed (= default) order differ by OS
// -- see agent-install-command.ts's doc comment for the full reasoning:
// Linux's Docker path was never virtualized, so it stays the recommended
// default there and NATIVE is offered only to skip a Docker dependency;
// Windows/Mac default to NATIVE since it's the only method that reports
// real host metrics on those two OSes.
function installMethodOptionsFor(os: AgentOS): { value: AgentInstallMethod; label: string }[] {
  if (os === "LINUX") {
    return [
      { value: "DOCKER", label: "Docker (recommended)" },
      { value: "NATIVE", label: "Native binary (no Docker required)" },
    ];
  }
  return [
    { value: "NATIVE", label: "Native binary (accurate metrics)" },
    { value: "DOCKER", label: "Docker (virtualized metrics)" },
  ];
}

// Per-OS/method run instructions above the command.
function runHint(os: AgentOS, method: AgentInstallMethod): string {
  if (method === "DOCKER") return "Run this on the machine (any machine with Docker):";
  switch (os) {
    case "LINUX":
      return "Run this in a terminal on the Linux machine:";
    case "WINDOWS":
      return "Run this in PowerShell on the Windows machine:";
    case "MAC":
      return "Run this in a terminal on the Mac:";
  }
}

function AgentTokenReveal({
  vmName,
  token,
  backendUrl,
  os,
  onOsChange,
  onDismiss,
}: {
  vmName: string;
  token: string;
  backendUrl: string;
  os: AgentOS;
  onOsChange: (os: AgentOS) => void;
  onDismiss: () => void;
}) {
  const [method, setMethod] = useState<AgentInstallMethod>(() => defaultInstallMethodFor(os));
  // Reset the method to the new OS's default whenever the OS selection
  // itself changes -- adjusted during render (React's recommended pattern
  // for this, not an effect) so switching OS never leaves a stale/invalid
  // method (e.g. Windows' NATIVE) selected for the newly picked OS.
  const [prevOs, setPrevOs] = useState(os);
  if (os !== prevOs) {
    setPrevOs(os);
    setMethod(defaultInstallMethodFor(os));
  }
  const runCommand = buildAgentInstallCommand(os, token, backendUrl, method);
  return (
    <Alert>
      <AlertDescription>
        <p className="mb-2">
          Agent token for <strong>{vmName}</strong> (shown once -- it cannot be retrieved again):
        </p>
        <div className="flex items-center gap-2">
          <code className="block flex-1 break-all rounded bg-slate-100 p-2 text-xs">{token}</code>
          <CopyButton value={token} />
        </div>
        <div className="mt-3 flex flex-wrap gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="connect-os-reveal-os">Target OS</Label>
            <Select value={os} onValueChange={(v) => onOsChange((v ?? "LINUX") as AgentOS)}>
              <SelectTrigger id="connect-os-reveal-os" className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {OS_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="connect-os-reveal-method">Install Method</Label>
            <Select value={method} onValueChange={(v) => setMethod((v ?? defaultInstallMethodFor(os)) as AgentInstallMethod)}>
              <SelectTrigger id="connect-os-reveal-method" className="w-64">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {installMethodOptionsFor(os).map((m) => (
                  <SelectItem key={m.value} value={m.value}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        {os !== "LINUX" && method === "DOCKER" && (
          <p className="mt-2 text-xs text-amber-600">
            Docker Desktop always runs this container inside its own Linux VM -- CPU/memory/storage will reflect that VM, not the
            real machine. Use the native binary if you need accurate host metrics.
          </p>
        )}
        <p className="mt-2 text-xs text-slate-500">{runHint(os, method)}</p>
        <div className="mt-1 flex items-start gap-2">
          <pre className="flex-1 overflow-x-auto whitespace-pre rounded bg-slate-900 p-2 text-xs text-slate-100">{runCommand}</pre>
          <CopyButton value={runCommand} />
        </div>
        <InstallNotes notes={vmAgentPermissionNotes(os, method)} />
        <Button variant="ghost" size="sm" className="mt-2" onClick={onDismiss}>
          Dismiss
        </Button>
      </AlertDescription>
    </Alert>
  );
}

function ConnectOSForm({ onConnected }: { onConnected: () => void }) {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);

  const [name, setName] = useState("");
  const [workspaceId, setWorkspaceId] = useState("");
  const [os, setOs] = useState<AgentOS>("LINUX");
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
      setError("Give the VM a name and pick a workspace.");
      return;
    }
    setSubmitting(true);
    try {
      const created = await createAgentOnlyVM({ workspace_id: workspaceId, name: name.trim() });
      setConnected({ name: created.name, token: created.agent_token, backendUrl: created.backend_url });
      setName("");
      setWorkspaceId("");
      onConnected();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to connect OS.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <h3 className="mb-3 text-sm font-semibold text-slate-900">Connect OS</h3>

      {connected && (
        <div className="mb-4">
          <AgentTokenReveal
            vmName={connected.name}
            token={connected.token}
            backendUrl={connected.backendUrl}
            os={os}
            onOsChange={setOs}
            onDismiss={() => setConnected(null)}
          />
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="connect-os-name">Name</Label>
            <Input id="connect-os-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="app-server-01" disabled={submitting} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="connect-os-workspace">Workspace</Label>
            <Select value={workspaceId} onValueChange={(v) => setWorkspaceId(v ?? "")} disabled={submitting}>
              <SelectTrigger id="connect-os-workspace">
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
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="connect-os-os">Operating System</Label>
            <Select value={os} onValueChange={(v) => setOs((v ?? "LINUX") as AgentOS)} disabled={submitting}>
              <SelectTrigger id="connect-os-os">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {OS_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <p className="text-xs text-slate-500">
          Linux defaults to Docker (its metrics are already host-accurate either way); Windows and Mac default to a native,
          install-free binary since Docker there only ever sees its own virtual machine, never the real host. Every OS also
          offers the other install method afterward. Connecting issues a one-time agent token below plus the exact command to
          run.
        </p>
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <Button type="submit" disabled={submitting || !name.trim() || !workspaceId} className="w-fit">
          {submitting ? "Connecting…" : "Connect OS"}
        </Button>
      </form>
    </div>
  );
}
