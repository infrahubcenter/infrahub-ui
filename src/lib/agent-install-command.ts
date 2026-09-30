// lib/agent-install-command.ts builds the install command (one option per
// line) and its permission notes shown by
// the Configure tab's "Connect OS" form (vm-agent-configure-table.tsx),
// per selected OS and install method.
//
// DOCKER is the same command on every OS (it's always the same Linux
// container -- Docker Desktop only ever runs Linux containers, regardless
// of host OS), and must stay byte-for-byte identical in shape to the
// backend's own services.VMAgentRunCommand (infrahub-api/internal/
// services/vm_agent_install.go) -- same 5 mounts, same 3 env vars -- just
// using the same infrahub-vm-agent image (see DOCKER_IMAGE_BY_OS below),
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

// DOCKER_IMAGE_BY_OS: Docker Desktop only ever runs one real Linux
// container regardless of which OS is selected (see this file's top doc
// comment), so every OS uses the one VM agent image, named after its
// repository (infrahub-vm-agent).
const VM_AGENT_IMAGE = "docker.io/infrahubcenter/infrahub-vm-agent:1.0.0";
const DOCKER_IMAGE_BY_OS: Record<AgentOS, string> = {
  LINUX: VM_AGENT_IMAGE,
  WINDOWS: VM_AGENT_IMAGE,
  MAC: VM_AGENT_IMAGE,
};

// Commands are rendered one option per line so they're readable and easy
// to check before running: POSIX shells continue lines with " \", and
// PowerShell with " `". Both forms paste and run as-is.
const SH_CONT = " \\\n  ";
const PS_CONT = " `\n  ";

const DOCKER_RUN_ARGS = (token: string, backendUrl: string, quote: (s: string) => string) => [
  "--name infrahub-vm-agent",
  "--restart unless-stopped",
  "-v /proc:/host/proc:ro",
  "-v /:/host/root:ro",
  "-v /var/log:/host/var/log:ro",
  "-v /var/log/journal:/host/var/log/journal:ro",
  "-v /run/log/journal:/host/run/log/journal:ro",
  `-e INFRAHUB_BACKEND_URL=${quote(backendUrl)}`,
  `-e INFRAHUB_AGENT_TOKEN=${quote(token)}`,
  `-e INFRAHUB_METRICS_INTERVAL=${METRICS_INTERVAL_SECONDS}`,
];

// The / mount is a plain `:ro` bind, deliberately without a `,rslave`
// propagation flag -- see vm_agent_install.go's VMAgentRunCommand doc
// comment (this must stay in sync with it): rslave requires the *source*
// mount to already be shared/slave, which Docker Desktop's own VM doesn't
// guarantee, so it made `docker run` itself fail outright there with
// "path / is mounted on / but it is not a shared or slave mount" -- a
// real failure hit while testing this exact command, not hypothetical.
function dockerCommand(os: AgentOS, token: string, backendUrl: string): string {
  if (os === "WINDOWS") {
    // PowerShell: no path rewriting happens, so no MSYS_NO_PATHCONV, and
    // backtick line continuations instead of backslashes.
    return ["docker run -d", ...DOCKER_RUN_ARGS(token, backendUrl, psQuote), DOCKER_IMAGE_BY_OS[os]].join(PS_CONT);
  }
  return ["MSYS_NO_PATHCONV=1 docker run -d", ...DOCKER_RUN_ARGS(token, backendUrl, posixQuote), DOCKER_IMAGE_BY_OS[os]].join(SH_CONT);
}

// Linux native: the infrahub-vm-agent installer (install.sh) -- detects
// apt/dnf/yum/zypper, downloads the release binary (or builds it on
// arm64) and registers a systemd service, so the agent survives reboots.
// Runs under sudo because it writes /usr/local/bin and /etc/systemd.
const LINUX_INSTALLER = "https://raw.githubusercontent.com/infrahubcenter/infrahub-vm-agent/main/install.sh";

function linuxNativeCommand(token: string, backendUrl: string): string {
  return [
    `curl -fsSL ${LINUX_INSTALLER} | sudo bash -s --`,
    `--backend-url ${posixQuote(backendUrl)}`,
    `--token ${posixQuote(token)}`,
    `--interval ${METRICS_INTERVAL_SECONDS}`,
  ].join(SH_CONT);
}

