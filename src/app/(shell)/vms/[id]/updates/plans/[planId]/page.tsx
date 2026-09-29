"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, Check, X, Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
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
  approveUpdatePlan,
  cancelUpdatePlan,
  executeUpdatePlan,
  getUpdatePlan,
  validateUpdatePlan,
  type UpdatePlanDetail,
  type ValidatePlanResult,
} from "@/lib/api";

const TERMINAL_STATUSES = new Set(["CANCELLED", "COMPLETED", "FAILED", "PARTIAL", "EXECUTING"]);
const EXECUTABLE_STATUSES = new Set(["READY", "APPROVED"]);

export default function UpdatePlanDetailPage() {
  const params = useParams<{ id: string; planId: string }>();
  const router = useRouter();
  const vmId = params.id;
  const planId = params.planId;

  const [plan, setPlan] = useState<UpdatePlanDetail | null>(null);
  const [precheck, setPrecheck] = useState<ValidatePlanResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [validating, setValidating] = useState(false);
  const [approving, setApproving] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [executeConfirmed, setExecuteConfirmed] = useState(false);
  const [executing, setExecuting] = useState(false);

  const load = useCallback(() => {
    getUpdatePlan(planId)
      .then(setPlan)
      .catch((err) => setError(err instanceof ApiError && err.status === 404 ? "Update plan not found." : "Failed to load update plan."));
  }, [planId]);

  useEffect(() => {
    // Load-on-mount: no external store to subscribe to.

    load();
  }, [load]);

  async function handleValidate() {
    setValidating(true);
    setActionMessage(null);
    try {
      const result = await validateUpdatePlan(planId);
      setPrecheck(result);
      setActionMessage(result.all_passed ? "All prechecks passed." : "Some prechecks failed — see below.");
    } catch (err) {
      setActionMessage(err instanceof ApiError ? err.message : "Failed to validate plan.");
    } finally {
      setValidating(false);
    }
  }

  async function handleApprove() {
    setApproving(true);
    setActionMessage(null);
    try {
      const result = await approveUpdatePlan(planId);
      setActionMessage(result.message);
      load();
    } catch (err) {
      setActionMessage(err instanceof ApiError ? err.message : "Failed to approve plan.");
      try {
        setPrecheck(await validateUpdatePlan(planId));
      } catch {
        // Best-effort refresh of the visible checklist -- the approval
        // error message above already explains the failure.
      }
    } finally {
      setApproving(false);
    }
  }

  async function handleCancel() {
    setCancelling(true);
    setActionMessage(null);
    try {
      await cancelUpdatePlan(planId);
      load();
    } catch (err) {
      setActionMessage(err instanceof ApiError ? err.message : "Failed to cancel plan.");
    } finally {
      setCancelling(false);
    }
  }

  async function handleExecute() {
    setExecuting(true);
    setActionMessage(null);
    try {
      const result = await executeUpdatePlan(planId);
      router.push(`/update-operations/${result.operation_id}`);
    } catch (err) {
      setActionMessage(err instanceof ApiError ? err.message : "Failed to start execution.");
      setExecuting(false);
    }
  }

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!plan) return <p className="text-sm text-slate-500">Loading&hellip;</p>;

  const terminal = TERMINAL_STATUSES.has(plan.plan.status);
  const canExecute = EXECUTABLE_STATUSES.has(plan.plan.status);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link href={`/vms/${vmId}/updates`} className="flex w-fit items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
          <ArrowLeft className="h-4 w-4" /> Back to Updates
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Update Plan</h2>
            <p className="text-sm text-slate-500">
              {plan.plan.vm_name ?? "VM"} · Created {new Date(plan.plan.created_at).toLocaleString()}
              {plan.plan.created_by ? ` by ${plan.plan.created_by}` : ""}
            </p>
          </div>
          <Badge variant={plan.plan.status === "READY" ? "secondary" : plan.plan.status === "CANCELLED" ? "outline" : "default"}>
            {plan.plan.status}
          </Badge>
        </div>
        {actionMessage && (
          <Alert>
            <AlertDescription>{actionMessage}</AlertDescription>
          </Alert>
        )}
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <h3 className="mb-3 text-sm font-semibold text-slate-900">Pre-update Checks</h3>
        {!precheck ? (
          <p className="text-sm text-slate-500">Click &ldquo;Validate&rdquo; below to run the pre-update checklist.</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {precheck.items.map((item) => (
              <li key={item.name} className="flex items-center gap-2 text-sm">
                {item.status === "PASS" && <Check className="h-4 w-4 shrink-0 text-emerald-600" />}
                {item.status === "FAIL" && <X className="h-4 w-4 shrink-0 text-red-600" />}
                {(item.status === "WARN" || item.status === "UNKNOWN") && <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />}
                {item.status === "INFO" && <span className="h-4 w-4 shrink-0" />}
                <span className="text-slate-700">{item.message}</span>
              </li>
            ))}
          </ul>
        )}
        {precheck?.stale && (
          <Alert variant="destructive" className="mt-3">
            <AlertDescription>
              One or more selected packages changed since this plan was created. Revalidate before approving.
              {precheck.stale_items && precheck.stale_items.length > 0 ? ` (${precheck.stale_items.join(", ")})` : ""}
            </AlertDescription>
          </Alert>
        )}
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-slate-900">Selected Updates</h3>
          <div className="flex gap-4 text-xs text-slate-500">
            <span>{plan.selected_count} package(s)</span>
            <span>Security: {plan.security_update_count}</span>
            <span>Reboot: {plan.reboot_required ? "Required" : "Not required"}</span>
          </div>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Package</TableHead>
              <TableHead>Current</TableHead>
              <TableHead>Target</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Security</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {plan.items.map((item) => (
              <TableRow key={item.id}>
                <TableCell className="font-medium text-slate-900">{item.package_name}</TableCell>
                <TableCell className="text-slate-600">{item.current_version}</TableCell>
                <TableCell className="text-slate-600">{item.target_version}</TableCell>
                <TableCell className="text-slate-600">{item.update_type}</TableCell>
                <TableCell>{item.security_update ? <Badge variant="destructive">Yes</Badge> : <Badge variant="outline">No</Badge>}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {plan.proposed_command && (
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <h3 className="mb-2 text-sm font-semibold text-slate-900">Proposed Command</h3>
          <pre className="overflow-x-auto rounded-md bg-slate-900 p-3 text-xs text-slate-100">{plan.proposed_command}</pre>
          <p className="mt-2 text-xs text-amber-600">⚠ This command has NOT been executed. This is only a preview.</p>
        </div>
      )}

      {plan.os_release_command && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4">
          <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-amber-900">
            <AlertTriangle className="h-4 w-4" /> OS Release Upgrade Command (High Risk)
          </h3>
          <pre className="overflow-x-auto rounded-md bg-slate-900 p-3 text-xs text-slate-100">{plan.os_release_command.command}</pre>
          <p className="mt-2 text-xs text-amber-700">
            ⚠ Not executed. OS release upgrades require additional compatibility review before proceeding.
          </p>
        </div>
      )}

      {plan.plan.status === "EXECUTING" && (
        <Alert>
          <AlertDescription>
            This plan is currently executing. Check{" "}
            <Link href="/update-operations" className="underline">
              Update Operations
            </Link>{" "}
            for live progress.
          </AlertDescription>
        </Alert>
      )}

      {!terminal && (
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={handleValidate} disabled={validating}>
            {validating ? "Validating…" : "Validate"}
          </Button>
          <Button variant="outline" size="sm" onClick={handleCancel} disabled={cancelling}>
            {cancelling ? "Cancelling…" : "Cancel Plan"}
          </Button>
          {plan.plan.status === "DRAFT" && (
            <Button size="sm" onClick={handleApprove} disabled={approving}>
              {approving ? "Approving…" : "Approve Update Plan"}
            </Button>
          )}
          {canExecute && (
            <AlertDialog onOpenChange={(open) => !open && setExecuteConfirmed(false)}>
              <AlertDialogTrigger render={<Button size="sm" />}>
                <Zap className="h-4 w-4" /> Execute Updates
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Execute this update?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will connect to <strong>{plan.plan.vm_name ?? "this VM"}</strong> over SSH and run the command below. This is a
                    real, irreversible change to a running system.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <div className="flex flex-col gap-2 text-sm">
                  <div className="flex gap-4 text-xs text-slate-500">
                    <span>{plan.selected_count} package(s)</span>
                    <span>Security: {plan.security_update_count}</span>
                    <span>Reboot: {plan.reboot_required ? "Required" : "Not required"}</span>
                  </div>
                  {plan.proposed_command && (
                    <pre className="overflow-x-auto rounded-md bg-slate-900 p-3 text-xs text-slate-100">{plan.proposed_command}</pre>
                  )}
                  <label className="mt-2 flex items-start gap-2 text-sm text-slate-700">
                    <Checkbox checked={executeConfirmed} onCheckedChange={(v) => setExecuteConfirmed(v === true)} />
                    I understand and want to execute this update.
                  </label>
                </div>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction disabled={!executeConfirmed || executing} onClick={handleExecute}>
                    {executing ? "Starting…" : "Execute Updates"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      )}
    </div>
  );
}
