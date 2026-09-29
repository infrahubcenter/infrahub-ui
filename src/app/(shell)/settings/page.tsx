"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { useTheme } from "@/components/theme-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ApiError,
  changeMyPassword,
  getMeSettings,
  getPlatformSettings,
  getSignInMethods,
  testOAuthSignIn,
  testSMTPSignIn,
  updateGitHubSignIn,
  updateGoogleSignIn,
  updateMeSettings,
  updateSMTPSignIn,
  type DateFormat,
  type DatabaseConnectionStatus,
  type MeSettings,
  type MutableNotificationCategory,
  type PlatformSettings,
  type SignInMethods,
  type SMTPSettingsInput,
  type Theme,
  isAdminRole,
} from "@/lib/api";

const MUTABLE_CATEGORY_LABEL: Record<MutableNotificationCategory, string> = {
  WARNING: "Warning alerts",
  OPERATIONS: "Operations completed / failed",
  VM_EVENT: "VM events",
  DATABASE_EVENT: "Database events",
  DOCKER_EVENT: "Docker events",
  SYSTEM_EVENT: "System notifications",
};
const MUTABLE_CATEGORIES = Object.keys(MUTABLE_CATEGORY_LABEL) as MutableNotificationCategory[];

export default function SettingsPage() {
  const { user } = useAuth();
  const isAdmin = isAdminRole(user?.role);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Settings</h2>
        <p className="text-sm text-slate-500">Manage your personal preferences and platform configuration.</p>
      </div>

      <Tabs defaultValue="personal">
        <TabsList>
          <TabsTrigger value="personal">Personal</TabsTrigger>
          {isAdmin && <TabsTrigger value="platform">Platform</TabsTrigger>}
          {isAdmin && <TabsTrigger value="security">Security</TabsTrigger>}
        </TabsList>

        <TabsContent value="personal">
          <PersonalSettingsTab />
        </TabsContent>
        {isAdmin && (
          <TabsContent value="platform">
            <PlatformSettingsTab />
          </TabsContent>
        )}
        {isAdmin && (
          <TabsContent value="security">
            <SecuritySettingsTab />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}

function SavedNotice({ saved }: { saved: boolean }) {
  if (!saved) return null;
  return <p className="text-sm text-emerald-600">Saved.</p>;
}

// Whether this sign-in method already has real credentials stored --
// distinct from SavedNotice above, which only flashes right after this
// form's own Save button is clicked. This reflects the persisted
// signin-methods state itself, so it's still showing correctly on a page
// reload, days later, regardless of who configured it.
function ConfiguredBadge({ configured }: { configured: boolean }) {
  if (!configured) return null;
  return (
    <Badge className="gap-1 bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200 dark:bg-emerald-950 dark:text-emerald-400 dark:ring-emerald-800">
      Saved
    </Badge>
  );
}

// === Personal ===

function PersonalSettingsTab() {
  const { theme, setTheme } = useTheme();
  const [settings, setSettings] = useState<MeSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState("");
  const [timezone, setTimezone] = useState("UTC");
  const [dateFormat, setDateFormat] = useState<DateFormat>("YYYY-MM-DD");
  const [muted, setMuted] = useState<Set<MutableNotificationCategory>>(new Set());

  useEffect(() => {
    getMeSettings()
      .then((s) => {
        setSettings(s);
        setName(s.name);
        setTimezone(s.timezone);
        setDateFormat(s.date_format);
        setMuted(new Set(s.muted_notification_categories));
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Unable to load settings."));
  }, []);

  const flashSaved = useCallback(() => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }, []);

  async function handleThemeChange(next: Theme) {
    setTheme(next);
    flashSaved();
  }

  async function handleSaveProfile() {
    setSaving(true);
    setError(null);
    try {
      const updated = await updateMeSettings({ name, timezone, date_format: dateFormat });
      setSettings(updated);
      flashSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save settings.");
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleCategory(category: MutableNotificationCategory, receive: boolean) {
    const next = new Set(muted);
    if (receive) next.delete(category);
    else next.add(category);
    setMuted(next);
    setSaving(true);
    setError(null);
    try {
      const updated = await updateMeSettings({ muted_notification_categories: Array.from(next) });
      setSettings(updated);
      flashSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save notification preferences.");
      setMuted(new Set(settings?.muted_notification_categories ?? [])); // roll back on failure
    } finally {
      setSaving(false);
    }
  }

  if (!settings && !error) {
    return <p className="text-sm text-slate-500">Loading settings&hellip;</p>;
  }

  return (
    <div className="flex max-w-2xl flex-col gap-8">
      {error && <p className="text-sm text-red-600">{error}</p>}

      <section className="flex flex-col gap-3">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Profile</h3>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="settings-name">Display name</Label>
          <Input id="settings-name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Email</Label>
          <Input value={settings?.email ?? ""} disabled />
        </div>
        <div>
          <Button size="sm" onClick={handleSaveProfile} disabled={saving}>
            Save
          </Button>
        </div>
      </section>

      <ChangePasswordSection />

      <section className="flex flex-col gap-3">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Theme</h3>
        <div className="flex gap-2">
          {(["SYSTEM", "LIGHT", "DARK"] as Theme[]).map((t) => (
            <Button key={t} size="sm" variant={theme === t ? "default" : "outline"} onClick={() => handleThemeChange(t)}>
              {t.charAt(0) + t.slice(1).toLowerCase()}
            </Button>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Date &amp; Time</h3>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="settings-timezone">Timezone</Label>
          <Input
            id="settings-timezone"
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
            placeholder="e.g. UTC, America/New_York, Asia/Kolkata"
          />
          <p className="text-xs text-slate-400">An IANA timezone name.</p>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Date format</Label>
          <Select value={dateFormat} onValueChange={(v) => v && setDateFormat(v as DateFormat)}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="YYYY-MM-DD">YYYY-MM-DD</SelectItem>
              <SelectItem value="MM/DD/YYYY">MM/DD/YYYY</SelectItem>
              <SelectItem value="DD/MM/YYYY">DD/MM/YYYY</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Button size="sm" onClick={handleSaveProfile} disabled={saving}>
            Save
          </Button>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Notification Preferences</h3>
        <p className="text-xs text-slate-500">
          Controls in-app notifications only. Critical alerts always notify every authorized recipient
          and cannot be muted.
        </p>
        <label className="flex items-center gap-2 text-sm text-slate-400">
          <Checkbox checked disabled />
          Critical alerts (always on)
        </label>
        {MUTABLE_CATEGORIES.map((category) => (
          <label key={category} className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
            <Checkbox
              checked={!muted.has(category)}
              onCheckedChange={(v) => handleToggleCategory(category, v === true)}
              disabled={saving}
            />
            {MUTABLE_CATEGORY_LABEL[category]}
          </label>
        ))}
      </section>

      <SavedNotice saved={saved} />
    </div>
  );
}

// Self-service, any role -- the backend's target is always the caller,
// never a request field, so there's no admin-reset variant of this form
// to keep in sync with.
function ChangePasswordSection() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  const mismatch = confirmPassword.length > 0 && newPassword !== confirmPassword;
  const canSubmit = currentPassword !== "" && newPassword.length >= 12 && newPassword === confirmPassword;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || saving) return;
    setSaving(true);
    setError(null);
    try {
      await changeMyPassword(currentPassword, newPassword);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to change password.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Password</h3>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="settings-current-password">Current password</Label>
          <Input
            id="settings-current-password"
            type="password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="settings-new-password">New password</Label>
          <Input
            id="settings-new-password"
            type="password"
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
          />
          <p className="text-xs text-slate-400">At least 12 characters.</p>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="settings-confirm-password">Confirm new password</Label>
          <Input
            id="settings-confirm-password"
            type="password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            aria-invalid={mismatch}
          />
          {mismatch && <p className="text-xs text-red-600">Passwords do not match.</p>}
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div>
          <Button type="submit" size="sm" disabled={!canSubmit || saving}>
            {saving ? "Changing…" : "Change Password"}
          </Button>
        </div>
      </form>
      <SavedNotice saved={saved} />
    </section>
  );
}

// === Notifications (Admin) ===
// Reuses Step 16's existing notification-policy API end to end -- the one
// genuinely admin-editable "platform setting" today. No new backend here.

// === Platform / Security (Admin, read-only) ===
// Every value here is a live echo of backend config -- none of it is
// runtime-editable today, so there is no Save button and no PUT. See
// internal/handlers/platform_settings.go's own doc comment for why.

function usePlatformSettings() {
  const [settings, setSettings] = useState<PlatformSettings | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getPlatformSettings()
      .then(setSettings)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Unable to load platform settings."));
  }, []);

  return { settings, error };
}

function ConfigRow({ label, value }: { label: string; value: string | number | boolean }) {
  return (
    <div className="flex items-center justify-between border-b border-slate-100 py-2 text-sm last:border-0 dark:border-slate-800">
      <span className="text-slate-500">{label}</span>
      <span className="font-mono text-slate-900 dark:text-slate-100">{String(value)}</span>
    </div>
  );
}

function PlatformSettingsTab() {
  const { settings, error } = usePlatformSettings();
  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!settings) return <p className="text-sm text-slate-500">Loading platform settings&hellip;</p>;

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <p className="text-xs text-slate-500">
        Configured via environment variables at deployment time -- read-only here. See
        docs/deployment.md for how to change any of these.
      </p>
      <section className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <h3 className="mb-2 text-sm font-semibold text-slate-900 dark:text-slate-100">General</h3>
        <ConfigRow label="Platform name" value={settings.platform_name} />
      </section>
      <section className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <h3 className="mb-2 text-sm font-semibold text-slate-900 dark:text-slate-100">Monitoring</h3>
        <ConfigRow label="VM monitor interval" value={settings.vm_monitor_interval} />
        <ConfigRow label="VM monitor retention (days)" value={settings.vm_monitor_retention_days} />
        <ConfigRow label="Docker metrics interval" value={settings.docker_metrics_interval} />
        <ConfigRow label="Database metrics interval" value={settings.database_metrics_interval} />
        <ConfigRow label="Database metrics retention (days)" value={settings.database_metrics_retention_days} />
        <ConfigRow label="Object storage metrics interval" value={settings.object_storage_metrics_interval} />
        <ConfigRow label="Alert evaluation interval" value={settings.alert_eval_interval} />
      </section>
      {/* Sign-in Methods (GitHub/Google/SMTP) is Owner-only -- not shown to
          Admin at all, not even read-only status, per explicit request. */}
      {settings.is_owner && (
        <section className="flex flex-col gap-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Sign-in Methods</h3>
            <p className="text-xs text-slate-500">
              Owner-only. Saved changes take effect on the next login attempt -- no restart needed.
            </p>
          </div>
          <SignInMethodsEditor />
        </section>
      )}
    </div>
  );
}

// === Sign-in Methods editor (Owner-only) ===

function SignInMethodsEditor() {
  const [methods, setMethods] = useState<SignInMethods | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    getSignInMethods()
      .then(setMethods)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Unable to load sign-in methods."));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!methods) return <p className="text-sm text-slate-500">Loading sign-in methods&hellip;</p>;

  return (
    <div className="flex flex-col gap-4">
      <GitHubSignInForm methods={methods} onSaved={load} />
      <GoogleSignInForm methods={methods} onSaved={load} />
      <SMTPSignInForm methods={methods} onSaved={load} />
    </div>
  );
}

// OAuth "test" can only ever confirm the provider recognizes this Client
// ID/Secret pair -- never that a full browser consent flow would actually
// succeed (that needs a real redirect). Labeled "Credentials recognized"
// rather than "Login verified" so it doesn't overpromise.
function describeOAuthTestStatus(status: DatabaseConnectionStatus): string {
  switch (status) {
    case "CONNECTED":
      return "Credentials recognized by the provider.";
    case "AUTH_FAILED":
      return "Provider rejected these credentials.";
    case "TIMEOUT":
      return "Timed out reaching the provider.";
    case "REFUSED":
      return "Connection refused.";
    case "TLS_ERROR":
      return "TLS/certificate error.";
    case "UNAVAILABLE":
      return "Provider unavailable.";
    default:
      return "Unable to determine credential status.";
  }
}

function describeSMTPTestStatus(status: DatabaseConnectionStatus): string {
  switch (status) {
    case "CONNECTED":
      return "Test email sent.";
    case "AUTH_FAILED":
      return "Authentication failed -- check the username/password.";
    case "TIMEOUT":
      return "Timed out reaching the server.";
    case "REFUSED":
      return "Connection refused.";
    case "TLS_ERROR":
      return "TLS/certificate error.";
    case "UNAVAILABLE":
      return "Server unavailable.";
    default:
      return "Unable to send test email.";
  }
}

function GitHubSignInForm({ methods, onSaved }: { methods: SignInMethods; onSaved: () => void }) {
  const [clientId, setClientId] = useState(methods.github_client_id);
  const [clientSecret, setClientSecret] = useState("");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    setMessage(null);
    try {
      await updateGitHubSignIn({ client_id: clientId, client_secret: clientSecret || undefined });
      setClientSecret("");
      setMessage("Saved.");
      onSaved();
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : "Failed to save GitHub settings.");
    } finally {
      setSaving(false);
    }
  }

  async function handleTest() {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await testOAuthSignIn("github", { client_id: clientId, client_secret: clientSecret || undefined });
      setTestResult(describeOAuthTestStatus(result.connection_status));
    } catch (err) {
      setTestResult(err instanceof ApiError ? err.message : "Failed to test GitHub credentials.");
    } finally {
      setTesting(false);
    }
  }

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="mb-1 flex items-center gap-2">
        <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">GitHub</h4>
        <ConfiguredBadge configured={Boolean(methods.github_client_id) && methods.github_secret_set} />
      </div>
      <p className="mb-3 text-xs text-slate-500">
        Create an OAuth App at github.com/settings/developers with an authorization callback URL pointing at this
        backend&apos;s own origin.
      </p>
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="github-client-id">Client ID</Label>
          <Input id="github-client-id" value={clientId} onChange={(e) => setClientId(e.target.value)} disabled={saving} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="github-client-secret">Client Secret</Label>
          <Input
            id="github-client-secret"
            type="password"
            value={clientSecret}
            onChange={(e) => setClientSecret(e.target.value)}
            placeholder={methods.github_secret_set ? "Leave blank to keep the saved secret" : "Not set"}
            disabled={saving}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
          <Button variant="outline" size="sm" onClick={handleTest} disabled={testing || !clientId}>
            {testing ? "Testing…" : "Test Connection"}
          </Button>
          {testResult && <span className="text-xs text-slate-600 dark:text-slate-400">{testResult}</span>}
        </div>
        {message && <p className="text-xs text-emerald-600">{message}</p>}
      </div>
    </section>
  );
}

