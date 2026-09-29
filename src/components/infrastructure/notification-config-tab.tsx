"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ApiError,
  createNotificationPolicy,
  deleteNotificationPolicy,
  listNotificationPolicies,
  sendTestNotification,
  updateNotificationPolicy,
  type NotificationChannel,
  type NotificationPolicy,
} from "@/lib/api";

// Alerts > Notifications -- which channels fire per alert severity, and
// each channel's own delivery config + a real test-send. Moved here from
// Settings (single authoritative location, per the user's ask), reusing
// the exact same NotificationPolicy CRUD/sendTestNotification API as
// before -- only the presentation changed, from "show every channel's
// config field at once" to a channel-type dropdown that reveals just the
// selected channel's own config and Test button.
export function NotificationConfigTab() {
  const [policies, setPolicies] = useState<NotificationPolicy[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    listNotificationPolicies()
      .then((res) => setPolicies(res.notification_policies))
      .catch((err) => setError(err instanceof ApiError ? err.message : "Unable to load notification policies."));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleDelete(id: string) {
    if (!confirm("Delete this notification policy?")) return;
    try {
      await deleteNotificationPolicy(id);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to delete policy.");
    }
  }

  async function handleToggleChannel(policy: NotificationPolicy, severity: "info" | "warning" | "critical", channel: string) {
    const key = `${severity}_channels` as "info_channels" | "warning_channels" | "critical_channels";
    const current = policy[key];
    const next = current.includes(channel) ? current.filter((c) => c !== channel) : [...current, channel];
    try {
      await updateNotificationPolicy(policy.id, {
        name: policy.name,
        info_channels: severity === "info" ? next : policy.info_channels,
        warning_channels: severity === "warning" ? next : policy.warning_channels,
        critical_channels: severity === "critical" ? next : policy.critical_channels,
        webhook_url: policy.webhook_url,
        slack_webhook_url: policy.slack_webhook_url,
        teams_webhook_url: policy.teams_webhook_url,
      });
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to update policy.");
    }
  }

  async function handleSaveURLs(policy: NotificationPolicy, urls: { webhook_url: string; slack_webhook_url: string; teams_webhook_url: string }) {
    await updateNotificationPolicy(policy.id, {
      name: policy.name,
      info_channels: policy.info_channels,
      warning_channels: policy.warning_channels,
      critical_channels: policy.critical_channels,
      ...urls,
    });
    load();
  }

  if (!policies && !error) {
    return <p className="text-sm text-slate-500">Loading notification policies&hellip;</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-slate-500">Which channels fire per alert severity, each channel&rsquo;s delivery config, and a test send.</p>
      {error && <p className="text-sm text-red-600">{error}</p>}

      <CreatePolicyForm onCreated={load} />

      {policies && policies.length === 0 && (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center">
          <p className="text-sm text-slate-500">No notification policies configured.</p>
        </div>
      )}
      {policies?.map((policy) => (
        <div key={policy.id} className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="font-medium text-slate-900">{policy.name}</span>
              {policy.is_default && <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600">Default</span>}
            </div>
            {!policy.is_default && (
              <Button size="sm" variant="outline" onClick={() => handleDelete(policy.id)}>
                Delete
              </Button>
            )}
          </div>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
            {(["info", "warning", "critical"] as const).map((severity) => (
              <div key={severity}>
                <p className="text-xs font-medium uppercase text-slate-400">{severity}</p>
                {["IN_APP", "EMAIL", "SLACK", "TEAMS", "WEBHOOK"].map((channel) => (
                  <label key={channel} className="flex items-center gap-2 text-sm text-slate-700">
                    <Checkbox
                      checked={policy[`${severity}_channels`].includes(channel)}
                      onCheckedChange={() => handleToggleChannel(policy, severity, channel)}
                    />
                    {channel}
                  </label>
                ))}
              </div>
            ))}
          </div>
          <ChannelConfigSection policy={policy} onSaveURLs={(urls) => handleSaveURLs(policy, urls)} />
        </div>
      ))}
    </div>
  );
}

// New policies need a real name up front -- silently creating one named
// "Policy <timestamp>" on click with zero visible feedback reads as "the
// button doesn't do anything" and invites repeated clicks, each creating
// another blank policy.
function CreatePolicyForm({ onCreated }: { onCreated: () => void }) {
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await createNotificationPolicy({
        name: name.trim(),
        info_channels: [],
        warning_channels: ["IN_APP"],
        critical_channels: ["IN_APP"],
      });
      setName("");
      onCreated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create policy.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-end gap-2 rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex flex-1 flex-col gap-1.5">
        <Label htmlFor="new-policy-name">New Policy Name</Label>
        <Input
          id="new-policy-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Production Critical Alerts"
          disabled={submitting}
        />
      </div>
      <Button type="submit" size="sm" disabled={submitting || !name.trim()}>
        {submitting ? "Creating…" : "New Policy"}
      </Button>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </form>
  );
}

type ConfigurableChannel = Exclude<NotificationChannel, "IN_APP">;

const CHANNEL_LABEL: Record<ConfigurableChannel, string> = {
  EMAIL: "Email",
  SLACK: "Slack",
  TEAMS: "Teams",
  WEBHOOK: "Webhook",
};

const CHANNEL_URL_FIELD: Partial<Record<ConfigurableChannel, { label: string; placeholder: string }>> = {
  WEBHOOK: { label: "Webhook URL", placeholder: "https://example.com/webhook" },
  SLACK: { label: "Slack Incoming Webhook URL", placeholder: "https://hooks.slack.com/services/..." },
  TEAMS: { label: "Teams Incoming Webhook URL", placeholder: "https://outlook.office.com/webhook/..." },
};

// One channel-type dropdown (Email/Slack/Teams/Webhook) revealing just
// that channel's own config -- Slack/Teams/Webhook each deliver by
// posting to their own destination URL (created from that app's own
// admin settings, then pasted here); Email has no destination to
// configure (it goes to each recipient's own account email, delivered
// via this deployment's configured SMTP server -- this is also where a
// Gmail SMTP account would be configured, at the platform level, not
// per-policy). Every channel gets its own "Test" button so an admin can
// confirm it actually works right after configuring it, without waiting
// for a real alert to fire.
function ChannelConfigSection({
  policy,
  onSaveURLs,
}: {
  policy: NotificationPolicy;
  onSaveURLs: (urls: { webhook_url: string; slack_webhook_url: string; teams_webhook_url: string }) => Promise<void>;
}) {
  const [channel, setChannel] = useState<ConfigurableChannel>("EMAIL");
  const [webhookURL, setWebhookURL] = useState(policy.webhook_url ?? "");
  const [slackURL, setSlackURL] = useState(policy.slack_webhook_url ?? "");
  const [teamsURL, setTeamsURL] = useState(policy.teams_webhook_url ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const urlState: Partial<Record<ConfigurableChannel, [string, (v: string) => void, string]>> = {
    WEBHOOK: [webhookURL, setWebhookURL, policy.webhook_url ?? ""],
    SLACK: [slackURL, setSlackURL, policy.slack_webhook_url ?? ""],
    TEAMS: [teamsURL, setTeamsURL, policy.teams_webhook_url ?? ""],
  };
  const current = urlState[channel];
  const field = CHANNEL_URL_FIELD[channel];
  const dirty = current ? current[0] !== current[2] : false;

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      await onSaveURLs({ webhook_url: webhookURL, slack_webhook_url: slackURL, teams_webhook_url: teamsURL });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save the URL.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-4 border-t border-slate-100 pt-4">
      <div className="flex flex-col gap-1.5 sm:max-w-xs">
        <Label htmlFor={`channel-select-${policy.id}`} className="text-xs">
          Notification Channel
        </Label>
        <Select value={channel} onValueChange={(v) => setChannel((v as ConfigurableChannel) ?? "EMAIL")}>
          <SelectTrigger id={`channel-select-${policy.id}`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(CHANNEL_LABEL) as ConfigurableChannel[]).map((c) => (
              <SelectItem key={c} value={c}>
                {CHANNEL_LABEL[c]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {channel === "EMAIL" ? (
        <p className="mt-3 text-xs text-slate-500">
          Email delivers to each recipient&rsquo;s own account email via this deployment&rsquo;s configured SMTP server -- no destination URL to
          set here.
        </p>
      ) : field && current ? (
        <div className="mt-3 flex flex-col gap-1.5 sm:max-w-md">
          <Label htmlFor={`channel-url-${policy.id}`} className="text-xs">
            {field.label}
          </Label>
          <div className="flex gap-2">
            <Input
              id={`channel-url-${policy.id}`}
              value={current[0]}
              onChange={(e) => current[1](e.target.value)}
              placeholder={field.placeholder}
              disabled={saving}
              className="text-xs"
            />
            <Button size="sm" variant="outline" onClick={handleSave} disabled={saving || !dirty}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
      ) : null}

      <div className="mt-3">
        <TestChannelButton policyId={policy.id} channel={channel} />
      </div>
    </div>
  );
}

function TestChannelButton({ policyId, channel }: { policyId: string; channel: ConfigurableChannel }) {
  const [state, setState] = useState<"idle" | "sending" | "sent" | "failed">("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function handleTest() {
    setState("sending");
    setMessage(null);
    try {
      const res = await sendTestNotification(policyId, channel);
      if (res.status === "sent") {
        setState("sent");
      } else {
        setState("failed");
        setMessage(res.message ?? "Send failed.");
      }
    } catch (err) {
      setState("failed");
      setMessage(err instanceof ApiError ? err.message : "Send failed.");
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Button size="sm" variant="outline" onClick={handleTest} disabled={state === "sending"}>
        {state === "sending" ? "Sending…" : `Test ${CHANNEL_LABEL[channel]}`}
      </Button>
      {state === "sent" && <span className="text-xs text-emerald-600">✓ Sent -- check {channel === "EMAIL" ? "your inbox" : "the destination"}</span>}
      {state === "failed" && <span className="text-xs text-red-600">✗ {message}</span>}
    </div>
  );
}
