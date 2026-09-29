"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Cpu, HardDrive, MemoryStick, Boxes, Container, Check, X, KeyRound, TerminalSquare, Settings, RefreshCw } from "lucide-react";
import { useAuth } from "@/components/auth/auth-provider";
import { StatusBadge } from "@/components/infrastructure/status-badge";
import { ConfirmDialog } from "@/components/infrastructure/confirm-dialog";
import { DeleteResourceDialog } from "@/components/infrastructure/delete-resource-dialog";
import { SSHKeyPicker, type SSHKeyPickerValue } from "@/components/infrastructure/ssh-key-picker";
import { CARD_THEMES, type CardTheme } from "@/components/infrastructure/monitor-dashboard-widgets";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { formatBytes, formatAgo } from "@/lib/format";
import {
  ApiError,
  deleteVM,
  discoverVM,
  getConnectionStatus,
  getDiscoveryHistory,
  getDockerSummary,
  getVM,
  testConnection,
  trustHostKey,
  updateVM,
  type ConnectionTestResult,
  type DiscoveryResult,
  type DiscoveryRun,
  type DockerSummary,
  type VMConnectionStatus,
  type VMDetail,
  isAdminRole,
} from "@/lib/api";

export default function VMDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const vmId = params.id;
  const { user } = useAuth();

  const [vm, setVm] = useState<VMDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const detail = await getVM(vmId);
      setVm(detail);
    } catch (err) {
      setError(err instanceof ApiError && err.status === 404 ? "VM not found." : "Failed to load VM.");
    }
  }, [vmId]);

  useEffect(() => {
    // Load-on-mount/param-change: no external store to subscribe to.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function handleToggleActive() {
    if (!vm) return;
    await updateVM(vm.id, { status: vm.status === "DISABLED" ? "UNKNOWN" : "DISABLED" });
    await load();
  }

  async function handleToggleMonitoring(enabled: boolean) {
    if (!vm) return;
    await updateVM(vm.id, { monitoring_enabled: enabled });
    await load();
  }

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!vm) return <p className="text-sm text-slate-500">Loading&hellip;</p>;

  const canConnect = vm.permissions.includes("vm.connect");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-slate-900">{vm.name}</h2>
            <StatusBadge status={vm.status} />
          </div>
          <p className="text-sm text-slate-500">
            {vm.workspace}
            {vm.address && <> &middot; {vm.address}</>}
          </p>
        </div>
        {isAdminRole(user?.role) && (
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <Checkbox checked={vm.monitoring_enabled} onCheckedChange={(v) => handleToggleMonitoring(v === true)} />
              Monitoring enabled
            </label>
            <ConfirmDialog
              trigger={<Button variant="outline">{vm.status === "DISABLED" ? "Reactivate VM" : "Deactivate VM"}</Button>}
              title={`${vm.status === "DISABLED" ? "Reactivate" : "Deactivate"} ${vm.name}?`}
              description={
                vm.status === "DISABLED"
                  ? "This VM will become accessible to authorized members again."
                  : `Are you sure you want to deactivate ${vm.name}? It will no longer grant new access to members, though existing audit and monitoring history is preserved.`
              }
              confirmLabel={vm.status === "DISABLED" ? "Reactivate" : "Deactivate"}
              destructive={vm.status !== "DISABLED"}
              onConfirm={handleToggleActive}
            />
            <DeleteResourceDialog
              trigger={<Button variant="outline">Delete</Button>}
              resourceTypeLabel="VM"
              resourceName={vm.name}
              description="Removes this VM's resource/configuration from Infra Hub Center only -- the real VM/server is never touched, stopped, or destroyed. Historical audit and operation records are preserved."
              onConfirm={async () => {
                await deleteVM(vm.id, vm.name);
              }}
              onDeleted={() => router.push("/vms")}
            />
          </div>
        )}
      </div>

      {/* Console access first -- this is the primary reason an admin/
          member lands on this page (the VM list itself now links straight
          to /vms/{id}/console; this section covers anyone who arrives at
          the detail page some other way, e.g. from a Docker/Monitoring
          link). */}
      {canConnect && <ConsoleSection vmId={vm.id} vmName={vm.name} />}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard icon={Cpu} label="CPU" value={vm.cpu_cores ? `${vm.cpu_cores} cores` : "Not discovered"} theme={CARD_THEMES.emerald} />
        <StatCard icon={MemoryStick} label="Memory" value={formatBytes(vm.total_memory_bytes)} theme={CARD_THEMES.emerald} />
        <StatCard icon={HardDrive} label="Storage" value={formatBytes(vm.total_storage_bytes)} theme={CARD_THEMES.cyan} />
        <StatCard icon={Boxes} label="Docker" value={vm.docker_installed ? "Installed" : "Unknown"} theme={CARD_THEMES.indigo} />
      </div>

      {vm.permissions.includes("vm.view") && <DockerSummarySection vmId={vm.id} />}
      {vm.permissions.includes("vm.view") && <UpdatesSection vmId={vm.id} />}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <h3 className="mb-3 text-sm font-semibold text-slate-900">Connection</h3>
          <dl className="grid grid-cols-2 gap-y-2 text-sm">
            <dt className="text-slate-500">Address</dt>
            <dd className="text-slate-900">{vm.address || "Not configured (agent-only VM)"}</dd>
            <dt className="text-slate-500">Username</dt>
            <dd className="text-slate-900">{vm.username || "—"}</dd>
            <dt className="text-slate-500">SSH Port</dt>
            <dd className="text-slate-900">{vm.ssh_port}</dd>
          </dl>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <h3 className="mb-3 text-sm font-semibold text-slate-900">System Information</h3>
          <dl className="grid grid-cols-2 gap-y-2 text-sm">
            <dt className="text-slate-500">Hostname</dt>
            <dd className="text-slate-900">{vm.hostname || "Not discovered"}</dd>
            <dt className="text-slate-500">OS</dt>
            <dd className="text-slate-900">{vm.os_name ? `${vm.os_name} ${vm.os_version ?? ""}` : "Not discovered"}</dd>
            <dt className="text-slate-500">Kernel</dt>
            <dd className="text-slate-900">{vm.kernel_version ?? "Not discovered"}</dd>
            <dt className="text-slate-500">Architecture</dt>
            <dd className="text-slate-900">{vm.architecture ?? "Not discovered"}</dd>
            <dt className="text-slate-500">Last Seen</dt>
            <dd className="text-slate-900">{vm.last_seen_at ? new Date(vm.last_seen_at).toLocaleString() : "Never"}</dd>
          </dl>
        </div>
      </div>

      {!vm.permissions.includes("vm.view") ? null : (
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <span>Your access:</span>
          <Badge variant="secondary">{vm.access_source}</Badge>
          {!canConnect && <Badge variant="secondary">View only</Badge>}
        </div>
      )}

      {isAdminRole(user?.role) && (
        <>
          <ConfigureVMSection vm={vm} onChanged={load} />
          {/* SSH-only sections -- meaningless for an agent-only VM (see
              createAgentOnlyVM/"Connect VM"), which has no address at
              all and connects purely via the push-based VM Agent. Fill
              in an address above to reveal these. */}
          {vm.address && (
            <>
              <SSHCredentialSection vm={vm} onChanged={load} />
              <ConnectionSection vm={vm} onConnected={load} />
              <DiscoverySection vmId={vm.id} onDiscovered={load} />
            </>
          )}
        </>
      )}

    </div>
  );
}

