"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { OperationStatusBadge } from "@/components/infrastructure/operation-status-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ApiError, listRebootOperations, type RebootOperation } from "@/lib/api";

function duration(startedAt?: string, completedAt?: string): string {
  if (!startedAt || !completedAt) return "—";
  const seconds = Math.max(0, Math.round((new Date(completedAt).getTime() - new Date(startedAt).getTime()) / 1000));
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

export default function RebootOperationsPage() {
  const [operations, setOperations] = useState<RebootOperation[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listRebootOperations()
      .then((res) => setOperations(res.reboot_operations))
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load reboot operations."));
  }, []);

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!operations) return <p className="text-sm text-slate-500">Loading&hellip;</p>;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Reboot Operations</h2>
          <p className="text-sm text-slate-500">History of every controlled VM reboot this project has run or attempted.</p>
        </div>
        <Link href="/update-operations" className="text-sm text-sky-700 hover:underline">
          View Update Operations →
        </Link>
      </div>

      {operations.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center">
          <p className="text-sm font-medium text-slate-700">No reboot operations yet.</p>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>VM</TableHead>
              <TableHead>Reason</TableHead>
              <TableHead>Requested By</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Started</TableHead>
              <TableHead>Duration</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {operations.map((op) => (
              <TableRow key={op.id}>
                <TableCell className="font-medium text-slate-900">{op.vm_name ?? "—"}</TableCell>
                <TableCell className="text-slate-600">{op.reason.replace("_", " ")}</TableCell>
                <TableCell className="text-slate-600">{op.created_by ?? "—"}</TableCell>
                <TableCell>
                  <OperationStatusBadge status={op.status} />
                </TableCell>
                <TableCell className="text-slate-600">{op.started_at ? new Date(op.started_at).toLocaleString() : "—"}</TableCell>
                <TableCell className="text-slate-600">{duration(op.started_at, op.completed_at)}</TableCell>
                <TableCell>
                  <Link href={`/reboot-operations/${op.id}`} className="text-sm text-slate-600 underline hover:text-slate-900">
                    View
                  </Link>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
