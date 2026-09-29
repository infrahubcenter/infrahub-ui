"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Check, ShieldOff } from "lucide-react";
import { useAuth } from "@/components/auth/auth-provider";
import { SeverityBadge } from "@/components/infrastructure/severity-badge";
import { AlertStatusBadge } from "@/components/infrastructure/alert-status-badge";
import { AlertSuppressDialog } from "@/components/infrastructure/alert-suppress-dialog";
import { Button } from "@/components/ui/button";
import { Alert as AlertBox, AlertDescription } from "@/components/ui/alert";
import { formatAgo, formatDuration } from "@/lib/format";
import {
  ApiError,
  acknowledgeAlert,
  getAlert,
  getAlertHistory,
  type Alert as AlertRecord,
  type AlertEvent,
  isAdminRole,
} from "@/lib/api";

// CREATED/ACKNOWLEDGED/RESOLVED/SUPPRESSED/ESCALATED/DEESCALATED are
// prominent lifecycle milestones; SAMPLE is one row per evaluation cycle
// (potentially hundreds for a long-lived alert) and is rendered compactly
// below the milestone list instead.
const MILESTONE_EVENTS = new Set(["CREATED", "ESCALATED", "DEESCALATED", "ACKNOWLEDGED", "RESOLVED", "SUPPRESSED", "UNSUPPRESSED"]);
const INITIAL_SAMPLE_COUNT = 8;

function fmtValue(v?: number): string {
  if (v === undefined || v === null) return "—";
  return Number.isInteger(v) ? String(v) : v.toFixed(2);
}

