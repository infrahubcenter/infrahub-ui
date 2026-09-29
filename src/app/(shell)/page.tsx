"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Boxes, Server, Database, Archive, Bell, Container, Network } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useAuth } from "@/components/auth/auth-provider";
import { OperationStatusBadge } from "@/components/infrastructure/operation-status-badge";
import { SeverityBadge } from "@/components/infrastructure/severity-badge";
import {
  getAlertsSummary,
  getObjectStorageSummary,
  listAlerts,
  listDatabaseOperationsGlobal,
  listDockerHosts,
  listK8sClusters,
  listResources,
  listWorkspaces,
  type Alert,
  type AlertsSummary,
  type DatabaseOperation,
  type ObjectStorageSummary,
  isAdminRole,
} from "@/lib/api";

type CardTheme = {
  badgeBg: string;
  badgeText: string;
  border: string;
};

const CARD_THEMES: CardTheme[] = [
  { badgeBg: "bg-indigo-100", badgeText: "text-indigo-600", border: "border-t-indigo-400" },
  { badgeBg: "bg-sky-100", badgeText: "text-sky-600", border: "border-t-sky-400" },
  { badgeBg: "bg-emerald-100", badgeText: "text-emerald-600", border: "border-t-emerald-400" },
  { badgeBg: "bg-amber-100", badgeText: "text-amber-600", border: "border-t-amber-400" },
  { badgeBg: "bg-cyan-100", badgeText: "text-cyan-600", border: "border-t-cyan-400" },
  { badgeBg: "bg-violet-100", badgeText: "text-violet-600", border: "border-t-violet-400" },
];

type SummaryCard = {
  label: string;
  icon: LucideIcon;
  value: number | null;
  href?: string;
  theme: CardTheme;
};

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

