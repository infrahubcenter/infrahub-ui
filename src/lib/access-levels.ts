// Access levels offered by Access Control (RBAC) › direct resource grants.
// Each level is a plain-language bundle of the API's permission codes, so
// an admin picks "View & Connect" or "View & Patch Management" instead of
// ticking vm.view / vm.connect / vm.updates by hand. The codes themselves
// (and what the backend enforces) are unchanged.

import type { ResourceTypeChoice } from "./resource-labels";

export type AccessLevel = {
  id: string;
  label: string;
  description: string;
  permissions: string[];
};

type DirectGrantChoice = Extract<ResourceTypeChoice, "VM_INVENTORY" | "VM_HOST_METRICS" | "DATABASE" | "OBJECT_STORAGE">;

export const ACCESS_LEVELS: Record<DirectGrantChoice, AccessLevel[]> = {
  // SSH-registered VMs (Compute › Compute Inventory / Patch Management).
  VM_INVENTORY: [
    {
      id: "view",
      label: "View",
      description: "See the VM in Compute Inventory: details, status and its Docker containers.",
      permissions: ["vm.view"],
    },
    {
      id: "view_connect",
      label: "View & Connect",
      description: "View, plus open the browser SSH console.",
      permissions: ["vm.view", "vm.connect"],
    },
    {
      id: "view_patch",
      label: "View & Patch Management",
      description: "View, plus see and run OS updates and controlled reboots in Patch Management.",
      permissions: ["vm.view", "vm.updates"],
    },
    {
      id: "view_connect_patch",
      label: "View, Connect & Patch Management",
      description: "View, open the SSH console, and run updates and reboots.",
      permissions: ["vm.view", "vm.connect", "vm.updates"],
    },
    {
      id: "full",
      label: "Full access",
      description: "Everything above, plus this VM's Host Metrics & Logs.",
      permissions: ["vm.view", "vm.connect", "vm.updates", "vm.metrics"],
    },
  ],
  // Agent-only VMs (Compute › Host Metrics & Logs) -- no SSH, so no
  // console or patching.
  VM_HOST_METRICS: [
    {
      id: "metrics",
      label: "Host Metrics & Logs",
      description: "See this VM's live metrics and logs in Host Metrics & Logs.",
      permissions: ["vm.metrics"],
    },
    {
      id: "view_metrics",
      label: "View & Host Metrics & Logs",
      description: "See the VM's details, plus its metrics and logs.",
      permissions: ["vm.view", "vm.metrics"],
    },
  ],
  DATABASE: [
    {
      id: "view",
      label: "View",
      description: "See the database and its connection health in Database Observability.",
      permissions: ["database.view"],
    },
    {
      id: "view_performance",
      label: "View & Performance",
      description: "View, plus performance charts and query details.",
      permissions: ["database.view", "database.performance", "database.query_details"],
    },
    {
      id: "view_logs",
      label: "View & Logs",
      description: "View, plus the database's logs.",
      permissions: ["database.view", "database.logs"],
    },
    {
      id: "view_browse",
      label: "View & Browse data",
      description: "View, plus the read-only table browser.",
      permissions: ["database.view", "database.browser"],
    },
    {
      id: "full",
      label: "Full access",
      description: "View, performance, query details, logs and the table browser.",
      permissions: ["database.view", "database.performance", "database.query_details", "database.logs", "database.browser"],
    },
  ],
  OBJECT_STORAGE: [
    {
      id: "view",
      label: "View",
      description: "See the bucket and its health in Object Storage (S3).",
      permissions: ["object_storage.view"],
    },
    {
      id: "view_monitor",
      label: "View & Monitoring",
      description: "View, plus usage, growth and security monitoring.",
      permissions: ["object_storage.view", "object_storage.monitor"],
    },
    {
      id: "view_browse",
      label: "View & Browse objects",
      description: "View and monitoring, plus the folder/object browser.",
      permissions: ["object_storage.view", "object_storage.monitor", "object_storage.browser"],
    },
    {
      id: "full",
      label: "Browse & Download",
      description: "Everything above, plus downloading objects.",
      permissions: ["object_storage.view", "object_storage.monitor", "object_storage.browser", "object_storage.download"],
    },
  ],
};

// Plain-language name for each permission code, for grant lists.
export const PERMISSION_TEXT: Record<string, string> = {
  "vm.view": "View",
  "vm.connect": "Connect (SSH console)",
  "vm.updates": "Patch Management",
  "vm.metrics": "Host Metrics & Logs",
  "database.view": "View",
  "database.performance": "Performance",
  "database.query_details": "Query details",
  "database.logs": "Logs",
  "database.browser": "Browse data",
  "object_storage.view": "View",
  "object_storage.monitor": "Monitoring",
  "object_storage.browser": "Browse objects",
  "object_storage.download": "Download",
};