function GoogleSignInForm({ methods, onSaved }: { methods: SignInMethods; onSaved: () => void }) {
  const [clientId, setClientId] = useState(methods.google_client_id);
  const [clientSecret, setClientSecret] = useState("");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    setMessage(null);
    try {
      await updateGoogleSignIn({ client_id: clientId, client_secret: clientSecret || undefined });
      setClientSecret("");
      setMessage("Saved.");
      onSaved();
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : "Failed to save Google settings.");
    } finally {
      setSaving(false);
    }
  }

  async function handleTest() {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await testOAuthSignIn("google", { client_id: clientId, client_secret: clientSecret || undefined });
      setTestResult(describeOAuthTestStatus(result.connection_status));
    } catch (err) {
      setTestResult(err instanceof ApiError ? err.message : "Failed to test Google credentials.");
    } finally {
      setTesting(false);
    }
  }

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="mb-1 flex items-center gap-2">
        <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Google</h4>
        <ConfiguredBadge configured={Boolean(methods.google_client_id) && methods.google_secret_set} />
      </div>
      <p className="mb-3 text-xs text-slate-500">
        Create an OAuth Client ID at console.cloud.google.com with an authorized redirect URI pointing at this
        backend&apos;s own origin.
      </p>
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="google-client-id">Client ID</Label>
          <Input id="google-client-id" value={clientId} onChange={(e) => setClientId(e.target.value)} disabled={saving} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="google-client-secret">Client Secret</Label>
          <Input
            id="google-client-secret"
            type="password"
            value={clientSecret}
            onChange={(e) => setClientSecret(e.target.value)}
            placeholder={methods.google_secret_set ? "Leave blank to keep the saved secret" : "Not set"}
            disabled={saving}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
          <Button variant="outline" size="sm" onClick={handleTest} disabled={testing || !clientId}>
            {testing ? "Testing…" : "Test Connection"}
          </Button>
          {testResult && <span className="text-xs text-slate-600 dark:text-slate-400">{testResult}</span>}
        </div>
        {message && <p className="text-xs text-emerald-600">{message}</p>}
      </div>
    </section>
  );
}

