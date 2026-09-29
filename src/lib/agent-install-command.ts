// lib/agent-install-command.ts builds the one-line install command shown by
// the Configure tab's "Connect OS" form (vm-agent-configure-table.tsx),
// per selected OS and install method.
//
// DOCKER is the same command on every OS (it's always the same Linux
// container -- Docker Desktop only ever runs Linux containers, regardless
// of host OS), and must stay byte-for-byte identical in shape to the
// backend's own services.VMAgentRunCommand (infrahub-api/internal/
// services/vm_agent_install.go) -- same 5 mounts, same 3 env vars -- just
// pointed at the infrahub-linux-os-agent image alias instead of vm-agent,
// since the backend only ever builds that one Linux form itself (see
// connectAgentOnlyVMResponse.RunCommand). It's prefixed with
// MSYS_NO_PATHCONV=1: harmless everywhere else, but without it Git Bash on
// Windows silently rewrites the /proc and / mount paths into Windows-style
// paths before Docker ever sees them, breaking the command for anyone
// testing from a Windows dev machine (a real, hit-in-practice failure, not
// a hypothetical one -- see the git history for the incident this fixed).
//
// NATIVE means a real binary, no Docker involved, downloaded from the
// vm-agent repo's GitHub Releases. On Windows and macOS this is the ONLY
// way to get accurate host metrics: Docker Desktop on both OSes always
// runs containers inside its own Linux VM (WSL2 on Windows, a Linux VM on
// macOS -- there is no native container concept on macOS at all), so
// DOCKER there reports that VM's own memory/disk, never the physical
// host's (this is exactly the bug this whole cross-platform agent effort
// exists to fix -- see the plan's Context section). DOCKER is still
// offered there for operators who want one uniform `docker run` story
// across every OS and accept trading accuracy for that.
//
// On Linux, by contrast, Docker was never virtualized -- a Linux
// container's bind-mounted /proc and / are already host-real -- so
// NATIVE's only benefit there is not needing Docker installed at all, not
// accuracy. DOCKER is Linux's default for exactly that reason: it's the
// original, most-tested path and what most existing fleets already run.

export type AgentOS = "LINUX" | "WINDOWS" | "MAC";
export type AgentInstallMethod = "NATIVE" | "DOCKER";

// Maps the agent-reported OS family (protocol.go's `os` field: "linux" |
// "windows" | "darwin", or unset if this agent has never pushed a sample)
// to the picker's AgentOS -- shared by the Configure tab's "Regenerate
// Token" default and the Metrics card grid's OS filter/badge.
export function agentOSFamilyToPickerOS(agentOS: string | undefined): AgentOS {
  switch (agentOS) {
    case "windows":
      return "WINDOWS";
    case "darwin":
      return "MAC";
    default:
      return "LINUX";
  }
}

// defaultInstallMethodFor picks the method that best matches each OS's
// own tradeoff (see this file's own doc comment): Linux defaults to the
// well-established Docker path, Windows/Mac default to the only method
// that reports real host metrics.
export function defaultInstallMethodFor(os: AgentOS): AgentInstallMethod {
  return os === "LINUX" ? "DOCKER" : "NATIVE";
}

const RELEASES_BASE = "https://github.com/infrahubcenter/infrahub-vm-agent/releases/latest/download";
const METRICS_INTERVAL_SECONDS = 15;

