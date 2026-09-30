"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, SlidersHorizontal, Trash2 } from "lucide-react";
import { RouteGuard } from "@/components/auth/route-guard";
import { ConfirmDialog } from "@/components/infrastructure/confirm-dialog";
import { SeverityBadge } from "@/components/infrastructure/severity-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  createAlertRule,
  deleteAlertRule,
  isLogBasedAlertTemplate,
  listAlertRuleTemplates,
  listAlertRules,
  listDatabases,
  listDockerContainers,
  listDockerHostContainers,
  listDockerHosts,
  listK8sClusters,
  listK8sOverview,
  listNotificationPolicies,
  listObjectStorage,
  listVMs,
  updateAlertRule,
  type AlertCondition,
  type AlertRuleListItem,
  type AlertSeverity,
  type AlertTemplate,
  type DatabaseListItem,
  type DockerContainer,
  type DockerHost,
  type DockerHostContainer,
  type K8sCluster,
  type K8sOverviewPod,
  type NotificationPolicy,
  type ObjectStorageListItem,
  type VM,
} from "@/lib/api";
import {
  RESOURCE_TYPE_CHOICE_ITEM,
  RESOURCE_TYPE_CHOICE_LABEL,
  RESOURCE_TYPE_CHOICE_WHERE,
  RESOURCE_TYPE_SECTION,
  choiceToType,
  vmChoiceFor,
  type ResourceTypeChoice,
} from "@/lib/resource-labels";

// Resource Type dropdown order -- the sidebar's own order.
const RESOURCE_CHOICE_ORDER: ResourceTypeChoice[] = [
  "VM_INVENTORY",
  "VM_HOST_METRICS",
  "DATABASE",
  "OBJECT_STORAGE",
  "DOCKER_HOST",
  "K8S_CLUSTER",
];

const CONDITIONS: AlertCondition[] = [">", "<", ">=", "<=", "=="];
const SEVERITIES: AlertSeverity[] = ["INFO", "WARNING", "CRITICAL"];

// Every resource kind Alert Rules can target -- the order here is also
// the section order on the list page below and the Resource Type
// dropdown's option order in the form.
const RESOURCE_KIND_ORDER = ["VM", "DATABASE", "OBJECT_STORAGE", "DOCKER_HOST", "K8S_CLUSTER"] as const;
const RESOURCE_KIND_LABELS: Record<string, string> = RESOURCE_TYPE_SECTION;

// Union of a policy's info/warning/critical channel lists -- what "this
// policy is configured for X/Y/Z" means at a glance, independent of
// which severity actually routes to which channel.
function configuredChannels(policy: NotificationPolicy): string[] {
  return Array.from(new Set([...policy.info_channels, ...policy.warning_channels, ...policy.critical_channels]));
}

const CHANNEL_LABELS: Record<string, string> = {
  IN_APP: "In-App", EMAIL: "Email", SLACK: "Slack", TEAMS: "Teams", WEBHOOK: "Webhook",
};

export default function AlertRulesPage() {
  return (
    <RouteGuard requireRole="ADMIN">
      <AlertRulesContent />
    </RouteGuard>
  );
}