function StatCard({ icon: Icon, label, value, theme }: { icon: typeof Cpu; label: string; value: string; theme: CardTheme }) {
  return (
    <div className={`rounded-lg border border-t-4 border-slate-200 bg-white p-4 shadow-sm ${theme.border}`}>
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-slate-500">{label}</span>
        <span className={`flex h-7 w-7 items-center justify-center rounded-full ${theme.badgeBg}`}>
          <Icon className={`h-3.5 w-3.5 ${theme.badgeText}`} />
        </span>
      </div>
      <div className="mt-2 text-sm font-medium text-slate-700">{value}</div>
    </div>
  );
}

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-slate-500">{label}</div>
      <div className="text-lg font-semibold text-slate-900">{value}</div>
    </div>
  );
}

function DockerSummarySection({ vmId }: { vmId: string }) {
  const [summary, setSummary] = useState<DockerSummary | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    getDockerSummary(vmId)
      .then(setSummary)
      .catch(() => setError(true));
  }, [vmId]);

  if (error) return null;
  if (!summary) return <p className="text-sm text-slate-500">Loading Docker&hellip;</p>;

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
          <Container className="h-4 w-4" /> Docker
        </h3>
        <Button variant="outline" size="sm" render={<Link href={`/vms/${vmId}/docker`} />}>
          View Docker
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <SummaryStat label="Containers" value={String(summary.containers_total)} />
        <SummaryStat label="Running" value={String(summary.containers_running)} />
        <SummaryStat label="Images" value={String(summary.images_total)} />
        <SummaryStat label="Networks" value={String(summary.networks_total)} />
      </div>
      <p className="mt-3 text-xs text-slate-500">Last scan: {formatAgo(summary.last_scan?.completed_at ?? summary.last_scan?.started_at)}</p>
    </div>
  );
}

