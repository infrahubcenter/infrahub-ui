// Step 19 Phase 1 already defined this closed union in lib/monitoring.ts
// (a dependency-free helpers module) -- imported here rather than
// redeclared, so there's exactly one MonitoringResourceType in the app.
import type { MonitoringResourceType } from "@/lib/monitoring";

// Empty by default -- every request below is a relative URL ("/api/...").
// The browser resolves that against whatever origin the page itself was
// loaded from (localhost, the ngrok domain, a future production domain,
// anything), and per the WebSocket spec a relative ws URL gets its scheme
// auto-upgraded (http -> ws, https -> wss) the same way. So as long as the
// backend is reachable under the same origin as the frontend (true here via
// dev-proxy.mjs / the ngrok tunnel, and true of any normal reverse-proxied
// deployment), zero frontend env configuration is ever needed. Only set
// NEXT_PUBLIC_API_BASE_URL if the backend is ever served from a genuinely
// different origin than the frontend.
const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}) as { error?: string });
    throw new ApiError(res.status, body.error ?? res.statusText);
  }

  if (res.status === 204) {
    return undefined as T;
  }
  return (await res.json()) as T;
}

export type Role = "OWNER" | "ADMIN" | "MEMBER";

export type User = {
  id: string;
  name: string;
  email: string;
  role: Role;
};

// OWNER has every ADMIN capability plus a couple of Owner-exclusive ones
// (see settings/page.tsx) -- every "is this user an admin" UI check across
// this app must treat OWNER as satisfying it too, so this is the one place
// that decision is made. Mirrors the backend's identical
// services.AuthenticatedUser.IsAdmin().
export function isAdminRole(role?: Role): boolean {
  return role === "ADMIN" || role === "OWNER";
}

// Derived by the backend (not a stored column): DISABLED if !is_active,
// INVITED if is_active && last_login_at is null, ACTIVE otherwise (Step 18
// decision #4). `last_login_at`/`created_at` are real columns; the five
// `*_count` fields are only populated by GET /api/users (Step 18 Phase 4's
// per-user resource-count aggregates) -- optional so every other caller
// that only reads .id/.name/.email/.role/.is_active (the VM/Database/
// Object-Storage AccessSection member dropdowns, the Permissions page's
// member picker, all calling listUsers() with zero args) keeps working
// unmodified.
export type UserListItem = User & {
  is_active: boolean;
  status: UserStatus;
  last_login_at?: string;
  created_at: string;
};

export type UserStatus = "ACTIVE" | "INVITED" | "DISABLED";

export type ResourceStatus = "UNKNOWN" | "ONLINE" | "OFFLINE" | "WARNING" | "ERROR" | "DISABLED";

export type VM = {
  id: string;
  name: string;
  workspace: string;
  status: ResourceStatus;
  // "" means this is an agent-only VM (see createAgentOnlyVM) -- it was
  // never given an SSH address and never will be. Guard any display of
  // this field accordingly rather than assuming it's always real.
  address: string;
  os_name?: string;
  os_version?: string;
  last_seen_at?: string;
  permissions: string[];
  access_source: "ADMIN" | "DIRECT" | "WORKSPACE";
  // Purely additive alongside the display-name workspace field above --
  // needed to match a VM by id rather than by (non-unique) name, e.g. when
  // creating a Dashboard bound to this VM.
  workspace_id: string;
  // VM Agent-reported host identity (migrations/060_vm_agent_host_identity.sql)
  // -- absent until the agent has pushed at least one sample, never
  // fabricated. agent_os is the OS family ("linux" | "windows" | "darwin"),
  // backing the Metrics card grid's OS badge/filter.
  agent_os?: string;
  agent_os_version?: string;
  agent_kernel_version?: string;
  agent_hostname?: string;
};

export type VMDetail = VM & {
  description?: string;
  hostname: string;
  username?: string;
  ssh_port: number;
  kernel_version?: string;
  architecture?: string;
  cpu_cores?: number;
  total_memory_bytes?: number;
  total_storage_bytes?: number;
  docker_installed: boolean;
  last_discovered_at?: string;
  monitoring_enabled: boolean;
  package_manager?: "APT" | "DNF" | "YUM" | "UNSUPPORTED";
  // The named, reusable SSH key credential this VM currently points at
  // (see the "SSH credentials" section below) -- absent means keyless,
  // in which case Console always prompts for an ephemeral key.
  ssh_key_credential_id?: string;
  ssh_key_credential_name?: string;
};

export type WorkspaceMembership = {
  workspace_id: string;
  workspace_name: string;
};

export type UserDetail = UserListItem & {
  vm_access: VM[];
  // The same caller-scoped access shape MyAccessHandler already produces
  // for the calling user, reused here for an admin-specified target user.
  // Shape mirrors vm_access (a `permissions: string[]` array per entry)
  // rather than the boolean-per-permission shape the resource-scoped
  // *AccessMember types use, for the same reason VM has two different
  // shapes for its two different consumers (VMAccessMember vs VM.permissions).
  database_access: (DatabaseListItem & { permissions: string[]; access_source: "DIRECT" | "WORKSPACE" | "ADMIN" })[];
  object_storage_access: (ObjectStorageListItem & { access_source: "DIRECT" | "WORKSPACE" | "ADMIN" })[];
  // Derived workspaces this user has any access into (direct grant or
  // workspace membership). The Effective Access section on the user
  // detail page is built from vm_access/database_access/
  // object_storage_access instead, not from this list.
  workspaces: WorkspaceMembership[];
  // Lets the frontend pre-emptively disable the role control without a
  // second fetch -- mirrors the same field on the GET /api/users list
  // envelope.
  active_admin_count: number;
};

export type Workspace = {
  id: string;
  name: string;
  description?: string;
  is_active: boolean;
  vm_count: number;
  database_count: number;
  object_storage_count: number;
  docker_host_count: number;
  k8s_cluster_count: number;
  member_count: number;
};

export type WorkspaceMember = {
  id: string;
  name: string;
  email: string;
  is_active: boolean;
  access_source: "WORKSPACE";
};

export type Resource = {
  id: string;
  workspace_id: string;
  name: string;
  resource_type: "VM" | "DATABASE" | "OBJECT_STORAGE";
  status: ResourceStatus;
  description?: string;
};

// --- Auth ---

