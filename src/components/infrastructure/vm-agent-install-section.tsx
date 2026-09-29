"use client";

import { useCallback, useEffect, useState } from "react";
import { Plug, Radio, RefreshCw } from "lucide-react";
import { CopyButton } from "@/components/infrastructure/copy-button";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { formatAgo } from "@/lib/format";
import {
  buildAgentInstallCommand,
  agentOSFamilyToPickerOS,
  defaultInstallMethodFor,
  type AgentOS,
  type AgentInstallMethod,
} from "@/lib/agent-install-command";
import {
  ApiError,
  getVMAgentStatus,
  getVMAgentManualInstall,
  testVMAgentConnection,
  type VMAgentStatus,
  type VMAgentManualInstall,
} from "@/lib/api";

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

function runHint(os: AgentOS, method: AgentInstallMethod): string {
  if (method === "DOCKER") return "Run this on any machine with Docker, wherever you want to monitor from:";
  switch (os) {
    case "LINUX":
      return "Run this in a terminal on the Linux machine:";
    case "WINDOWS":
      return "Run this in PowerShell on the Windows machine:";
    case "MAC":
      return "Run this in a terminal on the Mac:";
  }
}

// Admin-only status/token/test for the push-based VM Agent -- mirrors
// the Docker Host connect flow exactly: no SSH-based automated install
// exists here at all (an earlier one did, but it produced a misleading
// "Check SSH connectivity" error for agent-only VMs that never had SSH
// configured, so it was removed). "Regenerate Token" reveals the exact
// docker run command + a fresh one-time token (same shape as the Docker
// Host page's AgentTokenReveal / "Regenerate Token"), and Test Connection
// sends a real, synchronous round-trip ping (see testVMAgentConnection)
// -- unlike "Connected" + a recent heartbeat, which only proves the
// *last* push (up to a full interval old) arrived, this proves the agent
// is alive right now, same parity as the Docker agent's own Test
// Connection.
//
// Extracted as its own component (was previously inlined on
// vms/metrics/[id]/page.tsx) so the Configure tab's per-VM Sheet
// (vm-agent-configure-table.tsx) can reuse it without duplicating this
// logic.
export function VMAgentInstallSection({ vmId }: { vmId: string }) {
  const [status, setStatus] = useState<VMAgentStatus | null>(null);

  const [manualLoading, setManualLoading] = useState(false);
  const [manualError, setManualError] = useState<string | null>(null);
  const [manualInfo, setManualInfo] = useState<VMAgentManualInstall | null>(null);
  const [os, setOs] = useState<AgentOS>("LINUX");
  const [method, setMethod] = useState<AgentInstallMethod>(() => defaultInstallMethodFor("LINUX"));

  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const loadStatus = useCallback(() => {
    return getVMAgentStatus(vmId).then((s) => {
      setStatus(s);
      const detectedOs = agentOSFamilyToPickerOS(s.agent_os);
      setOs(detectedOs);
      setMethod(defaultInstallMethodFor(detectedOs));
    }).catch(() => {});
  }, [vmId]);

  function handleRefresh() {
    setRefreshing(true);
    loadStatus().finally(() => setRefreshing(false));
  }

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  async function handleShowManual() {
    if (status?.token_configured && !window.confirm("This immediately invalidates the currently running agent container's token. Continue?")) {
      return;
    }
    setManualLoading(true);
    setManualError(null);
    try {
      const info = await getVMAgentManualInstall(vmId);
      setManualInfo(info);
    } catch (err) {
      setManualError(err instanceof ApiError ? err.message : "Failed to regenerate the agent token.");
    } finally {
      setManualLoading(false);
      loadStatus();
    }
  }

  async function handleTest() {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await testVMAgentConnection(vmId);
      setTestResult(
        result.status === "connected"
          ? `Connected${result.latency_ms !== undefined ? ` (${result.latency_ms} ms)` : ""}.`
          : (result.message ?? "Connection failed.")
      );
    } catch (err) {
      setTestResult(err instanceof ApiError ? err.message : "Connection test failed.");
    } finally {
      setTesting(false);
      loadStatus();
    }
  }

  if (!status) return <p className="text-sm text-slate-500">Loading VM Agent&hellip;</p>;

  const badge = status.connected
    ? { text: "Connected", tone: "bg-emerald-50 text-emerald-700 ring-emerald-200" }
    : { text: "Disconnected", tone: "bg-slate-100 text-slate-600 ring-slate-200" };

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
          <Radio className="h-4 w-4" /> VM Agent
          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${badge.tone}`}>{badge.text}</span>
        </h3>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing} title="Refresh status/last heartbeat">
            <RefreshCw className={`mr-1 h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} /> Refresh
          </Button>
          {status.installed && (
            <Button variant="outline" size="sm" onClick={handleTest} disabled={testing}>
              <Plug className="mr-1 h-3.5 w-3.5" /> {testing ? "Testing…" : "Test Connection"}
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={handleShowManual} disabled={manualLoading}>
            {manualLoading ? "Regenerating…" : "Regenerate Token"}
          </Button>
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-y-2 text-sm sm:grid-cols-4">
        <dt className="text-slate-500">Last Heartbeat</dt>
        <dd className="text-slate-900">{status.last_heartbeat_at ? formatAgo(status.last_heartbeat_at) : "Never"}</dd>
      </dl>

      {testResult && <p className="mt-2 text-xs text-slate-500">{testResult}</p>}

      {!status.installed && (
        <p className="mt-3 text-xs text-slate-500">
          Not installed yet. Click Regenerate Token to get a one-time token and the install command for your OS, then run it on the machine you want to monitor.
        </p>
      )}

      {manualError && (
        <Alert variant="destructive" className="mt-4">
          <AlertDescription>{manualError}</AlertDescription>
        </Alert>
      )}

      {manualInfo && (
        <Alert className="mt-4">
          <AlertDescription>
            <p className="mb-2">
              Agent token for this VM (shown once -- it cannot be retrieved again):
            </p>
            <div className="flex items-center gap-2">
              <code className="block flex-1 break-all rounded bg-slate-100 p-2 text-xs">{manualInfo.token}</code>
              <CopyButton value={manualInfo.token} />
            </div>
            <div className="mt-3 flex flex-wrap gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="vm-agent-manual-os">Target OS</Label>
                <Select
                  value={os}
                  onValueChange={(v) => {
                    const nextOs = (v ?? "LINUX") as AgentOS;
                    setOs(nextOs);
                    setMethod(defaultInstallMethodFor(nextOs));
                  }}
                >
                  <SelectTrigger id="vm-agent-manual-os" className="w-40">
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
                <Label htmlFor="vm-agent-manual-method">Install Method</Label>
                <Select value={method} onValueChange={(v) => setMethod((v ?? defaultInstallMethodFor(os)) as AgentInstallMethod)}>
                  <SelectTrigger id="vm-agent-manual-method" className="w-64">
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
                Docker Desktop always runs this container inside its own Linux VM -- CPU/memory/storage will reflect that VM, not
                the real machine. Use the native binary if you need accurate host metrics.
              </p>
            )}
            <p className="mt-2 text-xs text-slate-500">{runHint(os, method)}</p>
            <div className="mt-1 flex items-start gap-2">
              <pre className="flex-1 overflow-x-auto whitespace-pre-wrap break-all rounded bg-slate-900 p-2 text-xs text-slate-100">
                {buildAgentInstallCommand(os, manualInfo.token, manualInfo.backend_url, method)}
              </pre>
              <CopyButton value={buildAgentInstallCommand(os, manualInfo.token, manualInfo.backend_url, method)} />
            </div>
            <Button variant="ghost" size="sm" className="mt-2" onClick={() => setManualInfo(null)}>
              Dismiss
            </Button>
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