export default function AlertDetailPage() {
  const params = useParams<{ id: string }>();
  const alertId = params.id;
  const { user } = useAuth();
  const isAdmin = isAdminRole(user?.role);

  const [alert, setAlert] = useState<AlertRecord | null>(null);
  const [events, setEvents] = useState<AlertEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [acknowledging, setAcknowledging] = useState(false);
  const [showAllSamples, setShowAllSamples] = useState(false);

  const load = useCallback(() => {
    getAlert(alertId)
      .then(setAlert)
      .catch((err) => setError(err instanceof ApiError && err.status === 404 ? "Alert not found." : "Failed to load alert."));
  }, [alertId]);

  const loadHistory = useCallback(() => {
    getAlertHistory(alertId)
      .then((res) => setEvents(res.events))
      .catch(() => setEvents([]));
  }, [alertId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  async function handleAcknowledge() {
    setAcknowledging(true);
    setActionError(null);
    try {
      await acknowledgeAlert(alertId);
      load();
      loadHistory();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Failed to acknowledge alert.");
    } finally {
      setAcknowledging(false);
    }
  }

  function handleSuppressed() {
    load();
    loadHistory();
  }

  const { milestones, samples } = useMemo(() => {
    const all = events ?? [];
    return {
      milestones: all.filter((e) => MILESTONE_EVENTS.has(e.event_type)),
      samples: all.filter((e) => e.event_type === "SAMPLE"),
    };
  }, [events]);

  const visibleSamples = showAllSamples ? samples : samples.slice(0, INITIAL_SAMPLE_COUNT);

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!alert) return <p className="text-sm text-slate-500">Loading&hellip;</p>;

  const resourceHref =
    alert.resource_type === "VM"
      ? `/vms/${alert.resource_id}`
      : alert.resource_type === "DATABASE"
        ? `/databases/${alert.resource_id}`
        : undefined;
  const canAct = alert.status === "ACTIVE" || alert.status === "ACKNOWLEDGED";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link href="/alerts" className="flex w-fit items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
          <ArrowLeft className="h-4 w-4" /> Back to Alerts
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <SeverityBadge severity={alert.severity} />
              <AlertStatusBadge status={alert.status} />
            </div>
            <h2 className="mt-1 text-lg font-semibold text-slate-900">{alert.title}</h2>
            {alert.description && <p className="text-sm text-slate-500">{alert.description}</p>}
          </div>
          {isAdmin && canAct && (
            <div className="flex gap-2">
              {alert.status === "ACTIVE" && (
                <Button size="sm" onClick={handleAcknowledge} disabled={acknowledging}>
                  <Check className="h-4 w-4" /> {acknowledging ? "Acknowledging…" : "Acknowledge"}
                </Button>
              )}
              <AlertSuppressDialog
                alertId={alert.id}
                onSuppressed={handleSuppressed}
                trigger={
                  <Button size="sm" variant="outline">
                    <ShieldOff className="h-4 w-4" /> Suppress
                  </Button>
                }
              />
            </div>
          )}
        </div>
      </div>

      {actionError && (
        <AlertBox variant="destructive">
          <AlertDescription>{actionError}</AlertDescription>
        </AlertBox>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <h3 className="mb-2 text-sm font-semibold text-slate-900">Resource</h3>
          <dl className="flex flex-col gap-1 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">Name</dt>
              <dd className="text-slate-900">
                {resourceHref ? (
                  <Link href={resourceHref} className="text-sky-700 hover:underline">
                    {alert.resource_name}
                  </Link>
                ) : (
                  alert.resource_name
                )}
              </dd>
            </div>
            {alert.container_name && (
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">Container</dt>
                <dd className="text-slate-900">{alert.container_name}</dd>
              </div>
            )}
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">Workspace</dt>
              <dd className="text-slate-900">{alert.workspace_name ?? "—"}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">Resource Type</dt>
              <dd className="text-slate-900">{alert.resource_type}</dd>
            </div>
          </dl>
          {/* Alert -> Recommendation -> Operation flow (Step 14): a plain
              link only -- never an auto-filled or auto-triggered operation.
              The database detail page's Operations tab isn't URL-addressable
              (Tabs uses local state, not a query param), so this links to
              the database itself. */}
          {alert.resource_type === "DATABASE" && resourceHref && (
            <Link href={resourceHref} className="mt-3 block text-xs text-sky-700 hover:underline">
              Review Operation on this Database →
            </Link>
          )}
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <h3 className="mb-2 text-sm font-semibold text-slate-900">Metric</h3>
          <dl className="flex flex-col gap-1 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">Alert Type</dt>
              <dd className="text-slate-900">{alert.alert_type.replace(/_/g, " ")}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">Metric</dt>
              <dd className="text-slate-900">{alert.metric}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">Current Value</dt>
              <dd className="text-slate-900">{fmtValue(alert.current_value)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">Threshold</dt>
              <dd className="text-slate-900">{fmtValue(alert.threshold)}</dd>
            </div>
          </dl>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <h3 className="mb-2 text-sm font-semibold text-slate-900">Timing</h3>
          <dl className="flex flex-col gap-1 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">First Seen</dt>
              <dd className="text-slate-900">{formatAgo(alert.first_seen_at)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">Last Seen</dt>
              <dd className="text-slate-900">{formatAgo(alert.last_seen_at)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">Duration</dt>
              <dd className="text-slate-900">{formatDuration(alert.duration_seconds, true)}</dd>
            </div>
            {alert.acknowledged_by && (
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">Acknowledged By</dt>
                <dd className="text-slate-900">{alert.acknowledged_by}</dd>
              </div>
            )}
            {alert.suppressed_reason && (
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">Suppressed Reason</dt>
                <dd className="text-slate-900">{alert.suppressed_reason}</dd>
              </div>
            )}
          </dl>
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <h3 className="mb-3 text-sm font-semibold text-slate-900">Timeline</h3>
        {events === null ? (
          <p className="text-sm text-slate-500">Loading&hellip;</p>
        ) : (
          <div className="flex flex-col gap-4">
            {milestones.length > 0 && (
              <ul className="flex flex-col gap-2">
                {milestones.map((e, i) => (
                  <li key={i} className="flex items-start gap-3 text-sm">
                    <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-sky-500" />
                    <div>
                      <div className="font-medium text-slate-900">
                        {e.event_type}
                        {e.message ? ` — ${e.message}` : ""}
                      </div>
                      <div className="text-xs text-slate-500">
                        {new Date(e.created_at).toLocaleString()}
                        {e.value !== undefined ? ` · value ${fmtValue(e.value)}` : ""}
                        {e.threshold !== undefined ? ` · threshold ${fmtValue(e.threshold)}` : ""}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {samples.length > 0 && (
              <div>
                <h4 className="mb-1 text-xs font-medium text-slate-500">Evaluation Samples</h4>
                <div className="flex flex-col gap-0.5 font-mono text-xs text-slate-600">
                  {visibleSamples.map((e, i) => (
                    <div key={i} className="flex justify-between gap-4 rounded px-1.5 py-0.5 odd:bg-slate-50">
                      <span>{new Date(e.created_at).toLocaleString()}</span>
                      <span>
                        value {fmtValue(e.value)}
                        {e.threshold !== undefined ? ` / threshold ${fmtValue(e.threshold)}` : ""}
                      </span>
                    </div>
                  ))}
                </div>
                {samples.length > INITIAL_SAMPLE_COUNT && (
                  <Button variant="outline" size="sm" className="mt-2" onClick={() => setShowAllSamples((v) => !v)}>
                    {showAllSamples ? "Show fewer samples" : `Show ${samples.length - INITIAL_SAMPLE_COUNT} more samples`}
                  </Button>
                )}
              </div>
            )}

            {milestones.length === 0 && samples.length === 0 && (
              <p className="text-sm text-slate-500">No history recorded yet.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
