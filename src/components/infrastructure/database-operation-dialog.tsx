"use client";

import { cloneElement, isValidElement, useState, type ReactElement } from "react";
import { useRouter } from "next/navigation";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  ApiError,
  confirmDatabaseOperation,
  createDatabaseOperation,
  previewDatabaseOperation,
  type DatabaseOperationType,
} from "@/lib/api";

type Step = "preview" | "review" | "submitting";

// Reusable "Recommendation/problem -> Review -> Operation Plan ->
// Confirmation -> Execute" flow, triggered from at least two places (the
// Operations tab's maintenance buttons, and Cancel Query/Terminate Session
// row actions in the Connections/Locks tables). Collapses create+confirm
// into one "Confirm & Execute" step after the preview -- the spec's intent
// ("Admin should see exactly what the system intends to execute" before it
// runs) is already covered by the preview step, so a separate
// still-editable "plan" screen would be a redundant extra click.
export function DatabaseOperationDialog({
  trigger,
  databaseId,
  operationType,
  operationLabel,
  destructive,
  impactDescription,
  parameters,
  recommendationId,
  onExecuted,
}: {
  trigger: ReactElement<{ onClick?: () => void }>;
  databaseId: string;
  operationType: DatabaseOperationType;
  operationLabel: string;
  destructive: boolean;
  impactDescription?: string;
  parameters?: { target_id?: string };
  recommendationId?: string;
  // If omitted, navigates to the new operation's detail page on success.
  onExecuted?: (operationId: string) => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("preview");
  const [reason, setReason] = useState("");
  const [preview, setPreview] = useState<{ command_preview: string; expected_impact: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  function loadPreview() {
    setError(null);
    setPreview(null);
    previewDatabaseOperation(databaseId, { operation_type: operationType, parameters })
      .then((res) => setPreview({ command_preview: res.command_preview, expected_impact: res.expected_impact }))
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to preview this operation."));
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setStep("preview");
      setReason("");
      loadPreview();
    }
  }

  async function handleConfirm() {
    setStep("submitting");
    setError(null);
    try {
      const created = await createDatabaseOperation(databaseId, {
        operation_type: operationType,
        parameters,
        reason: reason.trim() || undefined,
        recommendation_id: recommendationId,
      });
      await confirmDatabaseOperation(databaseId, created.id);
      setOpen(false);
      if (onExecuted) onExecuted(created.id);
      else router.push(`/databases/${databaseId}/operations/${created.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to confirm this operation.");
      setStep("review");
    }
  }

  const triggerElement = isValidElement(trigger)
    ? cloneElement(trigger, { onClick: () => handleOpenChange(true) })
    : trigger;

  return (
    <>
      {triggerElement}
      <AlertDialog open={open} onOpenChange={handleOpenChange}>
        <AlertDialogContent className="max-w-xs sm:max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>{operationLabel}</AlertDialogTitle>
            <AlertDialogDescription>
              {impactDescription ?? "Review the exact command below before this runs against the live database."}
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="flex flex-col gap-3 text-left text-sm">
            {!preview && !error && <p className="text-slate-500">Generating command preview&hellip;</p>}
            {preview && (
              <>
                <div>
                  <div className="mb-1 text-xs font-medium text-slate-500">Command to be executed</div>
                  <pre className="overflow-x-auto rounded-md bg-slate-900 p-3 text-xs whitespace-pre-wrap text-slate-100">
                    {preview.command_preview}
                  </pre>
                </div>
                <div>
                  <div className="mb-1 text-xs font-medium text-slate-500">Expected Impact</div>
                  <p className="text-slate-700">{preview.expected_impact}</p>
                </div>
                {step === "preview" ? (
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="db-operation-reason">Reason (optional)</Label>
                    <Textarea
                      id="db-operation-reason"
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="Why is this operation being run?"
                    />
                  </div>
                ) : (
                  reason && (
                    <p className="text-xs text-slate-500">
                      <span className="font-medium text-slate-600">Reason:</span> {reason}
                    </p>
                  )
                )}
              </>
            )}
            {error && <p className="text-sm text-red-600">{error}</p>}
          </div>

          <AlertDialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={step === "submitting"}>
              Cancel
            </Button>
            {step === "preview" && (
              <Button onClick={() => setStep("review")} disabled={!preview}>
                Continue
              </Button>
            )}
            {step !== "preview" && (
              <Button variant={destructive ? "destructive" : "default"} onClick={handleConfirm} disabled={step === "submitting"}>
                {step === "submitting" ? "Executing…" : "Confirm & Execute"}
              </Button>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