export function login(email: string, password: string) {
  return apiFetch<User>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export type OAuthProvider = "github" | "google";

// Which "Continue with..." buttons the login page should actually render
// -- a provider with no Client ID/Secret configured server-side isn't
// shown at all rather than round-tripping to a broken redirect.
export function getOAuthProviders() {
  return apiFetch<{ github: boolean; google: boolean }>("/api/auth/oauth/providers");
}

// A full browser navigation (never a fetch): OAuth requires the real
// redirect chain (this backend -> provider's consent screen -> back to
// this backend's own callback, which sets the session cookie and 302s to
// the app) to actually work.
export function oauthStartUrl(provider: OAuthProvider): string {
  return `${API_BASE}/api/auth/oauth/${provider}/start`;
}

export function logout() {
  return apiFetch<{ status: string }>("/api/auth/logout", { method: "POST" });
}

export function getMe() {
  return apiFetch<User>("/api/auth/me");
}

// --- VMs ---

// An agent-only VM (created from Host Metrics & Logs' "Connect VM") has no
// SSH address and never will -- it belongs to Host Metrics & Logs only.
// Compute Inventory and Patch Management are SSH-managed and list only VMs
// that have an address.
export function isAgentOnlyVM(vm: Pick<VM, "address">): boolean {
  return !vm.address;
}

export function listVMs() {
  return apiFetch<{ vms: VM[] }>("/api/vms");
}

export function getVM(id: string) {
  return apiFetch<VMDetail>(`/api/vms/${id}`);
}

export function createVM(payload: {
  workspace_id: string;
  name: string;
  description?: string;
  address: string;
  username?: string;
  ssh_port?: number;
  // Optionally attach an existing named SSH key credential (must belong
  // to the same workspace) at creation time -- omitted leaves the VM
  // keyless.
  ssh_key_credential_id?: string;
}) {
  return apiFetch<VMDetail>("/api/vms", { method: "POST", body: JSON.stringify(payload) });
}

// "Connect VM" -- an agent-only VM with no SSH fields at all, mirroring
// createDockerHost's identical name+workspace-in / token+run-command-out
// shape. address comes back as "" on the created VM (never a real
// address) -- see VMService.CreateAgentOnly's own doc comment for why
// that's a plain empty string, not null.
export function createAgentOnlyVM(payload: { workspace_id: string; name: string }) {
  return apiFetch<VMDetail & { agent_token: string; run_command: string; backend_url: string }>("/api/vms/agent-only", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateVM(
  id: string,
  payload: Partial<{
    name: string;
    description: string;
    workspace_id: string;
    status: ResourceStatus;
    username: string;
    address: string;
    ssh_port: number;
    monitoring_enabled: boolean;
    // Three-state: omit the field entirely to leave the current
    // credential unchanged, pass "" to detach it (VM becomes keyless), or
    // a credential id to attach/replace it.
    ssh_key_credential_id: string;
  }>
) {
  return apiFetch<VMDetail>(`/api/vms/${id}`, { method: "PATCH", body: JSON.stringify(payload) });
}

// Admin-only. Removes the VM's resource/configuration from Infra Hub
// Center only -- the real VM/server is never touched. The backend
// independently re-checks confirmationName against the VM's current name
// (case-sensitive, exact match) before deleting; this call is just the
// transport for that value, never the authority on it.
export function deleteVM(id: string, confirmationName: string) {
  return apiFetch<{ deleted: boolean }>(`/api/vms/${id}`, {
    method: "DELETE",
    body: JSON.stringify({ confirmation_name: confirmationName }),
  });
}

// Step 22 VM Console. The browser only ever exchanges JSON frames over
// this authenticated WebSocket (base64 keystrokes/output) -- it never
// receives or sends an SSH credential of any kind; the Go backend manages
// the SSH connection exclusively. Authorization (vm.connect) is enforced
// server-side before the upgrade completes, same as every other
// authorization check in this app -- this URL grants nothing by itself.
// useEphemeralKey opts into always waiting for the browser's first
// "connect" frame -- offering "use a different key for just this
// session" even when the VM already has a saved credential. A keyless VM
// always waits regardless of this flag (the backend decides that half on
// its own); this only ever matters for a VM that already has a saved key.
export function vmConsoleUrl(vmId: string, rows: number, cols: number, useEphemeralKey = false): string {
  const wsBase = API_BASE.replace(/^http/, "ws");
  const ephemeral = useEphemeralKey ? "&use_ephemeral_key=1" : "";
  return `${wsBase}/api/vms/${vmId}/console?rows=${rows}&cols=${cols}${ephemeral}`;
}

export type VMConsoleInboundFrame =
  | { type: "output"; data: string }
  | { type: "error"; message: string }
  | { type: "closed" };

// The one outbound frame shape Console needs beyond "input"/"resize"
// (already sent as plain object literals at the call site) -- sent once,
// first, only when the backend is actually waiting for it (a keyless VM,
// or ?use_ephemeral_key=1). private_key is never sent anywhere else and
// never persisted -- see vm_console.go's doc comment on the backend.
export type VMConsoleConnectFrame = { type: "connect"; private_key?: string };

export type VMAccessMember = {
  id: string;
  name: string;
  email: string;
  view: boolean;
  console: boolean;
  access_source: "DIRECT" | "WORKSPACE";
};

export function listVMAccess(vmId: string) {
  return apiFetch<{ members: VMAccessMember[] }>(`/api/vms/${vmId}/access`);
}

// --- Named SSH key credentials (VM section rebuild) ---
// Replaces the old "paste a key directly onto this VM" model: an admin
// creates a named, reusable credential once, and any VM in the same
// workspace can point at it via VM.ssh_key_credential_id (see
// createVM/updateVM above). The private key itself never appears in any
// of these response types -- the backend never returns it.

export type SSHKeyCredential = {
  id: string;
  workspace_id: string;
  name: string;
  fingerprint: string;
  created_by?: string;
  created_at: string;
  updated_at: string;
  // How many VMs currently point at this credential -- lets the UI warn
  // accurately before a delete attempt that the backend would reject.
  in_use_count: number;
};

export function listSSHKeyCredentials(workspaceId: string) {
  return apiFetch<{ credentials: SSHKeyCredential[] }>(`/api/ssh-key-credentials?workspace_id=${workspaceId}`);
}

export function getSSHKeyCredential(id: string) {
  return apiFetch<SSHKeyCredential>(`/api/ssh-key-credentials/${id}`);
}

export function createSSHKeyCredential(workspaceId: string, name: string, privateKey: string) {
  return apiFetch<SSHKeyCredential>("/api/ssh-key-credentials", {
    method: "POST",
    body: JSON.stringify({ workspace_id: workspaceId, name, private_key: privateKey }),
  });
}

export function renameSSHKeyCredential(id: string, name: string) {
  return apiFetch<SSHKeyCredential>(`/api/ssh-key-credentials/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ name }),
  });
}

// Admin-only. Fails (409) while any VM still points at this credential --
// detach it from every VM first (see updateVM's ssh_key_credential_id: "").
export function deleteSSHKeyCredential(id: string) {
  return apiFetch<{ deleted: boolean }>(`/api/ssh-key-credentials/${id}`, { method: "DELETE" });
}

// --- Connection, host key, discovery (Step 5) ---

export type ConnectionStatus =
  | "NOT_CONFIGURED"
  | "READY"
  | "CONNECTING"
  | "CONNECTED"
  | "FAILED"
  | "HOST_KEY_UNKNOWN"
  | "HOST_KEY_CHANGED";

export type VMConnectionStatus = {
  connection_status: ConnectionStatus;
  credential_configured: boolean;
  last_connection_at?: string;
  last_connection_error?: string;
};

export function getConnectionStatus(vmId: string) {
  return apiFetch<VMConnectionStatus>(`/api/vms/${vmId}/connection-status`);
}

export type HostKeyBrief = {
  host: string;
  port: number;
  algorithm: string;
  fingerprint: string;
};

export type ConnectionTestResult = {
  status: "connected" | "failed" | "host_key_unknown" | "host_key_changed";
  host?: string;
  port?: number;
  username?: string;
  latency_ms?: number;
  error_code?: string;
  message?: string;
  host_key?: HostKeyBrief;
};

export function testConnection(vmId: string) {
  return apiFetch<ConnectionTestResult>(`/api/vms/${vmId}/connection-test`, { method: "POST" });
}

export function trustHostKey(vmId: string) {
  return apiFetch<HostKeyBrief>(`/api/vms/${vmId}/host-key/trust`, { method: "POST" });
}

export type DiscoveryFieldResult = {
  name: string;
  succeeded: boolean;
  error?: string;
};

export type DiscoveryResult = {
  status: "success" | "partial" | "failed" | "unknown";
  error?: string;
  fields?: DiscoveryFieldResult[];
  vm?: {
    id: string;
    hostname?: string;
    os_name?: string;
    os_version?: string;
    distribution_id?: string;
    kernel?: string;
    architecture?: string;
    cpu_cores?: number;
    memory_bytes?: number;
    storage_bytes?: number;
    docker_installed?: boolean;
  };
};

export function discoverVM(vmId: string) {
  return apiFetch<DiscoveryResult>(`/api/vms/${vmId}/discover`, { method: "POST" });
}

export type DiscoveryRun = {
  id: string;
  status: "RUNNING" | "SUCCESS" | "PARTIAL" | "FAILED";
  started_at: string;
  completed_at?: string;
  error_summary?: string;
};

export function getDiscoveryHistory(vmId: string) {
  return apiFetch<{ runs: DiscoveryRun[] }>(`/api/vms/${vmId}/discovery`);
}

// --- VM Agent (push-based metrics/logs, alongside the SSH scheduler) ---
// A separate, optional agent from the per-VM Docker agent below: this one
// is OS-level (host CPU/memory/logs via journald), not container-level,
// and it pushes metrics on its own interval rather than answering polls.
// Mirrors the Docker agent section's install/status/manual shape closely
// (see docker_agent_install.go's/vm_agent_install.go's shared rationale).

export type VMAgentStatus = {
  installed: boolean;
  connected: boolean;
  version?: string;
  last_heartbeat_at?: string;
  token_configured: boolean;
  // OS family last reported by this VM's own agent -- absent until it has
  // pushed at least one sample.
  agent_os?: string;
};

export function getVMAgentStatus(vmId: string) {
  return apiFetch<VMAgentStatus>(`/api/vms/${vmId}/vm-agent/status`);
}

// No SSH-based automated install endpoint exists for the VM Agent -- see
// infrahub-api/internal/services/vm_agent_install.go's doc comment. Every
// install here is the admin running docker themselves, same as Docker
// Host/K8s Cluster.

export type VMAgentManualInstall = {
  token: string;
  backend_url: string;
  image: string;
  container_name: string;
  run_command: string;
};

export function getVMAgentManualInstall(vmId: string) {
  return apiFetch<VMAgentManualInstall>(`/api/vms/${vmId}/vm-agent/manual`, { method: "POST" });
}

// A real, synchronous round-trip ping -- unlike VMAgentStatus.connected
// (a WebSocket-open check) or last_heartbeat_at (up to a full push
// interval stale), this proves the agent is alive right now. Mirrors
// DockerAgentConnectionTestResult's shape (no engine_version -- this
// agent has no version to report).
export type VMAgentConnectionTestResult = {
  status: "connected" | "failed";
  latency_ms?: number;
  error_code?: string;
  message?: string;
};

export function testVMAgentConnection(vmId: string) {
  return apiFetch<VMAgentConnectionTestResult>(`/api/vms/${vmId}/vm-agent/connection-test`, { method: "POST" });
}

// Agent-pushed metrics -- fully separate from MonitoringCurrent/History
// above (the SSH-collected series): every field is a live sample the
// agent computed itself, never derived server-side, and every field is
// optional since the agent may not have been able to read it (e.g. no
// journal/proc mount, or the very first sample with nothing to delta
// CPU%/network rates against yet).
export type VMAgentMetrics = {
  captured_at: string;
  cpu_percent?: number;
  cpu_cores?: number;
  memory_used_bytes?: number;
  memory_total_bytes?: number;
  swap_used_bytes?: number;
  swap_total_bytes?: number;
  load_1m?: number;
  load_5m?: number;
  load_15m?: number;
  uptime_seconds?: number;
  storage_used_bytes?: number;
  storage_total_bytes?: number;
  network_rx_rate_bytes?: number;
  network_tx_rate_bytes?: number;
  process_count?: number;
  // Host identity -- current-value fields off the vms row (not per-sample),
  // see migrations/060_vm_agent_host_identity.sql; absent until the agent
  // has pushed at least one sample carrying them.
  agent_os?: string;
  agent_os_version?: string;
  agent_kernel_version?: string;
  agent_hostname?: string;
};

// 404 (via ApiError) means no sample has ever arrived yet -- never
// fabricated data, same discipline as getMonitoringCurrent.
export function getVMAgentMetricsCurrent(vmId: string) {
  return apiFetch<VMAgentMetrics>(`/api/vms/${vmId}/vm-agent/metrics/current`);
}

export function getVMAgentMetricsHistory(vmId: string, minutes = 60) {
  return apiFetch<{ metrics: VMAgentMetrics[] }>(`/api/vms/${vmId}/vm-agent/metrics/history?minutes=${minutes}`);
}

// True push, not a poll: the backend forwards each sample the instant
// the agent's own next push is persisted (see VMAgentService.HandleMetricsPush's
// broadcaster), sending whatever the latest known sample already is
// immediately on connect. Each frame is the exact same shape as
// VMAgentMetrics/getVMAgentMetricsCurrent's response.
export function vmAgentMetricsStreamUrl(vmId: string): string {
  const wsBase = API_BASE.replace(/^http/, "ws");
  return `${wsBase}/api/vms/${vmId}/vm-agent/metrics/stream`;
}

// --- VM Agent logs (journald-backed, live-only) ---
// Unlike Docker Host container logs (which gained real persisted history
// via searchDockerHostLogs), the VM Agent has no background capture of
// its own yet: nothing is persisted server-side here, just a single
// bounded "recent" fetch plus a live-tail WebSocket.

export type VMAgentLogLine = { logged_at: string; line: string; severity: LogSeverity; category?: string; suggestion?: string };

export function getVMAgentRecentLogs(vmId: string, params: { since?: string } = {}) {
  const q = new URLSearchParams();
  if (params.since) q.set("since", params.since);
  const qs = q.toString();
  return apiFetch<{ lines: VMAgentLogLine[]; total: number; since: string; agent_connected: boolean; counts: LogSeverityCounts }>(
    `/api/vms/${vmId}/vm-agent/logs/recent${qs ? `?${qs}` : ""}`
  );
}

export function vmAgentLogsStreamUrl(vmId: string): string {
  const wsBase = API_BASE.replace(/^http/, "ws");
  return `${wsBase}/api/vms/${vmId}/vm-agent/logs/stream`;
}

export type VMAgentLogsInboundFrame =
  | { type: "log"; line: string; severity: LogSeverity; category?: string; suggestion?: string }
  | { type: "error"; message: string }
  | { type: "closed" };

// Adapts getVMAgentRecentLogs to the same `search(params) => Promise<LogSearchResult>`
// contract LogsWorkspace/LogSearchPanel already expect -- copy of
// dockerHostLogsSearchAdapter's shape, just against the VM Agent's own
// recent-logs endpoint instead of a Docker Host's.
export function vmLogsSearchAdapter(vmId: string) {
  return async (params: {
    q?: string;
    from?: string;
    to?: string;
    severity?: LogSeverity;
    limit?: number;
    offset?: number;
  }): Promise<LogSearchResult> => {
    const result = await getVMAgentRecentLogs(vmId, { since: params.from });
    let lines: LogSearchLine[] = result.lines.map((l, i) => ({
      id: String(i),
      logged_at: l.logged_at,
      line: l.line,
      severity: l.severity,
      category: l.category,
      suggestion: l.suggestion,
    }));
    if (params.q) {
      const q = params.q.toLowerCase();
      lines = lines.filter((l) => l.line.toLowerCase().includes(q));
    }
    if (params.severity) lines = lines.filter((l) => l.severity === params.severity);
    const total = lines.length;
    const offset = params.offset ?? 0;
    const limit = params.limit ?? 200;
    return { lines: lines.slice(offset, offset + limit), total, retention_cutoff: result.since, counts: result.counts };
  };
}

// --- Per-VM Docker agent ---
// One agent per VM providing both Docker metrics and Docker logs over a
// persistent WebSocket. The agent ships as a published container image
// (docker.io/infrahubcenter/infrahub-docker-agent) run on the VM's own Docker daemon
// -- Install is a single automated Admin action that (re)issues the
// agent's bearer token and pulls/runs that image over SSH in one step,
// which also serves as repair/token-rotation for an already-installed
// agent. getDockerAgentManualInstall is the manual-install path: for a VM
// this app can't (or shouldn't) SSH into, an admin can still (re)issue a
// token and get the exact `docker run` command to paste into the VM's own
// console -- nothing to download or build by hand, the VM's own `docker
// run` pulls the image directly.

export type DockerAgentStatus = {
  installed: boolean;
  connected: boolean;
  version?: string;
  last_heartbeat_at?: string;
  token_configured: boolean;
};

export function getDockerAgentStatus(vmId: string) {
  return apiFetch<DockerAgentStatus>(`/api/vms/${vmId}/docker-agent/status`);
}

export type DockerAgentInstallResult = {
  status: "ok" | "failed";
  connected?: boolean;
  engine_version?: string;
  message?: string;
};

// Admin-only. An operation endpoint: always 200 with a structured
// outcome -- a real-world install failure (unreachable VM, no sudo,
// unsupported architecture) is an expected, common outcome, not a
// request-level error.
export function installDockerAgent(vmId: string) {
  return apiFetch<DockerAgentInstallResult>(`/api/vms/${vmId}/docker-agent/install`, { method: "POST" });
}

export type DockerAgentConnectionTestResult = {
  status: "connected" | "failed";
  engine_version?: string;
  latency_ms?: number;
  error_code?: string;
  message?: string;
};

export function testDockerAgentConnection(vmId: string) {
  return apiFetch<DockerAgentConnectionTestResult>(`/api/vms/${vmId}/docker-agent/connection-test`, { method: "POST" });
}

// Manual / Live install mode: the identical install installDockerAgent()
// triggers automatically, but streamed line-by-line over a WebSocket so
// an admin sees the real remote commands run instead of a single
// black-box outcome. Admin-only (enforced server-side).
export function dockerAgentInstallStreamUrl(vmId: string): string {
  const wsBase = API_BASE.replace(/^http/, "ws");
  return `${wsBase}/api/vms/${vmId}/docker-agent/install-stream`;
}

export type DockerAgentInstallStreamFrame =
  | { type: "line"; line: string }
  | { type: "done"; status: "ok" | "failed"; message?: string; connected?: boolean; engine_version?: string };

export type DockerAgentManualInstall = {
  token: string;
  backend_url: string;
  image: string;
  container_name: string;
  // The exact `docker run` command to paste into the VM's own console --
  // already includes the token/backend URl above, so callers don't need
  // to reassemble it client-side.
  run_command: string;
};

// Admin-only. Issues a fresh agent token (the same side effect Install has
// -- any previously running agent stops authenticating the moment this
// runs) and returns the exact `docker run` command to paste into the VM's
// own console, without touching this VM's SSH connection at all.
export function getDockerAgentManualInstall(vmId: string) {
  return apiFetch<DockerAgentManualInstall>(`/api/vms/${vmId}/docker-agent/manual`, { method: "POST" });
}

// --- Docker Hosts (standalone, agent-only) ---
// Mirrors the Kubernetes Clusters section (below) exactly: no VM record,
// no SSH -- Connect (name + workspace) issues a one-time bearer token
// plus the exact `docker run` command to paste anywhere with a Docker
// daemon. Independent of the per-VM Docker agent above (that one attaches
// to an existing VM resource and installs over SSH); a Docker Host is its
// own resource type from the start.

export type DockerHost = {
  id: string;
  resource_id: string;
  name: string;
  workspace_id: string;
  workspace_name: string;
  engine_version?: string;
  monitoring_enabled: boolean;
  last_connection_at?: string;
  agent_token_configured: boolean;
  agent_connected: boolean;
};

export function listDockerHosts() {
  return apiFetch<{ hosts: DockerHost[] }>("/api/docker/hosts");
}

export function getDockerHost(id: string) {
  return apiFetch<DockerHost>(`/api/docker/hosts/${id}`);
}

// createDockerHost's response additionally carries the one-time agent
// token and the exact `docker run` command to paste -- never retrievable
// again afterward (only the token's hash is stored); regenerateDockerHostAgentToken
// is how to get a fresh one later if it's lost.
export function createDockerHost(payload: { workspace_id: string; name: string }) {
  return apiFetch<DockerHost & { agent_token: string; run_command: string }>("/api/docker/hosts", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function deleteDockerHost(id: string, confirmationName: string) {
  return apiFetch<{ deleted: boolean }>(`/api/docker/hosts/${id}`, {
    method: "DELETE",
    body: JSON.stringify({ confirmation_name: confirmationName }),
  });
}

export function setDockerHostMonitoring(id: string, enabled: boolean) {
  return apiFetch<DockerHost>(`/api/docker/hosts/${id}/monitoring`, { method: "PUT", body: JSON.stringify({ enabled }) });
}

export function regenerateDockerHostAgentToken(id: string) {
  return apiFetch<{ agent_token: string; run_command: string }>(`/api/docker/hosts/${id}/agent-token`, { method: "POST" });
}

// Reuses DockerAgentConnectionTestResult -- same response shape as a VM's
// own agent test (see docker_host.go's TestConnection handler).
export function testDockerHostConnection(id: string) {
  return apiFetch<DockerAgentConnectionTestResult>(`/api/docker/hosts/${id}/connection-test`, { method: "POST" });
}

// --- Docker Host live containers/logs (for the top-level Docker
// Monitoring/Logs dashboards bound to a Docker Host instead of a VM) --
// live-only: fetched straight from the connected agent on every call,
// nothing persisted server-side, so there's no history/pagination the
// way listDockerContainers/searchDockerLogs (VM-backed) have.

export type DockerHostContainerMetric = {
  cpu_percent?: number;
  memory_usage_bytes?: number;
  memory_limit_bytes?: number;
  memory_percent?: number;
  network_rx_bytes?: number;
  network_tx_bytes?: number;
  block_read_bytes?: number;
  block_write_bytes?: number;
  pids?: number;
};

export type DockerHostContainer = {
  container_id: string;
  name: string;
  image: string;
  status: DockerContainerStatus;
  state?: string;
  health?: DockerContainerHealth;
  command?: string;
  restart_count: number;
  created_at_remote?: string;
  started_at_remote?: string;
  // InfraHub's own record of when this container was first reported by
  // the host's agent -- distinct from created_at_remote (Docker's own
  // container-creation time on the host).
  first_seen_at?: string;
  metrics?: DockerHostContainerMetric;
};

export function listDockerHostContainers(hostId: string) {
  return apiFetch<{ containers: DockerHostContainer[]; total: number; agent_connected: boolean }>(
    `/api/docker/hosts/${hostId}/containers`
  );
}

// Full image/volume/network/build-cache inventory with storage sizes --
// the agent-based counterpart to `docker system df`, powering the
// Monitor dashboard's click-through detail. Works identically for a VM's
// own Docker section (same hostId param is actually a resource id either
// way; see backend's authorizeFeature).
export type DockerHostImage = { id: string; repo_tags?: string[]; size_bytes: number; containers: number; created_at?: string };
export type DockerHostVolume = { name: string; driver: string; mountpoint?: string; size_bytes?: number; created_at?: string };
export type DockerHostNetwork = { id: string; name: string; driver: string; scope: string; containers: number };
export type DockerHostBuildCacheEntry = { id: string; type: string; description?: string; size_bytes: number; in_use: boolean; shared: boolean; last_used_at?: string };

export type DockerHostResources = {
  agent_connected: boolean;
  images?: DockerHostImage[];
  volumes?: DockerHostVolume[];
  networks?: DockerHostNetwork[];
  build_cache?: DockerHostBuildCacheEntry[];
  total_images_size_bytes?: number;
  total_volumes_size_bytes?: number;
  total_build_cache_size_bytes?: number;
};

export function getDockerHostResources(hostId: string) {
  return apiFetch<DockerHostResources>(`/api/docker/hosts/${hostId}/resources`);
}

// The Docker HOST machine's own OS-level CPU/memory/load/disk usage --
// never available from the Docker Engine API itself (only static
// capacity, never live usage), so the agent reads /proc and a statfs of
// the host's real root directly. `available: false` (with `error` set)
// is the agent-connected-but-lacks-the-two-new-bind-mounts case -- an
// agent installed before this feature existed, distinct from
// agent_connected: false (no agent at all).
export type DockerHostSystemMetrics = {
  agent_connected: boolean;
  available: boolean;
  error?: string;
  cpu_percent?: number;
  cpu_cores?: number;
  memory_total_bytes?: number;
  memory_used_bytes?: number;
  load_avg_1?: number;
  load_avg_5?: number;
  load_avg_15?: number;
  disk_total_bytes?: number;
  disk_used_bytes?: number;
  disk_available_bytes?: number;
};

export function getDockerHostSystemMetrics(hostId: string) {
  return apiFetch<DockerHostSystemMetrics>(`/api/docker/hosts/${hostId}/system-metrics`);
}

// The live-logs WebSocket URL for a Docker Host's container -- mirrors
// dockerLogsStreamUrl exactly, just under the Docker Host route tree.
export function dockerHostContainerLogsStreamUrl(hostId: string, containerId: string): string {
  const wsBase = API_BASE.replace(/^http/, "ws");
  return `${wsBase}/api/docker/hosts/${hostId}/containers/${containerId}/logs/stream`;
}

// Searches a Docker Host container's background-captured history (see
// services/docker_host_log_capture.go) -- mirrors searchDockerLogs
// exactly, just under the Docker Host route tree. Independent of live
// agent connection status: it only ever reads what the capture scheduler
// has already stored, going back up to the configured retention window,
// same as searchDockerLogs/searchK8sPodLogs.
export function searchDockerHostLogs(
  hostId: string,
  containerId: string,
  params: { q?: string; from?: string; to?: string; severity?: LogSeverity; limit?: number; offset?: number } = {}
) {
  const search = new URLSearchParams();
  if (params.q) search.set("q", params.q);
  if (params.from) search.set("from", params.from);
  if (params.to) search.set("to", params.to);
  if (params.severity) search.set("severity", params.severity);
  if (params.limit !== undefined) search.set("limit", String(params.limit));
  if (params.offset !== undefined) search.set("offset", String(params.offset));
  const qs = search.toString();
  return apiFetch<LogSearchResult>(`/api/docker/hosts/${hostId}/containers/${containerId}/logs/search${qs ? `?${qs}` : ""}`);
}

// Adapts searchDockerHostLogs to the `search(params) => Promise<LogSearchResult>`
// contract LogsWorkspace/LogSearchPanel/LogSummaryPanel already expect --
// a one-line wrapper, kept only so DockerLogsBrowser can pass the same
// shape regardless of whether it's showing a VM's or a Docker Host's
// containers.
export function dockerHostLogsSearchAdapter(hostId: string, containerId: string) {
  return (params: { q?: string; from?: string; to?: string; severity?: LogSeverity; limit?: number; offset?: number }) =>
    searchDockerHostLogs(hostId, containerId, params);
}

// --- Monitoring (Step 6) ---
// The browser never talks to a VM directly -- every one of these reads
// data the backend's monitoring scheduler already collected and stored.
// See docs/vm-monitoring.md.

export type HealthStatus = "HEALTHY" | "WARNING" | "CRITICAL" | "UNKNOWN" | "OFFLINE";

export type CPUMetrics = {
  usage_percent?: number;
  user_percent?: number;
  system_percent?: number;
  iowait_percent?: number;
  idle_percent?: number;
  cores?: number;
};

export type MemoryMetrics = {
  total_bytes?: number;
  used_bytes?: number;
  available_bytes?: number;
  usage_percent?: number;
};

export type SwapMetrics = {
  configured: boolean;
  total_bytes?: number;
  used_bytes?: number;
  usage_percent?: number;
};

export type LoadMetrics = {
  one_minute?: number;
  five_minutes?: number;
  fifteen_minutes?: number;
  load_per_cpu?: number;
};

export type StorageMetrics = {
  total_bytes?: number;
  used_bytes?: number;
  usage_percent?: number;
};

export type NetworkSummary = {
  rx_bytes_per_sec?: number;
  tx_bytes_per_sec?: number;
};

export type FilesystemMetrics = {
  mount_point: string;
  filesystem?: string;
  total_bytes: number;
  used_bytes: number;
  available_bytes: number;
  usage_percent: number;
};

export type NetworkInterfaceMetrics = {
  name: string;
  rx_bytes_per_sec?: number;
  tx_bytes_per_sec?: number;
  rx_errors: number;
  tx_errors: number;
  rx_dropped: number;
  tx_dropped: number;
};

export type ProcessMetrics = {
  total?: number;
  running?: number;
  sleeping?: number;
  zombie?: number;
};

export type MonitoringCurrent = {
  status: HealthStatus;
  captured_at?: string;
  stale_after_seconds: number;
  monitoring_enabled: boolean;
  cpu?: CPUMetrics;
  memory?: MemoryMetrics;
  swap?: SwapMetrics;
  load?: LoadMetrics;
  uptime_seconds?: number;
  storage?: StorageMetrics;
  network?: NetworkSummary;
  filesystems?: FilesystemMetrics[];
  network_interfaces?: NetworkInterfaceMetrics[];
  process?: ProcessMetrics;
  last_run_status?: string;
  last_run_error?: string;
};

export function getMonitoringCurrent(vmId: string) {
  return apiFetch<MonitoringCurrent>(`/api/vms/${vmId}/monitoring/current`);
}

export type MonitoringPoint = {
  captured_at: string;
  status?: string;
  cpu_usage_percent?: number;
  memory_usage_percent?: number;
  storage_usage_percent?: number;
  network_rx_rate_bytes?: number;
  network_tx_rate_bytes?: number;
};

export type MonitoringHistory = {
  from: string;
  to: string;
  points: MonitoringPoint[];
};

export function getMonitoringHistory(vmId: string, params?: { from?: string; to?: string; limit?: number }) {
  const query = new URLSearchParams();
  if (params?.from) query.set("from", params.from);
  if (params?.to) query.set("to", params.to);
  if (params?.limit) query.set("limit", String(params.limit));
  const qs = query.toString();
  return apiFetch<MonitoringHistory>(`/api/vms/${vmId}/monitoring/history${qs ? `?${qs}` : ""}`);
}

export type MonitoringCollectResult = {
  status: "SUCCESS" | "PARTIAL" | "FAILED";
  health?: HealthStatus;
  error_summary?: string;
};

// Admin-only, rate-limited server-side (a 429 ApiError means "try again in
// a few seconds," not a bug) -- never called by a member.
export function collectMonitoringNow(vmId: string) {
  return apiFetch<MonitoringCollectResult>(`/api/vms/${vmId}/monitoring/collect`, { method: "POST" });
}

// --- Workspace: List is any authenticated role (the picker source for
// every VM/Database/Object Storage/Docker/Kubernetes create flow); every
// other function is Admin-only. Replaces the old two-tier Project+Group
// model entirely with one flat tier. ---

export function listWorkspaces() {
  return apiFetch<{ workspaces: Workspace[] }>("/api/workspaces");
}

export function getWorkspace(id: string) {
  return apiFetch<Workspace>(`/api/workspaces/${id}`);
}

export function createWorkspace(payload: { name: string; description?: string }) {
  return apiFetch<Workspace>("/api/workspaces", { method: "POST", body: JSON.stringify(payload) });
}

export function updateWorkspace(id: string, payload: Partial<{ name: string; description: string; is_active: boolean }>) {
  return apiFetch<Workspace>(`/api/workspaces/${id}`, { method: "PATCH", body: JSON.stringify(payload) });
}

// Admin-only. A real, permanent delete -- unlike updateWorkspace's
// is_active deactivation above. The backend blocks this (409) if the
// workspace still contains any VMs/Databases/Object Storage, and
// independently re-checks confirmationName against the workspace's
// current name (case-sensitive, exact match) before deleting.
export function deleteWorkspace(id: string, confirmationName: string) {
  return apiFetch<{ deleted: boolean }>(`/api/workspaces/${id}`, {
    method: "DELETE",
    body: JSON.stringify({ confirmation_name: confirmationName }),
  });
}

export function listWorkspaceMembers(workspaceId: string) {
  return apiFetch<{ members: WorkspaceMember[] }>(`/api/workspaces/${workspaceId}/members`);
}

export function addWorkspaceMember(workspaceId: string, userId: string) {
  return apiFetch<{ status: string }>(`/api/workspaces/${workspaceId}/members`, {
    method: "POST",
    body: JSON.stringify({ user_id: userId }),
  });
}

export function removeWorkspaceMember(workspaceId: string, userId: string) {
  return apiFetch<{ status: string }>(`/api/workspaces/${workspaceId}/members/${userId}`, {
    method: "DELETE",
  });
}

// --- Admin: resources (generic; DATABASE/OBJECT_STORAGE placeholders) ---

export function listResources(filter?: { workspace_id?: string; resource_type?: string; status?: string }) {
  const params = new URLSearchParams();
  if (filter) {
    for (const [key, value] of Object.entries(filter)) {
      if (value) params.set(key, value);
    }
  }
  const qs = params.toString();
  return apiFetch<{ resources: Resource[] }>(`/api/resources${qs ? `?${qs}` : ""}`);
}

export function createResource(payload: {
  workspace_id: string;
  name: string;
  resource_type: "DATABASE" | "OBJECT_STORAGE";
  description?: string;
}) {
  return apiFetch<Resource>("/api/resources", { method: "POST", body: JSON.stringify(payload) });
}

// --- Admin: users ---

// Calling with no params returns every user (subject to the backend's own
// scoping) and only `res.users` needs to be read -- `total`/
// `active_admin_count` are additive, so every zero-arg caller (the VM/
// Database/Object-Storage AccessSection member dropdowns, the Permissions
// page's member picker) keeps compiling and working unchanged.
export function listUsers(params?: {
  search?: string;
  role?: Role;
  status?: UserStatus;
  sort?: "name" | "email" | "role" | "status" | "last_login_at" | "created_at";
  order?: "asc" | "desc";
  limit?: number;
  offset?: number;
}) {
  const q = new URLSearchParams();
  if (params?.search) q.set("search", params.search);
  if (params?.role) q.set("role", params.role);
  if (params?.status) q.set("status", params.status);
  if (params?.sort) q.set("sort", params.sort);
  if (params?.order) q.set("order", params.order);
  if (params?.limit) q.set("limit", String(params.limit));
  if (params?.offset !== undefined) q.set("offset", String(params.offset));
  const qs = q.toString();
  return apiFetch<{ users: UserListItem[]; total: number; active_admin_count: number }>(
    `/api/users${qs ? `?${qs}` : ""}`
  );
}

export function getUser(id: string) {
  return apiFetch<UserDetail>(`/api/users/${id}`);
}

export function createUser(payload: { name: string; email: string; role: Role }) {
  return apiFetch<UserListItem & { temporary_password?: string }>("/api/users", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateUser(id: string, payload: { name?: string; is_active?: boolean }) {
  return apiFetch<UserListItem>(`/api/users/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

// Removes the user from the active Users list entirely -- distinct from
// updateUser's is_active toggle (Disable), which keeps them listed.
// Requires the user's exact current name as confirmation_name, same
// convention as every other delete in this app.
export function deleteUser(id: string, confirmationName: string) {
  return apiFetch<{ deleted: true }>(`/api/users/${id}`, {
    method: "DELETE",
    body: JSON.stringify({ confirmation_name: confirmationName }),
  });
}

// --- Admin: VM access ---

export function grantVMAccess(userId: string, vmId: string, permissions: string[]) {
  return apiFetch<{ status: string }>(`/api/users/${userId}/vm-access`, {
    method: "POST",
    body: JSON.stringify({ vm_id: vmId, permissions }),
  });
}

export function revokeVMAccess(userId: string, vmId: string) {
  return apiFetch<{ status: string }>(`/api/users/${userId}/vm-access/${vmId}`, {
    method: "DELETE",
  });
}

// --- Permissions: unified direct-grants ledger (Admin only) ---
// GET /api/permissions is scoped to DIRECT grants only -- workspace-derived
// access stays visible per-resource via each type's own ListAccess
// endpoint (listVMAccess/listDatabaseAccess/listObjectStorageAccess)
// instead, since a revoke button here can't meaningfully "revoke" a
// WORKSPACE-derived row (that means removing workspace membership, a
// different action). One row per (resource, user, permission) -- NOT an
// array of permissions per grant -- matching the /permissions page's
// literal Permission/Description/Resource/Scope/Role/Status table columns.
// Mutations dispatch to the three existing per-type grant/revoke endpoints
// client-side; there is no generic grant/revoke endpoint.
export type PermissionGrant = {
  resource_id: string;
  resource_type: "VM" | "DATABASE" | "OBJECT_STORAGE";
  resource_name: string;
  workspace_id: string;
  workspace_name: string;
  user_id: string;
  user_name: string;
  user_email: string;
  user_role: Role;
  permission: string;
  description: string;
  granted_at: string;
};

export function listPermissions(params?: {
  resource_type?: "VM" | "DATABASE" | "OBJECT_STORAGE";
  workspace_id?: string;
  role?: Role;
}) {
  const q = new URLSearchParams();
  if (params?.resource_type) q.set("resource_type", params.resource_type);
  if (params?.workspace_id) q.set("workspace_id", params.workspace_id);
  if (params?.role) q.set("role", params.role);
  const qs = q.toString();
  return apiFetch<{ grants: PermissionGrant[] }>(`/api/permissions${qs ? `?${qs}` : ""}`);
}

// --- Linux packages (Step 7) ---
// Discovery/scanning is entirely backend-driven over SSH; the browser
// only ever reads what a scan already stored. See docs/package-management.md.

export type PackageStatus = "UP_TO_DATE" | "UPDATE_AVAILABLE" | "SECURITY_UPDATE";

export type Package = {
  id: string;
  name: string;
  installed_version: string;
  available_version?: string;
  architecture: string;
  package_manager: string;
  description?: string;
  status: PackageStatus;
  severity?: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" | "UNKNOWN";
  is_security_update: boolean;
  last_discovered_at?: string;
  // When this package row was first seen by our own scanner -- fallback
  // for installed_at below.
  created_at: string;
  // The package manager's own install-time record (APT/RPM), when
  // available -- more accurate than created_at for "Installed Since
  // Onboarding" since a delayed first scan can discover a package long
  // after it was actually installed. Falls back to created_at server-side
  // when absent (pip/npm/gem/snap).
  installed_at?: string;
};

export type PackagePage = { packages: Package[]; page: number; page_size: number; total: number };

export function listPackages(
  vmId: string,
  params?: {
    search?: string;
    status?: PackageStatus;
    security?: boolean;
    package_manager?: string;
    page?: number;
    page_size?: number;
    // Filters to packages whose created_at is after the VM's
    // package_baseline_at -- see resetPackageBaseline/PackageSummary.package_baseline_at.
    new_since_baseline?: boolean;
  }
) {
  const q = new URLSearchParams();
  if (params?.search) q.set("search", params.search);
  if (params?.status) q.set("status", params.status);
  if (params?.security) q.set("security", "true");
  if (params?.package_manager) q.set("package_manager", params.package_manager);
  if (params?.page) q.set("page", String(params.page));
  if (params?.page_size) q.set("page_size", String(params.page_size));
  if (params?.new_since_baseline) q.set("new_since_baseline", "true");
  const qs = q.toString();
  return apiFetch<PackagePage>(`/api/vms/${vmId}/packages${qs ? `?${qs}` : ""}`);
}

export function getPackage(vmId: string, packageId: string) {
  return apiFetch<Package>(`/api/vms/${vmId}/packages/${packageId}`);
}

export type PackageUpdate = {
  id: string;
  package_id: string;
  package_name: string;
  current_version: string;
  available_version: string;
  architecture?: string;
  release?: string;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" | "UNKNOWN";
  is_security_update: boolean;
  security_status: "CONFIRMED" | "NOT_SECURITY" | "UNKNOWN";
  recommendation_status: "NEW" | "ACKNOWLEDGED" | "DISMISSED" | "RESOLVED";
  detected_at: string;
};

export function listPackageUpdates(vmId: string, params?: { search?: string; security?: boolean; page?: number; page_size?: number }) {
  const q = new URLSearchParams();
  if (params?.search) q.set("search", params.search);
  if (params?.security) q.set("security", "true");
  if (params?.page) q.set("page", String(params.page));
  if (params?.page_size) q.set("page_size", String(params.page_size));
  const qs = q.toString();
  return apiFetch<{ updates: PackageUpdate[]; page: number; page_size: number; total: number }>(
    `/api/vms/${vmId}/packages/updates${qs ? `?${qs}` : ""}`
  );
}

export type PackageSummary = {
  total: number;
  up_to_date: number;
  updates_available: number;
  security_updates: number;
  last_scan?: string;
  // Absent until the VM's first-ever successful package scan completes,
  // or until an admin explicitly resets it (resetPackageBaseline below).
  package_baseline_at?: string;
};

export function getPackageSummary(vmId: string) {
  return apiFetch<PackageSummary>(`/api/vms/${vmId}/packages/summary`);
}

// Admin-only: "Reset Baseline to Now" -- for a VM that was already
// customized before onboarding, moves the "installed since onboarding"
// cutoff forward to this moment.
export function resetPackageBaseline(vmId: string) {
  return apiFetch<{ package_baseline_at: string }>(`/api/vms/${vmId}/packages/baseline`, { method: "PUT" });
}

export type PackageDiscoveryRun = {
  id: string;
  package_manager?: string;
  status: "RUNNING" | "SUCCESS" | "PARTIAL" | "FAILED";
  package_count?: number;
  started_at: string;
  completed_at?: string;
  error_summary?: string;
};

export function getPackageDiscoveryStatus(vmId: string) {
  return apiFetch<{ runs: PackageDiscoveryRun[] }>(`/api/vms/${vmId}/packages/discovery-status`);
}

export type PackageScanResult = {
  status: "SUCCESS" | "PARTIAL" | "FAILED";
  package_manager?: string;
  package_count: number;
  update_count: number;
  error_summary?: string;
};

// Admin-only, rate-limited server-side -- never called by a member.
export function scanPackages(vmId: string) {
  return apiFetch<PackageScanResult>(`/api/vms/${vmId}/packages/scan`, { method: "POST" });
}

export function refreshPackageMetadata(vmId: string) {
  return apiFetch<PackageScanResult>(`/api/vms/${vmId}/packages/refresh`, { method: "POST" });
}

export function acknowledgePackageUpdate(vmId: string, packageId: string) {
  return apiFetch<{ status: string }>(`/api/vms/${vmId}/packages/${packageId}/acknowledge`, { method: "POST" });
}

export function dismissPackageUpdate(vmId: string, packageId: string) {
  return apiFetch<{ status: string }>(`/api/vms/${vmId}/packages/${packageId}/dismiss`, { method: "POST" });
}

// --- Externally installed packages (pip/npm/gem/snap): list-only, no
// update checking (no generic way to check an arbitrary vendor's site
// for a newer version) -- a separate, simpler section from the OS
// package table above. ---

export type ExternalPackage = {
  id: string;
  name: string;
  installed_version: string;
  package_manager: "PIP" | "NPM" | "GEM" | "SNAP";
  last_discovered_at?: string;
};

export function listExternalPackages(vmId: string) {
  return apiFetch<{ packages: ExternalPackage[] }>(`/api/vms/${vmId}/external-packages`);
}

export type ExternalPackageScanResult = {
  status: "SUCCESS" | "FAILED";
  package_count: number;
  error_summary?: string;
};

export function scanExternalPackages(vmId: string) {
  return apiFetch<ExternalPackageScanResult>(`/api/vms/${vmId}/external-packages/scan`, { method: "POST" });
}

// --- Cross-VM recommendations dashboard (Step 7) ---
// The backend restricts this to the caller's authorized VMs for members
// -- never trust a client-side filter for this.

// Step 14 renamed vm_id/vm_name to resource_id/resource_name and added
// resource_type ("VM" | "DATABASE", with more resource types possible in
// the future) -- a recommendation is no longer assumed to always be about
// a VM. Treat unrecognized resource_type values gracefully (no link).
export type RecommendationSeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" | "UNKNOWN";

export type Recommendation = {
  id: string;
  resource_id: string;
  resource_name: string;
  resource_type: string;
  type: string;
  severity: RecommendationSeverity;
  title: string;
  description?: string;
  status: "NEW" | "ACKNOWLEDGED" | "DISMISSED" | "RESOLVED";
  metadata?: Record<string, unknown>;
  detected_at: string;
  resolved_at?: string;
};

export function listRecommendations(params?: {
  type?: string;
  status?: string;
  severity?: RecommendationSeverity;
  resource_id?: string;
  page?: number;
  page_size?: number;
}) {
  const q = new URLSearchParams();
  if (params?.type) q.set("type", params.type);
  if (params?.status) q.set("status", params.status);
  if (params?.severity) q.set("severity", params.severity);
  if (params?.resource_id) q.set("resource_id", params.resource_id);
  if (params?.page) q.set("page", String(params.page));
  if (params?.page_size) q.set("page_size", String(params.page_size));
  const qs = q.toString();
  return apiFetch<{ recommendations: Recommendation[]; page: number; page_size: number; total: number }>(
    `/api/recommendations${qs ? `?${qs}` : ""}`
  );
}

// --- Docker (Step 8) ---
// Discovery/metrics collection is entirely backend-driven over SSH; the
// browser only ever reads what a scan/collection cycle already stored,
// plus the live-metrics WebSocket, which itself only reads the backend's
// shared in-memory cache. See docs/docker-monitoring.md.

export type DockerDaemonStatus = "NOT_INSTALLED" | "INSTALLED" | "RUNNING" | "UNAVAILABLE" | "PERMISSION_DENIED" | "UNKNOWN";

export type DockerScanRun = {
  status: "RUNNING" | "SUCCESS" | "PARTIAL" | "FAILED";
  container_count?: number;
  image_count?: number;
  network_count?: number;
  volume_count?: number;
  started_at: string;
  completed_at?: string;
  error_summary?: string;
};

export type DockerOverview = {
  daemon_status: DockerDaemonStatus;
  engine_version?: string;
  api_version?: string;
  cli_version?: string;
  info?: Record<string, unknown>;
  last_scan?: DockerScanRun;
};

export function getDockerOverview(vmId: string) {
  return apiFetch<DockerOverview>(`/api/vms/${vmId}/docker`);
}

export type DockerSummary = {
  containers_total: number;
  containers_running: number;
  containers_stopped: number;
  containers_unhealthy: number;
  images_total: number;
  networks_total: number;
  volumes_total: number;
  last_scan?: DockerScanRun;
};

export function getDockerSummary(vmId: string) {
  return apiFetch<DockerSummary>(`/api/vms/${vmId}/docker/summary`);
}

export type DockerPort = { container_port: number; protocol: string; host_ip?: string; host_port?: number };
export type DockerMount = { source: string; destination: string; read_only: boolean; type?: string };
export type DockerContainerNetwork = { network_name: string; driver?: string; ip_address?: string; gateway?: string; mac_address?: string };
export type DockerContainerStatus = "CREATED" | "RUNNING" | "RESTARTING" | "EXITED" | "PAUSED" | "DEAD" | "REMOVING" | "UNKNOWN";
export type DockerContainerHealth = "HEALTHY" | "UNHEALTHY" | "STARTING" | "NO_HEALTHCHECK" | "UNKNOWN";

export type DockerContainer = {
  id: string;
  container_id: string;
  name: string;
  // Admin-set custom label (PUT /api/docker/containers/:id/name) --
  // empty when none has been set, in which case callers fall back to
  // `name`.
  display_name?: string;
  image: string;
  image_tag?: string;
  status: DockerContainerStatus;
  state?: string;
  health?: DockerContainerHealth;
  command?: string;
  restart_count?: number;
  platform?: string;
  ports?: DockerPort[];
  mounts?: DockerMount[];
  created_at_remote?: string;
  started_at_remote?: string;
  last_discovered_at?: string;
  networks?: DockerContainerNetwork[];
};

export type DockerContainerPage = { containers: DockerContainer[]; page: number; page_size: number; total: number };

export function listDockerContainers(
  vmId: string,
  params?: { search?: string; status?: DockerContainerStatus; health?: DockerContainerHealth; page?: number; page_size?: number }
) {
  const q = new URLSearchParams();
  if (params?.search) q.set("search", params.search);
  if (params?.status) q.set("status", params.status);
  if (params?.health) q.set("health", params.health);
  if (params?.page) q.set("page", String(params.page));
  if (params?.page_size) q.set("page_size", String(params.page_size));
  const qs = q.toString();
  return apiFetch<DockerContainerPage>(`/api/vms/${vmId}/docker/containers${qs ? `?${qs}` : ""}`);
}

export function getDockerContainer(vmId: string, containerId: string) {
  return apiFetch<DockerContainer>(`/api/vms/${vmId}/docker/containers/${containerId}`);
}

export type DockerImage = {
  id: string;
  repository: string;
  tag: string;
  image_id: string;
  digest?: string;
  size_bytes?: number;
  created_at_remote?: string;
  last_discovered_at?: string;
};

export function listDockerImages(vmId: string) {
  return apiFetch<{ images: DockerImage[]; total: number }>(`/api/vms/${vmId}/docker/images`);
}

export type DockerNetwork = {
  id: string;
  network_id: string;
  name: string;
  driver?: string;
  scope?: string;
  internal: boolean;
  attachable: boolean;
  created_at_remote?: string;
  last_discovered_at?: string;
};

export function listDockerNetworks(vmId: string) {
  return apiFetch<{ networks: DockerNetwork[]; total: number }>(`/api/vms/${vmId}/docker/networks`);
}

export type DockerVolume = {
  id: string;
  name: string;
  driver?: string;
  mountpoint?: string;
  scope?: string;
  created_at_remote?: string;
  last_discovered_at?: string;
};

export function listDockerVolumes(vmId: string) {
  return apiFetch<{ volumes: DockerVolume[]; total: number }>(`/api/vms/${vmId}/docker/volumes`);
}

export type DockerScanResult = {
  status: "SUCCESS" | "PARTIAL" | "FAILED";
  daemon_status: DockerDaemonStatus;
  container_count: number;
  image_count: number;
  network_count: number;
  volume_count: number;
  error_summary?: string;
};

// Admin-only, rate-limited server-side -- never called by a member.
export function scanDocker(vmId: string) {
  return apiFetch<DockerScanResult>(`/api/vms/${vmId}/docker/scan`, { method: "POST" });
}

export type DockerContainerMetric = {
  container_id: string;
  container_name?: string;
  captured_at: string;
  stale: boolean;
  cpu_percent?: number;
  memory_usage_bytes?: number;
  memory_limit_bytes?: number;
  memory_percent?: number;
  network_rx_bytes?: number;
  network_tx_bytes?: number;
  block_read_bytes?: number;
  block_write_bytes?: number;
  pids?: number;
};

export function getDockerMetricsCurrent(vmId: string) {
  return apiFetch<{ metrics: DockerContainerMetric[] }>(`/api/vms/${vmId}/docker/metrics/current`);
}

export function getDockerContainerMetricsCurrent(vmId: string, containerId: string) {
  return apiFetch<DockerContainerMetric>(`/api/vms/${vmId}/docker/containers/${containerId}/metrics/current`);
}

export type DockerContainerMetricPoint = {
  captured_at: string;
  cpu_percent?: number;
  memory_usage_bytes?: number;
  memory_percent?: number;
  network_rx_bytes_per_sec?: number;
  network_tx_bytes_per_sec?: number;
  block_read_bytes_per_sec?: number;
  block_write_bytes_per_sec?: number;
  pids?: number;
};

export function getDockerContainerMetricsHistory(
  vmId: string,
  containerId: string,
  params?: { from?: string; to?: string; limit?: number }
) {
  const q = new URLSearchParams();
  if (params?.from) q.set("from", params.from);
  if (params?.to) q.set("to", params.to);
  if (params?.limit) q.set("limit", String(params.limit));
  const qs = q.toString();
  return apiFetch<{ from: string; to: string; points: DockerContainerMetricPoint[] }>(
    `/api/vms/${vmId}/docker/containers/${containerId}/metrics/history${qs ? `?${qs}` : ""}`
  );
}

// The live-metrics WebSocket URL -- the browser connects to this
// directly (its own session cookie is sent automatically on the
// same-site upgrade request), never routed through apiFetch.
export function dockerContainerStatsStreamUrl(vmId: string, containerId: string): string {
  const wsBase = API_BASE.replace(/^http/, "ws");
  return `${wsBase}/api/vms/${vmId}/docker/containers/${containerId}/stats/stream`;
}

// --- Top-level Docker Monitoring/Logs section ---
//
// A deliberately separate access model from vm.view/vm.connect: a member
// only sees anything here once granted docker.monitor/docker.logs on a
// Workspace (see DockerAccessGrant below), independent of whatever
// VM-level access they already have. Admin always sees everything.

export type DockerOverviewContainer = {
  container_id: string;
  // container_name/real_container_id/vm_resource_id/vm_name are
  // Admin-only -- a Member's response never includes them (see
  // docker_overview.go's redaction rule); display_name is always
  // populated for a Member, falling back to "Unnamed App" server-side
  // when no custom name has been set.
  container_name?: string;
  real_container_id?: string;
  display_name: string;
  image: string;
  image_tag?: string;
  status: DockerContainerStatus;
  vm_resource_id?: string;
  vm_name?: string;
  workspace_name: string;
  created_at_remote?: string;
  metrics?: DockerContainerMetric;
};

// vmResourceId narrows the result to one VM's containers -- used by a
// Dashboard's Monitoring/Logs tabs (bound to exactly one VM) so a Member
// with access to several VMs only ever sees the one this Dashboard is
// about, even though vm_resource_id itself is redacted from their normal
// (unfiltered) response.
export function listDockerOverview(vmResourceId?: string) {
  const qs = vmResourceId ? `?vm_resource_id=${encodeURIComponent(vmResourceId)}` : "";
  return apiFetch<{ containers: DockerOverviewContainer[] }>(`/api/docker/overview${qs}`);
}

// Admin-only. A custom "App Name" label shown in Monitoring/Logs instead
// of the container's real name wherever set -- purely cosmetic, never
// affects authorization or access-grant matching. An empty string clears
// the label, reverting display to the real name.
export function setDockerContainerDisplayName(containerId: string, displayName: string) {
  return apiFetch<{ id: string; name: string; display_name: string }>(`/api/docker/containers/${containerId}/name`, {
    method: "PUT",
    body: JSON.stringify({ display_name: displayName }),
  });
}

// Computed at read time by the backend (services.ClassifyLogLine) --
// never stored, so it applies to every line ever captured, not just new
// ones. A heuristic ("does this line look like an HTTP 5xx / auth failure /
// panic / etc"), not an authoritative security verdict.
export type LogSeverity = "HEALTHY" | "WARNING" | "ERROR" | "CRITICAL";

export type LogSearchLine = {
  id: string;
  logged_at: string;
  line: string;
  severity: LogSeverity;
  category?: string;
  suggestion?: string;
};

export type LogSeverityCounts = {
  healthy: number;
  warning: number;
  error: number;
  critical: number;
};

export type LogSearchResult = {
  lines: LogSearchLine[];
  total: number;
  retention_cutoff: string;
  // Tallied over up to the most recent 5000 lines matching q/from/to
  // (see the backend's logSeverityScanCap) -- always reflects every
  // severity regardless of which `severity` filter (if any) was requested,
  // so a UI can show Healthy/Warning/Error/Critical tab counts together.
  counts: LogSeverityCounts;
};

// Searches the background-captured history (see
// services/docker_log_capture.go), bounded to the retention window --
// distinct from the live-tail WebSocket above, which persists nothing.
export function searchDockerLogs(
  containerId: string,
  params: { q?: string; from?: string; to?: string; severity?: LogSeverity; limit?: number; offset?: number } = {}
) {
  const search = new URLSearchParams();
  if (params.q) search.set("q", params.q);
  if (params.from) search.set("from", params.from);
  if (params.to) search.set("to", params.to);
  if (params.severity) search.set("severity", params.severity);
  if (params.limit !== undefined) search.set("limit", String(params.limit));
  if (params.offset !== undefined) search.set("offset", String(params.offset));
  const qs = search.toString();
  return apiFetch<LogSearchResult>(`/api/docker/containers/${containerId}/logs/search${qs ? `?${qs}` : ""}`);
}

// The live-logs WebSocket URL -- the browser connects to this directly
// (its own session cookie is sent automatically on the same-site upgrade
// request), never routed through apiFetch. Live-tail only: nothing is
// stored server-side, matching how the Docker stats stream and VM Console
// already work.
export function dockerLogsStreamUrl(containerId: string): string {
  const wsBase = API_BASE.replace(/^http/, "ws");
  return `${wsBase}/api/docker/containers/${containerId}/logs/stream`;
}

export type DockerLogsInboundFrame =
  | { type: "log"; line: string; severity: LogSeverity; category?: string; suggestion?: string }
  | { type: "error"; message: string }
  | { type: "closed" };

// This same grant model also covers Kubernetes: a k8s.monitor/k8s.logs
// grant is created/listed/revoked through the exact same
// /api/docker/access-grants endpoints as a docker.* one (see
// services.DockerAccessService's doc comment on the backend) -- which
// feature area a grant applies to is carried purely by this string.
export type DockerAccessPermission = "docker.monitor" | "docker.logs" | "k8s.monitor" | "k8s.logs";

export type DockerAccessGrant = {
  id: string;
  user_id?: string;
  user_name?: string;
  user_email?: string;
  scope_type: "WORKSPACE" | "RESOURCE" | "FOLDER" | "DASHBOARD";
  workspace_id?: string;
  workspace_name?: string;
  resource_id?: string;
  resource_name?: string;
  folder_id?: string;
  folder_name?: string;
  dashboard_id?: string;
  dashboard_name?: string;
  permission: DockerAccessPermission;
  created_at: string;
};

// Admin-only: the management list (every grant, with the target user
// resolved) for the Docker Access admin page.
export function listDockerAccessGrants() {
  return apiFetch<{ grants: DockerAccessGrant[] }>("/api/docker/access-grants");
}

// Admin-only. Idempotent -- granting the same (user, scope, permission)
// twice is a no-op, never a duplicate or an error. Exactly one of
// workspace_id (every VM/cluster in that workspace), resource_id (one
// specific VM/DockerHost, for docker.monitor/docker.logs, or one specific
// K8s cluster, for k8s.monitor/k8s.logs), folder_id (every Dashboard filed
// under one Monitoring Folder), or dashboard_id (exactly one Dashboard)
// should be set.
export function grantDockerAccess(payload: {
  user_id: string;
  workspace_id?: string;
  resource_id?: string;
  folder_id?: string;
  dashboard_id?: string;
  permission: DockerAccessPermission;
}) {
  return apiFetch<{ status: string }>("/api/docker/access-grants", { method: "POST", body: JSON.stringify(payload) });
}

// Admin-only.
export function revokeDockerAccess(grantId: string) {
  return apiFetch<{ status: string }>(`/api/docker/access-grants/${grantId}`, { method: "DELETE" });
}

// Authenticated-any-role: what does the calling user currently have, and
// why (which Workspace grant) -- powers the Docker section's own
// "why can't I see anything" / "what am I authorized for" display.
export function getMyDockerAccess() {
  return apiFetch<{ is_admin: boolean; grants: DockerAccessGrant[] }>("/api/docker/my-access");
}

// --- Standalone Kubernetes clusters ---
//
// A cluster is a first-class resource under a Workspace, configured with
// an uploaded kubeconfig -- never a VM child, never reached via SSH.
// Admin-only setup/credentials/connection-test/scan; Monitoring/Logs reuse
// the same Workspace-scoped docker_access_grants model as Docker
// (k8s.monitor/k8s.logs above), so a member's access here is entirely
// independent of any VM-level grant.

export type K8sClusterConnectionStatus =
  | "CONNECTED"
  | "AUTH_FAILED"
  | "TIMEOUT"
  | "REFUSED"
  | "TLS_ERROR"
  | "UNAVAILABLE"
  | "UNKNOWN";

export type K8sCluster = {
  id: string;
  resource_id: string;
  name: string;
  workspace_id: string;
  workspace_name: string;
  namespace_filter?: string;
  kubernetes_version?: string;
  monitoring_enabled: boolean;
  connection_status: K8sClusterConnectionStatus;
  last_connection_at?: string;
  last_connection_error?: string;
  last_discovered_at?: string;
  // Whether a bearer token has ever been issued for this cluster's agent,
  // and whether an agent is *currently* connected using it -- two
  // different things: a token can be configured but the agent installed
  // in the cluster might be down (see AgentConnected in k8s.go).
  agent_token_configured: boolean;
  agent_connected: boolean;
};

// Admin-only.
export function listK8sClusters() {
  return apiFetch<{ clusters: K8sCluster[] }>("/api/k8s/clusters");
}

export function getK8sCluster(id: string) {
  return apiFetch<K8sCluster>(`/api/k8s/clusters/${id}`);
}

// Admin-only. Never accepts a kubeconfig or any other credential -- the
// response's `agent_token` is a one-time-visible bearer token to install
// into the in-cluster agent (see /k8s-agent at the repo root), which then
// dials OUT to InfraHub. It is never shown again after this call.
export function createK8sCluster(payload: { workspace_id: string; name: string; namespace_filter?: string }) {
  return apiFetch<K8sCluster & { agent_token: string; backend_url?: string }>("/api/k8s/clusters", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

// Admin-only. A real partial update -- only supplied fields change.
export function updateK8sCluster(id: string, payload: Partial<{ namespace_filter: string }>) {
  return apiFetch<K8sCluster>(`/api/k8s/clusters/${id}`, { method: "PATCH", body: JSON.stringify(payload) });
}

// Admin-only. Soft-delete only -- the real cluster is never touched, never
// modified in any way. The backend independently re-checks
// confirmationName against the cluster's current name (case-sensitive,
// exact match) before deleting.
export function deleteK8sCluster(id: string, confirmationName: string) {
  return apiFetch<{ deleted: boolean }>(`/api/k8s/clusters/${id}`, {
    method: "DELETE",
    body: JSON.stringify({ confirmation_name: confirmationName }),
  });
}

// Admin-only.
export function setK8sClusterMonitoring(id: string, enabled: boolean) {
  return apiFetch<K8sCluster>(`/api/k8s/clusters/${id}/monitoring`, { method: "PUT", body: JSON.stringify({ enabled }) });
}

// Fallback only: derives a connect URL from this browser's own API base
// (often localhost-only, meaningless from inside a remote cluster).
// createK8sCluster/regenerateK8sAgentToken's own `backend_url` field --
// sourced server-side from K8S_AGENT_BACKEND_URL, the same real,
// externally-reachable tunnel URL the Docker/VM agents use -- is always
// preferred; this only fires if that env var was left unconfigured.
export function k8sAgentConnectUrl(): string {
  const wsBase = API_BASE.replace(/^http/, "ws");
  return `${wsBase}/api/k8s/agent/connect`;
}

// Public, pre-built manifest -- the install instructions run `kubectl
// apply -f` against this URL directly rather than a local repo-relative
// path, so the operator installing the agent doesn't need this app's own
// source checked out on the machine running kubectl (see
// github.com/infrahubcenter/infrahub-k8s-agent).
export const K8S_AGENT_MANIFEST_URL =
  "https://raw.githubusercontent.com/infrahubcenter/infrahub-k8s-agent/main/deploy/manifest.yaml";

// Admin-only. Issues a brand new bearer token, immediately invalidating
// whatever the currently-installed agent was using -- e.g. after a
// suspected leak, or when re-installing the agent. The response is the
// ONLY place this plaintext token is ever shown again; only its hash is
// stored server-side.
export function regenerateK8sAgentToken(id: string) {
  return apiFetch<{ agent_token: string; backend_url?: string }>(`/api/k8s/clusters/${id}/agent-token`, { method: "POST" });
}

export type K8sConnectionTestResult = {
  status: "connected" | "failed";
  kubernetes_version?: string;
  latency_ms?: number;
  error_code?: string;
  message?: string;
};

// Admin-only. An operation endpoint: always 200 with a structured outcome
// describing what happened -- never a non-2xx for "the connection itself
// failed," only for a request-level problem (e.g. an unknown cluster id).
export function testK8sConnection(id: string) {
  return apiFetch<K8sConnectionTestResult>(`/api/k8s/clusters/${id}/connection-test`, { method: "POST" });
}

// Admin-only. Triggers one immediate, out-of-band pod discovery pass
// against the cluster (rate-limited server-side to avoid hammering a slow
// or unreachable API server).
export function scanK8sCluster(id: string) {
  return apiFetch<{ status: string; message?: string }>(`/api/k8s/clusters/${id}/scan`, { method: "POST" });
}

// --- Step 26: cluster-level node detail + resource inventory ---
//
// Both are live reads straight from the cluster's connected agent (not
// anything discovery has stored) -- an operation endpoint, always 200
// with a structured `status`, since "no agent connected right now" is an
// expected, common state, not a server error. Admin-only, like every
// other cluster-identity-level endpoint.

export type K8sNode = {
  name: string;
  ready: boolean;
  roles?: string[];
  kubelet_version?: string;
  os_image?: string;
  cpu_capacity_millicores: number;
  cpu_allocatable_millicores: number;
  cpu_usage_millicores?: number;
  cpu_usage_percent?: number;
  memory_capacity_bytes: number;
  memory_allocatable_bytes: number;
  memory_usage_bytes?: number;
  memory_usage_percent?: number;
  // Best-effort (read from the node's own kubelet stats API) -- absent
  // entirely when that isn't reachable, never a fabricated 0%.
  storage_capacity_bytes?: number;
  storage_usage_bytes?: number;
  storage_usage_percent?: number;
  pod_capacity?: number;
  pod_count: number;
};

export type K8sClusterNodesResult = {
  status: "ok" | "agent_offline" | "failed";
  message?: string;
  nodes: K8sNode[];
};

export function listK8sClusterNodes(clusterId: string) {
  return apiFetch<K8sClusterNodesResult>(`/api/k8s/clusters/${clusterId}/nodes`);
}

// Deliberately excludes Secrets/ConfigMaps -- the agent's RBAC never
// grants access to them (see k8s-agent/deploy/manifest.yaml), so InfraHub
// can never enumerate a cluster's secret material even just by name.
export type K8sClusterResourceSummary = {
  status: "ok" | "agent_offline" | "failed";
  message?: string;
  namespaces?: number;
  nodes?: number;
  pods?: number;
  deployments?: number;
  stateful_sets?: number;
  daemon_sets?: number;
  services?: number;
  persistent_volume_claims?: number;
};

export function getK8sClusterResourceSummary(clusterId: string) {
  return apiFetch<K8sClusterResourceSummary>(`/api/k8s/clusters/${clusterId}/resources`);
}

// --- Step 25: top-level Kubernetes Monitoring/Logs section ---
//
// Mirrors the Docker Monitoring/Logs section above exactly, just reading
// from the pod inventory a cluster's background discovery scan keeps
// fresh instead of a live SSH stats cache.

export type K8sOverviewPod = {
  pod_id: string;
  // namespace/pod_name/node_name/cluster_resource_id/cluster_name are
  // Admin-only -- a Member's response never includes them (see
  // k8s_overview.go's redaction rule); display_name is always populated
  // for a Member, falling back to "Unnamed App" server-side.
  namespace?: string;
  pod_name?: string;
  display_name: string;
  node_name?: string;
  phase: "PENDING" | "RUNNING" | "SUCCEEDED" | "FAILED" | "UNKNOWN";
  ready_containers?: number;
  total_containers?: number;
  restart_count?: number;
  cpu_usage_millicores?: number;
  memory_usage_bytes?: number;
  started_at?: string;
  // When this row's phase/CPU/memory were last confirmed live from the
  // cluster -- this list always reads from the DB, never the live agent
  // (see k8s_overview.go's own doc comment), so a pod can keep showing
  // e.g. "Running" from before the agent went offline. Compare against
  // now to flag that as stale rather than current.
  last_discovered_at?: string;
  cluster_resource_id?: string;
  cluster_name?: string;
  workspace_name: string;
};

// clusterResourceId narrows the result to one cluster's pods -- mirrors
// listDockerOverview's vmResourceId param exactly.
export function listK8sOverview(clusterResourceId?: string) {
  const qs = clusterResourceId ? `?cluster_resource_id=${encodeURIComponent(clusterResourceId)}` : "";
  return apiFetch<{ pods: K8sOverviewPod[] }>(`/api/k8s/overview${qs}`);
}

// The live-logs WebSocket URL -- same live-tail-only, nothing-stored-
// server-side contract as dockerLogsStreamUrl above.
export function k8sLogsStreamUrl(podId: string): string {
  const wsBase = API_BASE.replace(/^http/, "ws");
  return `${wsBase}/api/k8s/pods/${podId}/logs/stream`;
}

export type K8sLogsInboundFrame =
  | { type: "log"; line: string; severity: LogSeverity; category?: string; suggestion?: string }
  | { type: "error"; message: string }
  | { type: "closed" };

// Admin-only. Mirrors setDockerContainerDisplayName exactly.
export function setK8sPodDisplayName(podId: string, displayName: string) {
  return apiFetch<{ id: string; pod_name: string; display_name: string }>(`/api/k8s/pods/${podId}/name`, {
    method: "PUT",
    body: JSON.stringify({ display_name: displayName }),
  });
}

// Mirrors searchDockerLogs exactly, against the pod's own captured
// history (services/k8s_log_capture.go).
export function searchK8sLogs(
  podId: string,
  params: { q?: string; from?: string; to?: string; severity?: LogSeverity; limit?: number; offset?: number } = {}
) {
  const search = new URLSearchParams();
  if (params.q) search.set("q", params.q);
  if (params.from) search.set("from", params.from);
  if (params.to) search.set("to", params.to);
  if (params.severity) search.set("severity", params.severity);
  if (params.limit !== undefined) search.set("limit", String(params.limit));
  if (params.offset !== undefined) search.set("offset", String(params.offset));
  const qs = search.toString();
  return apiFetch<LogSearchResult>(`/api/k8s/pods/${podId}/logs/search${qs ? `?${qs}` : ""}`);
}

// --- Saved dashboard views ---
//
// A named, reloadable filter snapshot for one Monitoring/Logs dashboard --
// private per-user, never shared. `filters` is opaque to the backend; each
// page defines and interprets its own shape.

export type SavedViewFeature = "docker_monitor" | "docker_logs" | "k8s_monitor" | "k8s_logs";

export type SavedDashboardView<TFilters = Record<string, unknown>> = {
  id: string;
  feature: SavedViewFeature;
  name: string;
  filters: TFilters;
  // Which Folder this dashboard lives in -- absent/undefined means it's
  // standalone (saved directly at the top level, no folder).
  folder_id?: string;
  created_at: string;
  updated_at: string;
};

export function listSavedViews<TFilters = Record<string, unknown>>(feature: SavedViewFeature) {
  return apiFetch<{ views: SavedDashboardView<TFilters>[] }>(`/api/saved-views?feature=${encodeURIComponent(feature)}`);
}

// Saving under a name that already exists for this user+feature replaces
// it -- re-saving a view is the expected way to update it, not an error.
// Pass folderId to save the dashboard inside that folder; omit it (or pass
// undefined) to save it standalone.
export function saveView<TFilters = Record<string, unknown>>(feature: SavedViewFeature, name: string, filters: TFilters, folderId?: string) {
  return apiFetch<SavedDashboardView<TFilters>>("/api/saved-views", {
    method: "POST",
    body: JSON.stringify({ feature, name, filters, folder_id: folderId ?? null }),
  });
}

export function deleteSavedView(id: string) {
  return apiFetch<{ status: string }>(`/api/saved-views/${id}`, { method: "DELETE" });
}

// --- Saved view Folders (Grafana-style "Folder > Dashboard" grouping for
// the same 4 saved-view features above) ---

export type SavedViewFolder = {
  id: string;
  feature: SavedViewFeature;
  name: string;
  created_at: string;
};

export function listSavedViewFolders(feature: SavedViewFeature) {
  return apiFetch<{ folders: SavedViewFolder[] }>(`/api/saved-view-folders?feature=${encodeURIComponent(feature)}`);
}

export function createSavedViewFolder(feature: SavedViewFeature, name: string) {
  return apiFetch<SavedViewFolder>("/api/saved-view-folders", {
    method: "POST",
    body: JSON.stringify({ feature, name }),
  });
}

// Deleting a folder also deletes every dashboard saved inside it (backend
// cascade) -- the caller should confirm this first when the folder isn't
// empty.
export function deleteSavedViewFolder(id: string) {
  return apiFetch<{ status: string }>(`/api/saved-view-folders/${id}`, { method: "DELETE" });
}

// --- Monitoring/Logs Folder > Dashboard: four independent trees under
// Workspace -- Monitoring>Docker, Monitoring>Kubernetes, Logs>Docker,
// Logs>Kubernetes -- discriminated by `feature`. Replaces the retired
// single-VM/cluster-bound Dashboard-with-tabs model. Each Dashboard binds
// to exactly one VM (DOCKER_*) or K8s cluster (K8S_*) resource, then
// scopes down to a multi-resource selection on it (several containers, or
// several namespaces/resource types) via resource_selection, plus which
// stat-card/chart widgets its Overview page shows via widgets (Monitoring
// dashboards only -- a Logs dashboard has no widgets). No new
// access-control model: a Dashboard is visible to whoever already holds
// the matching docker.monitor/docker.logs/k8s.monitor/k8s.logs grant on
// its Workspace via the existing Docker/K8s access-grants system --
// exactly one permission qualifies per feature (a docker.monitor grant
// does not also unlock a DOCKER_LOGS dashboard). Distinct from the private
// per-user saved-view folders above, and from App Folders (container/pod
// access grouping). ---

export type MonitoringFeature = "DOCKER_MONITORING" | "K8S_MONITORING" | "DOCKER_LOGS" | "K8S_LOGS";

export type MonitoringFolder = {
  id: string;
  feature: MonitoringFeature;
  workspace_id: string;
  name: string;
  created_at: string;
};

export type MonitoringDashboardFilterType = "CONTAINER" | "NAMESPACE" | "RESOURCE_TYPE";
export type MonitoringDashboardFilter = { type: MonitoringDashboardFilterType; value: string };

export type MonitoringWidgetType =
  | "CPU_CHART"
  | "MEMORY_CHART"
  | "NETWORK_CHART"
  | "STORAGE_CHART"
  | "CONTAINER_COUNT"
  | "POD_COUNT"
  | "RESTART_COUNT"
  | "LATENCY"
  | "LOGS"
  | "ERRORS"
  | "RESOURCE_STATUS";
export type MonitoringDashboardWidget = { type: MonitoringWidgetType; position: number };

export type MonitoringDashboard = {
  id: string;
  monitoring_folder_id?: string;
  folder_name?: string;
  feature: MonitoringFeature;
  workspace_id: string;
  name: string;
  description?: string;
  vm_resource_id?: string;
  k8s_cluster_resource_id?: string;
  refresh_interval_seconds: number;
  bound_resource_name: string;
  bound_resource_type: string;
  bound_resource_status: string;
  workspace_name: string;
  resource_selection: MonitoringDashboardFilter[];
  widgets: MonitoringDashboardWidget[];
  created_at: string;
};

export function listMonitoringFolders(feature: MonitoringFeature, workspaceId: string) {
  const q = new URLSearchParams({ feature, workspace_id: workspaceId });
  return apiFetch<{ folders: MonitoringFolder[] }>(`/api/monitoring-folders?${q.toString()}`);
}

export function createMonitoringFolder(feature: MonitoringFeature, workspaceId: string, name: string) {
  return apiFetch<MonitoringFolder>("/api/monitoring-folders", {
    method: "POST",
    body: JSON.stringify({ feature, workspace_id: workspaceId, name }),
  });
}

// Any authenticated role -- a folder's name/feature/placement is
// low-sensitivity organizational metadata, unlike listMonitoringFolders
// (Admin-only), so a Member landing on a folder's page can render its
// breadcrumb without needing an admin-only call.
export function getMonitoringFolder(id: string) {
  return apiFetch<MonitoringFolder>(`/api/monitoring-folders/${id}`);
}

export function renameMonitoringFolder(id: string, name: string) {
  return apiFetch<MonitoringFolder>(`/api/monitoring-folders/${id}`, { method: "PATCH", body: JSON.stringify({ name }) });
}

// Deleting a folder also deletes every Dashboard filed inside it (backend
// cascade) -- the caller should confirm this first when the folder isn't
// empty.
export function deleteMonitoringFolder(id: string) {
  return apiFetch<{ deleted: true }>(`/api/monitoring-folders/${id}`, { method: "DELETE" });
}

export function listMonitoringDashboards(
  feature: MonitoringFeature,
  params?: { workspace_id?: string; monitoring_folder_id?: string }
) {
  const q = new URLSearchParams({ feature });
  if (params?.workspace_id) q.set("workspace_id", params.workspace_id);
  if (params?.monitoring_folder_id) q.set("monitoring_folder_id", params.monitoring_folder_id);
  return apiFetch<{ dashboards: MonitoringDashboard[] }>(`/api/monitoring-dashboards?${q.toString()}`);
}

// The bound VM/cluster and feature are immutable after creation
// (rebinding is delete + recreate) -- see services/monitoring_dashboards.go's
// doc comment.
export function createMonitoringDashboard(input: {
  feature: MonitoringFeature;
  name: string;
  description?: string;
  monitoring_folder_id?: string;
  vm_resource_id?: string;
  k8s_cluster_resource_id?: string;
  refresh_interval_seconds?: number;
}) {
  return apiFetch<MonitoringDashboard>("/api/monitoring-dashboards", { method: "POST", body: JSON.stringify(input) });
}

export function getMonitoringDashboard(id: string) {
  return apiFetch<MonitoringDashboard>(`/api/monitoring-dashboards/${id}`);
}

export function updateMonitoringDashboard(id: string, patch: { name?: string; description?: string; refresh_interval_seconds?: number }) {
  return apiFetch<MonitoringDashboard>(`/api/monitoring-dashboards/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
}

// folderId undefined moves the Dashboard to standalone (no folder).
export function moveMonitoringDashboard(id: string, folderId: string | undefined) {
  return apiFetch<MonitoringDashboard>(`/api/monitoring-dashboards/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ move_folder: true, monitoring_folder_id: folderId ?? null }),
  });
}

export function deleteMonitoringDashboard(id: string) {
  return apiFetch<{ deleted: true }>(`/api/monitoring-dashboards/${id}`, { method: "DELETE" });
}

// The wizard's "Resources" step -- replaces the selection wholesale.
export function setMonitoringDashboardResourceSelection(id: string, filters: MonitoringDashboardFilter[]) {
  return apiFetch<MonitoringDashboard>(`/api/monitoring-dashboards/${id}/resource-selection`, {
    method: "PUT",
    body: JSON.stringify({ filters }),
  });
}

// The wizard's "Metrics" step -- replaces the widget picks wholesale, in
// order. Not applicable to a *_LOGS dashboard (rejected server-side).
export function setMonitoringDashboardWidgets(id: string, widgets: MonitoringWidgetType[]) {
  return apiFetch<MonitoringDashboard>(`/api/monitoring-dashboards/${id}/widgets`, {
    method: "PUT",
    body: JSON.stringify({ widgets }),
  });
}

// The Monitoring>Kubernetes Dashboard Overview's data source (stat-card
// resource counts + per-node CPU/Memory/Storage) -- unlike
// getK8sClusterResourceSummary/listK8sClusterNodes above (Admin-only by
// design), this is reachable by any authenticated role holding
// k8s.monitor on the cluster's Workspace.
export type K8sNamespaceItem = { name: string; status: string };
export type K8sWorkloadItem = { name: string; namespace: string; desired_replicas: number; ready_replicas: number };
export type K8sServiceItem = { name: string; namespace: string; type: string; cluster_ip?: string; ports?: string[] };
export type K8sPVCItem = { name: string; namespace: string; status: string; capacity_bytes?: number; storage_class?: string };

// The 12 kinds below are all backed by k8s_resources (see k8s_overview.go's
// addPersistedResourceKinds) rather than a live-only agent call -- every
// one carries last_discovered_at so the UI can show "last confirmed X
// ago" when the agent is offline, instead of implying the count is live
// (same reasoning as K8sOverviewPod.last_discovered_at).
export type K8sWorkloadResourceItem = K8sWorkloadItem & { last_discovered_at?: string };
export type K8sJobItem = {
  name: string; namespace: string; completions?: number; succeeded: number; failed: number; active: number; last_discovered_at?: string;
};
export type K8sCronJobItem = {
  name: string; namespace: string; schedule: string; suspended: boolean; active_jobs: number; last_schedule_time?: string; last_discovered_at?: string;
};
export type K8sPVItem = {
  name: string; status: string; capacity_bytes?: number; storage_class?: string; reclaim_policy?: string; last_discovered_at?: string;
};
export type K8sStorageClassItem = {
  name: string; provisioner: string; reclaim_policy?: string; is_default: boolean; last_discovered_at?: string;
};
export type K8sIngressItem = { name: string; namespace: string; class_name?: string; hosts?: string[]; last_discovered_at?: string };
export type K8sNetworkPolicyItem = { name: string; namespace: string; policy_types?: string[]; last_discovered_at?: string };
export type K8sEndpointSliceItem = {
  name: string; namespace: string; address_type: string; endpoint_count: number; last_discovered_at?: string;
};
export type K8sResourceQuotaItem = { name: string; namespace: string; hard?: Record<string, string>; last_discovered_at?: string };
export type K8sLimitRangeItem = { name: string; namespace: string; types?: string[]; last_discovered_at?: string };
export type K8sPDBItem = {
  name: string; namespace: string; min_available?: string; max_unavailable?: string;
  current_healthy: number; desired_healthy: number; expected_pods: number; last_discovered_at?: string;
};
export type K8sHPAItem = {
  name: string; namespace: string; min_replicas?: number; max_replicas: number; current_replicas: number;
  target_cpu_percent?: number; last_discovered_at?: string;
};

export type K8sClusterResourcesResult = {
  status: "ok" | "agent_offline" | "failed";
  message?: string;
  nodes: K8sNode[];
  namespaces?: number;
  node_count?: number;
  pods?: number;
  deployments?: number;
  stateful_sets?: number;
  daemon_sets?: number;
  services?: number;
  persistent_volume_claims?: number;
  replica_sets?: number;
  jobs?: number;
  cron_jobs?: number;
  persistent_volumes?: number;
  storage_classes?: number;
  ingresses?: number;
  network_policies?: number;
  endpoint_slices?: number;
  resource_quotas?: number;
  limit_ranges?: number;
  pod_disruption_budgets?: number;
  horizontal_pod_autoscalers?: number;
  // Item lists power click-through detail on each stat card above --
  // nodes/pods already have full detail (the `nodes` field here, and the
  // dashboard's own Pods tab), so they're not duplicated.
  namespace_items?: K8sNamespaceItem[];
  deployment_items?: K8sWorkloadItem[];
  stateful_set_items?: K8sWorkloadItem[];
  daemon_set_items?: K8sWorkloadItem[];
  service_items?: K8sServiceItem[];
  pvc_items?: K8sPVCItem[];
  replica_set_items?: K8sWorkloadResourceItem[];
  job_items?: K8sJobItem[];
  cron_job_items?: K8sCronJobItem[];
  pv_items?: K8sPVItem[];
  storage_class_items?: K8sStorageClassItem[];
  ingress_items?: K8sIngressItem[];
  network_policy_items?: K8sNetworkPolicyItem[];
  endpoint_slice_items?: K8sEndpointSliceItem[];
  resource_quota_items?: K8sResourceQuotaItem[];
  limit_range_items?: K8sLimitRangeItem[];
  pdb_items?: K8sPDBItem[];
  hpa_items?: K8sHPAItem[];
};

export function getK8sClusterResources(clusterResourceId: string) {
  return apiFetch<K8sClusterResourcesResult>(`/api/k8s/overview/clusters/${clusterResourceId}/resources`);
}

// --- Update Center (Step 9) ---
// OS/kernel/reboot detection is entirely backend-driven over SSH, exactly
// like Docker/package discovery; package-update data is never duplicated
// here -- it's the same Package type Step 7 already defined, reused as-is.
// Update planning never executes anything: it only ever produces a
// backend-generated command *preview*. See docs/update-center.md.

export type OSUpdateStatus = "UP_TO_DATE" | "UPDATE_AVAILABLE" | "UNKNOWN" | "BLOCKED";

export type OSUpdateInfo = {
  current?: string;
  available?: string;
  status: OSUpdateStatus;
  update_type?: "PATCH" | "MINOR" | "MAJOR" | "RELEASE";
  release_channel?: string;
  detected_at?: string;
};

export type RebootStatus = "NOT_REQUIRED" | "REQUIRED" | "UNKNOWN";

export type KernelInfo = {
  running?: string;
  available?: string;
  reboot_required: boolean;
  reboot_status: RebootStatus;
  reboot_reason?: string;
};

export function getVMUpdates(vmId: string) {
  return apiFetch<{ os: OSUpdateInfo; kernel: KernelInfo; packages: PackageUpdate[]; package_count: number }>(
    `/api/vms/${vmId}/updates`
  );
}

export type VMUpdatesSummary = {
  os: { current?: string; available?: string; status: OSUpdateStatus };
  packages: { total_updates: number; security_updates: number };
  kernel: { running?: string; available?: string; reboot_required: boolean };
};

export function getVMUpdatesSummary(vmId: string) {
  return apiFetch<VMUpdatesSummary>(`/api/vms/${vmId}/updates/summary`);
}

export function getVMUpdatesSecurity(vmId: string) {
  return apiFetch<{
    updates: PackageUpdate[];
    total: number;
    severity: { critical: number; high: number; medium: number; low: number; unknown: number };
  }>(`/api/vms/${vmId}/updates/security`);
}

export function getVMUpdatesKernel(vmId: string) {
  return apiFetch<KernelInfo>(`/api/vms/${vmId}/updates/kernel`);
}

// --- Cross-VM update summary ---

export type VMUpdateSummaryRow = {
  vm_id: string;
  vm_name: string;
  os_status: string;
  package_update_count: number;
  security_update_count: number;
  reboot_status: string;
};

export type GlobalUpdateTotals = {
  vms_with_updates: number;
  security_updates: number;
  package_updates: number;
  os_updates: number;
  reboots_required: number;
};

// ADMIN: every VM. MEMBER: only VMs they're authorized on -- totals are
// computed backend-side from that same restricted set, never a separate
// global count (never trust a client-side filter for this).
export function getUpdatesOverview() {
  return apiFetch<{ vms: VMUpdateSummaryRow[]; totals: GlobalUpdateTotals }>(`/api/updates`);
}

// --- Prechecks & refresh (admin-only) ---

export type PrecheckStatus = "PASS" | "FAIL" | "WARN" | "INFO" | "UNKNOWN";

export type PrecheckItem = { name: string; status: PrecheckStatus; message: string };

export type PrecheckReport = { items: PrecheckItem[]; all_passed: boolean };

export function runVMPrecheck(vmId: string) {
  return apiFetch<PrecheckReport>(`/api/vms/${vmId}/updates/precheck`, { method: "POST" });
}

export type UpdateRefreshResult = {
  status: string;
  package_count: number;
  update_count: number;
  os_status?: string;
  reboot_status?: string;
  error_summary?: string;
};

export function refreshVMUpdates(vmId: string) {
  return apiFetch<UpdateRefreshResult>(`/api/vms/${vmId}/updates/refresh`, { method: "POST" });
}

// --- Update plans (admin-only end to end) ---

export type UpdatePlanStatus = "DRAFT" | "READY" | "APPROVED" | "EXECUTING" | "COMPLETED" | "FAILED" | "PARTIAL" | "CANCELLED" | "STALE";

export type UpdatePlan = {
  id: string;
  vm_id?: string;
  vm_name?: string;
  created_by?: string;
  status: UpdatePlanStatus;
  created_at: string;
  updated_at: string;
};

export type UpdatePlanItem = {
  id: string;
  package_id: string;
  package_name: string;
  current_version: string;
  target_version: string;
  update_type: "PACKAGE" | "KERNEL";
  security_update: boolean;
  severity: string;
};

type PlanItemsSummary = {
  selected_count: number;
  security_update_count: number;
  kernel_update_count: number;
  reboot_required: boolean;
};

export type CreateUpdatePlanResult = { plan: UpdatePlan; items: UpdatePlanItem[] } & PlanItemsSummary;

// The backend always resolves target_version from its own database --
// whatever is sent here is only used to detect a stale client-side
// selection, never trusted or stored verbatim.
export function createUpdatePlan(vmId: string, items: { package_id: string; target_version?: string }[]) {
  return apiFetch<CreateUpdatePlanResult>(`/api/vms/${vmId}/update-plans`, {
    method: "POST",
    body: JSON.stringify({ items }),
  });
}

export function listUpdatePlansForVM(vmId: string) {
  return apiFetch<{ plans: UpdatePlan[] }>(`/api/vms/${vmId}/update-plans`);
}

export type UpdatePlanDetail = { plan: UpdatePlan; items: UpdatePlanItem[] } & PlanItemsSummary & {
    proposed_command?: string;
    kernel_command?: string;
    os_release_command?: { command: string; high_risk: boolean };
    executed: false;
  };

export function getUpdatePlan(planId: string) {
  return apiFetch<UpdatePlanDetail>(`/api/update-plans/${planId}`);
}

export type ValidatePlanResult = PrecheckReport & { stale: boolean; stale_items?: string[] };

// Read-only diagnostic -- never changes the plan's status.
export function validateUpdatePlan(planId: string) {
  return apiFetch<ValidatePlanResult>(`/api/update-plans/${planId}/validate`, { method: "POST" });
}

// "Approve" only moves DRAFT -> READY once every required precheck
// passes (spec: "It must NOT execute the command."). Throws ApiError on
// a failed precheck (409) -- call validateUpdatePlan first to show the
// admin why.
export function approveUpdatePlan(planId: string) {
  return apiFetch<{ plan: UpdatePlan; message: string }>(`/api/update-plans/${planId}/approve`, { method: "POST" });
}

export function cancelUpdatePlan(planId: string) {
  return apiFetch<UpdatePlan>(`/api/update-plans/${planId}/cancel`, { method: "POST" });
}

// --- Update execution engine (Step 10, admin-only end to end) ---
// This is the only part of the whole application that can cause a real
// change on a VM. Execute never accepts a raw command -- the backend
// always generates and hashes it -- and requires an explicit
// {"confirmation": true} body distinct from the plan's earlier Approve
// step. See docs/update-execution.md.

export type OperationStatus =
  | "PENDING"
  | "CONNECTING"
  | "RUNNING"
  | "VERIFYING"
  | "SUCCESS"
  | "FAILED"
  | "PARTIAL"
  | "CANCELLED"
  | "INTERRUPTED";

export type UpdateOperation = {
  id: string;
  vm_id?: string;
  vm_name?: string;
  update_plan_id?: string;
  status: OperationStatus;
  command_preview?: string;
  command_hash?: string;
  created_by?: string;
  started_at?: string;
  completed_at?: string;
  exit_code?: number;
  summary?: string;
  created_at: string;
};

// The Execute confirmation dialog is the one required, explicit second
// authorization distinct from Approve -- the UI must never enable this
// call until the admin has both reviewed the command and checked "I
// understand and want to execute this update."
export function executeUpdatePlan(planId: string) {
  return apiFetch<{ operation_id: string; status: OperationStatus; vm_id: string }>(
    `/api/update-plans/${planId}/execute`,
    { method: "POST", body: JSON.stringify({ confirmation: true }) }
  );
}

export function listUpdateOperations() {
  return apiFetch<{ operations: UpdateOperation[] }>(`/api/update-operations`);
}

export function listUpdateOperationsForVM(vmId: string) {
  return apiFetch<{ operations: UpdateOperation[] }>(`/api/vms/${vmId}/update-operations`);
}

export function getUpdateOperation(operationId: string) {
  return apiFetch<UpdateOperation>(`/api/update-operations/${operationId}`);
}

export type OperationLogLine = { sequence: number; stream: "STDOUT" | "STDERR" | "SYSTEM"; message: string; created_at: string };

export function getUpdateOperationLogs(operationId: string) {
  return apiFetch<{ logs: OperationLogLine[] }>(`/api/update-operations/${operationId}/logs`);
}

// The browser connects to this directly (same-site session cookie sent
// automatically on the upgrade request), never routed through apiFetch --
// mirrors dockerContainerStatsStreamUrl exactly. Frames are either
// {type:"log", stream, message, sequence} or {type:"done", status}, the
// latter meaning the operation reached a terminal status and the server
// will close the connection.
export function updateOperationLogsStreamUrl(operationId: string): string {
  const wsBase = API_BASE.replace(/^http/, "ws");
  return `${wsBase}/api/update-operations/${operationId}/logs/stream`;
}

export type OperationStep = {
  step_number: number;
  step_type: "PRECHECK" | "CONNECT" | "REFRESH_METADATA" | "UPDATE" | "VERIFY" | "DISCOVERY";
  status: "PENDING" | "RUNNING" | "SUCCESS" | "FAILED" | "SKIPPED";
  started_at?: string;
  completed_at?: string;
  output_summary?: string;
  error_summary?: string;
};

// Only ever reflects steps the backend has actually recorded -- render
// this list as-is, never infer or fabricate a step's progress.
export function getUpdateOperationSteps(operationId: string) {
  return apiFetch<{ steps: OperationStep[] }>(`/api/update-operations/${operationId}/steps`);
}

export type OperationResult = {
  package_name: string;
  before_version: string;
  target_version: string;
  after_version?: string;
  status: "VERIFIED" | "FAILED" | "UNKNOWN" | "NOT_APPLICABLE";
};

export function getUpdateOperationResults(operationId: string) {
  return apiFetch<{ results: OperationResult[] }>(`/api/update-operations/${operationId}/results`);
}

// Only valid while PENDING/CONNECTING -- once package changes have begun,
// the backend refuses (409) rather than attempt any unsafe process kill.
export function cancelUpdateOperation(operationId: string) {
  return apiFetch<{ id: string; status: OperationStatus }>(`/api/update-operations/${operationId}/cancel`, { method: "POST" });
}

// Read-only re-check of actual installed package versions. Never
// re-executes the update and never changes the operation's status.
export function verifyUpdateOperation(operationId: string) {
  return apiFetch<{ results: OperationResult[] }>(`/api/update-operations/${operationId}/verify`, { method: "POST" });
}

// --- Controlled VM reboot (Step 11, admin-only end to end) ---
// This is the only other part of the application that can cause a real
// change on a VM. Reboot never accepts a raw command -- the backend
// always chooses `systemctl reboot` or `reboot`, with a privilege prefix
// resolved server-side -- and requires an explicit {"confirmation": true}
// body, distinct from anything shown by the Update Center. See
// docs/vm-reboot.md.

export type RebootOperationStatus =
  | "PENDING"
  | "PRECHECK"
  | "REBOOTING"
  | "WAITING_FOR_VM"
  | "RECONNECTING"
  | "VERIFYING"
  | "SUCCESS"
  | "PARTIAL"
  | "FAILED"
  | "TIMEOUT"
  | "UNKNOWN"
  | "CANCELLED"
  | "INTERRUPTED";

export type RebootReason = "KERNEL_UPDATE" | "PACKAGE_UPDATE" | "ADMIN_REQUEST" | "OS_UPDATE" | "OTHER";

export type RebootOperation = {
  id: string;
  vm_id?: string;
  vm_name?: string;
  reason: RebootReason;
  status: RebootOperationStatus;
  created_by?: string;
  started_at?: string;
  reboot_sent_at?: string;
  disconnected_at?: string;
  reconnected_at?: string;
  completed_at?: string;
  timeout_at?: string;
  error_summary?: string;
  created_at: string;
};

// Read-only; never sends a reboot command.
export function rebootPrecheck(vmId: string) {
  return apiFetch<PrecheckReport & { ready: boolean }>(`/api/vms/${vmId}/reboot/precheck`, { method: "POST" });
}

// The Reboot confirmation dialog is the one required, explicit
// authorization for this call -- the UI must never enable it until the
// admin has checked "I understand the VM will temporarily become
// unavailable." reason defaults to ADMIN_REQUEST server-side if omitted.
export function requestReboot(vmId: string, reason?: RebootReason) {
  return apiFetch<{ operation_id: string; status: RebootOperationStatus; vm_id: string }>(`/api/vms/${vmId}/reboot`, {
    method: "POST",
    body: JSON.stringify({ confirmation: true, reason }),
  });
}

export function listRebootOperations() {
  return apiFetch<{ reboot_operations: RebootOperation[] }>(`/api/reboot-operations`);
}

export function listRebootOperationsForVM(vmId: string) {
  return apiFetch<{ reboot_operations: RebootOperation[] }>(`/api/vms/${vmId}/reboot-operations`);
}

export function getRebootOperation(operationId: string) {
  return apiFetch<RebootOperation>(`/api/reboot-operations/${operationId}`);
}

export function getRebootOperationLogs(operationId: string) {
  return apiFetch<{ logs: OperationLogLine[] }>(`/api/reboot-operations/${operationId}/logs`);
}

// Mirrors updateOperationLogsStreamUrl exactly -- same frame shape
// ({type:"log",...} / {type:"done",...}), same same-site-cookie handshake.
export function rebootOperationLogsStreamUrl(operationId: string): string {
  const wsBase = API_BASE.replace(/^http/, "ws");
  return `${wsBase}/api/reboot-operations/${operationId}/logs/stream`;
}

export type RebootVerificationCheckType =
  | "SSH"
  | "BOOT_ID"
  | "UPTIME"
  | "OS"
  | "KERNEL"
  | "STORAGE"
  | "DOCKER"
  | "CONTAINERS"
  | "PACKAGES"
  | "REBOOT_REQUIRED";

export type RebootVerificationResult = {
  check_type: RebootVerificationCheckType;
  expected_value?: string;
  actual_value?: string;
  status: "VERIFIED" | "FAILED" | "UNKNOWN" | "WARNING" | "NOT_APPLICABLE";
  error_summary?: string;
  checked_at?: string;
};

export function getRebootOperationResults(operationId: string) {
  return apiFetch<{ results: RebootVerificationResult[] }>(`/api/reboot-operations/${operationId}/results`);
}

// Only valid while PENDING/PRECHECK -- once the reboot command has been
// sent, the backend refuses (409) since the VM is already rebooting.
export function cancelRebootOperation(operationId: string) {
  return apiFetch<{ id: string; status: RebootOperationStatus }>(`/api/reboot-operations/${operationId}/cancel`, { method: "POST" });
}

// Read-only re-check (SSH/boot ID/uptime/kernel/OS/Docker/monitoring).
// Never sends another reboot command.
export function verifyRebootOperation(operationId: string) {
  return apiFetch<{ results: RebootVerificationResult[] }>(`/api/reboot-operations/${operationId}/verify`, { method: "POST" });
}

// --- Databases (standalone) ---
// A database is a first-class resource under a Project (optionally a
// Group) -- never a VM child -- reached directly over TCP/TLS
// (Postgres/MySQL/MariaDB/MongoDB/Redis/Valkey), never through SSH.
// Strictly read-only: no endpoint here can create/alter/drop a database,
// user, or table, and /test runs exactly one backend-defined read-only
// probe (PING/SELECT 1) -- there is no query field anywhere in this
// section.

export type DatabaseEngineType = "POSTGRESQL" | "MYSQL" | "MARIADB" | "MONGODB" | "REDIS" | "VALKEY";

export type DatabaseConnectionStatus =
  | "CONNECTED"
  | "AUTH_FAILED"
  | "TIMEOUT"
  | "REFUSED"
  | "TLS_ERROR"
  | "UNAVAILABLE"
  | "UNKNOWN";

export type DatabaseListItem = {
  id: string;
  resource_id: string;
  name?: string;
  workspace_id?: string;
  workspace_name?: string;
  type: DatabaseEngineType;
  provider?: string;
  host: string;
  port: number;
  database_name?: string;
  monitoring_enabled: boolean;
  connection_status: DatabaseConnectionStatus;
  health?: HealthStatus;
  last_metric_at?: string;
};

// Scoped server-side to the caller's authorized databases already -- no
// client-side filtering needed (mirrors listVMs' scoping).
export function listDatabases() {
  return apiFetch<{ databases: DatabaseListItem[]; total: number }>("/api/databases");
}

export type DatabaseDetail = {
  id: string;
  resource_id: string;
  name?: string;
  workspace_name?: string;
  type: DatabaseEngineType;
  provider?: string;
  host: string;
  port: number;
  database_name?: string;
  region?: string;
  cluster_identifier?: string;
  endpoint?: string;
  monitoring_enabled: boolean;
  connection_status: DatabaseConnectionStatus;
  tls_enabled: boolean;
  tls_skip_verify: boolean;
  last_metrics_at?: string;
  credential_username?: string;
  credential_configured: boolean;
};

export function getDatabase(id: string) {
  return apiFetch<DatabaseDetail>(`/api/databases/${id}`);
}

// Admin-only. No vm_id anywhere in the payload -- a database is never a
// VM child. The backend never returns the password back, only
// credential_username/credential_configured.
export function createDatabase(payload: {
  workspace_id: string;
  name: string;
  type: DatabaseEngineType;
  provider?: string;
  host: string;
  port: number;
  database_name?: string;
  region?: string;
  cluster_identifier?: string;
  endpoint?: string;
  tls_enabled: boolean;
  tls_skip_verify: boolean;
  username?: string;
  password?: string;
}) {
  return apiFetch<DatabaseDetail>("/api/databases", { method: "POST", body: JSON.stringify(payload) });
}

// Admin-only. A real partial update -- only supplied fields change.
export function updateDatabase(
  id: string,
  payload: Partial<{
    type: DatabaseEngineType;
    host: string;
    port: number;
    database_name: string;
    provider: string;
    region: string;
    cluster_identifier: string;
    endpoint: string;
    tls_enabled: boolean;
    tls_skip_verify: boolean;
    username: string;
    password: string;
    monitoring_enabled: boolean;
  }>
) {
  return apiFetch<DatabaseDetail>(`/api/databases/${id}`, { method: "PATCH", body: JSON.stringify(payload) });
}

// Admin-only. Soft-delete only -- the real external database is never
// touched, never DROPped; GET /api/databases/{id} returns 404 afterward.
// The backend independently re-checks confirmationName against the
// database's current name (case-sensitive, exact match) before deleting.
export function deleteDatabase(id: string, confirmationName: string) {
  return apiFetch<{ deleted: boolean }>(`/api/databases/${id}`, {
    method: "DELETE",
    body: JSON.stringify({ confirmation_name: confirmationName }),
  });
}

// Admin-only. Runs exactly one backend-defined read-only probe
// (PING/SELECT 1) -- there is no query field in the request, and never
// should be.
export function testDatabaseConnection(id: string) {
  return apiFetch<{ connection_status: DatabaseConnectionStatus }>(`/api/databases/${id}/test`, { method: "POST" });
}

// --- Database access grants (Admin only) ---

export type DatabasePermission = "database.view" | "database.performance" | "database.browser" | "database.logs" | "database.query_details";

export function grantDatabaseAccess(databaseId: string, userId: string, permissions: string[]) {
  return apiFetch<{ granted: boolean }>(`/api/databases/${databaseId}/access`, {
    method: "POST",
    body: JSON.stringify({ user_id: userId, permissions }),
  });
}

export function revokeDatabaseAccess(databaseId: string, userId: string) {
  return apiFetch<{ revoked: boolean }>(`/api/databases/${databaseId}/access/${userId}`, { method: "DELETE" });
}

// --- Database access listing (Admin only, Step 18 Phase 2) ---
// Resource-scoped: "who has access to this database" -- mirrors
// listVMAccess exactly (boolean-per-permission shape, distinct from the
// `permissions: string[]` shape UserDetail.database_access uses above for
// the same reason VMAccessMember and VM.permissions differ).
export type DatabaseAccessMember = {
  id: string;
  name: string;
  email: string;
  view: boolean;
  performance: boolean;
  browser: boolean;
  logs: boolean;
  query_details: boolean;
  access_source: "DIRECT" | "WORKSPACE" | "ADMIN";
};

export function listDatabaseAccess(databaseId: string) {
  return apiFetch<{ members: DatabaseAccessMember[] }>(`/api/databases/${databaseId}/access`);
}

// --- Fast metrics ---

export type DatabaseCommonMetrics = {
  connections?: number;
  active_connections?: number;
  max_connections?: number;
  memory_usage_bytes?: number;
  database_size_bytes?: number;
  operations_per_second?: number;
  transactions_per_second?: number;
  errors?: number;
  uptime_seconds?: number;
};

export type DatabaseMetricsCurrent = {
  // "NO_DATA" when nothing has ever been collected -- render that as "no
  // data yet", never fabricate zeros.
  status: string;
  captured_at?: string;
  stale_after_seconds: number;
  monitoring_enabled: boolean;
  connection_status: DatabaseConnectionStatus;
  health?: HealthStatus;
  metrics_status?: string;
  common?: DatabaseCommonMetrics;
  details?: Record<string, unknown>;
};

export function getDatabaseMetricsCurrent(databaseId: string) {
  return apiFetch<DatabaseMetricsCurrent>(`/api/databases/${databaseId}/metrics/current`);
}

export type DatabaseMetricPoint = {
  captured_at: string;
  health_status?: HealthStatus;
  metrics_status?: string;
  connections?: number;
  active_connections?: number;
  max_connections?: number;
  memory_usage_bytes?: number;
  database_size_bytes?: number;
  operations_per_second?: number;
  transactions_per_second?: number;
};

// Same from/to RFC3339 convention as getMonitoringHistory /
// getDockerContainerMetricsHistory; both optional, default last 24h.
export function getDatabaseMetricsHistory(databaseId: string, params?: { from?: string; to?: string }) {
  const q = new URLSearchParams();
  if (params?.from) q.set("from", params.from);
  if (params?.to) q.set("to", params.to);
  const qs = q.toString();
  return apiFetch<{ from: string; to: string; points: DatabaseMetricPoint[] }>(
    `/api/databases/${databaseId}/metrics/history${qs ? `?${qs}` : ""}`
  );
}

// Mirrors dockerContainerStatsStreamUrl exactly -- one shared backend
// collector/cache, N viewers, never a new connection per viewer/tick.
export function databaseMetricsStreamUrl(databaseId: string): string {
  const wsBase = API_BASE.replace(/^http/, "ws");
  return `${wsBase}/api/databases/${databaseId}/metrics/stream`;
}

// --- Deep / performance metrics ---
// Still strictly read-only: no query/session/lock termination, no config
// changes. Query text (normalized_text) is present only when the caller
// has the database.query_details permission -- absent, never null/empty,
// otherwise.

export type DatabaseSession = {
  pid: number;
  database?: string;
  user?: string;
  duration_seconds: number;
  state?: string;
  wait_event_type?: string;
  wait_event?: string;
  application_name?: string;
  blocking_pids?: string[];
};

export type DatabaseQuery = {
  fingerprint: string;
  calls?: number;
  total_time_ms?: number;
  avg_time_ms?: number;
  rows?: number;
  blocks_read?: number;
  blocks_hit?: number;
  database_name?: string;
  database_user?: string;
  // Only present when the caller has database.query_details (Admin, or
  // explicitly granted) -- render "Query text not available" when absent.
  normalized_text?: string;
  captured_at?: string;
};

export type DatabasePerformance = {
  status?: "NO_DATA";
  captured_at?: string;
  metrics_status?: string;
  cache_hit_ratio?: number;
  locks?: { waiting?: number; blocked?: number };
  replication?: { status: string; lag_seconds?: number; replica_count?: number };
  latency_p50_ms?: number;
  latency_p95_ms?: number;
  latency_p99_ms?: number;
  growth_bytes_per_day?: number;
  sessions?: DatabaseSession[];
  top_queries?: DatabaseQuery[];
};

export function getDatabasePerformance(databaseId: string) {
  return apiFetch<DatabasePerformance>(`/api/databases/${databaseId}/performance`);
}

export type DatabasePerformancePoint = {
  captured_at: string;
  metrics_status?: string;
  cache_hit_ratio?: number;
  locks_waiting?: number;
  locks_blocked?: number;
  replication_lag_seconds?: number;
  latency_p95_ms?: number;
  growth_bytes_per_day?: number;
};

export function getDatabasePerformanceHistory(databaseId: string, params?: { from?: string; to?: string }) {
  const q = new URLSearchParams();
  if (params?.from) q.set("from", params.from);
  if (params?.to) q.set("to", params.to);
  const qs = q.toString();
  return apiFetch<{ from: string; to: string; points: DatabasePerformancePoint[] }>(
    `/api/databases/${databaseId}/performance/history${qs ? `?${qs}` : ""}`
  );
}

// Mirrors databaseMetricsStreamUrl exactly -- same shape as
// getDatabasePerformance per frame, or { type: "waiting", reason } before
// the first deep collection cycle.
export function databasePerformanceStreamUrl(databaseId: string): string {
  const wsBase = API_BASE.replace(/^http/, "ws");
  return `${wsBase}/api/databases/${databaseId}/performance/stream`;
}

export function listDatabaseQueries(databaseId: string) {
  return apiFetch<{ queries: DatabaseQuery[] }>(`/api/databases/${databaseId}/queries`);
}

export type DatabaseQueryHistoryPoint = { captured_at: string; calls?: number; total_time_ms?: number; avg_time_ms?: number };

export function getDatabaseQueryDetail(databaseId: string, fingerprint: string) {
  return apiFetch<{ query: DatabaseQuery; first_seen_at?: string; history: DatabaseQueryHistoryPoint[] }>(
    `/api/databases/${databaseId}/queries/${encodeURIComponent(fingerprint)}`
  );
}

export function getDatabaseConnections(databaseId: string) {
  return apiFetch<{ captured_at?: string; sessions?: DatabaseSession[] }>(`/api/databases/${databaseId}/connections`);
}

export function getDatabaseLocks(databaseId: string) {
  return apiFetch<{ captured_at?: string; locks?: { waiting?: number; blocked?: number }; sessions?: DatabaseSession[] }>(
    `/api/databases/${databaseId}/locks`
  );
}

export function getDatabaseReplication(databaseId: string) {
  return apiFetch<{ captured_at?: string; replication?: { status: string; lag_seconds?: number; replica_count?: number } }>(
    `/api/databases/${databaseId}/replication`
  );
}

export type DatabaseMonitoringHealthTier = {
  tier: string;
  last_success_at?: string;
  last_failure_at?: string;
  last_error?: string;
  metrics_collected: number;
};

// Surfaces *why* Performance/Metrics might be empty even with monitoring
// enabled (bad credential, connection refused, insufficient privileges)
// -- see internal/handlers/databases.go's MonitoringHealth.
export function getDatabaseMonitoringHealth(databaseId: string) {
  return apiFetch<{ tiers: DatabaseMonitoringHealthTier[] }>(`/api/databases/${databaseId}/monitoring-health`);
}

export function getDatabaseStorage(databaseId: string) {
  return apiFetch<{ captured_at?: string; database_size_bytes?: number; growth_bytes_per_day?: number }>(
    `/api/databases/${databaseId}/storage`
  );
}

export function getDatabaseStorageHistory(databaseId: string, params?: { from?: string; to?: string }) {
  const q = new URLSearchParams();
  if (params?.from) q.set("from", params.from);
  if (params?.to) q.set("to", params.to);
  const qs = q.toString();
  return apiFetch<{ from: string; to: string; points: { captured_at: string; database_size_bytes?: number }[] }>(
    `/api/databases/${databaseId}/storage/history${qs ? `?${qs}` : ""}`
  );
}

export type DatabasePerformanceOverviewItem = {
  id: string;
  name?: string;
  workspace_name?: string;
  type: DatabaseEngineType;
  health?: HealthStatus;
  last_metric_at?: string;
  cache_hit_ratio?: number;
  locks_blocked?: number;
  replication_status?: string;
  latency_p95_ms?: number;
};

// Global overview, scoped server-side to the caller's authorized
// databases with database.performance -- mirrors listDatabases' scoping.
// Named distinctly from the deleted per-VM-era getDatabasePerformanceOverview
// (which returned aggregate counts, not a per-database list).
export function getDatabasesPerformanceOverview() {
  return apiFetch<{ databases: DatabasePerformanceOverviewItem[] }>("/api/databases/performance");
}

// --- Database Browser (Step 13, spec #17-107) ---
// Read-only, safe, paginated access to database structure and data.
// Admin-only. Member support can be added with database.browser permission.
// See docs/database-browser.md.

// One database/schema visible in the cluster this connection reaches,
// alongside how many live backend connections currently target it --
// since a "database" resource here is really one set of credentials
// against a whole cluster/server, which may host several logical databases.
export type DatabaseCatalogEntry = {
  name: string;
  connection_count: number;
};

export type CatalogData = {
  databases: DatabaseCatalogEntry[];
};

export type SchemasData = {
  schemas: string[];
};

export type TableListItem = {
  name: string;
  row_count?: number;
  size_bytes?: number;
};

export type TablesData = {
  tables: TableListItem[];
};

export type ColumnItem = {
  name: string;
  type: string;
  nullable: boolean;
  default?: string;
  comment?: string;
};

export type ColumnsData = {
  columns: ColumnItem[];
};

export type RowsData = {
  rows: Record<string, unknown>[];
  total?: number;
  page_size: number;
  offset: number;
  has_more: boolean;
};

export type IndexItem = {
  name: string;
  columns: string[];
  is_unique: boolean;
  is_primary: boolean;
};

export type IndexesData = {
  indexes: IndexItem[];
};

// Database catalog - list accessible databases (spec #15)
export function getDatabaseCatalog(databaseId: string) {
  return apiFetch<CatalogData>(`/api/databases/${databaseId}/catalog`);
}

// Schemas - PostgreSQL only (spec #19). `database`, when given, browses a
// sibling database in the same cluster instead of this resource's own
// configured one -- one of the names getDatabaseCatalog returned.
export function getDatabaseSchemas(databaseId: string, database?: string) {
  const params = new URLSearchParams();
  if (database) params.set("database", database);
  const qs = params.toString();
  return apiFetch<SchemasData>(`/api/databases/${databaseId}/schemas${qs ? `?${qs}` : ""}`);
}

// Tables in database/schema (spec #19-20). See getDatabaseSchemas' note on
// `database`.
export function getDatabaseTables(databaseId: string, schema?: string, database?: string) {
  const params = new URLSearchParams();
  if (schema) params.set("schema", schema);
  if (database) params.set("database", database);
  const qs = params.toString();
  return apiFetch<TablesData>(
    `/api/databases/${databaseId}/tables${qs ? `?${qs}` : ""}`
  );
}

// Columns in a table (spec #20). See getDatabaseSchemas' note on `database`.
export function getTableColumns(databaseId: string, tableId: string, schema?: string, database?: string) {
  const params = new URLSearchParams();
  if (schema) params.set("schema", schema);
  if (database) params.set("database", database);
  const qs = params.toString();
  return apiFetch<ColumnsData>(
    `/api/databases/${databaseId}/tables/${encodeURIComponent(tableId)}/columns${
      qs ? `?${qs}` : ""
    }`
  );
}

// Table rows with pagination (spec #20-22: default 50, max 200). See
// getDatabaseSchemas' note on `database`.
export function getTableRows(
  databaseId: string,
  tableId: string,
  limit?: number,
  offset?: number,
  schema?: string,
  database?: string
) {
  const params = new URLSearchParams();
  if (limit) params.set("limit", String(limit));
  if (offset) params.set("offset", String(offset));
  if (schema) params.set("schema", schema);
  if (database) params.set("database", database);
  const qs = params.toString();
  return apiFetch<RowsData>(
    `/api/databases/${databaseId}/tables/${encodeURIComponent(tableId)}/rows${
      qs ? `?${qs}` : ""
    }`
  );
}

// Search table data (spec #106). See getDatabaseSchemas' note on `database`.
export function searchTableData(
  databaseId: string,
  tableId: string,
  column: string,
  query: string,
  limit?: number,
  offset?: number,
  schema?: string,
  database?: string
) {
  const params = new URLSearchParams();
  params.set("column", column);
  params.set("q", query);
  if (limit) params.set("limit", String(limit));
  if (offset) params.set("offset", String(offset));
  if (schema) params.set("schema", schema);
  if (database) params.set("database", database);
  return apiFetch<RowsData>(
    `/api/databases/${databaseId}/tables/${encodeURIComponent(tableId)}/search?${params.toString()}`
  );
}

// Table indexes (spec #19: PostgreSQL). See getDatabaseSchemas' note on
// `database`.
export function getTableIndexes(databaseId: string, tableId: string, schema?: string, database?: string) {
  const params = new URLSearchParams();
  if (schema) params.set("schema", schema);
  if (database) params.set("database", database);
  const qs = params.toString();
  return apiFetch<IndexesData>(
    `/api/databases/${databaseId}/tables/${encodeURIComponent(tableId)}/indexes${
      qs ? `?${qs}` : ""
    }`
  );
}

// --- Database Logs (Step 13, spec #33-36, #72) ---

export type LogEntry = {
  timestamp: string;
  severity: string;
  source: string;
  message: string;
};

export type LogsData = {
  logs: LogEntry[];
  has_more: boolean;
};

// Get database logs (Admin only; spec #33-36)
export function getDatabaseLogs(
  databaseId: string,
  logType?: string,
  fromTime?: string,
  toTime?: string,
  limit?: number
) {
  const params = new URLSearchParams();
  if (logType) params.set("type", logType);
  if (fromTime) params.set("from", fromTime);
  if (toTime) params.set("to", toTime);
  if (limit) params.set("limit", String(limit));
  const qs = params.toString();
  return apiFetch<LogsData>(`/api/databases/${databaseId}/logs${qs ? `?${qs}` : ""}`);
}

// --- Database Operations (Step 14, Controlled Database Operations & Admin
// Remediation) ---
// Admin-only, full stop -- unlike the rest of the database API there is no
// permission grant that gives a Member any access here. Every operation is
// backend-generated and reviewed via preview before it can run; there is
// no raw/ad-hoc command input anywhere in this feature, by design.
// command_preview/result_summary/etc. are always display-only.

// The backend currently only ever returns the first five as capabilities;
// the rest are documented possible future values. `(string & {})` keeps
// autocomplete for the known values without assuming the list is closed.
export type DatabaseOperationType =
  | "CANCEL_QUERY"
  | "TERMINATE_SESSION"
  | "VACUUM"
  | "ANALYZE"
  | "REDIS_MAINTENANCE"
  | "RESTART"
  | "REPLICATION_ACTION"
  | "CONFIG_CHANGE"
  | "UPGRADE"
  | (string & {});

export type DatabaseOperationStatus =
  | "WAITING_CONFIRMATION"
  | "PENDING"
  | "RUNNING"
  | "SUCCESS"
  | "FAILED"
  | "CANCELLED"
  | "TIMEOUT";

export type DatabaseOperationCapability = {
  type: DatabaseOperationType;
  label: string;
  destructive: boolean;
  // Display string, verbatim from the backend -- never infer a stronger
  // or weaker claim than what it says.
  reversible: "N/A" | "Available" | "Not Available";
  requires_target_id: boolean;
  impact_description: string;
};

// Same shape everywhere: create response, get, and list items. Only the
// global cross-database list (listDatabaseOperationsGlobal) additionally
// carries database_type/database_name/database_resource_id.
export type DatabaseOperation = {
  id: string;
  database_id: string;
  database_type?: string;
  database_name?: string;
  database_resource_id?: string;
  operation_type: DatabaseOperationType;
  status: DatabaseOperationStatus;
  requested_by?: string;
  reason?: string;
  // Raw JSON passthrough (e.g. {"target_id":"12345"}) -- opaque/display-only.
  parameters?: Record<string, unknown>;
  command_preview: string;
  recommendation_id?: string;
  confirmed_at?: string;
  started_at?: string;
  completed_at?: string;
  timeout_at?: string;
  result_summary?: string;
  result_detail?: Record<string, unknown>;
  error_summary?: string;
  health_before?: HealthStatus;
  health_after?: HealthStatus;
  created_at: string;
};

export function getDatabaseOperationCapabilities(databaseId: string) {
  return apiFetch<{ capabilities: DatabaseOperationCapability[] }>(
    `/api/databases/${databaseId}/operations/capabilities`
  );
}

// Pure dry run, no side effects -- safe to call as soon as an operation
// type (and, if required, a target_id) is chosen.
export function previewDatabaseOperation(
  databaseId: string,
  payload: { operation_type: DatabaseOperationType; parameters?: { target_id?: string }; reason?: string }
) {
  return apiFetch<{
    database_id: string;
    operation_type: DatabaseOperationType;
    command_preview: string;
    expected_impact: string;
  }>(`/api/databases/${databaseId}/operations/preview`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

// Creates the operation plan in WAITING_CONFIRMATION -- still hasn't
// executed anything. confirmDatabaseOperation is the only call that can
// actually change the database.
export function createDatabaseOperation(
  databaseId: string,
  payload: {
    operation_type: DatabaseOperationType;
    parameters?: { target_id?: string };
    reason?: string;
    recommendation_id?: string;
  }
) {
  return apiFetch<DatabaseOperation>(`/api/databases/${databaseId}/operations`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function listDatabaseOperations(databaseId: string, params?: { limit?: number; offset?: number }) {
  const q = new URLSearchParams();
  if (params?.limit) q.set("limit", String(params.limit));
  if (params?.offset !== undefined) q.set("offset", String(params.offset));
  const qs = q.toString();
  return apiFetch<{ operations: DatabaseOperation[]; total: number }>(
    `/api/databases/${databaseId}/operations${qs ? `?${qs}` : ""}`
  );
}

export function getDatabaseOperation(databaseId: string, operationId: string) {
  return apiFetch<DatabaseOperation>(`/api/databases/${databaseId}/operations/${operationId}`);
}

// 202; status becomes PENDING, then RUNNING shortly after via the
// backend's own worker. Can 409 if another operation is already active for
// this database (operation-queue exclusivity) -- surface that message
// plainly rather than treating it as a crash.
export function confirmDatabaseOperation(databaseId: string, operationId: string) {
  return apiFetch<{ id: string; status: DatabaseOperationStatus }>(
    `/api/databases/${databaseId}/operations/${operationId}/confirm`,
    { method: "POST" }
  );
}

// Only valid while WAITING_CONFIRMATION or PENDING -- a 409 means it's too
// late (already RUNNING or terminal).
export function cancelDatabaseOperation(databaseId: string, operationId: string) {
  return apiFetch<{ id: string; status: DatabaseOperationStatus }>(
    `/api/databases/${databaseId}/operations/${operationId}/cancel`,
    { method: "POST" }
  );
}

// Creates a brand-new operation (new id) in WAITING_CONFIRMATION,
// referencing the same type/params -- only valid when the original is
// FAILED (409 otherwise). Callers should navigate to the new id, never
// reuse the old operation's state.
export function retryDatabaseOperation(databaseId: string, operationId: string) {
  return apiFetch<DatabaseOperation>(`/api/databases/${databaseId}/operations/${operationId}/retry`, {
    method: "POST",
  });
}

// Only permitted once the operation has reached a terminal status
// (SUCCESS/FAILED/CANCELLED/TIMEOUT) -- a 409 means it's still in flight
// and can't be deleted yet. Permanently removes the history row.
export function deleteDatabaseOperation(databaseId: string, operationId: string) {
  return apiFetch<{ deleted: boolean }>(`/api/databases/${databaseId}/operations/${operationId}`, {
    method: "DELETE",
  });
}

export function getDatabaseOperationLogs(databaseId: string, operationId: string) {
  return apiFetch<{ logs: OperationLogLine[] }>(`/api/databases/${databaseId}/operations/${operationId}/logs`);
}

// Mirrors rebootOperationLogsStreamUrl exactly -- same frame shape
// ({type:"log",...} / {type:"done",...}), same same-site-cookie handshake.
export function databaseOperationLogsStreamUrl(databaseId: string, operationId: string): string {
  const wsBase = API_BASE.replace(/^http/, "ws");
  return `${wsBase}/api/databases/${databaseId}/operations/${operationId}/logs/stream`;
}

// Global cross-database operation history (Admin only) -- each item
// additionally carries database_type/database_name/database_resource_id
// since the caller doesn't already know which database it's looking at.
export function listDatabaseOperationsGlobal(params?: { limit?: number; offset?: number }) {
  const q = new URLSearchParams();
  if (params?.limit) q.set("limit", String(params.limit));
  if (params?.offset !== undefined) q.set("offset", String(params.offset));
  const qs = q.toString();
  return apiFetch<{ operations: DatabaseOperation[] }>(`/api/database-operations${qs ? `?${qs}` : ""}`);
}

// --- Object Storage (Step 17) ---
// An object storage bucket (AWS S3 / DigitalOcean Spaces / MinIO / generic
// S3-compatible) is a first-class resource under a Project (optionally a
// Group) -- same standalone-resource shape as Databases, never a VM child.
// Strictly read-only against the real bucket: no endpoint here can write,
// delete, or upload an object, and /test-connection runs exactly one
// backend-defined read-only probe (HeadBucket) -- there is no way to
// mutate bucket contents anywhere in this section. The secret key is
// write-only from the frontend's perspective: it's sent on create/update
// and never returned by any API response afterward.

export type ObjectStorageProvider = "AWS_S3" | "DIGITALOCEAN_SPACES" | "MINIO" | "S3_COMPATIBLE";

export type ObjectStorageConnectionStatus =
  | "CONNECTED"
  | "AUTH_FAILED"
  | "ACCESS_DENIED"
  | "NOT_FOUND"
  | "TIMEOUT"
  | "TLS_ERROR"
  | "UNAVAILABLE"
  | "UNKNOWN";

export type ObjectStoragePermission =
  | "object_storage.view"
  | "object_storage.monitor"
  | "object_storage.browser"
  | "object_storage.download";

// Every provider returns the same flat map today (metrics/browser/object_metadata/
// download/versioning/encryption true, logs false) -- treated as genuinely
// per-instance data since the backend computes it per-provider, not hardcoded here.
export type ObjectStorageCapabilities = {
  metrics: boolean;
  browser: boolean;
  object_metadata: boolean;
  download: boolean;
  logs: boolean;
  versioning: boolean;
  encryption: boolean;
};

export type ObjectStorageListItem = {
  id: string;
  resource_id: string;
  name: string;
  workspace_id?: string;
  workspace_name?: string;
  provider: ObjectStorageProvider;
  bucket: string;
  region?: string;
  endpoint?: string;
  monitoring_enabled: boolean;
  connection_status: ObjectStorageConnectionStatus;
  health_status?: HealthStatus;
  object_count?: number;
  total_size_bytes?: number;
  last_checked_at?: string;
  permissions: ObjectStoragePermission[];
};

// Scoped server-side to the caller's authorized storages already -- no
// client-side access filtering needed (mirrors listDatabases' scoping).
export function listObjectStorage() {
  return apiFetch<{ storages: ObjectStorageListItem[]; total: number }>("/api/object-storage");
}

export type ObjectStorageSummary = {
  total: number;
  healthy: number;
  warning: number;
  critical: number;
  unavailable: number;
};

// Scoped to the caller's authorized object storage exactly like
// listObjectStorage -- the dashboard widget and this list page's summary
// cards use this, never a client-side count over a possibly-filtered list
// (mirrors getAlertsSummary's contract).
export function getObjectStorageSummary() {
  return apiFetch<ObjectStorageSummary>("/api/object-storage/summary");
}

// security/health_reasons/growth_projection (Step 17 Phase 3): deep-metrics-derived
// facts, all optional/nullable -- never fabricate a value. `security` is undefined
// until the deep-metrics cycle has run at least once; each of its four fields is
// independently capable of "UNKNOWN" (never inferred). `growth_projection` is
// null/absent below the backend's history threshold (<7 days) -- must not render
// a fabricated 0/day figure in that case.
export type ObjectStorageDetail = ObjectStorageListItem & {
  base_path?: string;
  tls_enabled: boolean;
  tls_skip_verify: boolean;
  access_key_id?: string;
  credential_configured: boolean;
  capabilities: ObjectStorageCapabilities;
  security?: {
    versioning: "ENABLED" | "DISABLED" | "UNKNOWN";
    encryption: "ENABLED" | "DISABLED" | "UNKNOWN";
    object_lock: "ENABLED" | "DISABLED" | "UNKNOWN";
    public_access: "PUBLIC" | "PRIVATE" | "UNKNOWN";
  };
  health_reasons?: string[];
  growth_projection?: {
    current_bytes: number;
    growth_bytes_per_day: number;
    estimated_30d_growth_bytes: number;
  } | null;
};

export function getObjectStorage(id: string) {
  return apiFetch<ObjectStorageDetail>(`/api/object-storage/${id}`);
}

// Admin-only. The backend never returns the secret key back, only
// access_key_id/credential_configured.
export function createObjectStorage(payload: {
  workspace_id: string;
  name: string;
  provider: ObjectStorageProvider;
  endpoint?: string;
  region?: string;
  bucket: string;
  base_path?: string;
  tls_enabled: boolean;
  tls_skip_verify: boolean;
  access_key_id?: string;
  secret_access_key?: string;
}) {
  return apiFetch<ObjectStorageDetail>("/api/object-storage", { method: "POST", body: JSON.stringify(payload) });
}

// Admin-only. A real partial update -- only supplied fields change.
export function updateObjectStorage(
  id: string,
  payload: Partial<{
    name: string;
    provider: ObjectStorageProvider;
    endpoint: string;
    region: string;
    bucket: string;
    base_path: string;
    tls_enabled: boolean;
    tls_skip_verify: boolean;
    access_key_id: string;
    secret_access_key: string;
    monitoring_enabled: boolean;
  }>
) {
  return apiFetch<ObjectStorageDetail>(`/api/object-storage/${id}`, { method: "PATCH", body: JSON.stringify(payload) });
}

// Admin-only. Soft-delete of the monitoring registration only -- the real
// bucket/objects/prefixes/policies are never touched; GET
// /api/object-storage/{id} returns 404 afterward. The backend
// independently re-checks confirmationName against the resource's current
// name (case-sensitive, exact match) before deleting.
export function deleteObjectStorage(id: string, confirmationName: string) {
  return apiFetch<{ deleted: boolean }>(`/api/object-storage/${id}`, {
    method: "DELETE",
    body: JSON.stringify({ confirmation_name: confirmationName }),
  });
}

// Admin-only. Runs exactly one backend-defined read-only probe
// (HeadBucket) -- there is no way to pass arbitrary bucket operations here.
export function testObjectStorageConnection(id: string) {
  return apiFetch<{ connection_status: ObjectStorageConnectionStatus }>(`/api/object-storage/${id}/test-connection`, {
    method: "POST",
  });
}

// --- Object storage fast metrics (Step 17 Phase 2) ---
// Every field is omitted -- never 0/false -- when that metric hasn't been
// collected yet; absence means "not available," not a fake zero/negative
// reading. Mirrors the Database fast-metrics contract's optionality rule.
export type ObjectStorageMetrics = {
  object_count?: number;
  total_size_bytes?: number;
  requests_per_min?: number;
  error_count?: number;
  bucket_reachable?: boolean;
  request_latency_ms?: number;
  captured_at?: string;
};

export function getObjectStorageMetricsCurrent(id: string) {
  return apiFetch<ObjectStorageMetrics>(`/api/object-storage/${id}/metrics/current`);
}

// Same from/to RFC3339 convention as getDatabaseMetricsHistory /
// getMonitoringHistory; both optional, default range decided server-side.
export function getObjectStorageMetricsHistory(id: string, params?: { from?: string; to?: string }) {
  const q = new URLSearchParams();
  if (params?.from) q.set("from", params.from);
  if (params?.to) q.set("to", params.to);
  const qs = q.toString();
  return apiFetch<{ points: (ObjectStorageMetrics & { captured_at: string })[] }>(
    `/api/object-storage/${id}/metrics/history${qs ? `?${qs}` : ""}`
  );
}

// --- Object storage access grants (Admin only) ---

export function grantObjectStorageAccess(storageId: string, userId: string, permissions: string[]) {
  return apiFetch<{ granted: boolean }>(`/api/object-storage/${storageId}/access`, {
    method: "POST",
    body: JSON.stringify({ user_id: userId, permissions }),
  });
}

export function revokeObjectStorageAccess(storageId: string, userId: string) {
  return apiFetch<{ revoked: boolean }>(`/api/object-storage/${storageId}/access/${userId}`, { method: "DELETE" });
}

// --- Object storage access listing (Admin only, Step 18 Phase 2) ---
// Mirrors listDatabaseAccess/listVMAccess exactly.
export type ObjectStorageAccessMember = {
  id: string;
  name: string;
  email: string;
  view: boolean;
  monitor: boolean;
  browser: boolean;
  download: boolean;
  access_source: "DIRECT" | "WORKSPACE" | "ADMIN";
};

export function listObjectStorageAccess(storageId: string) {
  return apiFetch<{ members: ObjectStorageAccessMember[] }>(`/api/object-storage/${storageId}/access`);
}

// --- Object storage browser (Step 17 Phase 4) ---
// Read-only listing/metadata/preview/download of bucket contents -- no
// write/delete/upload/rename/copy endpoint exists anywhere in this section.
// Browser/metadata/preview require object_storage.browser; download
// requires object_storage.download (see ObjectStorageDetail.permissions).

export type ObjectStorageEntryType = "FOLDER" | "OBJECT";

export type ObjectStorageEntry = {
  type: ObjectStorageEntryType;
  name: string; // basename/last-segment only
  key: string; // full key/prefix -- pass this back for navigation/metadata/download calls
  size_bytes?: number; // undefined for FOLDER
  last_modified?: string;
  storage_class?: string;
};

export type ObjectStorageListEntriesResponse = {
  bucket: string;
  prefix: string;
  entries: ObjectStorageEntry[];
  next_continuation_token?: string; // absent => no more pages
};

// Default page size 50, server-clamped to a max of 200 -- never
// offset-based, continuation-token only (there is no bidirectional
// pagination API, so "Previous" is implemented client-side as a token
// stack -- see object-table.tsx).
export function listObjectStorageEntries(
  storageId: string,
  params: { prefix?: string; limit?: number; continuation_token?: string }
) {
  const q = new URLSearchParams();
  if (params.prefix !== undefined) q.set("prefix", params.prefix);
  if (params.limit) q.set("limit", String(params.limit));
  if (params.continuation_token) q.set("continuation_token", params.continuation_token);
  const qs = q.toString();
  return apiFetch<ObjectStorageListEntriesResponse>(`/api/object-storage/${storageId}/objects${qs ? `?${qs}` : ""}`);
}

// One bounded, recursive size aggregation for a single folder (S3 has no
// native "folder size" API) -- computed on demand per folder row, never
// eagerly for a whole listing. truncated:true means the backend hit its
// page cap before finishing; render that as "X+" (a real but incomplete
// sum), never as an exact total.
export type ObjectStoragePrefixSize = { object_count: number; total_size_bytes: number; truncated: boolean };

export function getObjectStoragePrefixSize(storageId: string, prefix: string) {
  const q = new URLSearchParams({ prefix });
  return apiFetch<ObjectStoragePrefixSize>(`/api/object-storage/${storageId}/objects/prefix-size?${q.toString()}`);
}

// Prefix-only match against `q` (no wildcards, no full-text/fuzzy search) --
// callers must label this clearly to set correct expectations.
export function searchObjectStorageEntries(
  storageId: string,
  params: { prefix?: string; query: string; limit?: number; continuation_token?: string }
) {
  const q = new URLSearchParams();
  if (params.prefix !== undefined) q.set("prefix", params.prefix);
  q.set("q", params.query);
  if (params.limit) q.set("limit", String(params.limit));
  if (params.continuation_token) q.set("continuation_token", params.continuation_token);
  return apiFetch<ObjectStorageListEntriesResponse>(`/api/object-storage/${storageId}/objects/search?${q.toString()}`);
}

export type ObjectStorageObjectMetadata = {
  key: string;
  size_bytes: number;
  content_type?: string;
  etag?: string;
  last_modified?: string;
  storage_class?: string;
  metadata: Record<string, string>;
};

export function getObjectStorageObjectMetadata(storageId: string, key: string) {
  return apiFetch<ObjectStorageObjectMetadata>(
    `/api/object-storage/${storageId}/objects/metadata?key=${encodeURIComponent(key)}`
  );
}

// Short-lived signed URL -- never persist this longer than the single
// action it's fetched for, never log/render it anywhere else. The HTTP
// verb is isolated here on purpose: the backend agent is deciding between
// GET (this is arguably a stateless, side-effect-free read) and POST (per
// the plan's "don't use GET for a sensitive token-creating operation"
// rule) in parallel with this work. If it ships as POST, this is the only
// line that needs to change.
// POST, not GET -- generating a presigned URL mints a short-lived access
// token, treated as a stateful/sensitive operation (spec #48), not a plain
// resource fetch.
export function getObjectStorageDownloadUrl(storageId: string, key: string) {
  return apiFetch<{ url: string; expires_at: string }>(
    `/api/object-storage/${storageId}/objects/download?key=${encodeURIComponent(key)}`,
    { method: "POST" }
  );
}

// Text/JSON only -- images/PDF are never previewed through this endpoint,
// they use the download endpoint's presigned URL directly as an <img>/
// <iframe> src instead (see object-preview.tsx).
export function getObjectStoragePreview(storageId: string, key: string) {
  return apiFetch<{ content_type: string; encoding: "utf-8" | "base64"; content: string; truncated: boolean }>(
    `/api/object-storage/${storageId}/objects/preview?key=${encodeURIComponent(key)}`
  );
}

// --- Alerts, Alert Rules & Notifications (Step 16, Central Infrastructure
// Alerts, Notifications & Event Management) ---
// VM/Docker/Database metrics -> Health/Recommendation -> Alert Rule ->
// Alert -> Notification -> Admin/authorized user. An Alert Rule (Admin-only)
// is evaluated periodically server-side; a breach that holds for the
// configured duration creates an Alert (ACTIVE -> optionally ACKNOWLEDGED
// -> RESOLVED automatically on recovery, or SUPPRESSED by an Admin), which
// fans out to Notifications. Nothing here ever executes remediation --
// Step 14's Database Operations remain the only place anything gets
// executed. Every GET below is scoped server-side to the caller's
// authorized resources exactly like Step 7's recommendations -- never
// trust a client-side filter for this.

export type AlertSeverity = "INFO" | "WARNING" | "CRITICAL";
export type AlertStatus = "ACTIVE" | "ACKNOWLEDGED" | "RESOLVED" | "SUPPRESSED";
export type AlertCondition = ">" | "<" | ">=" | "<=" | "==";

export type Alert = {
  id: string;
  alert_rule_id: string;
  resource_id: string;
  resource_name: string;
  resource_type: string; // "VM" | "DATABASE" -- container alerts still report the parent VM's resource_type
  container_id?: string;
  container_name?: string;
  workspace_id?: string;
  workspace_name?: string;
  alert_type: string; // one of the 14 closed AlertType values, e.g. "VM_HIGH_CPU"
  severity: AlertSeverity;
  status: AlertStatus;
  metric: string;
  current_value?: number;
  threshold: number;
  title: string; // backend-generated
  description?: string; // backend-generated
  first_seen_at: string;
  last_seen_at: string;
  acknowledged_by?: string;
  acknowledged_at?: string;
  resolved_at?: string;
  suppressed_at?: string;
  suppressed_reason?: string;
  created_at: string;
  duration_seconds: number;
};

export function listAlerts(params?: {
  status?: AlertStatus;
  severity?: AlertSeverity;
  workspace_id?: string;
  resource_id?: string;
  search?: string;
  limit?: number;
  offset?: number;
}) {
  const q = new URLSearchParams();
  if (params?.status) q.set("status", params.status);
  if (params?.severity) q.set("severity", params.severity);
  if (params?.workspace_id) q.set("workspace_id", params.workspace_id);
  if (params?.resource_id) q.set("resource_id", params.resource_id);
  if (params?.search) q.set("search", params.search);
  if (params?.limit) q.set("limit", String(params.limit));
  if (params?.offset !== undefined) q.set("offset", String(params.offset));
  const qs = q.toString();
  return apiFetch<{ alerts: Alert[]; total: number }>(`/api/alerts${qs ? `?${qs}` : ""}`);
}

export type AlertsSummary = {
  critical: number;
  warning: number;
  info: number;
  active: number;
  acknowledged: number;
  resolved_today: number;
};

// Scoped to the caller's authorized resources exactly like listAlerts --
// the dashboard widget and any "Critical: N Warning: N" display use this,
// never a client-side count over a possibly-truncated list.
export function getAlertsSummary() {
  return apiFetch<AlertsSummary>("/api/alerts/summary");
}

// Mirrors databaseOperationLogsStreamUrl's URL-building exactly -- no path
// params needed, it's a global stream. Each frame is
// {type:"alerts", alerts: Alert[]}: the caller's current full list of
// ACTIVE alerts (top 50), scoped server-side -- treat every frame as a
// full replacement of "current active alerts," never an incremental diff.
export function alertsStreamUrl(): string {
  const wsBase = API_BASE.replace(/^http/, "ws");
  return `${wsBase}/api/alerts/stream`;
}

export function getAlert(id: string) {
  return apiFetch<Alert>(`/api/alerts/${id}`);
}

export type AlertEventType =
  | "CREATED"
  | "ESCALATED"
  | "DEESCALATED"
  | "ACKNOWLEDGED"
  | "RESOLVED"
  | "SUPPRESSED"
  | "UNSUPPRESSED"
  | "SAMPLE";

export type AlertEvent = {
  event_type: AlertEventType;
  status: string;
  value?: number;
  threshold?: number;
  message?: string;
  created_at: string;
};

// Expect many SAMPLE events for a long-lived alert (one per evaluation
// cycle) -- render those compactly, never as prominent timeline milestones
// the way CREATED/ACKNOWLEDGED/RESOLVED/SUPPRESSED/ESCALATED/DEESCALATED
// should be.
export function getAlertHistory(id: string) {
  return apiFetch<{ events: AlertEvent[] }>(`/api/alerts/${id}/history`);
}

// Admin-only. 409 if the alert isn't currently ACTIVE.
export function acknowledgeAlert(id: string) {
  return apiFetch<{ id: string; status: AlertStatus }>(`/api/alerts/${id}/acknowledge`, { method: "POST" });
}

// Admin-only. 409 if the alert isn't currently ACTIVE/ACKNOWLEDGED. A timed
// silence of this one already-firing alert -- distinct from (and coarser
// than) disabling the alert rule itself via updateAlertRule.
export function suppressAlert(id: string, payload: { duration_minutes: number; reason: string }) {
  return apiFetch<{ id: string; status: AlertStatus }>(`/api/alerts/${id}/suppress`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

// --- Alert Rules (Admin-only, all of them) ---

export type AlertTemplate = {
  type: string;
  metric: string;
  label: string;
  default_condition: AlertCondition;
  default_threshold: number;
  default_duration_seconds: number;
  default_severity: AlertSeverity;
  // "VM" | "DATABASE" | "OBJECT_STORAGE" | "DOCKER_CONTAINER" | "K8S_CLUSTER" |
  // "K8S_POD" | "DOCKER_HOST" | "DOCKER_HOST_CONTAINER"
  applies_to_resource: string;
};

// Every metric-threshold template's "current value" comes from an
// existing scheduler's own last sample; every *_HIGH_ERROR_LOGS template
// instead counts ERROR/CRITICAL-classified log lines within the rule's
// own duration window (see backend's alertLogErrorCount) -- grouping by
// this split is what lets the New Rule form show separate "Metrics" and
// "Logs" sections instead of one flat list.
export function isLogBasedAlertTemplate(t: AlertTemplate): boolean {
  return t.type.endsWith("_HIGH_ERROR_LOGS");
}

// Drives the "New Rule" form's template picker -- fetched live rather than
// hardcoded, since this is the backend's exact closed catalog.
export function listAlertRuleTemplates() {
  return apiFetch<{ templates: AlertTemplate[] }>("/api/alert-rules/templates");
}

export type AlertRule = {
  id: string;
  resource_id: string;
  container_id?: string;
  k8s_pod_id?: string;
  docker_host_container_sighting_id?: string;
  alert_type: string;
  metric: string;
  condition: AlertCondition;
  threshold: number;
  recovery_threshold?: number;
  duration_seconds: number;
  severity: AlertSeverity;
  notification_policy_id?: string;
  enabled: boolean;
  suppressed_until?: string;
  suppressed_reason?: string;
  created_at: string;
};

export type AlertRuleListItem = {
  rule: AlertRule;
  resource_name: string;
  resource_type: string;
  workspace_id: string;
  // Display-only extras for a rule narrowed to one K8s pod/Docker Host
  // container -- absent for every other rule.
  k8s_pod_name?: string;
  k8s_pod_namespace?: string;
  docker_host_container_docker_id?: string;
};

export function listAlertRules() {
  return apiFetch<{ alert_rules: AlertRuleListItem[] }>("/api/alert-rules");
}

// 400 if alert_type doesn't match the target resource's actual type (e.g. a
// DATABASE_* type against a VM resource) -- surface the message directly,
// it's already descriptive.
export function createAlertRule(payload: {
  resource_id: string;
  container_id?: string;
  k8s_pod_id?: string;
  // Raw Docker container id (from listDockerHostContainers) -- resolved
  // into a docker_host_container_sightings row server-side, since a
  // Docker Host container has no persisted identity of its own to
  // reference directly (see api.ts's DockerHostContainer type).
  docker_host_container_id?: string;
  alert_type: string;
  condition: AlertCondition;
  threshold: number;
  recovery_threshold?: number;
  duration_seconds: number;
  severity: AlertSeverity;
  notification_policy_id?: string;
  enabled: boolean;
}) {
  return apiFetch<AlertRule>("/api/alert-rules", { method: "POST", body: JSON.stringify(payload) });
}

export function getAlertRule(id: string) {
  return apiFetch<AlertRule>(`/api/alert-rules/${id}`);
}

// Same body shape as createAlertRule minus resource_id/container_id/
// alert_type -- those are fixed at creation; to monitor something
// different, create a new rule instead.
export function updateAlertRule(
  id: string,
  payload: {
    condition: AlertCondition;
    threshold: number;
    recovery_threshold?: number;
    duration_seconds: number;
    severity: AlertSeverity;
    notification_policy_id?: string;
    enabled: boolean;
  }
) {
  return apiFetch<AlertRule>(`/api/alert-rules/${id}`, { method: "PUT", body: JSON.stringify(payload) });
}

export function deleteAlertRule(id: string) {
  return apiFetch<{ deleted: true }>(`/api/alert-rules/${id}`, { method: "DELETE" });
}

// Rules for one specific resource -- a nice-to-have for a resource detail
// page's own "Alert Rules" section; the global /api/alert-rules list above
// is the primary management surface.
export function listAlertRulesForResource(resourceId: string) {
  return apiFetch<{ alert_rules: AlertRule[] }>(`/api/resources/${resourceId}/alert-rules`);
}

// --- Notifications (any authenticated role -- always scoped to the
// caller's own notifications, never another user's) ---

export type NotificationCategory =
  | "CRITICAL_ALERT"
  | "WARNING"
  | "OPERATIONS"
  | "DATABASE_EVENT"
  | "VM_EVENT"
  | "DOCKER_EVENT"
  | "SYSTEM_EVENT";

export type NotificationChannel = "IN_APP" | "EMAIL" | "SLACK" | "TEAMS" | "WEBHOOK";

export type Notification = {
  id: string;
  alert_id?: string;
  category: NotificationCategory;
  channel: NotificationChannel;
  severity?: AlertSeverity;
  title: string;
  body?: string;
  status: "PENDING" | "SENT" | "FAILED";
  read_at?: string;
  created_at: string;
};

export function listNotifications(params?: { unread_only?: boolean; limit?: number; offset?: number }) {
  const q = new URLSearchParams();
  if (params?.unread_only) q.set("unread_only", "true");
  if (params?.limit) q.set("limit", String(params.limit));
  if (params?.offset !== undefined) q.set("offset", String(params.offset));
  const qs = q.toString();
  return apiFetch<{ notifications: Notification[]; unread_count: number }>(`/api/notifications${qs ? `?${qs}` : ""}`);
}

export function markNotificationRead(id: string) {
  return apiFetch<Notification>(`/api/notifications/${id}/read`, { method: "POST" });
}

export function markAllNotificationsRead() {
  return apiFetch<{ marked_read: true }>("/api/notifications/read-all", { method: "POST" });
}

// --- Notification Policies (Admin-only) ---

export type NotificationPolicy = {
  id: string;
  name: string;
  is_default: boolean;
  info_channels: string[];
  warning_channels: string[];
  critical_channels: string[];
  quiet_hours_start?: string;
  quiet_hours_end?: string;
  quiet_hours_timezone?: string;
  // WEBHOOK/SLACK/TEAMS each deliver by posting to their own URL --
  // EMAIL has no per-policy destination (it goes to each recipient's own
  // account email) and IN_APP has no destination at all.
  webhook_url?: string;
  slack_webhook_url?: string;
  teams_webhook_url?: string;
  created_at: string;
};

export type NotificationPolicyInput = {
  name: string;
  info_channels: string[];
  warning_channels: string[];
  critical_channels: string[];
  quiet_hours_start?: string;
  quiet_hours_end?: string;
  quiet_hours_timezone?: string;
  webhook_url?: string;
  slack_webhook_url?: string;
  teams_webhook_url?: string;
};

export function listNotificationPolicies() {
  return apiFetch<{ notification_policies: NotificationPolicy[] }>("/api/notification-policies");
}

export function createNotificationPolicy(payload: NotificationPolicyInput) {
  return apiFetch<NotificationPolicy>("/api/notification-policies", { method: "POST", body: JSON.stringify(payload) });
}

export function updateNotificationPolicy(id: string, payload: NotificationPolicyInput) {
  return apiFetch<NotificationPolicy>(`/api/notification-policies/${id}`, { method: "PUT", body: JSON.stringify(payload) });
}

// The system default policy (is_default: true) can't be deleted -- surface
// the resulting error message as-is, never special-case it client-side.
export function deleteNotificationPolicy(id: string) {
  return apiFetch<{ deleted: true }>(`/api/notification-policies/${id}`, { method: "DELETE" });
}

// Sends exactly one synthetic notification over `channel` right now, so an
// admin can confirm their Email/Slack/Teams/Webhook configuration actually
// works without waiting for a real alert -- bypasses cooldown/retry and
// never appears in notification history. EMAIL always goes to the caller's
// own account address. An operation endpoint: always 200 with a
// status of "sent" or "failed" (+ message) -- never a non-2xx for "the
// send itself failed."
export function sendTestNotification(policyId: string, channel: NotificationChannel) {
  return apiFetch<{ status: "sent" | "failed"; message?: string }>(`/api/notification-policies/${policyId}/test`, {
    method: "POST",
    body: JSON.stringify({ channel }),
  });
}

// --- Monitoring Dashboard (Step 19 Phase 2) ---
// GET /api/monitoring/overview and GET /api/monitoring/resources back the
// central /monitoring dashboard, both authorization-scoped server-side
// exactly like /api/alerts and /api/my-access (decision #3) -- there is no
// client-side access filtering here, same as every other list function in
// this file. Re-exported so callers can get MonitoringResourceType from
// either this file or lib/monitoring.ts.
export type { MonitoringResourceType };

// unknown/offline/unavailable are optional because the three resource
// types don't share one health-bucket vocabulary: VMs report
// unknown+offline, Databases report only unknown, Object Storage reports
// only unavailable (Step 19 backend Phase 2 -- Object Storage's bucket
// reuses the existing GetObjectStorageSummaryCounts query verbatim rather
// than tallying the merged resource DTO's single Health field, since that
// single field can't represent the same critical-vs-unavailable split).
export type MonitoringHealthBucket = {
  total: number;
  healthy: number;
  warning: number;
  critical: number;
  unknown?: number;
  offline?: number;
  unavailable?: number;
};

export type MonitoringAlertsBucket = {
  critical: number;
  warning: number;
  info: number;
  active: number;
  acknowledged: number;
  resolved_today: number;
};

export type MonitoringRecommendationsBucket = {
  total: number;
  new: number;
  acknowledged: number;
  dismissed: number;
  resolved: number;
  open_critical: number;
  open_high: number;
  open_medium: number;
  open_low: number;
};

export type MonitoringOverview = {
  vms: MonitoringHealthBucket;
  databases: MonitoringHealthBucket;
  object_storage: MonitoringHealthBucket;
  // Step 19 Phase 3's cross-VM Docker aggregate -- always present now that
  // the backend ships it (no more optional/"not yet available" handling).
  docker: {
    hosts: number;
    containers_total: number;
    containers_running: number;
    containers_stopped: number;
    containers_unhealthy: number;
    images_total: number;
  };
  alerts: MonitoringAlertsBucket;
  recommendations: MonitoringRecommendationsBucket;
};

export function getMonitoringOverview(params?: { workspace_id?: string }) {
  const q = new URLSearchParams();
  if (params?.workspace_id) q.set("workspace_id", params.workspace_id);
  const qs = q.toString();
  return apiFetch<MonitoringOverview>(`/api/monitoring/overview${qs ? `?${qs}` : ""}`);
}

// Normalized per-resource availability, distinct from HealthStatus --
// VM/Database/Object Storage each have their own connection-status
// vocabulary, collapsed into one closed union here so the unified
// resource table's Availability column never has to branch per resource
// type.
export type MonitoringAvailability = "AVAILABLE" | "UNAVAILABLE" | "UNKNOWN";

export type MonitoringResource = {
  id: string;
  resource_type: MonitoringResourceType;
  name: string;
  workspace_id: string;
  workspace_name: string;
  health: HealthStatus;
  availability: MonitoringAvailability;
  connection_status?: string;
  monitoring_enabled: boolean;
  active_alert_severity?: string;
  permissions: string[];
  access_source?: string;
  last_seen_at?: string;
};

// Unpaginated -- matches every existing per-type List endpoint's own
// convention (none of VM/Database/Object Storage's List endpoints
// paginate today either). Search is a thin passthrough to the backend's
// `search` param; never filter the returned array client-side (the
// enumeration-protection requirement -- the backend applies authorization
// scoping before matching).
export function listMonitoringResources(params?: {
  resource_type?: MonitoringResourceType;
  workspace_id?: string;
  health?: HealthStatus;
  alert_severity?: string;
  search?: string;
}) {
  const q = new URLSearchParams();
  if (params?.resource_type) q.set("resource_type", params.resource_type);
  if (params?.workspace_id) q.set("workspace_id", params.workspace_id);
  if (params?.health) q.set("health", params.health);
  if (params?.alert_severity) q.set("alert_severity", params.alert_severity);
  if (params?.search) q.set("search", params.search);
  const qs = q.toString();
  return apiFetch<{ resources: MonitoringResource[]; total: number }>(`/api/monitoring/resources${qs ? `?${qs}` : ""}`);
}

// Step 19 Timeline phase (decision #7): composed server-side from Alerts +
// Recommendations timestamps (first_seen_at/acknowledged_at/resolved_at and
// detected_at/resolved_at), not a new audit-log endpoint. This is a "recent
// events" summary, not a full audit trail -- no page/cursor param, just
// `limit` (backend default applies when omitted).
export type MonitoringEventType =
  | "ALERT_TRIGGERED"
  | "ALERT_ACKNOWLEDGED"
  | "ALERT_RESOLVED"
  | "RECOMMENDATION_DETECTED"
  | "RECOMMENDATION_RESOLVED";

export type MonitoringEvent = {
  timestamp: string;
  type: MonitoringEventType;
  resource_id: string;
  resource_type: MonitoringResourceType;
  resource_name: string;
  description: string;
  severity?: string;
};

export function getMonitoringTimeline(params?: { workspace_id?: string; limit?: number }) {
  const q = new URLSearchParams();
  if (params?.workspace_id) q.set("workspace_id", params.workspace_id);
  if (params?.limit) q.set("limit", String(params.limit));
  const qs = q.toString();
  return apiFetch<{ events: MonitoringEvent[]; total: number }>(`/api/monitoring/timeline${qs ? `?${qs}` : ""}`);
}

// --- Operations (Step 21) ---
// GET /api/operations is a read-only merge of the three existing
// controlled-operation families (update execution/Step 10, VM reboot/Step
// 11, database operations/Step 14) -- authorization-scoped server-side
// exactly like every other list function in this file (Member sees only
// their authorized VMs' update/reboot operations, never any database
// operation at all -- there is no grant path for those). Every mutating
// action (confirm/execute/cancel/retry) still lives on that operation's
// own existing page; this is a list/overview surface only.

export type OperationFamily = "UPDATE" | "REBOOT" | "DATABASE";

export type UnifiedOperation = {
  id: string;
  family: OperationFamily;
  operation_type: string;
  resource_id: string;
  resource_name: string;
  resource_type: "VM" | "DATABASE";
  workspace_id?: string;
  status: string;
  requested_by_name?: string;
  requested_by_email?: string;
  summary?: string;
  error_summary?: string;
  created_at: string;
  started_at?: string;
  completed_at?: string;
};

export function listOperations(params?: {
  status?: string;
  family?: OperationFamily;
  resource_type?: "VM" | "DATABASE";
  operation_type?: string;
  workspace_id?: string;
  search?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}) {
  const q = new URLSearchParams();
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== "") q.set(key, String(value));
    }
  }
  const qs = q.toString();
  return apiFetch<{ operations: UnifiedOperation[]; total: number }>(`/api/operations${qs ? `?${qs}` : ""}`);
}

export type OperationsSummary = {
  total: number;
  running: number;
  pending_confirmation: number;
  successful: number;
  failed: number;
  cancelled: number;
};

export function getOperationsSummary() {
  return apiFetch<OperationsSummary>("/api/operations/summary");
}

// Deep-links a unified operation row to its own existing, fully-featured
// detail page -- never a fourth place to view/confirm/cancel it from.
export function operationDetailPath(op: Pick<UnifiedOperation, "family" | "id" | "resource_id">): string {
  switch (op.family) {
    case "UPDATE":
      return `/update-operations/${op.id}`;
    case "REBOOT":
      return `/reboot-operations/${op.id}`;
    case "DATABASE":
      return `/databases/${op.resource_id}/operations/${op.id}`;
  }
}

// --- Audit Logs (Step 21, Admin-only) ---
// Read-only browsing of the existing append-only audit_logs table
// (internal/services/audit.go writes it; there is no create/update/delete
// route here or anywhere -- see docs/... audit immutability is enforced at
// the database level).

export type AuditCategory =
  | "AUTHENTICATION"
  | "USERS"
  | "PERMISSIONS"
  | "PROJECTS"
  | "GROUPS"
  | "VMS"
  | "DOCKER"
  | "DATABASES"
  | "OBJECT_STORAGE"
  | "MONITORING"
  | "ALERTS"
  | "UPDATES"
  | "OPERATIONS"
  | "SETTINGS"
  | "OTHER";

export type AuditLogEntry = {
  id: string;
  actor_id?: string;
  actor_name?: string;
  actor_email?: string;
  action: string;
  category: AuditCategory;
  resource_type?: string;
  resource_id?: string;
  ip_address?: string;
  user_agent?: string;
  metadata: Record<string, unknown>;
  created_at: string;
};

export function listAuditLogs(params?: {
  user_id?: string;
  action?: string;
  category?: AuditCategory;
  resource_type?: string;
  search?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}) {
  const q = new URLSearchParams();
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== "") q.set(key, String(value));
    }
  }
  const qs = q.toString();
  return apiFetch<{ audit_logs: AuditLogEntry[]; total: number }>(`/api/audit-logs${qs ? `?${qs}` : ""}`);
}

export type AuditLogsSummary = {
  total: number;
  today: number;
  security_events: number;
  user_changes: number;
  resource_changes: number;
  operations_events: number;
};

export function getAuditLogsSummary() {
  return apiFetch<AuditLogsSummary>("/api/audit-logs/summary");
}

// --- Settings (Step 21) ---

export type Theme = "SYSTEM" | "LIGHT" | "DARK";
export type DateFormat = "YYYY-MM-DD" | "MM/DD/YYYY" | "DD/MM/YYYY";
// Every notifications.category value a user may mute -- CRITICAL_ALERT is
// deliberately excluded: it can never be muted (a critical alert must
// always still reach every authorized recipient).
export type MutableNotificationCategory = "WARNING" | "OPERATIONS" | "DATABASE_EVENT" | "VM_EVENT" | "DOCKER_EVENT" | "SYSTEM_EVENT";

export type MeSettings = {
  name: string;
  email: string;
  theme: Theme;
  timezone: string;
  date_format: DateFormat;
  muted_notification_categories: MutableNotificationCategory[];
};

export function getMeSettings() {
  return apiFetch<MeSettings>("/api/me/settings");
}

// Every field optional -- a call touching only `theme` leaves name and
// every other preference untouched server-side.
export function updateMeSettings(payload: Partial<{
  name: string;
  theme: Theme;
  timezone: string;
  date_format: DateFormat;
  muted_notification_categories: MutableNotificationCategory[];
}>) {
  return apiFetch<MeSettings>("/api/me/settings", { method: "PUT", body: JSON.stringify(payload) });
}

// Self-service only, any role -- the backend's target is always the
// caller (from the auth token), never a request field.
export function changeMyPassword(currentPassword: string, newPassword: string) {
  return apiFetch<{ changed: true }>("/api/me/password", {
    method: "PUT",
    body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
  });
}

// Admin-only -- monitoring/security fields here are a live echo of backend
// config (internal/handlers/platform_settings.go): each is baked into a
// scheduler/ticker/middleware at process startup, so there's deliberately
// no PUT for them. Sign-in-method status (below) is the one exception --
// backed by PlatformSettingsService (migration 047), editable via the
// Owner-only signin-methods functions further down.
export type PlatformSettings = {
  platform_name: string;
  vm_monitor_interval: string;
  vm_monitor_retention_days: number;
  docker_metrics_interval: string;
  database_metrics_interval: string;
  database_metrics_retention_days: number;
  object_storage_metrics_interval: string;
  alert_eval_interval: string;
  access_token_ttl_minutes: number;
  refresh_token_ttl_days: number;
  cookie_secure: boolean;
  login_rate_limit_attempts: number;
  login_rate_limit_window: string;
  max_request_body_bytes: number;
  github_oauth_configured: boolean;
  google_oauth_configured: boolean;
  smtp_configured: boolean;
  is_owner: boolean;
};

export function getPlatformSettings() {
  return apiFetch<PlatformSettings>("/api/settings/platform");
}

// === Sign-in Methods (Owner-only edit surface) ===
// GitHub/Google client secrets and the SMTP password are never echoed back
// -- only a `*_set` boolean, matching this app's masked-credential-display
// convention. Omitting `client_secret`/`password` on a PUT or test call
// means "use whatever is currently saved."

export type SignInMethods = {
  github_client_id: string;
  github_secret_set: boolean;
  google_client_id: string;
  google_secret_set: boolean;
  smtp_host: string;
  smtp_port: number;
  smtp_username: string;
  smtp_password_set: boolean;
  smtp_from_email: string;
  smtp_use_tls: boolean;
};

export function getSignInMethods() {
  return apiFetch<SignInMethods>("/api/settings/signin-methods");
}

export function updateGitHubSignIn(payload: { client_id: string; client_secret?: string }) {
  return apiFetch<{ saved: boolean }>("/api/settings/github", { method: "PUT", body: JSON.stringify(payload) });
}

export function updateGoogleSignIn(payload: { client_id: string; client_secret?: string }) {
  return apiFetch<{ saved: boolean }>("/api/settings/google", { method: "PUT", body: JSON.stringify(payload) });
}

export type SMTPSettingsInput = {
  host: string;
  port: number;
  username: string;
  password?: string;
  from_email: string;
  use_tls: boolean;
};

export function updateSMTPSignIn(payload: SMTPSettingsInput) {
  return apiFetch<{ saved: boolean }>("/api/settings/smtp", { method: "PUT", body: JSON.stringify(payload) });
}

// Reuses DatabaseConnectionStatus -- same shared services.ConnectionTestStatus
// enum on the backend (see database_health.go), not a coincidence.
export function testSMTPSignIn(payload: SMTPSettingsInput) {
  return apiFetch<{ connection_status: DatabaseConnectionStatus }>("/api/settings/smtp/test", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

// provider = "github" | "google". See platform_settings.go's own doc
// comment for exactly what this can and cannot verify -- a backend-only
// probe can confirm the provider recognizes the Client ID/Secret pair, but
// never that a full browser consent flow would actually succeed.
export function testOAuthSignIn(provider: "github" | "google", payload: { client_id: string; client_secret?: string }) {
  return apiFetch<{ connection_status: DatabaseConnectionStatus }>(`/api/settings/oauth/${provider}/test`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
