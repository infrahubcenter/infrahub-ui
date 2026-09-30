// Resource-type names, taken word for word from the sidebar
// (components/layout/nav-items.ts). Used wherever a resource type is
// picked or grouped -- Alert Rules and Access Control (RBAC) -- so a
// resource is always called exactly what the sidebar calls its section.
//
// VMs appear in two sidebar sections, so they are two choices here:
//   Compute Inventory    -- SSH-registered VMs (have an address)
//   Host Metrics & Logs  -- agent-only VMs (no SSH address)
// Both are the same "VM" resource type to the API.

import type { VM } from "./api";

export type ResourceTypeKey = "VM" | "DATABASE" | "OBJECT_STORAGE" | "DOCKER_HOST" | "K8S_CLUSTER";

// What a picker offers: the API types, with VM split by sidebar section.
export type ResourceTypeChoice = "VM_INVENTORY" | "VM_HOST_METRICS" | "DATABASE" | "OBJECT_STORAGE" | "DOCKER_HOST" | "K8S_CLUSTER";

export const RESOURCE_TYPE_CHOICE_LABEL: Record<ResourceTypeChoice, string> = {
  VM_INVENTORY: "Compute Inventory",
  VM_HOST_METRICS: "Host Metrics & Logs",
  DATABASE: "Database Observability",
  OBJECT_STORAGE: "Object Storage (S3)",
  DOCKER_HOST: "Docker Monitoring",
  K8S_CLUSTER: "Kubernetes Monitoring",
};

// What one resource of each choice is called in a "pick one" field.
export const RESOURCE_TYPE_CHOICE_ITEM: Record<ResourceTypeChoice, string> = {
  VM_INVENTORY: "Compute Inventory VM",
  VM_HOST_METRICS: "Host Metrics & Logs VM",
  DATABASE: "Database Observability database",
  OBJECT_STORAGE: "Object Storage (S3) bucket",
  DOCKER_HOST: "Docker Monitoring host",
  K8S_CLUSTER: "Kubernetes Monitoring cluster",
};

// Where each choice is registered -- shown when a picker has nothing to list.
export const RESOURCE_TYPE_CHOICE_WHERE: Record<ResourceTypeChoice, string> = {
  VM_INVENTORY: "Compute › Compute Inventory",
  VM_HOST_METRICS: "Compute › Host Metrics & Logs",
  DATABASE: "Database Observability",
  OBJECT_STORAGE: "Object Storage (S3)",
  DOCKER_HOST: "Agents & Integrations › Docker Host Onboarding",
  K8S_CLUSTER: "Agents & Integrations › Kubernetes Cluster Onboarding",
};

// Section headings for lists grouped by API type (a VM section covers both
// VM sidebar sections).
export const RESOURCE_TYPE_SECTION: Record<ResourceTypeKey, string> = {
  VM: "Compute Inventory · Host Metrics & Logs",
  DATABASE: "Database Observability",
  OBJECT_STORAGE: "Object Storage (S3)",
  DOCKER_HOST: "Docker Monitoring",
  K8S_CLUSTER: "Kubernetes Monitoring",
};

export function choiceToType(choice: ResourceTypeChoice): ResourceTypeKey {
  return choice === "VM_INVENTORY" || choice === "VM_HOST_METRICS" ? "VM" : choice;
}

// Which VM sidebar section a VM belongs to (agent-only = no SSH address).
export function vmChoiceFor(vm: Pick<VM, "address">): ResourceTypeChoice {
  return vm.address ? "VM_INVENTORY" : "VM_HOST_METRICS";
}