function windowsCommand(token: string, backendUrl: string): string {
  const url = `${RELEASES_BASE}/infrahub-windows-os-agent.exe`;
  const dest = "$env:ProgramData\\InfraHub\\infrahub-windows-os-agent.exe";
  return [
    `New-Item -ItemType Directory -Force -Path "$env:ProgramData\\InfraHub" | Out-Null`,
    `Invoke-WebRequest -UseBasicParsing -Uri ${psQuote(url)} -OutFile "${dest}"`,
    `Unblock-File -Path "${dest}"`,
    `$env:INFRAHUB_BACKEND_URL = ${psQuote(backendUrl)}`,
    `$env:INFRAHUB_AGENT_TOKEN = ${psQuote(token)}`,
    `$env:INFRAHUB_METRICS_INTERVAL = '${METRICS_INTERVAL_SECONDS}'`,
    `Start-Process -FilePath "${dest}" -WindowStyle Hidden`,
  ].join("\n");
}

function macCommand(token: string, backendUrl: string): string {
  const dest = "/usr/local/bin/infrahub-vm-agent";
  return [
    `ARCH=$(uname -m); [ "$ARCH" = "arm64" ] && ASSET=infrahub-mac-os-agent-arm64 || ASSET=infrahub-mac-os-agent-amd64`,
    `sudo mkdir -p /usr/local/bin`,
    `sudo curl -fsSL -o ${dest} "${RELEASES_BASE}/$ASSET"`,
    `sudo chmod +x ${dest}`,
    `INFRAHUB_BACKEND_URL=${posixQuote(backendUrl)}${SH_CONT}INFRAHUB_AGENT_TOKEN=${posixQuote(token)}${SH_CONT}INFRAHUB_METRICS_INTERVAL=${METRICS_INTERVAL_SECONDS}${SH_CONT}nohup ${dest} > /tmp/infrahub-vm-agent.log 2>&1 &`,
  ].join("\n");
}

// buildAgentInstallCommand returns the copy-pasteable command for os,
// given the freshly-issued agent token and the backend's own externally-
// reachable agent-connect URL (createAgentOnlyVM's backend_url, or the
// manual-install response's backend_url). method defaults per
// defaultInstallMethodFor when not given explicitly.
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

// --- Permission / troubleshooting notes shown under every command ---

const DOCKER_LINUX_NOTES = [
  "Run it as a user who can use Docker: prefix it with sudo, or add yourself to the docker group once (sudo usermod -aG docker $USER), then log out and back in.",
  "\"Cannot connect to the Docker daemon\": start Docker first -- sudo systemctl enable --now docker.",
  "RHEL / Fedora / Rocky with SELinux: if the agent logs \"permission denied\" on /host paths, add --security-opt label=disable after docker run -d.",
];

// Notes for the VM agent command, per OS + method.
export function vmAgentPermissionNotes(os: AgentOS, method: AgentInstallMethod): string[] {
  const reach = "The machine needs outbound access to the backend URL above (check firewalls/proxies); no inbound port is needed.";
  if (method === "DOCKER") {
    if (os === "WINDOWS") {
      return [
        "Paste into PowerShell (not cmd). Start Docker Desktop first and keep it on Linux containers.",
        "\"Access is denied\" on the Docker pipe: run PowerShell as Administrator, or add your account to the local docker-users group and sign out/in.",
        "Git Bash instead of PowerShell: use the Linux command (it starts with MSYS_NO_PATHCONV=1).",
        reach,
      ];
    }
    if (os === "MAC") {
      return [
        "Start Docker Desktop first. \"permission denied ... docker.sock\": Docker Desktop → Settings → Advanced → enable \"Allow the default Docker socket to be used\".",
        reach,
      ];
    }
    return [...DOCKER_LINUX_NOTES, reach];
  }
  if (os === "LINUX") {
    return [
      "Needs sudo (root): it installs /usr/local/bin/infrahub-vm-agent and the infrahub-vm-agent systemd service. Your user must be in sudoers/wheel.",
      "Requires systemd and curl. Check it afterwards with: systemctl status infrahub-vm-agent -- logs: journalctl -u infrahub-vm-agent -f",
      reach,
    ];
  }
  if (os === "WINDOWS") {
    return [
      "Paste into PowerShell. If it reports \"Access is denied\" writing C:\\ProgramData\\InfraHub, run PowerShell as Administrator.",
      "If SmartScreen or Defender blocks the download, allow it (Unblock-File is already included) or add C:\\ProgramData\\InfraHub as an exclusion.",
      "The agent runs until sign-out; to keep it running after reboot, add it to Task Scheduler (At startup, run whether user is logged on or not).",
      reach,
    ];
  }
  return [
    "Paste into Terminal. sudo asks for your macOS password (your account must be an administrator).",
    "If macOS blocks the binary (\"cannot be opened\"), run: sudo xattr -d com.apple.quarantine /usr/local/bin/infrahub-vm-agent",
    "Grant Terminal Full Disk Access (System Settings → Privacy & Security) if disk metrics stay empty.",
    reach,
  ];
}