function SMTPSignInForm({ methods, onSaved }: { methods: SignInMethods; onSaved: () => void }) {
  const [host, setHost] = useState(methods.smtp_host);
  const [port, setPort] = useState(methods.smtp_port || 587);
  const [username, setUsername] = useState(methods.smtp_username);
  const [password, setPassword] = useState("");
  const [fromEmail, setFromEmail] = useState(methods.smtp_from_email);
  const [useTLS, setUseTLS] = useState(methods.smtp_use_tls);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<string | null>(null);

  function buildPayload(): SMTPSettingsInput {
    return { host, port, username, password: password || undefined, from_email: fromEmail, use_tls: useTLS };
  }

  async function handleSave() {
    setSaving(true);
    setMessage(null);
    try {
      await updateSMTPSignIn(buildPayload());
      setPassword("");
      setMessage("Saved.");
      onSaved();
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : "Failed to save SMTP settings.");
    } finally {
      setSaving(false);
    }
  }

  async function handleTest() {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await testSMTPSignIn(buildPayload());
      setTestResult(describeSMTPTestStatus(result.connection_status));
    } catch (err) {
      setTestResult(err instanceof ApiError ? err.message : "Failed to send test email.");
    } finally {
      setTesting(false);
    }
  }

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="mb-1 flex items-center gap-2">
        <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">SMTP (Invite Emails)</h4>
        <ConfiguredBadge configured={Boolean(methods.smtp_host) && methods.smtp_password_set} />
      </div>
      <p className="mb-3 text-xs text-slate-500">
        Used to email a temporary password whenever a new user is invited. Test Connection sends a real email to
        your own address.
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="smtp-host">Host</Label>
          <Input id="smtp-host" value={host} onChange={(e) => setHost(e.target.value)} disabled={saving} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="smtp-port">Port</Label>
          <Input
            id="smtp-port"
            type="number"
            value={port}
            onChange={(e) => setPort(Number(e.target.value))}
            disabled={saving}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="smtp-username">Username</Label>
          <Input id="smtp-username" value={username} onChange={(e) => setUsername(e.target.value)} disabled={saving} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="smtp-password">Password</Label>
          <Input
            id="smtp-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={methods.smtp_password_set ? "Leave blank to keep the saved password" : "Not set"}
            disabled={saving}
          />
        </div>
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label htmlFor="smtp-from">From email</Label>
          <Input
            id="smtp-from"
            type="email"
            value={fromEmail}
            onChange={(e) => setFromEmail(e.target.value)}
            disabled={saving}
          />
        </div>
      </div>
      <label className="mt-3 flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
        <Checkbox checked={useTLS} onCheckedChange={(v) => setUseTLS(v === true)} disabled={saving} />
        Use TLS
      </label>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={handleSave} disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </Button>
        <Button variant="outline" size="sm" onClick={handleTest} disabled={testing || !host}>
          {testing ? "Sending test email…" : "Test Connection"}
        </Button>
        {testResult && <span className="text-xs text-slate-600 dark:text-slate-400">{testResult}</span>}
      </div>
      {message && <p className="mt-2 text-xs text-emerald-600">{message}</p>}
    </section>
  );
}

