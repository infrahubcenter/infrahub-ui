"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Check, Loader2, Pause, Play } from "lucide-react";
import { OperationStatusBadge } from "@/components/infrastructure/operation-status-badge";
import { HealthBadge } from "@/components/infrastructure/health-badge";
import { ConfirmDialog } from "@/components/infrastructure/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  ApiError,
  cancelDatabaseOperation,
  databaseOperationLogsStreamUrl,
  deleteDatabaseOperation,
  getDatabaseOperation,
  getDatabaseOperationLogs,
  retryDatabaseOperation,
  type DatabaseOperation,
  type HealthStatus,
  type OperationLogLine,
} from "@/lib/api";

// Mirrors reboot-operations/[id]/page.tsx's shape closely: a
// WebSocket-driven live log viewer, a status-driven timeline, terminal
// result panel, and cancel/retry buttons gated by status.
const TERMINAL = new Set(["SUCCESS", "FAILED", "CANCELLED", "TIMEOUT"]);
const CANCELLABLE = new Set(["WAITING_CONFIRMATION", "PENDING"]);

type TimelineStep = { label: string; done: (op: DatabaseOperation) => boolean; active: (op: DatabaseOperation) => boolean };

const TIMELINE: TimelineStep[] = [
  { label: "Requested", done: () => true, active: (op) => op.status === "WAITING_CONFIRMATION" },
  { label: "Confirmed", done: (op) => !!op.confirmed_at, active: (op) => op.status === "PENDING" },
  { label: "Running", done: (op) => !!op.started_at, active: (op) => op.status === "RUNNING" },
  {
    label: "Complete",
    done: (op) => TERMINAL.has(op.status),
    active: () => false,
  },
];