// Exported so Alerts > Alert Rules (the new tabbed home for this content,
// see app/(shell)/alerts/page.tsx) can render it directly rather than
// duplicating the rules table/toggle/delete logic. The standalone
// /alert-rules route above still works (direct URL only, unlinked from
// nav) since it's a real, harmless extra way to reach the same content.
export function AlertRulesContent() {
  const [rules, setRules] = useState<AlertRuleListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(() => {
    listAlertRules()
      .then((res) => setRules(res.alert_rules))
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load alert rules."));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleToggleEnabled(item: AlertRuleListItem) {
    setBusyId(item.rule.id);
    setError(null);
    try {
      await updateAlertRule(item.rule.id, {
        condition: item.rule.condition,
        threshold: item.rule.threshold,
        recovery_threshold: item.rule.recovery_threshold,
        duration_seconds: item.rule.duration_seconds,
        severity: item.rule.severity,
        notification_policy_id: item.rule.notification_policy_id,
        enabled: !item.rule.enabled,
      });
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to update alert rule.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(id: string) {
    setBusyId(id);
    setError(null);
    try {
      await deleteAlertRule(id);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to delete alert rule.");
    } finally {
      setBusyId(null);
    }
  }

  // Grouped by resource kind (spec ask: VM/Database/Object Storage/
  // Docker/Kubernetes each get their own visible section instead of one
  // flat table) -- fixed RESOURCE_KIND_ORDER regardless of which groups
  // are actually populated, so the sections never reshuffle as rules are
  // added/removed.
  const sections = useMemo(() => {
    const groups = new Map<string, AlertRuleListItem[]>();
    for (const item of rules ?? []) {
      const list = groups.get(item.resource_type) ?? [];
      list.push(item);
      groups.set(item.resource_type, list);
    }
    return RESOURCE_KIND_ORDER.map((kind) => ({ kind, label: RESOURCE_KIND_LABELS[kind], items: groups.get(kind) ?? [] })).filter(
      (s) => s.items.length > 0
    );
  }, [rules]);

  function targetDetail(item: AlertRuleListItem): string {
    if (item.rule.container_id) return `container ${item.rule.container_id.slice(0, 8)}`;
    if (item.k8s_pod_name) return `pod ${item.k8s_pod_namespace ? `${item.k8s_pod_namespace}/` : ""}${item.k8s_pod_name}`;
    if (item.docker_host_container_docker_id) return `container ${item.docker_host_container_docker_id.slice(0, 8)}`;
    return "";
  }

  function renderRow(item: AlertRuleListItem) {
    const detail = targetDetail(item);
    return (
      <TableRow key={item.rule.id}>
        <TableCell>
          <div className="font-medium text-slate-900">{item.resource_name}</div>
          {detail && <div className="text-xs text-slate-500">{detail}</div>}
        </TableCell>
        <TableCell className="text-slate-600">
          <div className="flex items-center gap-1.5">
            {item.rule.alert_type.replace(/_/g, " ")}
            {item.rule.alert_type.endsWith("_HIGH_ERROR_LOGS") && (
              <Badge variant="outline" className="text-[10px]">
                Logs
              </Badge>
            )}
          </div>
        </TableCell>
        <TableCell className="font-mono text-xs text-slate-600">
          {item.rule.condition} {item.rule.threshold}
        </TableCell>
        <TableCell className="text-slate-600">{item.rule.duration_seconds}s</TableCell>
        <TableCell>
          <SeverityBadge severity={item.rule.severity} />
        </TableCell>
        <TableCell>
          <Button
            variant={item.rule.enabled ? "secondary" : "outline"}
            size="sm"
            disabled={busyId === item.rule.id}
            onClick={() => handleToggleEnabled(item)}
          >
            {item.rule.enabled ? "Enabled" : "Disabled"}
          </Button>
        </TableCell>
        <TableCell className="text-slate-600">
          {item.rule.suppressed_until ? (
            <Badge variant="outline">until {new Date(item.rule.suppressed_until).toLocaleString()}</Badge>
          ) : (
            "—"
          )}
        </TableCell>
        <TableCell>
          <ConfirmDialog
            trigger={
              <Button variant="ghost" size="icon-sm" aria-label="Delete rule" disabled={busyId === item.rule.id}>
                <Trash2 className="h-4 w-4" />
              </Button>
            }
            title="Delete this alert rule?"
            description="This stops all future evaluation for this rule. Any alert it already raised is unaffected."
            confirmLabel="Delete"
            onConfirm={() => handleDelete(item.rule.id)}
          />
        </TableCell>
      </TableRow>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
            <SlidersHorizontal className="h-5 w-5" /> Alert Rules
          </h2>
          <p className="text-sm text-slate-500">
            Configure when a VM, database, object storage bucket, Docker container/host, or Kubernetes pod/cluster
            metric breach -- or a burst of error-level logs -- should raise an alert. Rules never execute anything --
            they only observe and notify.
          </p>
        </div>
        <Button size="sm" onClick={() => setShowForm((v) => !v)}>
          <Plus className="h-4 w-4" /> New Rule
        </Button>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {showForm && (
        <NewAlertRuleForm
          onCreated={() => {
            setShowForm(false);
            load();
          }}
          onCancel={() => setShowForm(false)}
        />
      )}

      {rules === null ? (
        <p className="text-sm text-slate-500">Loading&hellip;</p>
      ) : rules.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center">
          <SlidersHorizontal className="mx-auto mb-3 h-8 w-8 text-slate-300" />
          <p className="text-sm font-medium text-slate-700">No alert rules configured yet.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {sections.map((section) => (
            <div key={section.kind} className="flex flex-col gap-2">
              <h3 className="text-sm font-semibold text-slate-700">
                {section.label} <span className="font-normal text-slate-400">({section.items.length})</span>
              </h3>
              <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Resource</TableHead>
                      <TableHead>Alert Type</TableHead>
                      <TableHead>Condition</TableHead>
                      <TableHead>Duration</TableHead>
                      <TableHead>Severity</TableHead>
                      <TableHead>Enabled</TableHead>
                      <TableHead>Suppressed Until</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>{section.items.map(renderRow)}</TableBody>
                </Table>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const ALL = "__all__";
export type AlertRuleResourceKind = "VM" | "DATABASE" | "OBJECT_STORAGE" | "K8S_CLUSTER" | "DOCKER_HOST";

// lockedResourceId/lockedResourceKind let a caller reuse this exact form
// pre-targeted at one specific VM, skipping the Resource Type/Resource
// pickers entirely -- the Container sub-picker and everything below it
// works unchanged, since a VM can still host several containers a rule
// might target instead of the VM itself.
export function NewAlertRuleForm({
  onCreated,
  onCancel,
  lockedResourceId,
  lockedResourceKind,
}: {
  onCreated: () => void;
  onCancel: () => void;
  lockedResourceId?: string;
  lockedResourceKind?: AlertRuleResourceKind;
}) {
  const [vms, setVms] = useState<VM[]>([]);
  const [databases, setDatabases] = useState<DatabaseListItem[]>([]);
  const [objectStorages, setObjectStorages] = useState<ObjectStorageListItem[]>([]);
  const [k8sClusters, setK8sClusters] = useState<K8sCluster[]>([]);
  const [dockerHosts, setDockerHosts] = useState<DockerHost[]>([]);
  const [templates, setTemplates] = useState<AlertTemplate[]>([]);
  const [containers, setContainers] = useState<DockerContainer[]>([]);
  const [k8sPods, setK8sPods] = useState<K8sOverviewPod[]>([]);
  const [dockerHostContainers, setDockerHostContainers] = useState<DockerHostContainer[]>([]);
  const [notificationPolicies, setNotificationPolicies] = useState<NotificationPolicy[]>([]);

  const [resourceKind, setResourceKind] = useState<AlertRuleResourceKind>(lockedResourceKind ?? "VM");
  const [typeChoice, setTypeChoice] = useState<ResourceTypeChoice>(
    lockedResourceKind && lockedResourceKind !== "VM" ? lockedResourceKind : "VM_INVENTORY"
  );
  const [resourceId, setResourceId] = useState(lockedResourceId ?? "");
  const [containerId, setContainerId] = useState("");
  const [k8sPodId, setK8sPodId] = useState("");
  const [dockerHostContainerId, setDockerHostContainerId] = useState("");
  const [templateType, setTemplateType] = useState("");

  const [condition, setCondition] = useState<AlertCondition>(">");
  const [threshold, setThreshold] = useState("");
  const [durationSeconds, setDurationSeconds] = useState("300");
  const [severity, setSeverity] = useState<AlertSeverity>("WARNING");
  const [notificationPolicyId, setNotificationPolicyId] = useState("");
  const [enabled, setEnabled] = useState(true);

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    listVMs().then((res) => setVms(res.vms)).catch(() => setVms([]));
    listDatabases().then((res) => setDatabases(res.databases)).catch(() => setDatabases([]));
    listObjectStorage().then((res) => setObjectStorages(res.storages)).catch(() => setObjectStorages([]));
    listK8sClusters().then((res) => setK8sClusters(res.clusters)).catch(() => setK8sClusters([]));
    listDockerHosts().then((res) => setDockerHosts(res.hosts)).catch(() => setDockerHosts([]));
    listNotificationPolicies().then((res) => setNotificationPolicies(res.notification_policies)).catch(() => setNotificationPolicies([]));
    listAlertRuleTemplates()
      .then((res) => setTemplates(res.templates))
      .catch(() => setError("Failed to load alert rule templates."));
  }, []);

  useEffect(() => {
    // Sub-targets are only meaningful once a parent resource is chosen --
    // fetched fresh per selection, so this can't be pure render-time
    // derivation.
    if (resourceKind === "VM" && resourceId) {
      listDockerContainers(resourceId, { page_size: 200 })
        .then((res) => setContainers(res.containers))
        .catch(() => setContainers([]));
    } else {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setContainers([]);
    }

    if (resourceKind === "K8S_CLUSTER" && resourceId) {
      listK8sOverview(resourceId)
        .then((res) => setK8sPods(res.pods))
        .catch(() => setK8sPods([]));
    } else {
      setK8sPods([]);
    }

    if (resourceKind === "DOCKER_HOST" && resourceId) {
      listDockerHostContainers(resourceId)
        .then((res) => setDockerHostContainers(res.containers))
        .catch(() => setDockerHostContainers([]));
    } else {
      setDockerHostContainers([]);
    }
  }, [resourceKind, resourceId]);

  const choiceVMs = vms.filter((vm) => vmChoiceFor(vm) === typeChoice);
  const resourceCounts: Record<ResourceTypeChoice, number> = {
    VM_INVENTORY: vms.filter((vm) => vmChoiceFor(vm) === "VM_INVENTORY").length,
    VM_HOST_METRICS: vms.filter((vm) => vmChoiceFor(vm) === "VM_HOST_METRICS").length,
    DATABASE: databases.length,
    OBJECT_STORAGE: objectStorages.length,
    DOCKER_HOST: dockerHosts.length,
    K8S_CLUSTER: k8sClusters.length,
  };

  const targetsContainer = resourceKind === "VM" && containerId !== "" && containerId !== ALL;
  const targetsPod = resourceKind === "K8S_CLUSTER" && k8sPodId !== "" && k8sPodId !== ALL;
  const targetsHostContainer = resourceKind === "DOCKER_HOST" && dockerHostContainerId !== "" && dockerHostContainerId !== ALL;

  const applicableResourceType = targetsContainer
    ? "DOCKER_CONTAINER"
    : targetsPod
      ? "K8S_POD"
      : targetsHostContainer
        ? "DOCKER_HOST_CONTAINER"
        : resourceKind;
  const availableTemplates = templates.filter((t) => t.applies_to_resource === applicableResourceType);
  const metricTemplates = availableTemplates.filter((t) => !isLogBasedAlertTemplate(t));
  const logTemplates = availableTemplates.filter(isLogBasedAlertTemplate);
  const selectedTemplate = availableTemplates.find((t) => t.type === templateType);

  function handleTypeChoiceChange(choice: ResourceTypeChoice) {
    setTypeChoice(choice);
    handleResourceKindChange(choiceToType(choice));
  }

  function handleResourceKindChange(kind: AlertRuleResourceKind) {
    setResourceKind(kind);
    setResourceId("");
    setContainerId("");
    setK8sPodId("");
    setDockerHostContainerId("");
    setTemplateType("");
  }

  function handleSubTargetChange(setter: (v: string) => void, value: string) {
    setter(value);
    setTemplateType("");
  }

  function handleTemplateChange(type: string) {
    setTemplateType(type);
    const t = availableTemplates.find((tpl) => tpl.type === type);
    if (t) {
      setCondition(t.default_condition);
      setThreshold(String(t.default_threshold));
      setDurationSeconds(String(t.default_duration_seconds));
      setSeverity(t.default_severity);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!resourceId) {
      setError("Choose a resource.");
      return;
    }
    if (!templateType) {
      setError("Choose an alert type.");
      return;
    }
    const thresholdNum = Number(threshold);
    const durationNum = Number(durationSeconds);
    if (Number.isNaN(thresholdNum)) {
      setError("Threshold must be a number.");
      return;
    }
    if (!Number.isFinite(durationNum) || durationNum < 0) {
      setError("Duration must be a non-negative number of seconds.");
      return;
    }

    setSubmitting(true);
    try {
      await createAlertRule({
        resource_id: resourceId,
        container_id: targetsContainer ? containerId : undefined,
        k8s_pod_id: targetsPod ? k8sPodId : undefined,
        docker_host_container_id: targetsHostContainer ? dockerHostContainerId : undefined,
        alert_type: templateType,
        condition,
        threshold: thresholdNum,
        duration_seconds: durationNum,
        severity,
        notification_policy_id: notificationPolicyId || undefined,
        enabled,
      });
      onCreated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create alert rule.");
    } finally {
      setSubmitting(false);
    }
  }

  function renderTemplateOptions(list: AlertTemplate[]) {
    return list.map((t) => (
      <SelectItem key={t.type} value={t.type}>
        {t.label}
      </SelectItem>
    ));
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 rounded-lg border border-slate-200 bg-white p-4">
      <h3 className="text-sm font-semibold text-slate-900">New Alert Rule</h3>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {!lockedResourceId && (
          <>
            <div className="flex flex-col gap-1.5">
              <Label>Resource Type</Label>
              <Select value={typeChoice} onValueChange={(v) => handleTypeChoiceChange((v as ResourceTypeChoice) ?? "VM_INVENTORY")} disabled={submitting}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RESOURCE_CHOICE_ORDER.map((c) => (
                    <SelectItem key={c} value={c}>
                      {RESOURCE_TYPE_CHOICE_LABEL[c]} ({resourceCounts[c]})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>{RESOURCE_TYPE_CHOICE_ITEM[typeChoice]}</Label>
              <Select
                value={resourceId}
                onValueChange={(v) => {
                  setResourceId(v ?? "");
                  setContainerId("");
                  setK8sPodId("");
                  setDockerHostContainerId("");
                  setTemplateType("");
                }}
                disabled={submitting}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={resourceCounts[typeChoice] === 0 ? `No ${RESOURCE_TYPE_CHOICE_ITEM[typeChoice]} registered yet` : `Select a ${RESOURCE_TYPE_CHOICE_ITEM[typeChoice]}`}
                  />
                </SelectTrigger>
                <SelectContent>
                  {resourceKind === "VM" &&
                    choiceVMs.map((vm) => (
                      <SelectItem key={vm.id} value={vm.id}>
                        {vm.name} — {vm.address || vm.agent_hostname || "VM Agent"} · {vm.workspace}
                      </SelectItem>
                    ))}
                  {resourceKind === "DATABASE" &&
                    databases.map((db) => (
                      <SelectItem key={db.resource_id} value={db.resource_id}>
                        {db.name || db.database_name || db.host} — {db.type} · {db.workspace_name ?? "—"}
                      </SelectItem>
                    ))}
                  {resourceKind === "OBJECT_STORAGE" &&
                    objectStorages.map((os) => (
                      <SelectItem key={os.resource_id} value={os.resource_id}>
                        {os.name} — {os.bucket} · {os.workspace_name ?? "—"}
                      </SelectItem>
                    ))}
                  {resourceKind === "DOCKER_HOST" &&
                    dockerHosts.map((h) => (
                      <SelectItem key={h.resource_id} value={h.resource_id}>
                        {h.name} — {h.agent_connected ? "connected" : "not connected"} · {h.workspace_name}
                      </SelectItem>
                    ))}
                  {resourceKind === "K8S_CLUSTER" &&
                    k8sClusters.map((c) => (
                      <SelectItem key={c.resource_id} value={c.resource_id}>
                        {c.name} — {c.agent_connected ? "connected" : "not connected"} · {c.workspace_name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              {resourceCounts[typeChoice] === 0 && (
                <p className="text-xs text-slate-500">Register one under {RESOURCE_TYPE_CHOICE_WHERE[typeChoice]}.</p>
              )}
            </div>
          </>
        )}

        {resourceKind === "VM" && resourceId && containers.length > 0 && (
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label>Target</Label>
            <Select value={containerId || ALL} onValueChange={(v) => handleSubTargetChange(setContainerId, v ?? ALL)} disabled={submitting}>
              <SelectTrigger>
                <SelectValue placeholder="The VM itself" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>The VM itself</SelectItem>
                {containers.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    Container: {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {resourceKind === "K8S_CLUSTER" && resourceId && k8sPods.length > 0 && (
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label>Pod (optional)</Label>
            <Select value={k8sPodId || ALL} onValueChange={(v) => handleSubTargetChange(setK8sPodId, v ?? ALL)} disabled={submitting}>
              <SelectTrigger>
                <SelectValue placeholder="The whole cluster" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>The whole cluster</SelectItem>
                {k8sPods.map((p) => (
                  <SelectItem key={p.pod_id} value={p.pod_id}>
                    Pod: {p.namespace ? `${p.namespace}/` : ""}
                    {p.pod_name ?? p.display_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {resourceKind === "DOCKER_HOST" && resourceId && dockerHostContainers.length > 0 && (
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label>Container (optional)</Label>
            <Select
              value={dockerHostContainerId || ALL}
              onValueChange={(v) => handleSubTargetChange(setDockerHostContainerId, v ?? ALL)}
              disabled={submitting}
            >
              <SelectTrigger>
                <SelectValue placeholder="The whole host" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>The whole host</SelectItem>
                {dockerHostContainers.map((c) => (
                  <SelectItem key={c.container_id} value={c.container_id}>
                    Container: {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label>Alert Type</Label>
          <Select value={templateType} onValueChange={(v) => handleTemplateChange(v ?? "")} disabled={submitting || !resourceId}>
            <SelectTrigger>
              <SelectValue placeholder="Select an alert type" />
            </SelectTrigger>
            <SelectContent>
              {metricTemplates.length > 0 && (
                <SelectGroup>
                  <SelectLabel>Metrics</SelectLabel>
                  {renderTemplateOptions(metricTemplates)}
                </SelectGroup>
              )}
              {logTemplates.length > 0 && (
                <SelectGroup>
                  <SelectLabel>Log Management</SelectLabel>
                  {renderTemplateOptions(logTemplates)}
                </SelectGroup>
              )}
            </SelectContent>
          </Select>
          {selectedTemplate && <p className="text-xs text-slate-500">Metric: {selectedTemplate.metric}</p>}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label>Condition</Label>
          <Select value={condition} onValueChange={(v) => setCondition((v as AlertCondition) ?? ">")} disabled={submitting}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CONDITIONS.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label>Threshold</Label>
          <Input type="number" step="any" value={threshold} onChange={(e) => setThreshold(e.target.value)} disabled={submitting} />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label>Duration (seconds)</Label>
          <Input
            type="number"
            min={0}
            value={durationSeconds}
            onChange={(e) => setDurationSeconds(e.target.value)}
            disabled={submitting}
          />
          <p className="text-xs text-slate-500">How long the breach must hold before an alert is raised.</p>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label>Severity</Label>
          <Select value={severity} onValueChange={(v) => setSeverity((v as AlertSeverity) ?? "WARNING")} disabled={submitting}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SEVERITIES.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label>Notification Policy</Label>
          <Select value={notificationPolicyId || ALL} onValueChange={(v) => setNotificationPolicyId(v === ALL ? "" : v ?? "")} disabled={submitting}>
            <SelectTrigger>
              <SelectValue placeholder="Use the default policy" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Use the default policy</SelectItem>
              {notificationPolicies.map((p) => {
                const channels = configuredChannels(p);
                return (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                    {p.is_default ? " (default)" : ""} — {channels.length > 0 ? channels.map((c) => CHANNEL_LABELS[c] ?? c).join(", ") : "no channels configured"}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
          <p className="text-xs text-slate-500">
            Which configured channel (Email, Teams, Slack, Webhook, In-App) actually delivers this alert -- manage
            channels under Alerts &rsaquo; Notifications.
          </p>
        </div>
      </div>

      <label className="flex w-fit items-center gap-2 text-sm text-slate-700">
        <Checkbox checked={enabled} onCheckedChange={(v) => setEnabled(v === true)} disabled={submitting} />
        Enabled immediately
      </label>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onCancel} disabled={submitting}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={submitting}>
          {submitting ? "Saving…" : "Save Rule"}
        </Button>
      </div>
    </form>
  );
}