// Kubernetes agent.
export const K8S_PERMISSION_NOTES: string[] = [
  "kubectl must point at the cluster you want to monitor: kubectl config current-context",
  "Your kubectl user needs cluster-admin rights (the manifest creates a ClusterRole and ClusterRoleBinding). Check with: kubectl auth can-i create clusterrolebinding",
  "Nodes must be able to pull docker.io/infrahubcenter/infrahub-k8s-agent and reach the backend URL outbound. On Docker Desktop, localhost means the pod itself -- use host.docker.internal.",
  "PowerShell: replace each trailing \\ with a backtick (`).",
  "Check it with: kubectl -n infrahub-agent get pods -- logs: kubectl -n infrahub-agent logs deploy/infrahub-k8s-agent",
];

// formatShellCommand reflows a one-line `docker run ...` command from the
// backend (run_command) into one option per line, for display and copy.
// Values are already single-quoted by the backend and contain no spaces,
// so splitting on spaces is safe; each flag keeps its value on its line.
export function formatShellCommand(cmd: string): string {
  const tokens = cmd.trim().split(/\s+/);
  const runIdx = tokens.findIndex((t, i) => t === "run" && tokens[i - 1] === "docker");
  if (runIdx < 0) return cmd;
  const lines: string[] = [tokens.slice(0, runIdx + 1).join(" ")];
  let i = runIdx + 1;
  // Keep a leading -d on the first line.
  if (tokens[i] === "-d") {
    lines[0] += " -d";
    i++;
  }
  while (i < tokens.length) {
    const t = tokens[i];
    const takesValue = t.startsWith("-") && !t.includes("=") && i + 1 < tokens.length && !tokens[i + 1].startsWith("-");
    if (takesValue && i + 2 <= tokens.length - 1) {
      lines.push(`${t} ${tokens[i + 1]}`);
      i += 2;
    } else {
      lines.push(t);
      i++;
    }
  }
  return lines.join(SH_CONT);
}

// --- Docker Host agent: one command per OS / shell ---
//
// The backend returns a single POSIX `docker run` line (run_command). The
// same container runs everywhere Docker does, but each shell needs its own
// syntax -- most importantly Git Bash on Windows, which rewrites
// /var/run/docker.sock into "C:\Program Files\Git\var\..." unless
// MSYS_NO_PATHCONV=1 is set ("mkdir C:\Program Files\Git\var: Access is
// denied"). So the console parses the backend's command and re-renders it
// for the shell the operator picks.

export type DockerHostShell = "LINUX" | "MAC" | "WIN_POWERSHELL" | "WIN_CMD" | "WIN_GITBASH";

export const DOCKER_HOST_SHELL_OPTIONS: { value: DockerHostShell; label: string }[] = [
  { value: "LINUX", label: "Linux (bash)" },
  { value: "MAC", label: "macOS (Terminal)" },
  { value: "WIN_POWERSHELL", label: "Windows (PowerShell)" },
  { value: "WIN_CMD", label: "Windows (Command Prompt)" },
  { value: "WIN_GITBASH", label: "Windows (Git Bash)" },
];

// Best guess from the browser the admin is using right now; they can
// always switch in the picker (the target machine may differ).
export function detectDockerHostShell(): DockerHostShell {
  if (typeof navigator === "undefined") return "LINUX";
  const ua = `${navigator.userAgent} ${navigator.platform ?? ""}`.toLowerCase();
  if (ua.includes("win")) return "WIN_POWERSHELL";
  if (ua.includes("mac")) return "MAC";
  return "LINUX";
}

export type DockerRunParts = { backendUrl: string; token: string; image: string };

// Pulls the backend URL, token and image out of the backend's run_command,
// so the image tag stays whatever the API currently pins.
export function parseDockerHostRunCommand(cmd: string): DockerRunParts | null {
  const url = cmd.match(/INFRAHUB_BACKEND_URL='([^']*)'/)?.[1] ?? cmd.match(/INFRAHUB_BACKEND_URL=(\S+)/)?.[1];
  const token = cmd.match(/INFRAHUB_AGENT_TOKEN='([^']*)'/)?.[1] ?? cmd.match(/INFRAHUB_AGENT_TOKEN=(\S+)/)?.[1];
  const image = cmd.trim().split(/\s+/).pop();
  if (!url || !token || !image || image.startsWith("-")) return null;
  return { backendUrl: url, token, image };
}

