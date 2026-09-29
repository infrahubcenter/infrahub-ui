"use client";

import { useState, type ReactNode } from "react";
import {
  Archive,
  Bell,
  BookOpen,
  Boxes,
  Container,
  CreditCard,
  Cpu,
  Database,
  FileText,
  KeySquare,
  Radio,
  ScrollText,
  Settings as SettingsIcon,
  Users,
  type LucideIcon,
} from "lucide-react";
import { useAuth } from "@/components/auth/auth-provider";
import { isAdminRole } from "@/lib/api";
import { cn } from "@/lib/utils";

type Topic = {
  id: string;
  label: string;
  icon: LucideIcon;
  adminOnly?: boolean;
  content: ReactNode;
};

function P({ children }: { children: ReactNode }) {
  return <p className="text-sm leading-6 text-slate-600 dark:text-slate-300">{children}</p>;
}
function H({ children }: { children: ReactNode }) {
  return <h3 className="mt-5 text-sm font-semibold text-slate-900 dark:text-slate-100">{children}</h3>;
}
function Ul({ children }: { children: ReactNode }) {
  return <ul className="ml-4 list-disc space-y-1.5 text-sm leading-6 text-slate-600 dark:text-slate-300">{children}</ul>;
}

const TOPICS: Topic[] = [
  {
    id: "getting-started",
    label: "Getting Started",
    icon: BookOpen,
    content: (
      <>
        <P>
          Infra Hub Center is a single control center for everything your team runs: Virtual Machines, Databases,
          Object Storage, and Docker/Kubernetes workloads. Everything lives under a <strong>Workspace</strong> --
          that&rsquo;s the boundary access is granted against.
        </P>
        <H>Roles</H>
        <Ul>
          <li><strong>Owner</strong> -- full control, including Sign-in Methods (GitHub/Google/SMTP) and inviting other Owners/Admins.</li>
          <li><strong>Admin</strong> -- full control over infrastructure, users, and access grants.</li>
          <li><strong>Member</strong> -- sees only what&rsquo;s explicitly granted: a Workspace membership, a direct resource grant, or a Monitoring/Logs access grant.</li>
        </Ul>
        <H>Around the app</H>
        <Ul>
          <li>The Sun/Moon icon next to the notification bell (top right) switches Light/Dark instantly -- the full System/Light/Dark preference lives in Settings.</li>
          <li>The bell shows recent notifications; unread ones are highlighted.</li>
          <li>Every list in this app (VMs, Databases, folders, dashboards, users) only ever shows what your role and grants actually allow -- the backend re-checks this independently of what the sidebar happens to show.</li>
        </Ul>
      </>
    ),
  },
  {
    id: "workspaces",
    label: "Workspaces",
    icon: Boxes,
    content: (
      <>
        <P>Every VM, Database, Object Storage, Docker Host, and Kubernetes cluster belongs to exactly one Workspace.</P>
        <H>How it&rsquo;s used</H>
        <Ul>
          <li>An Admin creates a Workspace, then adds resources to it as they&rsquo;re registered.</li>
          <li>Adding a Member to a Workspace gives them visibility into everything currently inside it -- this is the broadest, simplest way to grant access.</li>
          <li>A Workspace can be deactivated once it holds nothing (every VM/Database/Object Storage inside it must be moved or removed first).</li>
        </Ul>
      </>
    ),
  },
  {
    id: "vms",
    label: "Compute",
    icon: Cpu,
    content: (
      <>
        <P>The Compute area has three parts, matching the sidebar&rsquo;s own grouping.</P>
        <H>Compute Inventory</H>
        <Ul>
          <li>Register a VM with its address and an SSH credential -- this is what every other feature (Console, package scans, Docker discovery, updates) connects through.</li>
          <li>Open Console for a real interactive terminal in the browser (xterm.js over a WebSocket) -- choose a saved key or upload a key for just that session (never stored). Disconnecting always requires choosing a key again next time.</li>
          <li>A VM&rsquo;s own Docker section shows its containers/images if Docker is installed there.</li>
        </Ul>
        <H>Host Metrics &amp; Logs</H>
        <P>Pick a VM to see its resource history (CPU/memory/disk/network) collected by the periodic SSH-based monitor.</P>
        <H>Patch Management</H>
        <P>OS/package update plans, reboot handling, and the &ldquo;Installed Since Onboarding&rdquo; view -- packages that showed up after this VM was first registered, separate from externally-installed packages (pip/npm/gem/snap).</P>
      </>
    ),
  },
  {
    id: "databases",
    label: "Database Observability",
    icon: Database,
    content: (
      <>
        <P>Connect a standalone database (self-hosted or managed/RDS-style) for monitoring and, with the right permission, browsing.</P>
        <H>How it&rsquo;s used</H>
        <Ul>
          <li>An Admin registers the connection (host/port/credentials) and turns monitoring on.</li>
          <li>The detail page shows connection health, recent operations, and (if granted database.browser) a live table browser.</li>
          <li>Access is granted the same way as VMs -- via Workspace membership or a direct grant on that one database.</li>
        </Ul>
      </>
    ),
  },
  {
    id: "object-storage",
    label: "Object Storage (S3)",
    icon: Archive,
    content: (
      <>
        <P>Connect an S3-compatible bucket (AWS S3, DigitalOcean Spaces, MinIO, etc.) to monitor its health and browse its contents.</P>
        <H>How it&rsquo;s used</H>
        <Ul>
          <li>Configure once with endpoint/region/bucket/credentials -- Edit Connection lets you fix any of these later without recreating the resource.</li>
          <li>The Browser tab (if granted) lists real folders and objects with sizes -- a folder&rsquo;s total size is computed on demand, capped to a bounded scan so it never runs unbounded on a huge bucket.</li>
          <li>Connection/health status reflects a real, periodic round trip to the bucket, not just whether credentials look well-formed.</li>
        </Ul>
      </>
    ),
  },
  {
    id: "configure-observability",
    label: "Agents & Integrations",
    icon: Radio,
    adminOnly: true,
    content: (
      <>
        <P>
          This is the one-time setup step before Docker/Kubernetes Monitoring or Logs can show anything for a given
          host or cluster -- it installs a small agent that reports back over a WebSocket, rather than this backend
          reaching in over SSH.
        </P>
        <H>Docker Host Onboarding</H>
        <P>
          Register a Docker Host (a plain machine running Docker, no VM record needed), then copy the generated
          one-line <code>docker run</code> command and run it on that machine. It needs no SSH access at all --
          just the Docker socket. Regenerating the token requires reinstalling with the new command.
        </P>
        <H>Kubernetes Cluster Onboarding</H>
        <P>
          Register a cluster, then apply the generated agent manifest with <code>kubectl</code>. Optionally restrict
          discovery to one namespace -- leave it blank to discover everything, since a namespace filter that
          doesn&rsquo;t match a real namespace silently finds nothing (an easy misconfiguration to accidentally hit).
        </P>
      </>
    ),
  },
  {
    id: "monitoring",
    label: "Infrastructure Monitoring",
    icon: Container,
    content: (
      <>
        <P>
          Cross-host/cross-cluster live dashboards, organized into folders. Each dashboard is bound to exactly one
          Docker Host (or VM) or one Kubernetes cluster, set once at creation.
        </P>
        <H>How it&rsquo;s used</H>
        <Ul>
          <li>Create a folder, then a dashboard inside it, picking the target host/cluster.</li>
          <li>A Docker dashboard shows containers, images/volumes/networks/build-cache (click through for full detail), and -- for a Docker Host specifically -- the underlying machine&rsquo;s own CPU/memory/load/disk, distinct from the containers-only totals.</li>
          <li>A Kubernetes dashboard shows nodes, pods, and cluster-wide CPU/memory/storage totals.</li>
          <li>The refresh control (Live/10s/30s/1m/5m/Custom) and Refresh Now are per-dashboard and change without reopening any setup wizard.</li>
          <li>Configure (pencil icon) lets you rename a dashboard or change what it tracks later -- add a container to an existing dashboard instead of rebuilding it.</li>
        </Ul>
      </>
    ),
  },
  {
    id: "logs",
    label: "Log Management",
    icon: FileText,
    content: (
      <>
        <P>Live-tailed logs, organized into the same kind of folders/dashboards as Monitoring, just pointed at log streams instead of metrics.</P>
        <H>How it&rsquo;s used</H>
        <Ul>
          <li>Pick a container or pod on the left to stream its logs live -- lines are colorized and badged by severity.</li>
          <li>Expand to full screen (top-right icon) or drag the handle under the log panel to resize it -- both work the same way on VM Console.</li>
          <li>Reconnect restarts the stream without losing your place in the container/pod list; Disconnect just stops it.</li>
        </Ul>
      </>
    ),
  },
  {
    id: "alerts",
    label: "Alerting & Incidents",
    icon: Bell,
    content: (
      <>
        <P>Threshold-based alert rules on collected metrics (CPU, memory, disk, etc.), with in-app notifications.</P>
        <H>How it&rsquo;s used</H>
        <Ul>
          <li>Create a rule on a resource with a metric, condition, and threshold -- an optional recovery threshold avoids rapid flapping.</li>
          <li>An active alert can be acknowledged or suppressed for a period; critical alerts can&rsquo;t be muted from Settings.</li>
          <li>Settings &gt; Personal lets each person mute non-critical notification categories for themselves.</li>
        </Ul>
      </>
    ),
  },
  {
    id: "access-grants",
    label: "Access Control (RBAC)",
    icon: KeySquare,
    adminOnly: true,
    content: (
      <>
        <P>
          View-only access to the Docker/Kubernetes Monitoring and Logs sections, independent of a Workspace
          membership or a direct VM grant.
        </P>
        <H>Scopes, broadest to narrowest</H>
        <Ul>
          <li><strong>Workspace</strong> -- every current and future Docker Host/cluster in that Workspace.</li>
          <li><strong>Resource</strong> -- one specific host or cluster.</li>
          <li><strong>Folder</strong> -- every dashboard filed under one Monitoring/Logs folder, dynamically (adding a dashboard to that folder later extends access automatically).</li>
          <li><strong>Dashboard</strong> -- exactly one dashboard.</li>
        </Ul>
        <P>Grant docker.monitor/docker.logs or k8s.monitor/k8s.logs separately -- a Member can have one without the other.</P>
      </>
    ),
  },
  {
    id: "users",
    label: "Identity & Users",
    icon: Users,
    adminOnly: true,
    content: (
      <>
        <P>Invite and manage every account: role, active/inactive status, and a one-time temporary password shown at creation.</P>
        <H>How it&rsquo;s used</H>
        <Ul>
          <li>There&rsquo;s always at least one active Admin/Owner -- the last one can&rsquo;t be demoted or deactivated.</li>
          <li>Deactivating a user blocks sign-in immediately without deleting their history (audit entries, past operations).</li>
        </Ul>
      </>
    ),
  },
  {
    id: "audit-logs",
    label: "Audit Trail",
    icon: ScrollText,
    adminOnly: true,
    content: (
      <>
        <P>A record of every security-relevant action: logins, role changes, access grants, configuration edits, and infrastructure operations.</P>
        <P>Console sessions and log streams are logged as open/close events only -- never their actual content.</P>
      </>
    ),
  },
  {
    id: "billing",
    label: "Plans & Billing",
    icon: CreditCard,
    adminOnly: true,
    content: (
      <>
        <P>Your active subscription plan, how much of each plan limit is in use, and what the other plans include.</P>
        <H>How it&rsquo;s used</H>
        <Ul>
          <li>Usage meters count VMs, Databases, Object Storage buckets, Docker Hosts, Kubernetes clusters, and Users against the plan&rsquo;s quota.</li>
          <li>A warning appears when any resource is over its limit -- upgrade from the plan cards or Compare plans.</li>
          <li>The active plan is set per deployment (NEXT_PUBLIC_INFRAHUB_PLAN); the platform version is shown here and at the bottom of the sidebar.</li>
        </Ul>
      </>
    ),
  },
  {
    id: "settings",
    label: "Settings",
    icon: SettingsIcon,
    content: (
      <>
        <H>Personal (everyone)</H>
        <Ul>
          <li>Display name, theme (System/Light/Dark), timezone, and date format.</li>
          <li>Change your own password -- requires the current one.</li>
          <li>Mute non-critical notification categories for yourself.</li>
        </Ul>
        <H>Platform &amp; Security (Admin/Owner)</H>
        <P>A read-only echo of deployment-time configuration (monitoring intervals, retention, etc.), plus Sign-in Methods (GitHub/Google/SMTP) for an Owner specifically.</P>
      </>
    ),
  },
];

export default function DocsPage() {
  const { user } = useAuth();
  const isAdmin = isAdminRole(user?.role);
  const visibleTopics = TOPICS.filter((t) => !t.adminOnly || isAdmin);
  const [activeId, setActiveId] = useState(visibleTopics[0]?.id ?? "");
  const active = visibleTopics.find((t) => t.id === activeId) ?? visibleTopics[0];

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Documentation</h2>
        <p className="text-sm text-slate-500">What each section of this platform does, and how to use it.</p>
      </div>

      <div className="flex flex-col gap-4 md:flex-row">
        <nav className="flex shrink-0 flex-row gap-1 overflow-x-auto md:w-64 md:flex-col md:overflow-visible">
          {visibleTopics.map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setActiveId(t.id)}
                className={cn(
                  "flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-left text-sm whitespace-nowrap md:whitespace-normal",
                  active?.id === t.id
                    ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
                    : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {t.label}
              </button>
            );
          })}
        </nav>

        <div className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center gap-2">
            {active && <active.icon className="h-5 w-5 text-slate-400" />}
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">{active?.label}</h3>
          </div>
          <div className="mt-3">{active?.content}</div>
        </div>
      </div>
    </div>
  );
}
