// Subscription plans and their resource limits. The same tiers are
// published on the marketing site (infrahub-site/src/lib/product.ts) --
// keep the two in sync when prices or limits change.
//
// The active plan comes from the API (GET /api/license): Community unless
// the API holds a valid signed INFRAHUB_LICENSE_KEY. The API enforces the
// limits itself -- creating one more VM/database/bucket/Docker host/cluster/
// user past the plan's limit is refused -- and caps metrics/log retention.
// INFRAHUB_PLAN (lib/runtime-config.ts) is only a fallback for an older API
// without /api/license.

import { runtimeConfig } from "./runtime-config";

export type PlanId = "community" | "team" | "business" | "enterprise";

export type PlanLimitKey = "vms" | "databases" | "objectStorage" | "dockerHosts" | "k8sClusters" | "users";

export type Plan = {
  id: PlanId;
  name: string;
  /** Monthly price in Indian rupees (INR), or null for "Contact sales". */
  priceMonthly: number | null;
  /** Price per month when billed annually. */
  priceAnnual: number | null;
  tagline: string;
  /** null = unlimited. */
  limits: Record<PlanLimitKey, number | null>;
  logRetentionDays: number | null;
  metricsRetentionDays: number | null;
  features: string[];
};

export const PLAN_LIMIT_LABELS: Record<PlanLimitKey, string> = {
  vms: "Virtual Machines",
  databases: "Databases",
  objectStorage: "Object Storage Buckets",
  dockerHosts: "Docker Hosts",
  k8sClusters: "Kubernetes Clusters",
  users: "Users",
};

export const PLANS: Plan[] = [
  {
    id: "community",
    name: "Community",
    priceMonthly: 0,
    priceAnnual: 0,
    tagline: "For individuals and small labs getting started.",
    limits: { vms: 2, databases: 1, objectStorage: 1, dockerHosts: 1, k8sClusters: 1, users: 1 },
    logRetentionDays: 3,
    metricsRetentionDays: 3,
    features: ["VM inventory & web SSH console", "Docker & Kubernetes monitoring", "Live log tailing", "Threshold alerts", "Community support"],
  },
  {
    id: "team",
    name: "Team",
    priceMonthly: 3999,
    priceAnnual: 3199,
    tagline: "For growing DevOps teams running production workloads.",
    limits: { vms: 25, databases: 10, objectStorage: 5, dockerHosts: 10, k8sClusters: 3, users: 15 },
    logRetentionDays: 14,
    metricsRetentionDays: 30,
    features: ["Everything in Community", "Patch management & controlled reboots", "Database performance insights", "Email (SMTP) notifications", "Email support"],
  },
  {
    id: "business",
    name: "Business",
    priceMonthly: 15999,
    priceAnnual: 12799,
    tagline: "For organizations standardizing on one ops platform.",
    limits: { vms: 100, databases: 50, objectStorage: 25, dockerHosts: 50, k8sClusters: 15, users: null },
    logRetentionDays: 30,
    metricsRetentionDays: 90,
    features: ["Everything in Team", "GitHub & Google sign-in (SSO)", "Audit trail & access-grant scopes", "Database remediation operations", "Priority support"],
  },
  {
    id: "enterprise",
    name: "Enterprise",
    priceMonthly: null,
    priceAnnual: null,
    tagline: "For large fleets with compliance and custom needs.",
    limits: { vms: null, databases: null, objectStorage: null, dockerHosts: null, k8sClusters: null, users: null },
    logRetentionDays: null,
    metricsRetentionDays: null,
    features: ["Everything in Business", "Unlimited resources", "Custom retention", "Dedicated success engineer", "SLA & onboarding assistance"],
  },
];

export function planById(id: string | undefined): Plan {
  return PLANS.find((p) => p.id === id) ?? PLANS[0];
}

export const CURRENT_PLAN: Plan = planById(runtimeConfig().plan);

export function formatLimit(limit: number | null): string {
  return limit === null ? "Unlimited" : String(limit);
}

export function formatPrice(price: number | null): string {
  if (price === null) return "Custom";
  return price === 0 ? "Free" : `₹${price.toLocaleString("en-IN")}`;
}

// GET /api/license's limit keys -> this file's.
export const LICENSE_LIMIT_KEYS: Record<string, PlanLimitKey> = {
  vms: "vms",
  databases: "databases",
  object_storage: "objectStorage",
  docker_hosts: "dockerHosts",
  k8s_clusters: "k8sClusters",
  users: "users",
};