// Link-out card to this VM's Updates page (/vms/updates/{id}) -- the
// summary/plans/execution history all live there already, so this is
// deliberately just a pointer, same shape as ConsoleSection below.
// Explicitly no equivalent card for Metrics-and-Logs: that section is
// reachable from its own top-level nav tab, and this detail page's only
// other paths out are Docker and Console.
function UpdatesSection({ vmId }: { vmId: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
          <RefreshCw className="h-4 w-4" /> Updates
        </h3>
        <Button variant="outline" size="sm" render={<Link href={`/vms/updates/${vmId}`} />}>
          View Updates
        </Button>
      </div>
      <p className="mt-2 text-xs text-slate-500">OS/kernel updates, package update plans, and installed-since-onboarding packages.</p>
    </div>
  );
}

// Entry point into the interactive VM Console (Step 22). Rendered only
// when the caller holds vm.connect specifically -- vm.view alone (every
// other summary section above) is not enough, matching
// docs/authorization.md's reservation of this permission for the console.
// The actual warning-before-connecting dialog and terminal live on the
// dedicated /vms/[id]/console route, mirroring how Docker/Monitoring/
// Packages/Updates are each their own sub-page rather than an inline tab.
function ConsoleSection({ vmId, vmName }: { vmId: string; vmName: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
          <TerminalSquare className="h-4 w-4" /> Console
        </h3>
        <Button variant="outline" size="sm" render={<Link href={`/vms/${vmId}/console`} />}>
          Open Console
        </Button>
      </div>
      <p className="mt-2 text-xs text-slate-500">Open an interactive SSH shell on {vmName} directly in your browser.</p>
    </div>
  );
}


