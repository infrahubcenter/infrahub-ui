import type { DockerContainerHealth, DockerContainerStatus, DockerDaemonStatus } from "@/lib/api";

// Mirrors health-badge.tsx's palette/shape -- a dedicated small badge per
// Docker-specific status dimension, since none of these share vocabulary
// with ResourceStatus/HealthStatus (a RUNNING daemon says nothing about
// container health, and vice versa).

const DAEMON_STYLES: Record<DockerDaemonStatus, string> = {
  RUNNING: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  INSTALLED: "bg-amber-50 text-amber-700 ring-amber-600/20",
  PERMISSION_DENIED: "bg-red-50 text-red-700 ring-red-600/20",
  UNAVAILABLE: "bg-red-50 text-red-700 ring-red-600/20",
  NOT_INSTALLED: "bg-slate-100 text-slate-500 ring-slate-400/20",
  UNKNOWN: "bg-slate-100 text-slate-500 ring-slate-400/20",
};

const DAEMON_LABEL: Record<DockerDaemonStatus, string> = {
  RUNNING: "Running",
  INSTALLED: "Daemon Not Running",
  PERMISSION_DENIED: "Permission Denied",
  UNAVAILABLE: "Unavailable",
  NOT_INSTALLED: "Not Installed",
  UNKNOWN: "Unknown",
};

export function DockerDaemonStatusBadge({ status }: { status: DockerDaemonStatus }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${DAEMON_STYLES[status]}`}>
      {DAEMON_LABEL[status]}
    </span>
  );
}

const CONTAINER_STATUS_STYLES: Record<DockerContainerStatus, string> = {
  RUNNING: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  RESTARTING: "bg-amber-50 text-amber-700 ring-amber-600/20",
  CREATED: "bg-sky-50 text-sky-700 ring-sky-600/20",
  EXITED: "bg-slate-100 text-slate-600 ring-slate-400/20",
  PAUSED: "bg-amber-50 text-amber-700 ring-amber-600/20",
  DEAD: "bg-red-50 text-red-700 ring-red-600/20",
  REMOVING: "bg-slate-100 text-slate-500 ring-slate-400/20",
  UNKNOWN: "bg-slate-100 text-slate-500 ring-slate-400/20",
};

export function DockerContainerStatusBadge({ status }: { status: DockerContainerStatus }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium capitalize ring-1 ring-inset ${CONTAINER_STATUS_STYLES[status]}`}>
      {status.toLowerCase()}
    </span>
  );
}

const HEALTH_STYLES: Record<DockerContainerHealth, string> = {
  HEALTHY: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  UNHEALTHY: "bg-red-50 text-red-700 ring-red-600/20",
  STARTING: "bg-amber-50 text-amber-700 ring-amber-600/20",
  NO_HEALTHCHECK: "bg-slate-100 text-slate-500 ring-slate-400/20",
  UNKNOWN: "bg-slate-100 text-slate-500 ring-slate-400/20",
};

const HEALTH_LABEL: Record<DockerContainerHealth, string> = {
  HEALTHY: "Healthy",
  UNHEALTHY: "Unhealthy",
  STARTING: "Starting",
  NO_HEALTHCHECK: "No Healthcheck",
  UNKNOWN: "Unknown",
};

export function DockerHealthBadge({ health }: { health: DockerContainerHealth }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${HEALTH_STYLES[health]}`}>
      {HEALTH_LABEL[health]}
    </span>
  );
}