// POSIX single-quote escaping -- mirrors shellQuote in
// vm_agent_install.go/docker_agent_install.go exactly ('\'' to close,
// escape, reopen the quote).
function posixQuote(s: string): string {
  return "'" + s.replace(/'/g, `'\\''`) + "'";
}

// PowerShell single-quote escaping: double any embedded single quote.
function psQuote(s: string): string {
  return "'" + s.replace(/'/g, "''") + "'";
}

// DOCKER_IMAGE_BY_OS: every tag below is the exact same image content --
// Docker Desktop only ever runs one real Linux container regardless of
// which OS is selected (see this file's top doc comment) -- pushed under
// three names purely so the generated command's image reference matches
// whichever OS the operator picked, rather than always saying "linux"
// even when running against a Windows/Mac target.
const DOCKER_IMAGE_BY_OS: Record<AgentOS, string> = {
  LINUX: "docker.io/infrahubcenter/infrahub-linux-os-agent:1.0.0",
  WINDOWS: "docker.io/infrahubcenter/infrahub-windows-os-agent:1.0.0",
  MAC: "docker.io/infrahubcenter/infrahub-mac-os-agent:1.0.0",
};

// The / mount is a plain `:ro` bind, deliberately without a `,rslave`
// propagation flag -- see vm_agent_install.go's VMAgentRunCommand doc
// comment (this must stay in sync with it): rslave requires the *source*
// mount to already be shared/slave, which Docker Desktop's own VM doesn't
// guarantee, so it made `docker run` itself fail outright there with
// "path / is mounted on / but it is not a shared or slave mount" -- a
// real failure hit while testing this exact command, not hypothetical.
function dockerCommand(os: AgentOS, token: string, backendUrl: string): string {
  return (
    "MSYS_NO_PATHCONV=1 docker run -d --name infrahub-vm-agent --restart unless-stopped " +
    "-v /proc:/host/proc:ro -v /:/host/root:ro " +
    "-v /var/log:/host/var/log:ro -v /var/log/journal:/host/var/log/journal:ro -v /run/log/journal:/host/run/log/journal:ro " +
    `-e INFRAHUB_BACKEND_URL=${posixQuote(backendUrl)} -e INFRAHUB_AGENT_TOKEN=${posixQuote(token)} -e INFRAHUB_METRICS_INTERVAL=${METRICS_INTERVAL_SECONDS} ` +
    DOCKER_IMAGE_BY_OS[os]
  );
}

function linuxNativeCommand(token: string, backendUrl: string): string {
  const dest = "/usr/local/bin/infrahub-vm-agent";
  return (
    `curl -fsSL -o ${dest} "${RELEASES_BASE}/infrahub-linux-os-agent-amd64" && chmod +x ${dest} && ` +
    `INFRAHUB_BACKEND_URL=${posixQuote(backendUrl)} INFRAHUB_AGENT_TOKEN=${posixQuote(token)} INFRAHUB_METRICS_INTERVAL=${METRICS_INTERVAL_SECONDS} ` +
    `nohup ${dest} > /tmp/infrahub-vm-agent.log 2>&1 &`
  );
}

function windowsCommand(token: string, backendUrl: string): string {
  const url = `${RELEASES_BASE}/infrahub-windows-os-agent.exe`;
  const dest = "$env:TEMP\\infrahub-windows-os-agent.exe";
  return (
    `$env:INFRAHUB_BACKEND_URL=${psQuote(backendUrl)}; ` +
    `$env:INFRAHUB_AGENT_TOKEN=${psQuote(token)}; ` +
    `$env:INFRAHUB_METRICS_INTERVAL='${METRICS_INTERVAL_SECONDS}'; ` +
    `Invoke-WebRequest -Uri ${psQuote(url)} -OutFile "${dest}"; ` +
    `Start-Process -FilePath "${dest}" -WindowStyle Hidden`
  );
}

function macCommand(token: string, backendUrl: string): string {
  const dest = "/usr/local/bin/infrahub-vm-agent";
  return (
    `ARCH=$(uname -m); [ "$ARCH" = "arm64" ] && ASSET=infrahub-mac-os-agent-arm64 || ASSET=infrahub-mac-os-agent-amd64; ` +
    `curl -fsSL -o ${dest} "${RELEASES_BASE}/$ASSET" && chmod +x ${dest} && ` +
    `INFRAHUB_BACKEND_URL=${posixQuote(backendUrl)} INFRAHUB_AGENT_TOKEN=${posixQuote(token)} INFRAHUB_METRICS_INTERVAL=${METRICS_INTERVAL_SECONDS} ` +
    `nohup ${dest} > /tmp/infrahub-vm-agent.log 2>&1 &`
  );
}

// buildAgentInstallCommand returns the single copy-pasteable command for
// os, given the freshly-issued agent token and the backend's own
// externally-reachable agent-connect URL (createAgentOnlyVM's
// backend_url, or the manual-install response's backend_url). method
// defaults per defaultInstallMethodFor when not given explicitly.
export function buildAgentInstallCommand(
  os: AgentOS,
  token: string,
  backendUrl: string,
  method: AgentInstallMethod = defaultInstallMethodFor(os)
): string {
  if (method === "DOCKER") {
    return dockerCommand(os, token, backendUrl);
  }
  switch (os) {
    case "LINUX":
      return linuxNativeCommand(token, backendUrl);
    case "WINDOWS":
      return windowsCommand(token, backendUrl);
    case "MAC":
      return macCommand(token, backendUrl);
  }
}
