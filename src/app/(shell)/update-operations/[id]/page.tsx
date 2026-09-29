"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, Check, Loader2, Pause, Play, X } from "lucide-react";
import { OperationStatusBadge } from "@/components/infrastructure/operation-status-badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  ApiError,
  cancelUpdateOperation,
  getUpdateOperation,
  getUpdateOperationLogs,
  getUpdateOperationResults,
  getUpdateOperationSteps,
  updateOperationLogsStreamUrl,
  verifyUpdateOperation,
  type OperationLogLine,
  type OperationResult,
  type OperationStep,
  type UpdateOperation,
} from "@/lib/api";

const TERMINAL = new Set(["SUCCESS", "FAILED", "PARTIAL", "CANCELLED", "INTERRUPTED"]);
const CANCELLABLE = new Set(["PENDING", "CONNECTING"]);

const STEP_LABELS: Record<string, string> = {
  PRECHECK: "Pre-check",
  CONNECT: "Connect",
  REFRESH_METADATA: "Refresh package metadata",
  UPDATE: "Execute package update",
  VERIFY: "Verify versions",
  DISCOVERY: "Refresh VM inventory",
};
const STEP_ORDER: OperationStep["step_type"][] = ["PRECHECK", "CONNECT", "REFRESH_METADATA", "UPDATE", "VERIFY", "DISCOVERY"];

