"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ApiError, updateObjectStorage, type ObjectStorageDetail, type ObjectStorageProvider } from "@/lib/api";

const PROVIDERS: ObjectStorageProvider[] = ["AWS_S3", "DIGITALOCEAN_SPACES", "MINIO", "S3_COMPATIBLE"];

// Lets an admin go back and fix/complete connection details after initial
// setup -- endpoint, region, bucket, base path, and credentials were all
// only ever settable once, at creation; nothing here mirrors createObjectStorage's
// AddObjectStorageForm exactly, since editing needs three extra things
// that form never has: current values pre-filled, an explicit "leave secret
// key unchanged" default (never re-shown, never required to re-enter), and
// clearing endpoint/region/base_path back to empty (updateObjectStorage's
// backend counterpart was fixed alongside this to actually support that --
// previously an empty string there was silently ignored as "no change").
export function EditObjectStorageForm({
  storage,
  onSaved,
  onCancel,
}: {
  storage: ObjectStorageDetail;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(storage.name);
  const [provider, setProvider] = useState<ObjectStorageProvider>(storage.provider);
  const [endpoint, setEndpoint] = useState(storage.endpoint ?? "");
  const [region, setRegion] = useState(storage.region ?? "");
  const [bucket, setBucket] = useState(storage.bucket);
  const [basePath, setBasePath] = useState(storage.base_path ?? "");
  const [accessKey, setAccessKey] = useState(storage.access_key_id ?? "");
  const [secretKey, setSecretKey] = useState("");
  const [tlsEnabled, setTlsEnabled] = useState(storage.tls_enabled);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) {
      setError("Name is required.");
      return;
    }
    if (!bucket.trim()) {
      setError("Bucket is required.");
      return;
    }
    if (provider !== "AWS_S3" && !endpoint.trim()) {
      setError("Endpoint is required for DigitalOcean Spaces / MinIO / S3-compatible.");
      return;
    }
    setSubmitting(true);
    try {
      await updateObjectStorage(storage.id, {
        name: name.trim(),
        provider,
        endpoint: endpoint.trim(),
        region: region.trim(),
        bucket: bucket.trim(),
        base_path: basePath.trim(),
        tls_enabled: tlsEnabled,
        access_key_id: accessKey.trim(),
        // Omitted entirely (not sent as "") when left blank -- re-entering
        // the secret every time you just want to fix the region would be a
        // real hazard (a blank field saved as-is would wipe a working
        // credential). Only sent when the admin actually typed a new one.
        ...(secretKey ? { secret_access_key: secretKey } : {}),
      });
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to update object storage.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 rounded-lg border border-slate-200 bg-white p-4">
      <h3 className="text-sm font-semibold text-slate-900">Edit Connection</h3>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label>Name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} disabled={submitting} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Provider</Label>
          <Select value={provider} onValueChange={(v) => setProvider(v as ObjectStorageProvider)} disabled={submitting}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PROVIDERS.map((p) => (
                <SelectItem key={p} value={p}>
                  {p}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label>Endpoint {provider === "AWS_S3" ? "(optional)" : ""}</Label>
          <Input value={endpoint} onChange={(e) => setEndpoint(e.target.value)} disabled={submitting} placeholder="https://nyc3.digitaloceanspaces.com" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Region (optional)</Label>
          <Input value={region} onChange={(e) => setRegion(e.target.value)} disabled={submitting} placeholder="us-east-1" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Bucket</Label>
          <Input value={bucket} onChange={(e) => setBucket(e.target.value)} disabled={submitting} />
        </div>
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label>Base Path (optional)</Label>
          <Input value={basePath} onChange={(e) => setBasePath(e.target.value)} disabled={submitting} placeholder="prefix/within/bucket" />
          <p className="text-xs text-slate-500">
            Scopes the Browser tab to only this prefix. Leave empty to browse the whole bucket from its root.
          </p>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Access Key</Label>
          <Input value={accessKey} onChange={(e) => setAccessKey(e.target.value)} disabled={submitting} autoComplete="off" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Secret Key</Label>
          <Input
            type="password"
            value={secretKey}
            onChange={(e) => setSecretKey(e.target.value)}
            disabled={submitting}
            autoComplete="new-password"
            placeholder={storage.credential_configured ? "Leave blank to keep the current secret key" : ""}
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-6">
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <Checkbox checked={tlsEnabled} onCheckedChange={(v) => setTlsEnabled(v === true)} disabled={submitting} />
          TLS enabled
        </label>
      </div>

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
          {submitting ? "Saving…" : "Save"}
        </Button>
      </div>
    </form>
  );
}
