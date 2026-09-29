"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, Check, Loader2, Pause, Play, X } from "lucide-react";
import { OperationStatusBadge } from "@/components/infrastructure/operation-status-badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
  cancelRebootOperation,
  getRebootOperation,
  getRebootOperationLogs,
  getRebootOperationResults,
  rebootOperationLogsStreamUrl,
  verifyRebootOperation,
  type OperationLogLine,
  type RebootOperation,
  type RebootVerificationResult,
} from "@/lib/api";

const TERMINAL = new Set(["SUCCESS", "PARTIAL", "FAILED", "TIMEOUT", "UNKNOWN", "CANCELLED", "INTERRUPTED"]);
const CANCELLABLE = new Set(["PENDING", "PRECHECK"]);

type TimelineStep = { label: string; done: (op: RebootOperation) => boolean; active: (op: RebootOperation) => boolean };

const TIMELINE: TimelineStep[] = [
  { label: "Pre-check", done: (op) => !!op.started_at, active: (op) => op.status === "PRECHECK" },
  { label: "Reboot command sent", done: (op) => !!op.reboot_sent_at, active: (op) => op.status === "REBOOTING" },
  { label: "Waiting for VM", done: (op) => !!op.disconnected_at, active: (op) => op.status === "WAITING_FOR_VM" },
  { label: "Reconnect", done: (op) => !!op.reconnected_at, active: (op) => op.status === "RECONNECTING" },
  { label: "Verify", done: (op) => op.status === "VERIFYING" || TERMINAL.has(op.status), active: (op) => op.status === "VERIFYING" },
  { label: "Complete", done: (op) => TERMINAL.has(op.status), active: () => false },
];