export default function UpdateOperationDetailPage() {
  const params = useParams<{ id: string }>();
  const operationId = params.id;

  const [operation, setOperation] = useState<UpdateOperation | null>(null);
  const [steps, setSteps] = useState<OperationStep[]>([]);
  const [logs, setLogs] = useState<OperationLogLine[]>([]);
  const [results, setResults] = useState<OperationResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [cancelling, setCancelling] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);
  const seenSeq = useRef<Set<number>>(new Set());

  const load = useCallback(() => {
    getUpdateOperation(operationId)
      .then(setOperation)
      .catch((err) => setError(err instanceof ApiError && err.status === 404 ? "Update operation not found." : "Failed to load operation."));
    getUpdateOperationSteps(operationId)
      .then((res) => setSteps(res.steps))
      .catch(() => {});
  }, [operationId]);

  useEffect(() => {
    // Load-on-mount: no external store to subscribe to.

    load();
  }, [load]);

  // Initial log history via REST (covers a viewer landing on an already-
  // completed operation), then a WebSocket tail for anything new.
  useEffect(() => {
    getUpdateOperationLogs(operationId)
      .then((res) => {
        seenSeq.current = new Set(res.logs.map((l) => l.sequence));
        setLogs(res.logs);
      })
      .catch(() => {});

    const ws = new WebSocket(updateOperationLogsStreamUrl(operationId));
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- operationId is stable per mount; load is intentionally re-created but shouldn't retrigger the socket
  }, [operationId]);

  useEffect(() => {
    if (autoScroll && logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  // Poll operation status every few seconds while non-terminal, so the
  // step checklist and header badge advance even if the log WS is quiet.
  useEffect(() => {
    if (!operation || TERMINAL.has(operation.status)) return;
    const interval = setInterval(load, 3000);
    return () => clearInterval(interval);
  }, [operation, load]);

  useEffect(() => {
    if (operation && TERMINAL.has(operation.status)) {
      getUpdateOperationResults(operationId)
        .then((res) => setResults(res.results))
        .catch(() => {});
    }
  }, [operation, operationId]);

  async function handleCancel() {
    setCancelling(true);
    try {
      await cancelUpdateOperation(operationId);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to cancel operation.");
    } finally {
      setCancelling(false);
    }
  }

  async function handleVerify() {
    setVerifying(true);
    try {
      const res = await verifyUpdateOperation(operationId);
      setResults(res.results);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to verify operation.");
    } finally {
      setVerifying(false);
    }
  }

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!operation) return <p className="text-sm text-slate-500">Loading&hellip;</p>;

  const stepByType = new Map(steps.map((s) => [s.step_type, s]));
  const terminal = TERMINAL.has(operation.status);
  const verifiedCount = results?.filter((r) => r.status === "VERIFIED").length ?? 0;
  const failedCount = results?.filter((r) => r.status === "FAILED").length ?? 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link href="/update-operations" className="flex w-fit items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
          <ArrowLeft className="h-4 w-4" /> Back to Update Operations
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">{operation.vm_name ?? "Update Operation"}</h2>
            <p className="text-sm text-slate-500">Started {operation.started_at ? new Date(operation.started_at).toLocaleString() : "not yet"}</p>
          </div>
          <OperationStatusBadge status={operation.status} />
        </div>
      </div>

      {terminal && operation.status === "SUCCESS" && (
        <Alert>
          <AlertDescription>
            ✓ Update completed. {verifiedCount} package(s) verified updated.
            {operation.summary ? ` ${operation.summary}` : ""}
          </AlertDescription>
        </Alert>
      )}
      {terminal && operation.status === "PARTIAL" && (
        <Alert variant="destructive">
          <AlertDescription>
            {verifiedCount} of {results?.length ?? 0} package(s) succeeded, {failedCount} failed. Review results below before retrying with a
            new plan.
          </AlertDescription>
        </Alert>
      )}
      {terminal && (operation.status === "FAILED" || operation.status === "INTERRUPTED") && (
        <Alert variant="destructive">
          <AlertDescription>
            ✕ Update {operation.status === "INTERRUPTED" ? "interrupted" : "failed"}.{" "}
            {operation.exit_code !== undefined ? `Exit code ${operation.exit_code}. ` : ""}
            {operation.summary ?? "See logs below for details."}
          </AlertDescription>
        </Alert>
      )}

      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <h3 className="mb-3 text-sm font-semibold text-slate-900">Progress</h3>
        <ul className="flex flex-col gap-1.5">
          {STEP_ORDER.map((type) => {
            const step = stepByType.get(type);
            return (
              <li key={type} className="flex items-center gap-2 text-sm">
                {!step || step.status === "PENDING" ? (
                  <span className="h-4 w-4 shrink-0 rounded-full border border-slate-300" />
                ) : step.status === "RUNNING" ? (
                  <Loader2 className="h-4 w-4 shrink-0 animate-spin text-blue-600" />
                ) : step.status === "SUCCESS" ? (
                  <Check className="h-4 w-4 shrink-0 text-emerald-600" />
                ) : step.status === "SKIPPED" ? (
                  <span className="h-4 w-4 shrink-0 text-slate-400">–</span>
                ) : (
                  <X className="h-4 w-4 shrink-0 text-red-600" />
                )}
                <span className={step?.status === "PENDING" || !step ? "text-slate-400" : "text-slate-700"}>{STEP_LABELS[type]}</span>
                {step?.error_summary && <span className="text-xs text-red-600">— {step.error_summary}</span>}
              </li>
            );
          })}
        </ul>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-900">Execution Log</h3>
          <Button variant="outline" size="sm" onClick={() => setAutoScroll((v) => !v)}>
            {autoScroll ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />} {autoScroll ? "Pause Auto Scroll" : "Resume Auto Scroll"}
          </Button>
        </div>
        <div ref={logRef} className="h-80 overflow-y-auto rounded-md bg-slate-900 p-3 font-mono text-xs text-slate-100">
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
          <h3 className="mb-2 text-sm font-semibold text-slate-900">
            Package Results ({verifiedCount} of {results.length} succeeded{failedCount > 0 ? `, ${failedCount} failed` : ""})
          </h3>
          <ul className="flex flex-col gap-1 text-sm">
            {results.map((r) => (
              <li key={r.package_name} className="flex items-center gap-2">
                {r.status === "VERIFIED" && <Check className="h-4 w-4 text-emerald-600" />}
                {r.status === "FAILED" && <X className="h-4 w-4 text-red-600" />}
                {(r.status === "UNKNOWN" || r.status === "NOT_APPLICABLE") && <AlertTriangle className="h-4 w-4 text-amber-500" />}
                <span className="text-slate-700">
                  {r.package_name}: {r.before_version} → {r.after_version ?? "?"} (target {r.target_version})
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex justify-end gap-2">
        {CANCELLABLE.has(operation.status) && (
          <Button variant="outline" size="sm" onClick={handleCancel} disabled={cancelling}>
            {cancelling ? "Cancelling…" : "Cancel"}
          </Button>
        )}
        {!CANCELLABLE.has(operation.status) && !terminal && (
          <p className="self-center text-xs text-slate-500">Cancellation is unavailable while package changes are in progress.</p>
        )}
        {terminal && operation.status !== "CANCELLED" && (
          <Button variant="outline" size="sm" onClick={handleVerify} disabled={verifying}>
            {verifying ? "Verifying…" : "Re-verify Package Versions"}
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
