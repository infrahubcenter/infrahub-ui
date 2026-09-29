"use client";

import { cloneElement, isValidElement, useState, type ReactElement } from "react";
import { ApiError } from "@/lib/api";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";

// Step 22 safe-deletion UX: unlike ConfirmDialog (a single Cancel/Confirm
// click), this requires re-typing the resource's exact current name
// (case-sensitive, no partial match) before Delete enables. This is a UX
// guard only, never the source of truth -- the backend independently
// re-validates the same confirmation_name against its own record and
// re-checks authorization/dependencies before deleting anything, so
// bypassing this dialog (e.g. via devtools) can never delete the wrong
// resource, skip RBAC, or skip the dependency check.
export function DeleteResourceDialog({
  trigger,
  resourceTypeLabel,
  resourceName,
  description,
  onConfirm,
  onDeleted,
}: {
  trigger: ReactElement<{ onClick?: () => void }>;
  /** e.g. "project", "group", "VM", "database", "object storage" */
  resourceTypeLabel: string;
  resourceName: string;
  description: string;
  onConfirm: () => Promise<void>;
  onDeleted?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const matches = typed.length > 0 && typed === resourceName;

  function reset() {
    setTyped("");
    setBusy(false);
    setError(null);
  }

  const triggerElement = isValidElement(trigger)
    ? cloneElement(trigger, {
        onClick: () => {
          reset();
          setOpen(true);
        },
      })
    : trigger;

  async function handleConfirm() {
    if (!matches || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onConfirm();
      setOpen(false);
      onDeleted?.();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to delete.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {triggerElement}
      <AlertDialog
        open={open}
        onOpenChange={(next) => {
          if (busy) return;
          setOpen(next);
          if (!next) reset();
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {resourceTypeLabel} &ldquo;{resourceName}&rdquo;?
            </AlertDialogTitle>
            <AlertDialogDescription>{description}</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex flex-col gap-2">
            <label className="text-sm text-slate-600">
              Type <span className="font-mono font-semibold text-slate-900">{resourceName}</span> to confirm.
            </label>
            <Input
              autoFocus
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && matches && !busy) {
                  e.preventDefault();
                  handleConfirm();
                }
              }}
              placeholder={resourceName}
              disabled={busy}
              aria-invalid={typed.length > 0 && !matches}
            />
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={!matches || busy} onClick={handleConfirm}>
              {busy ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
