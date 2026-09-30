"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Pencil, Plus, SlidersHorizontal, Trash2 } from "lucide-react";
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
  SelectItem,
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
import { thresholdExplanation, thresholdKind, thresholdPresets, thresholdUnit } from "@/lib/alert-thresholds";

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
  const [editing, setEditing] = useState<AlertRuleListItem | null>(null);
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
          {/* Status and action are separate: the old single button showed the
              current state ("Enabled") but clicking it turned the rule off,
              which read like a confirmation and silently disabled rules. */}
          <div className="flex items-center gap-2">
            <span
              className={
                item.rule.enabled
                  ? "inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-200"
                  : "inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 ring-1 ring-inset ring-slate-200"
              }
            >
              <span className={item.rule.enabled ? "h-1.5 w-1.5 rounded-full bg-emerald-500" : "h-1.5 w-1.5 rounded-full bg-slate-400"} />
              {item.rule.enabled ? "Enabled" : "Disabled"}
            </span>
            <Button variant="outline" size="sm" disabled={busyId === item.rule.id} onClick={() => handleToggleEnabled(item)}>
              {item.rule.enabled ? "Disable" : "Enable"}
            </Button>
          </div>
        </TableCell>
        <TableCell className="text-slate-600">
          {item.rule.suppressed_until ? (
            <Badge variant="outline">until {new Date(item.rule.suppressed_until).toLocaleString()}</Badge>
          ) : (
            "—"
          )}
        </TableCell>
        <TableCell>
          <div className="flex items-center justify-end gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Edit rule"
            title="Edit rule"
            disabled={busyId === item.rule.id}
            onClick={() => {
              setShowForm(false);
              setEditing(item);
            }}
          >
            <Pencil className="h-4 w-4" />
          </Button>
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
          </div>
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
            Configure when a metric breach on a Compute Inventory or Host Metrics &amp; Logs VM, a Database
            Observability database, an Object Storage (S3) bucket, a Docker Monitoring host/container or a
            Kubernetes Monitoring cluster/pod -- or a burst of error-level logs from Log Management -- should raise
            an alert. Rules never execute anything -- they only observe and notify.
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => {
            setEditing(null);
            setShowForm((v) => !v);
          }}
        >
          <Plus className="h-4 w-4" /> New Rule
        </Button>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {editing && (
        <EditAlertRuleForm
          key={editing.rule.id}
          item={editing}
          onSaved={() => {
            setEditing(null);
            load();
          }}
          onCancel={() => setEditing(null)}
        />
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

type TypeSettings = { condition: AlertCondition; threshold: string; duration: string };
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
  // Ticked alert types, each with its own condition/threshold/duration.
  const [selectedTypes, setSelectedTypes] = useState<Record<string, TypeSettings>>({});

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
    setSelectedTypes({});
  }

  function handleSubTargetChange(setter: (v: string) => void, value: string) {
    setter(value);
    setSelectedTypes({});
  }

  // Tick/untick one alert type; ticking starts from the template's own
  // defaults (condition, threshold, duration).
  function toggleType(t: AlertTemplate, on: boolean) {
    setSelectedTypes((prev) => {
      const next = { ...prev };
      if (on) {
        next[t.type] = {
          condition: t.default_condition,
          threshold: String(t.default_threshold),
          duration: String(t.default_duration_seconds),
        };
      } else {
        delete next[t.type];
      }
      return next;
    });
  }

  function updateType(type: string, patch: Partial<TypeSettings>) {
    setSelectedTypes((prev) => (prev[type] ? { ...prev, [type]: { ...prev[type], ...patch } } : prev));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!resourceId) {
      setError("Choose a resource.");
      return;
    }
    const chosen = availableTemplates.filter((t) => selectedTypes[t.type]);
    if (chosen.length === 0) {
      setError("Tick at least one alert type.");
      return;
    }
    for (const t of chosen) {
      const cfg = selectedTypes[t.type];
      if (cfg.threshold.trim() === "" || Number.isNaN(Number(cfg.threshold))) {
        setError(`${t.label}: threshold must be a number.`);
        return;
      }
      const d = Number(cfg.duration);
      if (!Number.isFinite(d) || d < 0) {
        setError(`${t.label}: duration must be a non-negative number of seconds.`);
        return;
      }
    }

    setSubmitting(true);
    const failed: string[] = [];
    for (const t of chosen) {
      const cfg = selectedTypes[t.type];
      try {
        await createAlertRule({
          resource_id: resourceId,
          container_id: targetsContainer ? containerId : undefined,
          k8s_pod_id: targetsPod ? k8sPodId : undefined,
          docker_host_container_id: targetsHostContainer ? dockerHostContainerId : undefined,
          alert_type: t.type,
          condition: cfg.condition,
          threshold: Number(cfg.threshold),
          duration_seconds: Number(cfg.duration),
          severity,
          notification_policy_id: notificationPolicyId || undefined,
          enabled,
        });
      } catch (err) {
        failed.push(`${t.label}: ${err instanceof ApiError ? err.message : "failed"}`);
      }
    }
    setSubmitting(false);
    if (failed.length === 0) {
      onCreated();
    } else if (failed.length < chosen.length) {
      setError(`Created ${chosen.length - failed.length} of ${chosen.length} rules. Not created -- ${failed.join("; ")}`);
    } else {
      setError(`No rules created -- ${failed.join("; ")}`);
    }
  }

  function renderTypeRow(t: AlertTemplate) {
    const cfg = selectedTypes[t.type];
    const kind = thresholdKind(t);
    const unit = thresholdUnit(t);
    return (
      <div key={t.type} className={cfg ? "rounded-md border border-sky-200 bg-sky-50/40 p-3" : "rounded-md border border-slate-200 p-3"}>
        <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-slate-800">
          <Checkbox checked={!!cfg} onCheckedChange={(v) => toggleType(t, v === true)} disabled={submitting || !resourceId} />
          {t.label}
        </label>
        {cfg && (
          <div className="mt-3 grid grid-cols-1 gap-3 pl-6 sm:grid-cols-[120px_minmax(0,1fr)_140px]">
            <div className="flex flex-col gap-1">
              <Label className="text-xs">Condition</Label>
              {kind === "flag" ? (
                <p className="pt-1.5 text-sm text-slate-600">When it happens</p>
              ) : (
                <Select value={cfg.condition} onValueChange={(v) => updateType(t.type, { condition: (v as AlertCondition) ?? cfg.condition })} disabled={submitting}>
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
              )}
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs">Threshold{unit ? ` (${unit})` : ""}</Label>
              {kind === "flag" ? (
                <p className="pt-1.5 text-sm text-slate-600">Not needed -- yes/no event</p>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    type="number"
                    step="any"
                    className="w-28"
                    value={cfg.threshold}
                    onChange={(e) => updateType(t.type, { threshold: e.target.value })}
                    disabled={submitting}
                  />
                  {thresholdPresets(t).map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => updateType(t.type, { threshold: String(n) })}
                      disabled={submitting}
                      className={
                        Number(cfg.threshold) === n
                          ? "rounded-full bg-sky-600 px-2.5 py-1 text-xs font-medium text-white"
                          : "rounded-full border border-slate-300 px-2.5 py-1 text-xs text-slate-600 hover:border-sky-400 hover:text-sky-700"
                      }
                    >
                      {n}
                      {unit === "%" ? "%" : ""}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs">Duration (seconds)</Label>
              <Input type="number" min={0} value={cfg.duration} onChange={(e) => updateType(t.type, { duration: e.target.value })} disabled={submitting} />
            </div>
            <p className="text-xs text-sky-800 sm:col-span-3">{thresholdExplanation(t, cfg.condition, cfg.threshold, cfg.duration)}</p>
          </div>
        )}
      </div>
    );
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
                  setSelectedTypes({});
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

        <div className="flex flex-col gap-2 sm:col-span-2">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <Label>Alert Types</Label>
            {Object.keys(selectedTypes).length > 0 && (
              <span className="text-xs text-slate-500">{Object.keys(selectedTypes).length} selected -- one rule is created per type</span>
            )}
          </div>
          {!resourceId ? (
            <p className="text-sm text-slate-500">Choose a resource above to see the alert types available for it.</p>
          ) : availableTemplates.length === 0 ? (
            <p className="text-sm text-slate-500">No alert types are available for this target.</p>
          ) : (
            <>
              <div className="rounded-md bg-slate-50 p-3 text-xs leading-5 text-slate-600">
                <span className="font-semibold text-slate-800">What is the threshold?</span> The value each check compares the
                metric against -- e.g. Memory &gt; 90 means &ldquo;alert when more than 90% of memory is in use&rdquo;. The alert is
                raised only if the metric stays past the threshold for the whole <em>Duration</em>, so a short spike never pages
                you. Lower thresholds warn you earlier (more alerts); higher ones only flag serious problems.
              </div>
              {metricTemplates.length > 0 && (
                <div className="flex flex-col gap-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Metrics</p>
                  {metricTemplates.map(renderTypeRow)}
                </div>
              )}
              {logTemplates.length > 0 && (
                <div className="flex flex-col gap-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Log Management</p>
                  {logTemplates.map(renderTypeRow)}
                </div>
              )}
            </>
          )}
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
          {submitting
            ? "Saving…"
            : Object.keys(selectedTypes).length > 1
              ? `Save ${Object.keys(selectedTypes).length} Rules`
              : "Save Rule"}
        </Button>
      </div>
    </form>
  );
}

// Edits an existing rule's settings in place. The target (resource,
// container/pod) and alert type are fixed once created -- the update API
// only changes these settings, so they are shown read-only. The API
// replaces every field on save, so every field is sent, pre-filled with
// the rule's current values.
export function EditAlertRuleForm({
  item,
  onSaved,
  onCancel,
}: {
  item: AlertRuleListItem;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const rule = item.rule;
  const [notificationPolicies, setNotificationPolicies] = useState<NotificationPolicy[]>([]);
  const [condition, setCondition] = useState<AlertCondition>(rule.condition);
  const [threshold, setThreshold] = useState(String(rule.threshold));
  const [recoveryThreshold, setRecoveryThreshold] = useState(rule.recovery_threshold === undefined || rule.recovery_threshold === null ? "" : String(rule.recovery_threshold));
  const [durationSeconds, setDurationSeconds] = useState(String(rule.duration_seconds));
  const [severity, setSeverity] = useState<AlertSeverity>(rule.severity);
  const [notificationPolicyId, setNotificationPolicyId] = useState(rule.notification_policy_id ?? "");
  const [enabled, setEnabled] = useState(rule.enabled);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    listNotificationPolicies()
      .then((res) => setNotificationPolicies(res.notification_policies))
      .catch(() => setNotificationPolicies([]));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const thresholdNum = Number(threshold);
    const durationNum = Number(durationSeconds);
    const recoveryNum = recoveryThreshold.trim() === "" ? undefined : Number(recoveryThreshold);
    if (threshold.trim() === "" || Number.isNaN(thresholdNum)) {
      setError("Threshold must be a number.");
      return;
    }
    if (recoveryNum !== undefined && Number.isNaN(recoveryNum)) {
      setError("Recovery threshold must be a number, or left empty.");
      return;
    }
    if (!Number.isFinite(durationNum) || durationNum < 0) {
      setError("Duration must be a non-negative number of seconds.");
      return;
    }
    setSubmitting(true);
    try {
      await updateAlertRule(rule.id, {
        condition,
        threshold: thresholdNum,
        recovery_threshold: recoveryNum,
        duration_seconds: durationNum,
        severity,
        notification_policy_id: notificationPolicyId || undefined,
        enabled,
      });
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save alert rule.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 rounded-lg border border-sky-200 bg-white p-4 ring-1 ring-sky-100">
      <div>
        <h3 className="text-sm font-semibold text-slate-900">Edit Alert Rule</h3>
        <p className="mt-1 text-xs text-slate-500">
          <span className="font-medium text-slate-700">{item.resource_name}</span> · {rule.alert_type.replace(/_/g, " ")} ·{" "}
          {RESOURCE_TYPE_SECTION[item.resource_type as keyof typeof RESOURCE_TYPE_SECTION] ?? item.resource_type}. The resource and
          alert type can&apos;t be changed -- create a new rule to target something else.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label>Condition</Label>
          <Select value={condition} onValueChange={(v) => setCondition((v as AlertCondition) ?? rule.condition)} disabled={submitting}>
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
          <Input type="number" min={0} value={durationSeconds} onChange={(e) => setDurationSeconds(e.target.value)} disabled={submitting} />
          <p className="text-xs text-slate-500">How long the breach must hold before an alert is raised.</p>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label>Recovery threshold (optional)</Label>
          <Input
            type="number"
            step="any"
            value={recoveryThreshold}
            onChange={(e) => setRecoveryThreshold(e.target.value)}
            placeholder="Same as threshold"
            disabled={submitting}
          />
          <p className="text-xs text-slate-500">The alert resolves only once the value is back past this -- avoids flapping.</p>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label>Severity</Label>
          <Select value={severity} onValueChange={(v) => setSeverity((v as AlertSeverity) ?? rule.severity)} disabled={submitting}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SEVERITIES.map((sv) => (
                <SelectItem key={sv} value={sv}>
                  {sv}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label>Notification Policy</Label>
          <Select value={notificationPolicyId || ALL} onValueChange={(v) => setNotificationPolicyId(v === ALL ? "" : v ?? "")} disabled={submitting}>
            <SelectTrigger>
              <SelectValue placeholder="Use the default policy" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Use the default policy</SelectItem>
              {notificationPolicies.map((np) => {
                const channels = configuredChannels(np);
                return (
                  <SelectItem key={np.id} value={np.id}>
                    {np.name}
                    {np.is_default ? " (default)" : ""} — {channels.length > 0 ? channels.map((c) => CHANNEL_LABELS[c] ?? c).join(", ") : "no channels configured"}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </div>
      </div>

      <label className="flex w-fit items-center gap-2 text-sm text-slate-700">
        <Checkbox checked={enabled} onCheckedChange={(v) => setEnabled(v === true)} disabled={submitting} />
        Enabled
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
          {submitting ? "Saving…" : "Save Changes"}
        </Button>
      </div>
    </form>
  );
}
