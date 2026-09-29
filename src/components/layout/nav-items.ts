import {
  LayoutDashboard,
  Users,
  ScrollText,
  Settings,
  KeySquare,
  Bell,
  Container,
  FileText,
  Radio,
  Boxes,
  Cpu,
  Database,
  Archive,
  BookOpen,
  CreditCard,
  type LucideIcon,
} from "lucide-react";
import type { Role } from "@/lib/api";

export type NavChild = {
  label: string;
  href: string;
};

// A plain item has its own href. A group (Docker, Kubernetes) has no href
// of its own -- it only expands/collapses -- and lists its own pages as
// children, each independently link-able and independently access-
// controlled server-side (a member might have Docker Monitor but not
// Docker Logs, or vice versa; see docker.monitor/docker.logs and
// k8s.monitor/k8s.logs access grants).
export type NavItem = {
  label: string;
  icon: LucideIcon;
  href?: string;
  children?: NavChild[];
};

// The backend independently authorizes every request regardless of what
// the sidebar shows -- see docs/authorization.md. This list only decides
// what's convenient to click, never what's accessible.
//
// Labels follow the industry-standard names DevOps tooling uses for each
// capability (Compute Inventory, Patch Management, Log Management, ...),
// so the sidebar reads the way an SRE would describe the platform. Child
// labels are self-descriptive on their own -- the header shows the child
// label alone, without its group prefix.
const COMPUTE_GROUP: NavItem = {
  label: "Compute",
  icon: Cpu,
  children: [
    // Patch Management sits right below Compute Inventory (both are SSH-VM
    // concerns -- registering a VM and running updates on it), while
    // Host Metrics & Logs is its own agent-based, VM-unrelated concern
    // (see vm-agent-configure-table.tsx's "Connect VM" -- an agent-only
    // VM never has SSH at all), so it sits last.
    { label: "Compute Inventory", href: "/vms" },
    { label: "Patch Management", href: "/vms/updates" },
    { label: "Host Metrics & Logs", href: "/vms/metrics" },
  ],
};

const MONITORING_GROUP: NavItem = {
  label: "Infrastructure Monitoring",
  icon: Container,
  children: [
    { label: "Docker Monitoring", href: "/monitoring/docker" },
    { label: "Kubernetes Monitoring", href: "/monitoring/kubernetes" },
  ],
};

const LOGS_GROUP: NavItem = {
  label: "Log Management",
  icon: FileText,
  children: [
    { label: "Docker Log Explorer", href: "/logs/docker" },
    { label: "Kubernetes Log Explorer", href: "/logs/kubernetes" },
  ],
};

export const adminNavItems: NavItem[] = [
  { label: "Operations Overview", href: "/", icon: LayoutDashboard },
  { label: "Workspaces", href: "/workspaces", icon: Boxes },
  COMPUTE_GROUP,
  { label: "Database Observability", href: "/databases", icon: Database },
  { label: "Object Storage (S3)", href: "/object-storage", icon: Archive },
  {
    label: "Agents & Integrations",
    icon: Radio,
    children: [
      { label: "Docker Host Onboarding", href: "/docker/hosts" },
      { label: "Kubernetes Cluster Onboarding", href: "/k8s/clusters" },
    ],
  },
  MONITORING_GROUP,
  LOGS_GROUP,
  { label: "Alerting & Incidents", href: "/alerts", icon: Bell },
  { label: "Identity & Users", href: "/admin/users", icon: Users },
  { label: "Access Control (RBAC)", href: "/docker/access", icon: KeySquare },
  { label: "Audit Trail", href: "/audit-logs", icon: ScrollText },
  { label: "Plans & Billing", href: "/billing", icon: CreditCard },
  { label: "Documentation", href: "/docs", icon: BookOpen },
  { label: "Settings", href: "/settings", icon: Settings },
];

export const memberNavItems: NavItem[] = [
  { label: "Operations Overview", href: "/", icon: LayoutDashboard },
  { label: "Workspaces", href: "/workspaces", icon: Boxes },
  COMPUTE_GROUP,
  { label: "Database Observability", href: "/databases", icon: Database },
  { label: "Object Storage (S3)", href: "/object-storage", icon: Archive },
  MONITORING_GROUP,
  LOGS_GROUP,
  { label: "Alerting & Incidents", href: "/alerts", icon: Bell },
  { label: "Documentation", href: "/docs", icon: BookOpen },
  { label: "Settings", href: "/settings", icon: Settings },
];

export function navItemsForRole(role: Role | undefined): NavItem[] {
  return role === "ADMIN" || role === "OWNER" ? adminNavItems : memberNavItems;
}
