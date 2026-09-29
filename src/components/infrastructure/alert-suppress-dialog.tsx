"use client";

import { cloneElement, isValidElement, useState, type ReactElement } from "react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, suppressAlert } from "@/lib/api";

// Admin-only timed silence of one already-firing ACTIVE/ACKNOWLEDGED alert
// -- distinct from (and coarser than) disabling the underlying alert rule
// via alert-rules/page.tsx's enabled toggle, which stops all future
// evaluation rather than just quieting the current alert for a window.
export function AlertSuppressDialog({
  trigger,
  alertId,
  onSuppressed,
}: {
  trigger: ReactElement<{ onClick?: () => void }>;
  alertId: string;
  onSuppressed: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [durationMinutes, setDurationMinutes] = useState("60");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setDurationMinutes("60");
      setReason("");
      setError(null);
    }
  }

  async function handleSubmit() {
    const minutes = Number(durationMinutes);
    if (!minutes || minutes <= 0) {
      setError("Duration must be a positive number of minutes.");
      return;
    }
    if (!reason.trim()) {
      setError("A reason is required.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await suppressAlert(alertId, { duration_minutes: minutes, reason: reason.trim() });
      setOpen(false);
      onSuppressed();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to suppress alert.");
    } finally {
      setSubmitting(false);
    }
  }

  const triggerElement = isValidElement(trigger)
    ? cloneElement(trigger, { onClick: () => handleOpenChange(true) })
    : trigger;

  return (
    <>
      {triggerElement}
      <AlertDialog open={open} onOpenChange={handleOpenChange}>
        <AlertDialogContent className="max-w-xs sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Suppress Alert</AlertDialogTitle>
            <AlertDialogDescription>
              Silences this alert for the given window; evaluation resumes automatically afterward. This never disables the
              underlying alert rule.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="flex flex-col gap-3 text-left text-sm">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="suppress-duration">Duration (minutes)</Label>
              <Input
                id="suppress-duration"
                type="number"
                min={1}
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(e.target.value)}
                disabled={submitting}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="suppress-reason">Reason</Label>
              <Textarea
                id="suppress-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Why is this alert being suppressed?"
                disabled={submitting}
              />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
          </div>

          <AlertDialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={submitting}>
              {submitting ? "Suppressing…" : "Suppress"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
