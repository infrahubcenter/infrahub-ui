"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Check } from "lucide-react";
import { RouteGuard } from "@/components/auth/route-guard";
import { ConfirmDialog } from "@/components/infrastructure/confirm-dialog";
import { SSHKeyPicker, type SSHKeyPickerValue } from "@/components/infrastructure/ssh-key-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ApiError,
  createVM,
  listWorkspaces,
  testConnection,
  trustHostKey,
  updateVM,
  type ConnectionTestResult,
  type VM,
  type Workspace,
} from "@/lib/api";

export default function NewVMPage() {
  return (
    <RouteGuard requireRole="ADMIN">
      <Suspense fallback={null}>
        <NewVMForm />
      </Suspense>
    </RouteGuard>
  );
}

function NewVMForm() {
  const searchParams = useSearchParams();

  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [workspaceId, setWorkspaceId] = useState(searchParams.get("workspace_id") ?? "");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [address, setAddress] = useState("");
  const [username, setUsername] = useState("");
  const [sshPort, setSshPort] = useState("22");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Set once Phase 1 (Register) succeeds -- Phase 2 (SSH key/trust/test)
  // then renders below, on this same page, since none of those calls can
  // target a VM that doesn't exist yet.
  const [createdVm, setCreatedVm] = useState<VM | null>(null);

  useEffect(() => {
    listWorkspaces()
      .then((res) => setWorkspaces(res.workspaces))
      .catch(() => setError("Failed to load workspaces."));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!workspaceId) {
      setError("Workspace is required.");
      return;
    }
    if (!address.trim()) {
      setError("Address is required.");
      return;
    }

    setError(null);
    setSubmitting(true);
    try {
      const vm = await createVM({
        workspace_id: workspaceId,
        name: name.trim(),
        description: description.trim(),
        address: address.trim(),
        username: username.trim(),
        ssh_port: Number(sshPort) || 22,
      });
      setCreatedVm(vm);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create VM.");
    } finally {
      setSubmitting(false);
    }
  }

  if (createdVm) {
    return <ConnectVMStep vm={createdVm} />;
  }

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Register VM</h2>
        <p className="text-sm text-slate-500">
          After registering, this same page walks you through adding an SSH key, trusting the host key, and testing the connection.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4 rounded-lg border border-slate-200 bg-white p-6">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="workspace">Workspace</Label>
          <Select value={workspaceId} onValueChange={(v) => setWorkspaceId(v ?? "")} disabled={submitting}>
            <SelectTrigger id="workspace">
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
          <Label htmlFor="name">VM Name</Label>
          <Input id="name" required value={name} onChange={(e) => setName(e.target.value)} disabled={submitting} placeholder="backend-prod-01" />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="description">Description</Label>
          <Textarea id="description" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} disabled={submitting} />
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div className="col-span-2 flex flex-col gap-1.5">
            <Label htmlFor="address">Address</Label>
            <Input id="address" required value={address} onChange={(e) => setAddress(e.target.value)} disabled={submitting} placeholder="192.168.1.10" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ssh-port">SSH Port</Label>
            <Input id="ssh-port" type="number" min={1} max={65535} value={sshPort} onChange={(e) => setSshPort(e.target.value)} disabled={submitting} />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="username">Username</Label>
          <Input id="username" value={username} onChange={(e) => setUsername(e.target.value)} disabled={submitting} placeholder="ubuntu" />
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" render={<Link href="/vms" />}>
            Cancel
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? "Registering…" : "Register"}
          </Button>
        </div>
      </form>
    </div>
  );
}

// Phase 2 of registration, same page: SSH key -> trust host key -> test
// connection, in order -- mirrors SSHCredentialSection/ConnectionSection's
// exact logic from the VM detail page (vms/[id]/page.tsx), just walked
// through once, inline, right after Register instead of requiring a
// separate visit to the VM's own page. Attaching a key here is optional --
// "Skip" moves straight to Test Connection, which simply fails with a
// clear NOT_CONFIGURED result until a key is attached (here or later, on
// the VM's own page), never blocking VM registration itself.
function ConnectVMStep({ vm }: { vm: VM }) {
  const router = useRouter();
  const [pickerValue, setPickerValue] = useState<SSHKeyPickerValue>({ mode: "none" });
  const [keyConfigured, setKeyConfigured] = useState(false);
  const [keyError, setKeyError] = useState<string | null>(null);
  const [savingKey, setSavingKey] = useState(false);

  const [testing, setTesting] = useState(false);
  const [trusting, setTrusting] = useState(false);
  const [result, setResult] = useState<ConnectionTestResult | null>(null);

  async function handleAttachKey() {
    if (pickerValue.mode !== "saved") {
      setKeyError("Pick or create a named credential first (the \"Add Directly\" tab is Console-only and doesn't attach anything here).");
      return;
    }
    setKeyError(null);
    setSavingKey(true);
    try {
      await updateVM(vm.id, { ssh_key_credential_id: pickerValue.credentialId });
      setKeyConfigured(true);
    } catch (err) {
      setKeyError(err instanceof ApiError ? err.message : "Failed to attach the SSH key.");
    } finally {
      setSavingKey(false);
    }
  }

  async function handleTest() {
    setTesting(true);
    setResult(null);
    try {
      const r = await testConnection(vm.id);
      setResult(r);
    } finally {
      setTesting(false);
    }
  }

  async function handleTrust() {
    setTrusting(true);
    try {
      await trustHostKey(vm.id);
      await handleTest();
    } catch {
      // surfaced via the next test's result
    } finally {
      setTrusting(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Connect {vm.name}</h2>
        <p className="text-sm text-slate-500">VM registered. Add its SSH key, trust its host key, and test the connection.</p>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-6">
        <div className="mb-4 flex items-center gap-2 text-sm font-medium text-slate-900">
          <span
            className={`flex h-5 w-5 items-center justify-center rounded-full text-xs ${keyConfigured ? "bg-emerald-600 text-white" : "bg-slate-900 text-white"}`}
          >
            {keyConfigured ? <Check className="h-3 w-3" /> : "1"}
          </span>
          SSH Key
        </div>
        <div className="flex flex-col gap-2">
          <SSHKeyPicker workspaceId={vm.workspace_id} value={pickerValue} onChange={setPickerValue} />
          {keyError && <p className="text-sm text-red-600">{keyError}</p>}
          <div className="flex justify-end">
            <Button type="button" size="sm" onClick={handleAttachKey} disabled={savingKey}>
              {savingKey ? "Attaching…" : keyConfigured ? "Change Key" : "Attach Key"}
            </Button>
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-6">
        <div className="mb-4 flex items-center gap-2 text-sm font-medium text-slate-900">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-900 text-xs text-white">2</span>
          Test Connection
        </div>
        <Button size="sm" onClick={handleTest} disabled={testing || !keyConfigured}>
          {testing ? "Testing…" : "Test Connection"}
        </Button>
        {!keyConfigured && <p className="mt-2 text-xs text-slate-500">Attach an SSH key first.</p>}

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
              <dd className="text-amber-900">
                {result.host_key.host}:{result.host_key.port}
              </dd>
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

      <div className="flex justify-end gap-2">
        <Button variant="outline" render={<Link href="/vms" />}>
          Finish Later
        </Button>
        <Button onClick={() => router.push(`/vms/${vm.id}/console`)}>Go to VM</Button>
      </div>
    </div>
  );
}
