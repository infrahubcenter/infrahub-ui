// Display names for resource types, matching the sidebar sections
// (components/layout/nav-items.ts): Compute, Database Observability,
// Object Storage (S3), Agents & Integrations / Infrastructure Monitoring.
// Used wherever a resource type is picked or grouped -- Alert Rules and
// Access Control (RBAC) -- so the same thing is never called by two names.

export type ResourceTypeKey = "VM" | "DATABASE" | "OBJECT_STORAGE" | "DOCKER_HOST" | "K8S_CLUSTER";

// Singular, for pickers: "what am I choosing?"
export const RESOURCE_TYPE_LABEL: Record<ResourceTypeKey, string> = {
  VM: "Compute · Virtual Machine",
  DATABASE: "Database Observability · Database",
  OBJECT_STORAGE: "Object Storage (S3) · Bucket",
  DOCKER_HOST: "Docker Monitoring · Docker Host",
  K8S_CLUSTER: "Kubernetes Monitoring · Kubernetes Cluster",
};

// Plural, for section headings on lists.
export const RESOURCE_TYPE_SECTION: Record<ResourceTypeKey, string> = {
  VM: "Compute · Virtual Machines",
  DATABASE: "Database Observability · Databases",
  OBJECT_STORAGE: "Object Storage (S3) · Buckets",
  DOCKER_HOST: "Docker Monitoring · Docker Hosts",
  K8S_CLUSTER: "Kubernetes Monitoring · Kubernetes Clusters",
};

// Short noun for field labels ("Virtual Machine", "Docker Host", ...).
export const RESOURCE_TYPE_NOUN: Record<ResourceTypeKey, string> = {
  VM: "Virtual Machine",
  DATABASE: "Database",
  OBJECT_STORAGE: "Bucket",
  DOCKER_HOST: "Docker Host",
  K8S_CLUSTER: "Kubernetes Cluster",
};

// Where each type is registered -- shown when a picker has nothing to list.
export const RESOURCE_TYPE_WHERE: Record<ResourceTypeKey, string> = {
  VM: "Compute › Compute Inventory, or Compute › Host Metrics & Logs for agent-only VMs",
  DATABASE: "Database Observability",
  OBJECT_STORAGE: "Object Storage (S3)",
  DOCKER_HOST: "Agents & Integrations › Docker Host Onboarding",
  K8S_CLUSTER: "Agents & Integrations › Kubernetes Cluster Onboarding",
};
