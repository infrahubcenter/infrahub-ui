import { Badge } from "@/components/ui/badge";
import type { AlertStatus } from "@/lib/api";

// Mirrors OperationStatusBadge's convention: destructive = still needs
// attention, secondary = resolved/success-like, outline = muted/off,
// default = actively being handled.
function variantFor(status: AlertStatus): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "ACTIVE":
      return "destructive";
    case "ACKNOWLEDGED":
      return "default";
    case "RESOLVED":
      return "secondary";
    case "SUPPRESSED":
      return "outline";
    default:
      return "outline";
  }
}

const LABEL: Record<AlertStatus, string> = {
  ACTIVE: "Active",
  ACKNOWLEDGED: "Acknowledged",
  RESOLVED: "Resolved",
  SUPPRESSED: "Suppressed",
};

export function AlertStatusBadge({ status }: { status: AlertStatus }) {
  return <Badge variant={variantFor(status)}>{LABEL[status]}</Badge>;
}
