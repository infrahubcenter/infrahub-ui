import { Badge } from "@/components/ui/badge";

// Shared across update operations (Step 10), reboot operations (Step 11),
// and database operations (Step 14) -- the vocabularies overlap heavily
// (PENDING/RUNNING/SUCCESS/FAILED/CANCELLED/TIMEOUT) with a few
// feature-specific phases layered on top (reboot's
// WAITING_FOR_VM/RECONNECTING/UNKNOWN, database operations'
// WAITING_CONFIRMATION), so one component covers all of them rather than
// near-identical inline copies.
export type OperationStatusValue =
  | "WAITING_CONFIRMATION"
  | "PENDING"
  | "PRECHECK"
  | "CONNECTING"
  | "RUNNING"
  | "REBOOTING"
  | "WAITING_FOR_VM"
  | "RECONNECTING"
  | "VERIFYING"
  | "SUCCESS"
  | "PARTIAL"
  | "FAILED"
  | "TIMEOUT"
  | "UNKNOWN"
  | "CANCELLED"
  | "INTERRUPTED";

function variantFor(status: string): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "SUCCESS":
      return "secondary";
    case "FAILED":
    case "TIMEOUT":
    case "INTERRUPTED":
      return "destructive";
    case "PARTIAL":
    case "CANCELLED":
    case "UNKNOWN":
      return "outline";
    default:
      return "default";
  }
}

// WAITING_CONFIRMATION reuses the plain "default" variant (like PENDING)
// but gets a distinct label so an Admin never confuses "plan created, not
// yet confirmed" with "confirmed and queued to run."
const LABEL_OVERRIDES: Record<string, string> = {
  WAITING_CONFIRMATION: "Awaiting Confirmation",
};

export function OperationStatusBadge({ status }: { status: string }) {
  return <Badge variant={variantFor(status)}>{LABEL_OVERRIDES[status] ?? status}</Badge>;
}