function cmdQuote(s: string): string {
  // Command Prompt has no single quotes; wrap the whole KEY=value in "".
  return `"${s.replace(/"/g, '\\"')}"`;
}

export function buildDockerHostCommand(shell: DockerHostShell, parts: DockerRunParts): string {
  const mounts = ["-v /var/run/docker.sock:/var/run/docker.sock", "-v /proc:/host/proc:ro", "-v /:/host/root:ro"];
  const base = ["--name infrahub-docker-agent", "--restart unless-stopped", ...mounts];
  switch (shell) {
    case "WIN_POWERSHELL":
      return [
        "docker run -d",
        ...base,
        `-e INFRAHUB_BACKEND_URL=${psQuote(parts.backendUrl)}`,
        `-e INFRAHUB_AGENT_TOKEN=${psQuote(parts.token)}`,
        parts.image,
      ].join(PS_CONT);
    case "WIN_CMD":
      return [
        "docker run -d",
        ...base,
        `-e ${cmdQuote(`INFRAHUB_BACKEND_URL=${parts.backendUrl}`)}`,
        `-e ${cmdQuote(`INFRAHUB_AGENT_TOKEN=${parts.token}`)}`,
        parts.image,
      ].join(" ^\n  ");
    case "WIN_GITBASH":
      return [
        "MSYS_NO_PATHCONV=1 docker run -d",
        ...base,
        `-e INFRAHUB_BACKEND_URL=${posixQuote(parts.backendUrl)}`,
        `-e INFRAHUB_AGENT_TOKEN=${posixQuote(parts.token)}`,
        parts.image,
      ].join(SH_CONT);
    default:
      return [
        "docker run -d",
        ...base,
        `-e INFRAHUB_BACKEND_URL=${posixQuote(parts.backendUrl)}`,
        `-e INFRAHUB_AGENT_TOKEN=${posixQuote(parts.token)}`,
        parts.image,
      ].join(SH_CONT);
  }
}

const DOCKER_HOST_REACH = "The machine needs outbound access to the backend URL in the command; no inbound port is needed.";
const DOCKER_HOST_REINSTALL = "Already installed once? Remove the old container first: docker rm -f infrahub-docker-agent";

export function dockerHostPermissionNotes(shell: DockerHostShell): string[] {
  switch (shell) {
    case "LINUX":
      return [...DOCKER_LINUX_NOTES, DOCKER_HOST_REINSTALL, DOCKER_HOST_REACH];
    case "MAC":
      return [
        "Start Docker Desktop first and wait until it says it is running.",
        "\"permission denied ... docker.sock\": Docker Desktop → Settings → Advanced → enable \"Allow the default Docker socket to be used\" (needs your admin password).",
        "Host metrics describe Docker Desktop's Linux VM, not the Mac itself; container metrics and logs are exact.",
        DOCKER_HOST_REINSTALL,
        DOCKER_HOST_REACH,
      ];
    case "WIN_POWERSHELL":
      return [
        "Paste into Windows PowerShell or PowerShell 7 -- not Command Prompt, not Git Bash (each has its own option above).",
        "Start Docker Desktop first and keep it on Linux containers (tray icon → \"Switch to Linux containers\" if it offers that).",
        "\"Access is denied\" / \"permission denied ... docker_engine\": run PowerShell as Administrator, or add your account to the local docker-users group (Computer Management → Local Users and Groups) and sign out/in.",
        "Host metrics describe Docker Desktop's WSL 2 VM, not Windows itself; container metrics and logs are exact.",
        DOCKER_HOST_REINSTALL,
        DOCKER_HOST_REACH,
      ];
    case "WIN_CMD":
      return [
        "Paste into Command Prompt (cmd.exe). Lines end with ^ -- paste the whole block at once.",
        "Start Docker Desktop first and keep it on Linux containers.",
        "\"Access is denied\": open Command Prompt with \"Run as administrator\", or add your account to the local docker-users group and sign out/in.",
        DOCKER_HOST_REINSTALL,
        DOCKER_HOST_REACH,
      ];
    case "WIN_GITBASH":
      return [
        "Keep the MSYS_NO_PATHCONV=1 prefix: without it Git Bash rewrites /var/run/docker.sock into C:\\Program Files\\Git\\var\\... and Docker fails with \"mkdir C:\\Program Files\\Git\\var: Access is denied\".",
        "Start Docker Desktop first and keep it on Linux containers.",
        "\"Access is denied\" on the Docker pipe: run Git Bash as Administrator, or add your account to the local docker-users group and sign out/in.",
        DOCKER_HOST_REINSTALL,
        DOCKER_HOST_REACH,
      ];
  }
}