function duration(startedAt?: string, endAt?: string): string {
  if (!startedAt || !endAt) return "—";
  const seconds = Math.max(0, Math.round((new Date(endAt).getTime() - new Date(startedAt).getTime()) / 1000));
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

function isHealthStatus(v: string | undefined): v is HealthStatus {
  return v === "HEALTHY" || v === "WARNING" || v === "CRITICAL" || v === "UNKNOWN" || v === "OFFLINE";
}

export default function DatabaseOperationDetailPage() {
  const params = useParams<{ id: string; operationId: string }>();
  const router = useRouter();
  const databaseId = params.id;
  const operationId = params.operationId;

  const [operation, setOperation] = useState<DatabaseOperation | null>(null);
  const [logs, setLogs] = useState<OperationLogLine[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [cancelling, setCancelling] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const seenSeq = useRef<Set<number>>(new Set());

  const load = useCallback(() => {
    getDatabaseOperation(databaseId, operationId)
      .then(setOperation)
      .catch((err) => setError(err instanceof ApiError && err.status === 404 ? "Operation not found." : "Failed to load operation."));
  }, [databaseId, operationId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    getDatabaseOperationLogs(databaseId, operationId)
      .then((res) => {
        seenSeq.current = new Set(res.logs.map((l) => l.sequence));
        setLogs(res.logs);
      })
      .catch(() => {});

    const ws = new WebSocket(databaseOperationLogsStreamUrl(databaseId, operationId));
    ws.onmessage = (event) => {
      const frame = JSON.parse(event.data) as
        | { type: "log"; stream: string; message: string; sequence: number }
        | { type: "done"; status: string };
      if (frame.type === "log") {
        if (seenSeq.current.has(frame.sequence)) return;
        seenSeq.current.add(frame.sequence);
        setLogs((prev) => [
          ...prev,
          { sequence: frame.sequence, stream: frame.stream as OperationLogLine["stream"], message: frame.message, created_at: "" },
        ]);
      } else {
        load();
      }
    };
    return () => ws.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- databaseId/operationId are stable per mount
  }, [databaseId, operationId]);

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

  async function handleCancel() {
    setCancelling(true);
    setActionError(null);
    try {
      await cancelDatabaseOperation(databaseId, operationId);
      load();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Failed to cancel operation.");
    } finally {
      setCancelling(false);
    }
  }

  async function handleRetry() {
    setRetrying(true);
    setActionError(null);
    try {
      const created = await retryDatabaseOperation(databaseId, operationId);
      router.push(`/databases/${databaseId}/operations/${created.id}`);
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Failed to retry operation.");
      setRetrying(false);
    }
  }

  async function handleDelete() {
    await deleteDatabaseOperation(databaseId, operationId);
    router.push(`/databases/${databaseId}`);
  }

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!operation) return <p className="text-sm text-slate-500">Loading&hellip;</p>;

  const terminal = TERMINAL.has(operation.status);
  const runDuration = duration(operation.started_at, operation.completed_at);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link
          href={`/databases/${databaseId}`}
          className="flex w-fit items-center gap-1 text-sm text-slate-500 hover:text-slate-700"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Database
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">{operation.operation_type.replace(/_/g, " ")}</h2>
            <p className="text-sm text-slate-500">
              Requested {new Date(operation.created_at).toLocaleString()}
              {operation.requested_by ? ` by ${operation.requested_by}` : ""}
              {operation.reason ? ` · ${operation.reason}` : ""}
            </p>
          </div>
          <OperationStatusBadge status={operation.status} />
        </div>
      </div>

      {terminal && operation.status === "SUCCESS" && (
        <Alert>
          <AlertDescription>✓ Operation completed. {operation.result_summary ?? "No further details reported."}</AlertDescription>
        </Alert>
      )}
      {terminal && operation.status === "FAILED" && (
        <Alert variant="destructive">
          <AlertDescription>✕ Operation failed. {operation.error_summary ?? "See logs below for details."}</AlertDescription>
        </Alert>
      )}
      {terminal && operation.status === "CANCELLED" && (
        <Alert variant="destructive">
          <AlertDescription>Operation was cancelled before it ran.</AlertDescription>
        </Alert>
      )}
      {terminal && operation.status === "TIMEOUT" && (
        <Alert variant="destructive">
          <AlertDescription>⚠ Operation timed out. {operation.error_summary ?? "It did not complete within the configured timeout."}</AlertDescription>
        </Alert>
      )}

      {actionError && (
        <Alert variant="destructive">
          <AlertDescription>{actionError}</AlertDescription>
        </Alert>
      )}

      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <h3 className="mb-3 text-sm font-semibold text-slate-900">What Will Be Executed</h3>
        <p className="mb-1 text-xs text-slate-500">Backend-generated command -- read-only, exactly what was (or will be) run.</p>
        <pre className="overflow-x-auto rounded-md bg-slate-900 p-3 text-xs whitespace-pre-wrap text-slate-100">
          {operation.command_preview}
        </pre>
      </div>

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
          <h3 className="text-sm font-semibold text-slate-900">Operation Log</h3>
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

      {terminal && (
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <h3 className="mb-3 text-sm font-semibold text-slate-900">Result</h3>
          <div className="flex flex-col gap-3 text-sm">
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-slate-500">Health Before</span>
                {isHealthStatus(operation.health_before) ? (
                  <HealthBadge status={operation.health_before} />
                ) : (
                  <span className="text-slate-400">—</span>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-slate-500">Health After</span>
                {isHealthStatus(operation.health_after) ? (
                  <HealthBadge status={operation.health_after} />
                ) : (
                  <span className="text-slate-400">—</span>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-slate-500">Duration</span>
                <span className="text-slate-700">{runDuration}</span>
              </div>
            </div>
            {operation.result_summary && <p className="text-slate-700">{operation.result_summary}</p>}
            {operation.error_summary && <p className="text-red-600">{operation.error_summary}</p>}
          </div>
        </div>
      )}

      <div className="flex justify-end gap-2">
        {CANCELLABLE.has(operation.status) && (
          <Button variant="outline" size="sm" onClick={handleCancel} disabled={cancelling}>
            {cancelling ? "Cancelling…" : "Cancel"}
          </Button>
        )}
        {operation.status === "FAILED" && (
          <Button variant="outline" size="sm" onClick={handleRetry} disabled={retrying}>
            {retrying ? "Retrying…" : "Retry"}
          </Button>
        )}
        {terminal && (
          <ConfirmDialog
            trigger={
              <Button variant="outline" size="sm">
                Delete
              </Button>
            }
            title="Delete this operation?"
            description="Permanently removes this operation from the history below. This does not affect the database itself."
            confirmLabel="Delete"
            destructive
            onConfirm={handleDelete}
          />
        )}
        <Link href={`/databases/${databaseId}`}>
          <Button variant="outline" size="sm">
            Back to Database
          </Button>
        </Link>
      </div>
    </div>
  );
}
