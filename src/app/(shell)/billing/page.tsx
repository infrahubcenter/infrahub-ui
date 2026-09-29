"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Check, ExternalLink } from "lucide-react";
import { RouteGuard } from "@/components/auth/route-guard";
import { UsageBar } from "@/components/infrastructure/usage-bar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  listDatabases,
  listDockerHosts,
  listK8sClusters,
  listObjectStorage,
  listUsers,
  listVMs,
} from "@/lib/api";
import { APP_RELEASE_CHANNEL, APP_VERSION, MARKETING_URL } from "@/lib/branding";
import {
  CURRENT_PLAN,
  PLAN_LIMIT_LABELS,
  PLANS,
  formatLimit,
  formatPrice,
  type PlanLimitKey,
} from "@/lib/plans";
import { cn } from "@/lib/utils";

type Usage = Partial<Record<PlanLimitKey, number>>;

const LIMIT_KEYS = Object.keys(PLAN_LIMIT_LABELS) as PlanLimitKey[];
const PRICING_URL = `${MARKETING_URL}/#pricing`;

export default function BillingPage() {
  return (
    <RouteGuard requireRole="ADMIN">
      <BillingContent />
    </RouteGuard>
  );
}

function BillingContent() {
  const [usage, setUsage] = useState<Usage>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    // Each count is independent -- one failing endpoint (e.g. K8s not
    // configured) must not blank out the rest of the meters.
    const keys: PlanLimitKey[] = ["vms", "databases", "objectStorage", "dockerHosts", "k8sClusters", "users"];
    Promise.allSettled([
      listVMs().then((r) => r.vms.length),
      listDatabases().then((r) => r.total ?? r.databases.length),
      listObjectStorage().then((r) => r.total ?? r.storages.length),
      listDockerHosts().then((r) => r.hosts.length),
      listK8sClusters().then((r) => r.clusters.length),
      listUsers({ limit: 1 }).then((r) => r.total),
    ]).then((results) => {
      if (cancelled) return;
      const next: Usage = {};
      results.forEach((res, i) => {
        if (res.status === "fulfilled") next[keys[i]] = res.value;
      });
      setUsage(next);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const overLimit = LIMIT_KEYS.filter((k) => {
    const limit = CURRENT_PLAN.limits[k];
    const used = usage[k];
    return limit !== null && used !== undefined && used > limit;
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Plans &amp; Billing</h2>
          <p className="text-sm text-slate-500">Your subscription, resource usage against plan limits, and available upgrades.</p>
        </div>
        <a
          href={PRICING_URL}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          Compare plans <ExternalLink className="h-4 w-4" />
        </a>
      </div>

      {overLimit.length > 0 && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <div className="font-medium">You&rsquo;re over your {CURRENT_PLAN.name} plan limits</div>
            <div>
              {overLimit.map((k) => PLAN_LIMIT_LABELS[k]).join(", ")} exceed{overLimit.length === 1 ? "s" : ""} the included
              quota. Upgrade to keep adding resources.
            </div>
          </div>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-lg border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Current plan</div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-semibold text-slate-900 dark:text-slate-100">{CURRENT_PLAN.name}</span>
            <Badge variant="secondary">Active</Badge>
          </div>
          <div className="mt-1 text-sm text-slate-500">{CURRENT_PLAN.tagline}</div>
          <div className="mt-4 text-3xl font-semibold text-slate-900 dark:text-slate-100">
            {formatPrice(CURRENT_PLAN.priceMonthly)}
            {CURRENT_PLAN.priceMonthly ? <span className="text-sm font-normal text-slate-500"> / month</span> : null}
          </div>
          <dl className="mt-4 space-y-1.5 text-sm">
            <Row label="Metrics retention" value={retention(CURRENT_PLAN.metricsRetentionDays)} />
            <Row label="Log retention" value={retention(CURRENT_PLAN.logRetentionDays)} />
            <Row label="Platform version" value={`v${APP_VERSION} (${APP_RELEASE_CHANNEL})`} />
          </dl>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-6 lg:col-span-2 dark:border-slate-800 dark:bg-slate-900">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Usage</div>
          <div className="mt-4 grid gap-5 sm:grid-cols-2">
            {LIMIT_KEYS.map((k) => {
              const limit = CURRENT_PLAN.limits[k];
              const used = usage[k];
              const percent =
                limit === null ? 0 : used === undefined ? undefined : limit === 0 ? 100 : (used / limit) * 100;
              return (
                <UsageBar
                  key={k}
                  label={PLAN_LIMIT_LABELS[k]}
                  percent={percent}
                  detail={loading ? "Loading…" : `${used ?? "—"} of ${formatLimit(limit)}`}
                />
              );
            })}
          </div>
        </div>
      </div>

      <div>
        <h3 className="mb-3 text-sm font-semibold text-slate-900 dark:text-slate-100">Available plans</h3>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {PLANS.map((plan) => {
            const current = plan.id === CURRENT_PLAN.id;
            return (
              <div
                key={plan.id}
                className={cn(
                  "flex flex-col rounded-lg border bg-white p-5 dark:bg-slate-900",
                  current ? "border-sky-500 ring-1 ring-sky-500" : "border-slate-200 dark:border-slate-800"
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-900 dark:text-slate-100">{plan.name}</span>
                  {current && <Badge>Current</Badge>}
                </div>
                <div className="mt-2 text-2xl font-semibold text-slate-900 dark:text-slate-100">
                  {formatPrice(plan.priceMonthly)}
                  {plan.priceMonthly ? <span className="text-sm font-normal text-slate-500"> / mo</span> : null}
                </div>
                <p className="mt-1 text-xs text-slate-500">{plan.tagline}</p>
                <ul className="mt-4 flex-1 space-y-1.5 text-sm text-slate-600 dark:text-slate-300">
                  {LIMIT_KEYS.map((k) => (
                    <li key={k} className="flex justify-between gap-2">
                      <span>{PLAN_LIMIT_LABELS[k]}</span>
                      <span className="font-medium text-slate-900 dark:text-slate-100">{formatLimit(plan.limits[k])}</span>
                    </li>
                  ))}
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 pt-1">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                {current ? (
                  <Button className="mt-5" variant="outline" disabled>
                    Current plan
                  </Button>
                ) : (
                  <a
                    href={plan.priceMonthly === 0 ? PRICING_URL : `${MARKETING_URL}/contact?plan=${plan.id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-5 inline-flex items-center justify-center rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200"
                  >
                    {plan.priceMonthly === null ? "Contact sales" : "Upgrade"}
                  </a>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-slate-500">{label}</dt>
      <dd className="font-medium text-slate-900 dark:text-slate-100">{value}</dd>
    </div>
  );
}

function retention(days: number | null): string {
  return days === null ? "Custom" : `${days} days`;
}
