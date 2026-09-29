"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Archive, Plus } from "lucide-react";
import { useAuth } from "@/components/auth/auth-provider";
import { ObjectStorageStatusBadge } from "@/components/infrastructure/object-storage-status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
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
import { formatBytes } from "@/lib/format";
import {
  ApiError,
  createObjectStorage,
  listObjectStorage,
  listWorkspaces,
  type ObjectStorageListItem,
  type ObjectStorageProvider,
  type Workspace,
  isAdminRole,
} from "@/lib/api";

const PROVIDERS: ObjectStorageProvider[] = ["AWS_S3", "DIGITALOCEAN_SPACES", "MINIO", "S3_COMPATIBLE"];
const ALL = "__all__";

// Object storage is a first-class resource under a Workspace -- never a
// VM child -- mirroring databases/page.tsx's list shape as closely as
// possible. No metrics/browser exist yet (Phase 1), so Objects/Size
// always render "--" for now; that's expected, not a bug.
export default function ObjectStoragePage() {
  const { user } = useAuth();
  const isAdmin = isAdminRole(user?.role);

  const [storages, setStorages] = useState<ObjectStorageListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [providerFilter, setProviderFilter] = useState(ALL);
  const [workspaceFilter, setWorkspaceFilter] = useState(ALL);
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(() => {
    listObjectStorage()
      .then((res) => setStorages(res.storages))
      .catch(() => setError("Failed to load object storage."));
  }, []);

  useEffect(() => {
    // Load-on-mount: no external store to subscribe to.

    load();
  }, [load]);

  const workspaceNames = useMemo(
    () => [...new Set((storages ?? []).map((s) => s.workspace_name).filter((w): w is string => !!w))].sort(),
    [storages]
  );

  const filtered = useMemo(() => {
    if (!storages) return [];
    return storages.filter((s) => {
      if (providerFilter !== ALL && s.provider !== providerFilter) return false;
      if (workspaceFilter !== ALL && s.workspace_name !== workspaceFilter) return false;
      return true;
    });
  }, [storages, providerFilter, workspaceFilter]);

  if (error) return <p className="text-sm text-red-600">{error}</p>;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
            <Archive className="h-5 w-5" /> Object Storage
          </h2>
          <p className="text-sm text-slate-500">
            {isAdmin
              ? "Read-only monitoring for every registered bucket (AWS S3, DigitalOcean Spaces, MinIO, S3-compatible)."
              : "Object storage you're authorized on."}
          </p>
        </div>
        {isAdmin && (
          <Button size="sm" onClick={() => setShowForm((v) => !v)}>
            <Plus className="h-4 w-4" /> Add Storage
          </Button>
        )}
      </div>

      {isAdmin && showForm && (
        <AddObjectStorageForm
          onSaved={() => {
            setShowForm(false);
            load();
          }}
          onCancel={() => setShowForm(false)}
        />
      )}

      {/* TODO Phase 3: summary cards (Total/Healthy/Warning/Critical/Unavailable) */}

      {storages !== null && storages.length > 0 && (
        <div className="flex flex-wrap gap-3">
          <Select value={providerFilter} onValueChange={(v) => setProviderFilter(v ?? ALL)}>
            <SelectTrigger className="w-52">
              <SelectValue placeholder="Provider" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All providers</SelectItem>
              {PROVIDERS.map((p) => (
                <SelectItem key={p} value={p}>
                  {p}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={workspaceFilter} onValueChange={(v) => setWorkspaceFilter(v ?? ALL)}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Workspace" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All workspaces</SelectItem>
              {workspaceNames.map((w) => (
                <SelectItem key={w} value={w}>
                  {w}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {storages !== null && filtered.length === 0 && (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center">
          <Archive className="mx-auto mb-3 h-8 w-8 text-slate-300" />
          <p className="text-sm font-medium text-slate-700">
            {storages.length === 0
              ? isAdmin
                ? "No object storage registered yet."
                : "No object storage authorized for you yet."
              : "No object storage matches your filters."}
          </p>
          {storages.length === 0 && !isAdmin && (
            <p className="mt-1 text-sm text-slate-500">Contact an administrator to request access.</p>
          )}
        </div>
      )}

      {filtered.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Storage</TableHead>
                <TableHead>Provider</TableHead>
                <TableHead>Bucket</TableHead>
                <TableHead>Region</TableHead>
                <TableHead>Workspace</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Objects</TableHead>
                <TableHead>Size</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((s) => (
                <TableRow key={s.id}>
                  <TableCell>
                    <Link href={`/object-storage/${s.id}`} className="font-medium text-sky-700 hover:underline">
                      {s.name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-slate-600">{s.provider}</TableCell>
                  <TableCell className="font-mono text-xs text-slate-500">{s.bucket}</TableCell>
                  <TableCell className="text-slate-600">{s.region ?? "—"}</TableCell>
                  <TableCell className="text-slate-600">{s.workspace_name ?? "—"}</TableCell>
                  <TableCell>
                    <ObjectStorageStatusBadge status={s.connection_status} />
                  </TableCell>
                  <TableCell className="text-slate-600">{s.object_count !== undefined ? s.object_count : "—"}</TableCell>
                  <TableCell className="text-slate-600">
                    {s.total_size_bytes !== undefined ? formatBytes(s.total_size_bytes) : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

function AddObjectStorageForm({ onSaved, onCancel }: { onSaved: () => void; onCancel: () => void }) {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [workspaceId, setWorkspaceId] = useState("");
  const [name, setName] = useState("");
  const [provider, setProvider] = useState<ObjectStorageProvider>("AWS_S3");
  const [endpoint, setEndpoint] = useState("");
  const [region, setRegion] = useState("");
  const [bucket, setBucket] = useState("");
  const [basePath, setBasePath] = useState("");
  const [accessKey, setAccessKey] = useState("");
  const [secretKey, setSecretKey] = useState("");
  const [tlsEnabled, setTlsEnabled] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    listWorkspaces()
      .then((res) => setWorkspaces(res.workspaces))
      .catch(() => setError("Failed to load workspaces."));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) {
      setError("Name is required.");
      return;
    }
    if (!workspaceId) {
      setError("Workspace is required.");
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
      await createObjectStorage({
        workspace_id: workspaceId,
        name: name.trim(),
        provider,
        endpoint: endpoint.trim() || undefined,
        region: region.trim() || undefined,
        bucket: bucket.trim(),
        base_path: basePath.trim() || undefined,
        tls_enabled: tlsEnabled,
        tls_skip_verify: false,
        access_key_id: accessKey.trim() || undefined,
        secret_access_key: secretKey || undefined,
      });
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create object storage.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 rounded-lg border border-slate-200 bg-white p-4">
      <h3 className="text-sm font-semibold text-slate-900">Add Storage</h3>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label>Workspace</Label>
          <Select value={workspaceId} onValueChange={(v) => setWorkspaceId(v ?? "")} disabled={submitting}>
            <SelectTrigger>
              <SelectValue placeholder="Select a workspace" />
            </SelectTrigger>
            <SelectContent>
              {workspaces.map((w) => (
                <SelectItem key={w.id} value={w.id}>
                  {w.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} disabled={submitting} placeholder="prod-uploads" />
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
          <p className="text-xs text-slate-500">
            Required for DigitalOcean Spaces / MinIO / S3-compatible; leave blank for AWS S3.
          </p>
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
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Access Key</Label>
          <Input value={accessKey} onChange={(e) => setAccessKey(e.target.value)} disabled={submitting} autoComplete="off" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Secret Key</Label>
          <Input type="password" value={secretKey} onChange={(e) => setSecretKey(e.target.value)} disabled={submitting} autoComplete="new-password" />
        </div>
      </div>

      <div className="flex flex-wrap gap-6">
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <Checkbox checked={tlsEnabled} onCheckedChange={(v) => setTlsEnabled(v === true)} disabled={submitting} />
          TLS enabled
        </label>
      </div>

      <p className="text-xs text-slate-500">
        Use a dedicated, least-privilege access key (read-only permissions) -- never an administrative credential. The secret key is
        encrypted at rest and is never returned by any API response once saved.
      </p>

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
