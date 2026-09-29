"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Lightbulb, ShieldAlert } from "lucide-react";
import { useAuth } from "@/components/auth/auth-provider";
import { SeverityBadge } from "@/components/infrastructure/severity-badge";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { isAdminRole, ApiError, listRecommendations, type Recommendation, type RecommendationSeverity } from "@/lib/api";

const ALL = "__all__";

// useSearchParams requires a Suspense boundary at build time -- mirrors
// alerts/page.tsx's AlertsPage/AlertsPageContent split.
export default function RecommendationsPage() {
  return (
    <Suspense fallback={null}>
      <RecommendationsPageContent />
    </Suspense>
  );
}

// Admins see every resource's recommendations; members see only the ones
// for resources they're individually authorized on -- enforced by the
// backend (spec §39), not filtered here. There is nothing this page could
// do to widen or narrow that on its own.
function RecommendationsPageContent() {
  const { user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [statusFilter, setStatusFilter] = useState<string>(searchParams.get("status") ?? ALL);
  const [severityFilter, setSeverityFilter] = useState<string>(searchParams.get("severity") ?? ALL);
  const [items, setItems] = useState<Recommendation[] | null>(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Step 19 decision #10: the old hardcoded `type: "PACKAGE_UPDATE"` filter
  // is gone -- every recommendation type is shown by default now, which is
  // exactly the fix that makes the dashboard's Recommendations widget links
  // (e.g. /recommendations?severity=HIGH) land on a correctly filtered view
  // instead of silently landing on an unrelated, type-restricted one that
  // hid every Database/Object Storage recommendation.
  const load = useCallback(() => {
    listRecommendations({
      status: statusFilter !== ALL ? statusFilter : undefined,
      severity: severityFilter !== ALL ? (severityFilter as RecommendationSeverity) : undefined,
      page_size: 200,
    })
      .then((res) => {
        setItems(res.recommendations);
        setTotal(res.total);
        setError(null);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load recommendations."));
  }, [statusFilter, severityFilter]);

  useEffect(() => {
    load();
  }, [load]);

  // Keeps the URL in sync so a deep link from the dashboard's
  // Recommendations widget (e.g. /recommendations?severity=HIGH) is
  // shareable/bookmarkable, and the browser back button restores filter
  // state -- structurally identical to alerts/page.tsx's own sync effect.
  useEffect(() => {
    const params = new URLSearchParams();
    if (statusFilter !== ALL) params.set("status", statusFilter);
    if (severityFilter !== ALL) params.set("severity", severityFilter);
    const qs = params.toString();
    router.replace(`/recommendations${qs ? `?${qs}` : ""}`, { scroll: false });
    // Only the local filter state should trigger this -- re-running on
    // every searchParams/router identity change would fight the browser's
    // own back/forward navigation (mirrors alerts/page.tsx).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, severityFilter]);

  const securityCount = (items ?? []).filter((r) => (r.metadata?.security_update as boolean | undefined) === true).length;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
          <Lightbulb className="h-5 w-5" /> Recommendations
        </h2>
        <p className="text-sm text-slate-500">
          {isAdminRole(user?.role)
            ? "Recommendations across every monitored VM, database, and object storage bucket."
            : "Recommendations for resources you're authorized on."}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="text-sm text-slate-500">Total</div>
          <div className="mt-1 text-2xl font-semibold text-slate-900">{total}</div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="flex items-center gap-1.5 text-sm text-slate-500">
            <ShieldAlert className="h-4 w-4 text-red-500" /> Security Updates
          </div>
          <div className="mt-1 text-2xl font-semibold text-slate-900">{securityCount}</div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-600">Status</span>
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v ?? ALL)}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="All" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All</SelectItem>
              <SelectItem value="NEW">New</SelectItem>
              <SelectItem value="ACKNOWLEDGED">Acknowledged</SelectItem>
              <SelectItem value="DISMISSED">Dismissed</SelectItem>
              <SelectItem value="RESOLVED">Resolved</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-600">Severity</span>
          <Select value={severityFilter} onValueChange={(v) => setSeverityFilter(v ?? ALL)}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="All" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All</SelectItem>
              <SelectItem value={"LOW" satisfies RecommendationSeverity}>Low</SelectItem>
              <SelectItem value={"MEDIUM" satisfies RecommendationSeverity}>Medium</SelectItem>
              <SelectItem value={"HIGH" satisfies RecommendationSeverity}>High</SelectItem>
              <SelectItem value={"CRITICAL" satisfies RecommendationSeverity}>Critical</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {items !== null && items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center">
          <Lightbulb className="mx-auto mb-3 h-8 w-8 text-slate-300" />
          <p className="text-sm font-medium text-slate-700">No recommendations match your filters.</p>
        </div>
      ) : (
        items !== null && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Resource</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Package</TableHead>
                <TableHead>Current</TableHead>
                <TableHead>Available</TableHead>
                <TableHead>Severity</TableHead>
                <TableHead>Security</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>
                    {r.resource_type === "VM" ? (
                      <Link href={`/vms/${r.resource_id}`} className="font-medium text-sky-700 hover:underline">
                        {r.resource_name}
                      </Link>
                    ) : r.resource_type === "DATABASE" ? (
                      <Link href={`/databases/${r.resource_id}`} className="font-medium text-sky-700 hover:underline">
                        {r.resource_name}
                      </Link>
                    ) : r.resource_type === "OBJECT_STORAGE" ? (
                      <Link href={`/object-storage/${r.resource_id}`} className="font-medium text-sky-700 hover:underline">
                        {r.resource_name}
                      </Link>
                    ) : (
                      <span className="font-medium text-slate-900">{r.resource_name}</span>
                    )}
                  </TableCell>
                  {/* Package-specific fields (Package/Current/Available/
                      Security) render "—" for non-package recommendation
                      types (e.g. DATABASE_LOCK_CONTENTION) since their
                      metadata simply doesn't carry those keys -- the Type
                      column below is what makes those rows legible now
                      that every type (not just PACKAGE_UPDATE) is shown. */}
                  <TableCell className="text-slate-600">{r.type.replace(/_/g, " ")}</TableCell>
                  <TableCell className="text-slate-900">{(r.metadata?.package as string | undefined) ?? "—"}</TableCell>
                  <TableCell className="text-slate-600">{(r.metadata?.installed_version as string | undefined) ?? "—"}</TableCell>
                  <TableCell className="text-slate-600">{(r.metadata?.available_version as string | undefined) ?? "—"}</TableCell>
                  <TableCell>
                    <SeverityBadge severity={r.severity} />
                  </TableCell>
                  <TableCell>{r.metadata?.security_update ? "Yes" : "No"}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{r.status}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )
      )}
    </div>
  );
}