function duration(startedAt?: string, endAt?: string): string {
  if (!startedAt || !endAt) return "—";
  const seconds = Math.max(0, Math.round((new Date(endAt).getTime() - new Date(startedAt).getTime()) / 1000));
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

export default function RebootOperationDetailPage() {
  const params = useParams<{ id: string }>();
  const operationId = params.id;

  const [operation, setOperation] = useState<RebootOperation | null>(null);
  const [logs, setLogs] = useState<OperationLogLine[]>([]);
  const [results, setResults] = useState<RebootVerificationResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [cancelling, setCancelling] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);
  const seenSeq = useRef<Set<number>>(new Set());

  const load = useCallback(() => {
    getRebootOperation(operationId)
      .then(setOperation)
      .catch((err) => setError(err instanceof ApiError && err.status === 404 ? "Reboot operation not found." : "Failed to load operation."));
  }, [operationId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    getRebootOperationLogs(operationId)
      .then((res) => {
        seenSeq.current = new Set(res.logs.map((l) => l.sequence));
        setLogs(res.logs);
      })
      .catch(() => {});

    const ws = new WebSocket(rebootOperationLogsStreamUrl(operationId));
    ws.onmessage = (event) => {
      const frame = JSON.parse(event.data) as
        | { type: "log"; stream: string; message: string; sequence: number }
        | { type: "done"; status: string };
      if (frame.type === "log") {
        if (seenSeq.current.has(frame.sequence)) return;
        seenSeq.current.add(frame.sequence);
        setLogs((prev) => [...prev, { sequence: frame.sequence, stream: frame.stream as OperationLogLine["stream"], message: frame.message, created_at: "" }]);
      } else {
        load();
      }
    };
    return () => ws.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- operationId is stable per mount
  }, [operationId]);

  useEffect(() => {
    if (autoScroll && logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  useEffect(() => {
    if (!operation || TERMINAL.has(operation.status)) return;
    const interval = setInterval(load, 3000);
    return () => clearInterval(interval);
  }, [operation, load]);

  useEffect(() => {
    if (operation && TERMINAL.has(operation.status)) {
      getRebootOperationResults(operationId)
        .then((res) => setResults(res.results))
        .catch(() => {});
    }
  }, [operation, operationId]);

  async function handleCancel() {
    setCancelling(true);
    try {
      await cancelRebootOperation(operationId);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to cancel reboot.");
    } finally {
      setCancelling(false);
    }
  }

  async function handleVerify() {
    setVerifying(true);
    try {
      const res = await verifyRebootOperation(operationId);
      setResults(res.results);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to verify reboot.");
    } finally {
      setVerifying(false);
    }
  }

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!operation) return <p className="text-sm text-slate-500">Loading&hellip;</p>;

  const terminal = TERMINAL.has(operation.status);
  const verifiedCount = results?.filter((r) => r.status === "VERIFIED").length ?? 0;
  const failedResults = results?.filter((r) => r.status === "FAILED") ?? [];
  const downtime = duration(operation.disconnected_at, operation.reconnected_at ?? operation.completed_at);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link href="/reboot-operations" className="flex w-fit items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
          <ArrowLeft className="h-4 w-4" /> Back to Reboot Operations
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">{operation.vm_name ?? "Reboot Operation"}</h2>
            <p className="text-sm text-slate-500">
              {operation.reason.replace("_", " ")} · Started {operation.started_at ? new Date(operation.started_at).toLocaleString() : "not yet"}
            </p>
          </div>
          <OperationStatusBadge status={operation.status} />
        </div>
      </div>

      {terminal && operation.status === "SUCCESS" && (
        <Alert>
          <AlertDescription>
            ✓ Reboot completed. Downtime: {downtime}. {verifiedCount} of {results?.length ?? 0} checks verified.
          </AlertDescription>
        </Alert>
      )}
      {terminal && operation.status === "PARTIAL" && (
        <Alert variant="destructive">
          <AlertDescription>
            VM rebooted, but {failedResults.length > 0 ? failedResults.length : "one or more"} check(s) show warnings. Review the comparison
            table below.
          </AlertDescription>
        </Alert>
      )}
      {terminal && operation.status === "FAILED" && (
        <Alert variant="destructive">
          <AlertDescription>✕ Reboot verification failed. {operation.error_summary ?? "See logs and results below for details."}</AlertDescription>
        </Alert>
      )}
      {terminal && operation.status === "TIMEOUT" && (
        <Alert variant="destructive">
          <AlertDescription>
            ⚠ Reboot timeout. The VM did not become reachable within the configured reboot timeout. Use Retry Verification below, or view the
            VM directly.
          </AlertDescription>
        </Alert>
      )}
      {terminal && (operation.status === "UNKNOWN" || operation.status === "INTERRUPTED") && (
        <Alert variant="destructive">
          <AlertDescription>
            The final VM state could not be determined automatically. Use Retry Verification below to check the VM&apos;s actual state —
            no reboot command will be sent.
          </AlertDescription>
        </Alert>
      )}

      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <h3 className="mb-3 text-sm font-semibold text-slate-900">Timeline</h3>
        <ul className="flex flex-col gap-1.5">
          {TIMELINE.map((step) => {
            const done = step.done(operation);
            const active = !done && step.active(operation);
            return (
              <li key={step.label} className="flex items-center gap-2 text-sm">
                {done ? (
                  <Check className="h-4 w-4 shrink-0 text-emerald-600" />
                ) : active ? (
                  <Loader2 className="h-4 w-4 shrink-0 animate-spin text-blue-600" />
                ) : (
                  <span className="h-4 w-4 shrink-0 rounded-full border border-slate-300" />
                )}
                <span className={done || active ? "text-slate-700" : "text-slate-400"}>{step.label}</span>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-900">Reboot Log</h3>
          <Button variant="outline" size="sm" onClick={() => setAutoScroll((v) => !v)}>
            {autoScroll ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />} {autoScroll ? "Pause Auto Scroll" : "Resume Auto Scroll"}
          </Button>
        </div>
        <div ref={logRef} className="h-64 overflow-y-auto rounded-md bg-slate-900 p-3 font-mono text-xs text-slate-100">
          {logs.length === 0 ? (
            <p className="text-slate-500">Waiting for output&hellip;</p>
          ) : (
            logs.map((l) => (
              <div key={l.sequence} className={l.stream === "STDERR" ? "text-red-300" : l.stream === "SYSTEM" ? "text-amber-300" : ""}>
                {l.message}
              </div>
            ))
          )}
        </div>
      </div>

      {results && results.length > 0 && (
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <h3 className="mb-2 text-sm font-semibold text-slate-900">Before / After Comparison</h3>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Check</TableHead>
                <TableHead>Before / Expected</TableHead>
                <TableHead>After / Actual</TableHead>
                <TableHead>Result</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {results
                .filter((r) => r.status !== "NOT_APPLICABLE")
                .map((r) => (
                  <TableRow key={r.check_type}>
                    <TableCell className="font-medium text-slate-900">{r.check_type.replace("_", " ")}</TableCell>
                    <TableCell className="text-slate-600">{r.expected_value || "—"}</TableCell>
                    <TableCell className="text-slate-600">{r.actual_value || "—"}</TableCell>
                    <TableCell>
                      {r.status === "VERIFIED" && <Check className="h-4 w-4 text-emerald-600" />}
                      {r.status === "FAILED" && <X className="h-4 w-4 text-red-600" />}
                      {(r.status === "WARNING" || r.status === "UNKNOWN") && <AlertTriangle className="h-4 w-4 text-amber-500" />}
                      {r.error_summary && <span className="ml-1 text-xs text-slate-500">{r.error_summary}</span>}
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </div>
      )}

      <div className="flex justify-end gap-2">
        {CANCELLABLE.has(operation.status) && (
          <Button variant="outline" size="sm" onClick={handleCancel} disabled={cancelling}>
            {cancelling ? "Cancelling…" : "Cancel"}
          </Button>
        )}
        {!CANCELLABLE.has(operation.status) && !terminal && (
          <p className="self-center text-xs text-slate-500">Cancellation is unavailable once the reboot command has been sent.</p>
        )}
        {terminal && operation.status !== "CANCELLED" && (
          <Button variant="outline" size="sm" onClick={handleVerify} disabled={verifying}>
            {verifying ? "Verifying…" : "Retry Verification"}
          </Button>
        )}
        {operation.vm_id && (
          <Link href={`/vms/${operation.vm_id}`}>
            <Button variant="outline" size="sm">
              View VM
            </Button>
          </Link>
        )}
        {operation.vm_id && (
          <Link href={`/vms/${operation.vm_id}/monitoring`}>
            <Button variant="outline" size="sm">
              View Monitoring
            </Button>
          </Link>
        )}
      </div>
    </div>
  );
}