// The dashboard is an ADMIN-oriented, infrastructure-wide overview.
// Members are redirected to /workspaces (formerly a dedicated /my-access
// summary page, removed since every resource list -- VMs/Databases/
// Object Storage/etc. -- already scopes itself to what the viewer can
// see, making a separate summary redundant) -- the spec is explicit that
// a member's first-login landing must never be an infrastructure-wide
// view (Step 3 §36), and dashboard counts must never be global totals for
// a member even if they somehow reached this page (Step 4 §28) -- there
// is no MEMBER-facing rendering path here at all.
export default function DashboardPage() {
  const { user } = useAuth();
  const router = useRouter();

  const [workspaceCount, setWorkspaceCount] = useState<number | null>(null);
  const [vmCount, setVmCount] = useState<number | null>(null);
  const [databaseCount, setDatabaseCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [recentOperations, setRecentOperations] = useState<DatabaseOperation[] | null>(null);
  const [alertsSummary, setAlertsSummary] = useState<AlertsSummary | null>(null);
  const [recentAlerts, setRecentAlerts] = useState<Alert[] | null>(null);
  const [storageSummary, setStorageSummary] = useState<ObjectStorageSummary | null>(null);
  const [dockerHostCount, setDockerHostCount] = useState<number | null>(null);
  const [k8sClusterCount, setK8sClusterCount] = useState<number | null>(null);

  useEffect(() => {
    if (user && user.role === "MEMBER") {
      router.replace("/workspaces");
    }
  }, [user, router]);

  useEffect(() => {
    if (!isAdminRole(user?.role)) return;
    Promise.all([listWorkspaces(), listResources({ resource_type: "DATABASE" })])
      .then(([workspaces, databases]) => {
        setWorkspaceCount(workspaces.workspaces.length);
        setVmCount(workspaces.workspaces.reduce((sum, w) => sum + w.vm_count, 0));
        setDatabaseCount(databases.resources.length);
      })
      .catch(() => setError("Failed to load dashboard counts."));
  }, [user]);

  // Step 17: object storage health-bucketed counts, scoped server-side to
  // the caller's authorized set (an Admin sees the global totals) --
  // mirrors the Alerts summary widget's shape/intent exactly.
  useEffect(() => {
    if (!isAdminRole(user?.role)) return;
    getObjectStorageSummary()
      .then(setStorageSummary)
      .catch(() => setStorageSummary(null));
  }, [user]);

  // Docker Hosts / Kubernetes Clusters -- just for visibility on the
  // dashboard, mirroring the Workspaces/VMs/Databases/Object Storage
  // cards' own "how many do you have" shape (a live connected count
  // belongs on the Monitoring dashboards themselves, not squeezed into a
  // single top-level number here).
  useEffect(() => {
    if (!isAdminRole(user?.role)) return;
    listDockerHosts()
      .then((res) => setDockerHostCount(res.hosts.length))
      .catch(() => setDockerHostCount(null));
    listK8sClusters()
      .then((res) => setK8sClusterCount(res.clusters.length))
      .catch(() => setK8sClusterCount(null));
  }, [user]);

  // Small, Admin-only nice-to-have (Step 14) -- there's no unified
  // cross-cutting operations page (reboot/update operations each have
  // their own dedicated list page), so this is a compact widget rather
  // than a new page of its own.
  useEffect(() => {
    if (!isAdminRole(user?.role)) return;
    listDatabaseOperationsGlobal({ limit: 5 })
      .then((res) => setRecentOperations(res.operations))
      .catch(() => setRecentOperations([]));
  }, [user]);

  // Step 16: alert summary counts (scoped server-side to the caller's
  // authorized resources -- an Admin sees the global totals) and a compact
  // recent-active-alerts list, mirroring the Recent Database Operations
  // widget's shape.
  useEffect(() => {
    if (!isAdminRole(user?.role)) return;
    getAlertsSummary()
      .then(setAlertsSummary)
      .catch(() => setAlertsSummary(null));
  }, [user]);

  useEffect(() => {
    if (!isAdminRole(user?.role)) return;
    listAlerts({ status: "ACTIVE", limit: 5 })
      .then((res) => setRecentAlerts(res.alerts))
      .catch(() => setRecentAlerts([]));
  }, [user]);

  if (user?.role === "MEMBER") {
    return null;
  }

  const cards: SummaryCard[] = [
    { label: "Workspaces", icon: Boxes, value: workspaceCount, href: "/workspaces", theme: CARD_THEMES[0] },
    { label: "VMs", icon: Server, value: vmCount, href: "/vms", theme: CARD_THEMES[1] },
    { label: "Databases", icon: Database, value: databaseCount, theme: CARD_THEMES[2] },
    { label: "Object Storage", icon: Archive, value: storageSummary?.total ?? null, href: "/object-storage", theme: CARD_THEMES[3] },
    { label: "Docker Hosts", icon: Container, value: dockerHostCount, href: "/monitoring/docker", theme: CARD_THEMES[4] },
    { label: "K8s Clusters", icon: Network, value: k8sClusterCount, href: "/monitoring/kubernetes", theme: CARD_THEMES[5] },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="overflow-hidden rounded-xl bg-linear-to-r from-indigo-600 via-sky-600 to-emerald-500 p-6 text-white shadow-sm">
        <h2 className="text-xl font-semibold">
          {greeting()}
          {user?.name ? `, ${user.name}` : ""}
        </h2>
        <p className="mt-1 text-sm text-white/80">Here&apos;s a real-time look at your infrastructure.</p>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {cards.map(({ label, icon: Icon, value, href, theme }) => {
          const card = (
            <div
              className={`rounded-lg border border-t-4 border-slate-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md ${theme.border}`}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-slate-500">{label}</span>
                <span className={`flex h-8 w-8 items-center justify-center rounded-full ${theme.badgeBg}`}>
                  <Icon className={`h-4 w-4 ${theme.badgeText}`} />
                </span>
              </div>
              <div className="mt-2 text-2xl font-semibold text-slate-900">{value ?? "—"}</div>
            </div>
          );
          return href ? (
            <Link key={label} href={href}>
              {card}
            </Link>
          ) : (
            <div key={label}>{card}</div>
          );
        })}
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-rose-100">
              <Bell className="h-3.5 w-3.5 text-rose-600" />
            </span>
            Infrastructure Health
          </h3>
          <Link href="/alerts" className="text-xs text-sky-700 hover:underline">
            View all alerts
          </Link>
        </div>
        {alertsSummary ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Link
              href="/alerts?severity=CRITICAL&status=ACTIVE"
              className="rounded-md border border-slate-200 p-3 transition-colors hover:border-red-300 hover:bg-red-50"
            >
              <div className="text-xs text-slate-500">Critical</div>
              <div className="mt-1 text-2xl font-semibold text-red-600">{alertsSummary.critical}</div>
            </Link>
            <Link
              href="/alerts?severity=WARNING&status=ACTIVE"
              className="rounded-md border border-slate-200 p-3 transition-colors hover:border-amber-300 hover:bg-amber-50"
            >
              <div className="text-xs text-slate-500">Warning</div>
              <div className="mt-1 text-2xl font-semibold text-amber-600">{alertsSummary.warning}</div>
            </Link>
            <Link
              href="/alerts?status=ACKNOWLEDGED"
              className="rounded-md border border-slate-200 p-3 transition-colors hover:border-sky-300 hover:bg-sky-50"
            >
              <div className="text-xs text-slate-500">Acknowledged</div>
              <div className="mt-1 text-2xl font-semibold text-sky-600">{alertsSummary.acknowledged}</div>
            </Link>
            <Link
              href="/alerts?status=RESOLVED"
              className="rounded-md border border-slate-200 p-3 transition-colors hover:border-emerald-300 hover:bg-emerald-50"
            >
              <div className="text-xs text-slate-500">Resolved Today</div>
              <div className="mt-1 text-2xl font-semibold text-emerald-600">{alertsSummary.resolved_today}</div>
            </Link>
          </div>
        ) : (
          <p className="text-sm text-slate-500">Loading&hellip;</p>
        )}

        {recentAlerts && recentAlerts.length > 0 && (
          <div className="mt-4 border-t border-slate-100 pt-3">
            <h4 className="mb-2 text-xs font-medium text-slate-500">Recent Active Alerts</h4>
            <ul className="flex flex-col gap-2">
              {recentAlerts.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <Link href={`/alerts/${a.id}`} className="font-medium text-sky-700 hover:underline">
                    {a.resource_name} &middot; {a.title}
                  </Link>
                  <SeverityBadge severity={a.severity} />
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {recentOperations && recentOperations.length > 0 && (
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100">
              <Database className="h-3.5 w-3.5 text-emerald-600" />
            </span>
            Recent Database Operations
          </h3>
            <Link href="/databases" className="text-xs text-sky-700 hover:underline">
              View databases
            </Link>
          </div>
          <ul className="flex flex-col gap-2">
            {recentOperations.map((op) => (
              <li key={op.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <Link
                  href={`/databases/${op.database_id}/operations/${op.id}`}
                  className="font-medium text-sky-700 hover:underline"
                >
                  {op.database_name ?? op.database_id} &middot; {op.operation_type.replace(/_/g, " ")}
                </Link>
                <OperationStatusBadge status={op.status} />
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-100">
              <Archive className="h-3.5 w-3.5 text-amber-600" />
            </span>
            Object Storage
          </h3>
          <Link href="/object-storage" className="text-xs text-sky-700 hover:underline">
            View object storage
          </Link>
        </div>
        {storageSummary ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Link
              href="/object-storage"
              className="rounded-md border border-slate-200 p-3 transition-colors hover:border-emerald-300 hover:bg-emerald-50"
            >
              <div className="text-xs text-slate-500">Healthy</div>
              <div className="mt-1 text-2xl font-semibold text-emerald-600">{storageSummary.healthy}</div>
            </Link>
            <Link
              href="/object-storage"
              className="rounded-md border border-slate-200 p-3 transition-colors hover:border-amber-300 hover:bg-amber-50"
            >
              <div className="text-xs text-slate-500">Warning</div>
              <div className="mt-1 text-2xl font-semibold text-amber-600">{storageSummary.warning}</div>
            </Link>
            <Link
              href="/object-storage"
              className="rounded-md border border-slate-200 p-3 transition-colors hover:border-red-300 hover:bg-red-50"
            >
              <div className="text-xs text-slate-500">Critical</div>
              <div className="mt-1 text-2xl font-semibold text-red-600">{storageSummary.critical}</div>
            </Link>
            <Link
              href="/object-storage"
              className="rounded-md border border-slate-200 p-3 transition-colors hover:border-slate-300 hover:bg-slate-50"
            >
              <div className="text-xs text-slate-500">Unavailable</div>
              <div className="mt-1 text-2xl font-semibold text-slate-600">{storageSummary.unavailable}</div>
            </Link>
          </div>
        ) : (
          <p className="text-sm text-slate-500">Loading&hellip;</p>
        )}
      </div>
    </div>
  );
}