function SecuritySettingsTab() {
  const { settings, error } = usePlatformSettings();
  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!settings) return <p className="text-sm text-slate-500">Loading security settings&hellip;</p>;

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <p className="text-xs text-slate-500">
        Configured via environment variables at deployment time -- read-only here.
      </p>
      <section className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <h3 className="mb-2 text-sm font-semibold text-slate-900 dark:text-slate-100">Session</h3>
        <ConfigRow label="Access token lifetime (minutes)" value={settings.access_token_ttl_minutes} />
        <ConfigRow label="Refresh token lifetime (days)" value={settings.refresh_token_ttl_days} />
        <ConfigRow label="Secure cookies" value={settings.cookie_secure} />
      </section>
      <section className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <h3 className="mb-2 text-sm font-semibold text-slate-900 dark:text-slate-100">Login Protection</h3>
        <ConfigRow label="Login attempts allowed" value={settings.login_rate_limit_attempts} />
        <ConfigRow label="Per window" value={settings.login_rate_limit_window} />
      </section>
      <section className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <h3 className="mb-2 text-sm font-semibold text-slate-900 dark:text-slate-100">Requests</h3>
        <ConfigRow label="Max request body (bytes)" value={settings.max_request_body_bytes} />
      </section>
    </div>
  );
}
