"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  CheckCircle2,
  Clock,
  ListChecks,
  Loader2,
  PlayCircle,
  XCircle,
} from "lucide-react";
import { OperationStatusBadge } from "@/components/infrastructure/operation-status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import {
  ApiError,
  listOperations,
  getOperationsSummary,
  operationDetailPath,
  type OperationFamily,
  type OperationsSummary,
  type UnifiedOperation,
} from "@/lib/api";

const ALL = "__all__";
const PAGE_SIZE = 25;

const FAMILY_LABEL: Record<OperationFamily, string> = {
  UPDATE: "Update",
  REBOOT: "Reboot",
  DATABASE: "Database",
};

// This page's own /update-operations/:id and /reboot-operations/:id and
// /databases/:id/operations/:operationId (Steps 10/11/14) already
// implement operation detail, live output, confirm/cancel/retry actions,
// audited end to end -- every row here deep-links there rather than
// duplicating that UI. See lib/api.ts's operationDetailPath doc comment.

export default function OperationsPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <OperationsContent />
    </Suspense>
  );
}

function PageSkeleton() {
  return <div className="text-sm text-slate-500">Loading operations&hellip;</div>;
}

function OperationsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [statusFilter, setStatusFilter] = useState(searchParams.get("status") ?? ALL);
  const [familyFilter, setFamilyFilter] = useState(searchParams.get("family") ?? ALL);
  const [resourceTypeFilter, setResourceTypeFilter] = useState(searchParams.get("resource_type") ?? ALL);
  const [search, setSearch] = useState(searchParams.get("search") ?? "");
  const [page, setPage] = useState(0);

  const [summary, setSummary] = useState<OperationsSummary | null>(null);
  const [operations, setOperations] = useState<UnifiedOperation[] | null>(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    Promise.all([
      getOperationsSummary(),
      listOperations({
        status: statusFilter !== ALL ? statusFilter : undefined,
        family: familyFilter !== ALL ? (familyFilter as OperationFamily) : undefined,
        resource_type: resourceTypeFilter !== ALL ? (resourceTypeFilter as "VM" | "DATABASE") : undefined,
        search: search.trim() || undefined,
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
      }),
    ])
      .then(([summaryRes, listRes]) => {
        setError(null);
        setSummary(summaryRes);
        setOperations(listRes.operations);
        setTotal(listRes.total);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Unable to load operations."))
      .finally(() => setLoading(false));
  }, [statusFilter, familyFilter, resourceTypeFilter, search, page]);

  useEffect(() => {
    load();
  }, [load]);

  // Keeps the URL shareable/bookmarkable and survives back/forward --
  // mirrors admin/users/page.tsx and alerts/page.tsx exactly.
  useEffect(() => {
    const params = new URLSearchParams();
    if (statusFilter !== ALL) params.set("status", statusFilter);
    if (familyFilter !== ALL) params.set("family", familyFilter);
    if (resourceTypeFilter !== ALL) params.set("resource_type", resourceTypeFilter);
    if (search.trim()) params.set("search", search.trim());
    const qs = params.toString();
    router.replace(`/operations${qs ? `?${qs}` : ""}`, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, familyFilter, resourceTypeFilter, search]);

  function handleFilterChange(setter: (v: string) => void, value: string) {
    setter(value);
    setPage(0);
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const hasFilters = statusFilter !== ALL || familyFilter !== ALL || resourceTypeFilter !== ALL || search.trim() !== "";

  const cards = [
    { label: "Total Operations", value: summary?.total, icon: ListChecks },
    { label: "Running", value: summary?.running, icon: Loader2 },
    { label: "Pending Confirmation", value: summary?.pending_confirmation, icon: Clock },
    { label: "Successful", value: summary?.successful, icon: CheckCircle2 },
    { label: "Failed", value: summary?.failed, icon: XCircle },
    { label: "Cancelled", value: summary?.cancelled, icon: PlayCircle },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Operations</h2>
        <p className="text-sm text-slate-500">
          Controlled infrastructure operations -- update execution, VM reboot, and database
          remediation -- in one place. Every action still happens on that operation&apos;s detail page.
        </p>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-6">
        {cards.map(({ label, value, icon: Icon }) => (
          <div key={label} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-slate-500">{label}</span>
              <Icon className="h-4 w-4 text-slate-400" />
            </div>
            <div className="mt-2 text-2xl font-semibold text-slate-900 dark:text-slate-100">{value ?? "—"}</div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Select value={statusFilter} onValueChange={(v) => handleFilterChange(setStatusFilter, v ?? ALL)}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All statuses</SelectItem>
            {["PENDING", "WAITING_CONFIRMATION", "RUNNING", "SUCCESS", "FAILED", "CANCELLED", "TIMEOUT"].map((s) => (
              <SelectItem key={s} value={s}>{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={familyFilter} onValueChange={(v) => handleFilterChange(setFamilyFilter, v ?? ALL)}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All types</SelectItem>
            <SelectItem value="UPDATE">Update</SelectItem>
            <SelectItem value="REBOOT">Reboot</SelectItem>
            <SelectItem value="DATABASE">Database</SelectItem>
          </SelectContent>
        </Select>
        <Select value={resourceTypeFilter} onValueChange={(v) => handleFilterChange(setResourceTypeFilter, v ?? ALL)}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Resource type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All resources</SelectItem>
            <SelectItem value="VM">VM</SelectItem>
            <SelectItem value="DATABASE">Database</SelectItem>
          </SelectContent>
        </Select>
        <Input
          value={search}
          onChange={(e) => handleFilterChange(setSearch, e.target.value)}
          placeholder="Search resource, type, summary…"
          className="w-64"
        />
      </div>

      {loading && operations === null ? (
        <p className="text-sm text-slate-500">Loading operations&hellip;</p>
      ) : operations !== null && operations.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center dark:border-slate-700 dark:bg-slate-900">
          {hasFilters ? (
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">No operations match your filters.</p>
          ) : (
            <>
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300">No operations yet</p>
              <p className="mt-1 text-sm text-slate-500">
                Controlled infrastructure operations will appear here after an update, reboot, or
                database operation is requested.
              </p>
              <Link href="/recommendations" className="mt-3 inline-block text-sm text-sky-700 hover:underline dark:text-sky-400">
                View Recommendations →
              </Link>
            </>
          )}
        </div>
      ) : (
        operations !== null && (
          <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Operation</TableHead>
                  <TableHead>Resource</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Requested By</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Completed</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {operations.map((op) => (
                  <TableRow key={`${op.family}-${op.id}`}>
                    <TableCell className="font-medium text-slate-900 dark:text-slate-100">{op.operation_type}</TableCell>
                    <TableCell className="text-slate-600 dark:text-slate-400">{op.resource_name || "—"}</TableCell>
                    <TableCell className="text-slate-600 dark:text-slate-400">{FAMILY_LABEL[op.family]}</TableCell>
                    <TableCell className="text-slate-600 dark:text-slate-400">{op.requested_by_name || "—"}</TableCell>
                    <TableCell>
                      <OperationStatusBadge status={op.status} />
                    </TableCell>
                    <TableCell className="text-slate-600 dark:text-slate-400">{new Date(op.created_at).toLocaleString()}</TableCell>
                    <TableCell className="text-slate-600 dark:text-slate-400">
                      {op.completed_at ? new Date(op.completed_at).toLocaleString() : "—"}
                    </TableCell>
                    <TableCell>
                      <Link href={operationDetailPath(op)} className="text-sm text-sky-700 underline hover:text-sky-900 dark:text-sky-400">
                        View
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )
      )}

      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between text-sm text-slate-600 dark:text-slate-400">
          <span>
            Showing {page * PAGE_SIZE + 1}–{Math.min(total, (page + 1) * PAGE_SIZE)} of {total}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}>
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