// Editable connection details -- the same fields filled in at Register VM
// time (name/description/address/username/ssh_port), so an admin can
// adjust any of them afterward instead of having to delete and recreate
// the VM. Collapsed by default; "Edit" reveals the form pre-filled with
// the VM's current values.
function ConfigureVMSection({ vm, onChanged }: { vm: VMDetail; onChanged: () => void }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(vm.name);
  const [description, setDescription] = useState(vm.description ?? "");
  const [address, setAddress] = useState(vm.address);
  const [username, setUsername] = useState(vm.username ?? "");
  const [sshPort, setSshPort] = useState(String(vm.ssh_port));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function startEditing() {
    setName(vm.name);
    setDescription(vm.description ?? "");
    setAddress(vm.address);
    setUsername(vm.username ?? "");
    setSshPort(String(vm.ssh_port));
    setError(null);
    setEditing(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) {
      setError("Name is required.");
      return;
    }
    if (!address.trim()) {
      setError("Address is required.");
      return;
    }
    setSubmitting(true);
    try {
      await updateVM(vm.id, {
        name: name.trim(),
        description: description.trim(),
        address: address.trim(),
        username: username.trim(),
        ssh_port: Number(sshPort) || 22,
      });
      setEditing(false);
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save changes.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
          <Settings className="h-4 w-4" /> Configure VM
        </h3>
        {!editing && (
          <Button variant="outline" size="sm" onClick={startEditing}>
            Edit
          </Button>
        )}
      </div>

      {!editing ? (
        <dl className="grid grid-cols-2 gap-y-2 text-sm sm:grid-cols-4">
          <dt className="text-slate-500">Name</dt>
          <dd className="text-slate-900">{vm.name}</dd>
          <dt className="text-slate-500">Address</dt>
          <dd className="text-slate-900">{vm.address || "Not configured (agent-only VM)"}</dd>
          <dt className="text-slate-500">Username</dt>
          <dd className="text-slate-900">{vm.username || "—"}</dd>
          <dt className="text-slate-500">SSH Port</dt>
          <dd className="text-slate-900">{vm.address ? vm.ssh_port : "—"}</dd>
        </dl>
      ) : (
        <form onSubmit={handleSave} className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="edit-name">VM Name</Label>
              <Input id="edit-name" required value={name} onChange={(e) => setName(e.target.value)} disabled={submitting} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="edit-username">Username</Label>
              <Input id="edit-username" value={username} onChange={(e) => setUsername(e.target.value)} disabled={submitting} placeholder="ubuntu" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-2 flex flex-col gap-1.5">
              <Label htmlFor="edit-address">Address</Label>
              <Input id="edit-address" required value={address} onChange={(e) => setAddress(e.target.value)} disabled={submitting} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="edit-ssh-port">SSH Port</Label>
              <Input id="edit-ssh-port" type="number" min={1} max={65535} value={sshPort} onChange={(e) => setSshPort(e.target.value)} disabled={submitting} />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-description">Description</Label>
            <Textarea id="edit-description" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} disabled={submitting} />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setEditing(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={submitting}>
              {submitting ? "Saving…" : "Save Changes"}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}

// SSH key: this VM either points at a named, reusable credential (see
// ssh-key-picker.tsx) or is keyless -- a keyless VM still opens fine in
// Console, it just prompts for a key file every session instead of
// connecting automatically. Replaces the old "paste a key directly onto
// this VM" model.
function SSHCredentialSection({ vm, onChanged }: { vm: VMDetail; onChanged: () => void }) {
  const [picking, setPicking] = useState(false);
  const [pickerValue, setPickerValue] = useState<SSHKeyPickerValue>({ mode: "none" });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAttach() {
    if (pickerValue.mode !== "saved") return;
    setSubmitting(true);
    setError(null);
    try {
      await updateVM(vm.id, { ssh_key_credential_id: pickerValue.credentialId });
      setPicking(false);
      setPickerValue({ mode: "none" });
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to attach the credential.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDetach() {
    await updateVM(vm.id, { ssh_key_credential_id: "" });
    onChanged();
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900">
        <KeyRound className="h-4 w-4" /> SSH Key
      </h3>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm">
          <span className={`h-2 w-2 rounded-full ${vm.ssh_key_credential_id ? "bg-emerald-500" : "bg-slate-300"}`} />
          <span className="text-slate-700">
            {vm.ssh_key_credential_id ? `Attached: ${vm.ssh_key_credential_name}` : "No key attached -- Console will prompt for one each session"}
          </span>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setPicking((v) => !v)}>
            {vm.ssh_key_credential_id ? "Change Key" : "Attach Key"}
          </Button>
          {vm.ssh_key_credential_id && (
            <ConfirmDialog
              trigger={<Button variant="outline" size="sm">Detach</Button>}
              title="Detach SSH key?"
              description="The VM becomes keyless -- Console will prompt for a key file each session instead of connecting automatically."
              confirmLabel="Detach"
              onConfirm={handleDetach}
            />
          )}
        </div>
      </div>

      {picking && (
        <div className="mt-4 flex flex-col gap-3">
          <SSHKeyPicker workspaceId={vm.workspace_id} value={pickerValue} onChange={setPickerValue} />
          {pickerValue.mode === "ephemeral" && (
            <p className="text-xs text-slate-500">
              This tab is for Console-only, one-time use -- it doesn&rsquo;t attach anything here. To attach a saved key to this VM, use the &ldquo;Named
              Credential&rdquo; tab instead.
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setPicking(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button type="button" size="sm" onClick={handleAttach} disabled={submitting || pickerValue.mode !== "saved"}>
              {submitting ? "Attaching…" : "Attach"}
            </Button>
          </div>
        </div>
      )}
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}

function ConnectionSection({ vm, onConnected }: { vm: VMDetail; onConnected: () => void }) {
  const [status, setStatus] = useState<VMConnectionStatus | null>(null);
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<ConnectionTestResult | null>(null);
  const [trusting, setTrusting] = useState(false);

  const load = useCallback(() => {
    getConnectionStatus(vm.id)
      .then(setStatus)
      .catch(() => setStatus(null));
  }, [vm.id]);

  useEffect(() => {
    // Load-on-mount/param-change: no external store to subscribe to.
     
    load();
  }, [load]);

  async function handleTest() {
    setTesting(true);
    setResult(null);
    try {
      const r = await testConnection(vm.id);
      setResult(r);
    } finally {
      setTesting(false);
      load();
      onConnected();
    }
  }

  async function handleTrust() {
    setTrusting(true);
    try {
      await trustHostKey(vm.id);
      await handleTest();
    } catch {
      // surfaced via the next test's result / status reload
    } finally {
      setTrusting(false);
    }
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <h3 className="mb-3 text-sm font-semibold text-slate-900">Connection</h3>

      <dl className="grid grid-cols-2 gap-y-2 text-sm sm:grid-cols-4">
        <dt className="text-slate-500">Host</dt>
        <dd className="text-slate-900">{vm.address}</dd>
        <dt className="text-slate-500">Port</dt>
        <dd className="text-slate-900">{vm.ssh_port}</dd>
        <dt className="text-slate-500">Username</dt>
        <dd className="text-slate-900">{vm.username || "—"}</dd>
        <dt className="text-slate-500">Last Connection</dt>
        <dd className="text-slate-900">{status?.last_connection_at ? new Date(status.last_connection_at).toLocaleString() : "Never"}</dd>
      </dl>

      <Button className="mt-4" size="sm" onClick={handleTest} disabled={testing || !status?.credential_configured}>
        {testing ? "Testing SSH connection…" : "Test Connection"}
      </Button>
      {!status?.credential_configured && (
        <p className="mt-2 text-xs text-slate-500">Configure an SSH credential before testing the connection.</p>
      )}

      {result && result.status === "connected" && (
        <Alert className="mt-4">
          <AlertDescription>
            ✓ Connection successful{result.latency_ms !== undefined ? ` — latency: ${result.latency_ms} ms` : ""}
          </AlertDescription>
        </Alert>
      )}

      {result && (result.status === "host_key_unknown" || result.status === "host_key_changed") && result.host_key && (
        <div className="mt-4 rounded-md border border-amber-300 bg-amber-50 p-4">
          <h4 className="text-sm font-semibold text-amber-900">
            {result.status === "host_key_changed" ? "Host Key Changed" : "Host Key Verification Required"}
          </h4>
          <dl className="mt-2 grid grid-cols-2 gap-y-1 text-sm">
            <dt className="text-amber-700">Host</dt>
            <dd className="text-amber-900">{result.host_key.host}:{result.host_key.port}</dd>
            <dt className="text-amber-700">Algorithm</dt>
            <dd className="text-amber-900">{result.host_key.algorithm}</dd>
            <dt className="text-amber-700">Fingerprint</dt>
            <dd className="font-mono text-amber-900">{result.host_key.fingerprint}</dd>
          </dl>
          <p className="mt-2 text-xs text-amber-800">
            {result.status === "host_key_changed"
              ? "This VM previously had a different host key. Verify this is expected before trusting the new key."
              : "Verify this fingerprint against the server before trusting it."}
          </p>
          <div className="mt-3 flex gap-2">
            <ConfirmDialog
              trigger={<Button size="sm">Trust Host Key</Button>}
              title="Trust this host key?"
              description={`Only trust this fingerprint if you have verified it out-of-band: ${result.host_key.fingerprint}`}
              confirmLabel="Trust"
              destructive={result.status === "host_key_changed"}
              onConfirm={handleTrust}
            />
          </div>
          {trusting && <p className="mt-2 text-xs text-amber-700">Trusting…</p>}
        </div>
      )}

      {result && result.status === "failed" && (
        <Alert variant="destructive" className="mt-4">
          <AlertDescription>{result.message ?? "Connection failed."}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}

const DISCOVERY_FIELD_LABELS: Record<string, string> = {
  hostname: "Reading hostname",
  os: "Reading OS",
  kernel: "Reading kernel",
  architecture: "Reading architecture",
  cpu: "Reading CPU",
  memory: "Reading memory",
  storage: "Reading storage",
  docker: "Checking Docker",
};

function DiscoverySection({ vmId, onDiscovered }: { vmId: string; onDiscovered: () => void }) {
  const [discovering, setDiscovering] = useState(false);
  const [result, setResult] = useState<DiscoveryResult | null>(null);
  const [history, setHistory] = useState<DiscoveryRun[]>([]);

  const loadHistory = useCallback(() => {
    getDiscoveryHistory(vmId)
      .then((res) => setHistory(res.runs))
      .catch(() => setHistory([]));
  }, [vmId]);

  useEffect(() => {
    // Load-on-mount/param-change: no external store to subscribe to.
     
    loadHistory();
  }, [loadHistory]);

  async function handleDiscover() {
    setDiscovering(true);
    setResult(null);
    try {
      const r = await discoverVM(vmId);
      setResult(r);
      onDiscovered();
    } finally {
      setDiscovering(false);
      loadHistory();
    }
  }

  const lastRun = history[0];

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <h3 className="mb-3 text-sm font-semibold text-slate-900">Discovery</h3>

      <p className="text-sm text-slate-600">
        Last discovery: {lastRun ? new Date(lastRun.started_at).toLocaleString() : "Never"}
        {lastRun && <span className="ml-2 text-slate-400">({lastRun.status.toLowerCase()})</span>}
      </p>

      <Button className="mt-3" size="sm" onClick={handleDiscover} disabled={discovering}>
        {discovering ? "Discovering VM…" : "Connect & Discover"}
      </Button>

      {result?.fields && result.fields.length > 0 && (
        <ul className="mt-4 flex flex-col gap-1 text-sm">
          {result.fields.map((f) => (
            <li key={f.name} className="flex items-center gap-2">
              {f.succeeded ? (
                <Check className="h-4 w-4 text-emerald-600" />
              ) : (
                <X className="h-4 w-4 text-red-500" />
              )}
              <span className={f.succeeded ? "text-slate-700" : "text-slate-500"}>
                {DISCOVERY_FIELD_LABELS[f.name] ?? f.name}
              </span>
            </li>
          ))}
        </ul>
      )}
      {result?.error && (
        <Alert variant={result.status === "failed" ? "destructive" : "default"} className="mt-4">
          <AlertDescription>{result.error}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
