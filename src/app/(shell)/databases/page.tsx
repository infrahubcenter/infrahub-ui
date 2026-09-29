"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Database, Gauge, Plus } from "lucide-react";
import { useAuth } from "@/components/auth/auth-provider";
import { HealthBadge } from "@/components/infrastructure/health-badge";
import { DatabaseConnectionStatusBadge } from "@/components/infrastructure/database-status-badge";
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
import { formatAgo } from "@/lib/format";
import {
  ApiError,
  createDatabase,
  listDatabases,
  listWorkspaces,
  type DatabaseEngineType,
  type DatabaseListItem,
  type Workspace,
  isAdminRole,
} from "@/lib/api";

const DATABASE_TYPES: DatabaseEngineType[] = ["POSTGRESQL", "MYSQL", "MARIADB", "MONGODB", "REDIS", "VALKEY"];
const ALL = "__all__";

const DEFAULT_PORT_BY_TYPE: Record<DatabaseEngineType, string> = {
  POSTGRESQL: "5432",
  MYSQL: "3306",
  MARIADB: "3306",
  MONGODB: "27017",
  REDIS: "6379",
  VALKEY: "6379",
};

// Parses a standard `scheme://[user[:pass]@]host[:port][/database]`
// connection string -- the same shape Postgres/MySQL/MongoDB/Redis all
// use -- into the same discrete fields AddDatabaseForm's Parameters mode
// already collects. Returns null on anything unparseable (missing
// scheme, no host) so the caller can show one clear inline error rather
// than submit partial/wrong data.
function parseConnectionString(
  type: DatabaseEngineType,
  raw: string
): { host: string; port: string; username: string; password: string; databaseName: string } | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  if (!url.hostname) return null;
  return {
    host: url.hostname,
    port: url.port || DEFAULT_PORT_BY_TYPE[type],
    username: decodeURIComponent(url.username || ""),
    password: decodeURIComponent(url.password || ""),
    databaseName: url.pathname.replace(/^\//, ""),
  };
}

// Standalone databases are first-class resources under a Workspace --
// never a VM child, connected directly over TCP/TLS -- so this page lists
// them independently of any VM, mirroring vms/page.tsx's list shape as
// closely as possible.
export default function DatabasesPage() {
  const { user } = useAuth();
  const isAdmin = isAdminRole(user?.role);

  const [databases, setDatabases] = useState<DatabaseListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState(ALL);
  const [workspaceFilter, setWorkspaceFilter] = useState(ALL);
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(() => {
    listDatabases()
      .then((res) => setDatabases(res.databases))
      .catch(() => setError("Failed to load databases."));
  }, []);

  useEffect(() => {
    // Load-on-mount: no external store to subscribe to.

    load();
  }, [load]);

  const workspaceNames = useMemo(
    () => [...new Set((databases ?? []).map((d) => d.workspace_name).filter((w): w is string => !!w))].sort(),
    [databases]
  );

  const filtered = useMemo(() => {
    if (!databases) return [];
    return databases.filter((d) => {
      if (typeFilter !== ALL && d.type !== typeFilter) return false;
      if (workspaceFilter !== ALL && d.workspace_name !== workspaceFilter) return false;
      return true;
    });
  }, [databases, typeFilter, workspaceFilter]);

  if (error) return <p className="text-sm text-red-600">{error}</p>;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
            <Database className="h-5 w-5" /> Databases
          </h2>
          <p className="text-sm text-slate-500">
            {isAdmin
              ? "Read-only monitoring for every standalone database, connected directly over TCP/TLS."
              : "Databases you're authorized on."}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/databases/performance" className="flex items-center gap-1 text-sm text-sky-700 hover:underline">
            <Gauge className="h-4 w-4" /> Performance Overview
          </Link>
          {isAdmin && (
            <Button size="sm" onClick={() => setShowForm((v) => !v)}>
              <Plus className="h-4 w-4" /> Add Database
            </Button>
          )}
        </div>
      </div>

      {isAdmin && showForm && (
        <AddDatabaseForm
          onSaved={() => {
            setShowForm(false);
            load();
          }}
          onCancel={() => setShowForm(false)}
        />
      )}

      {databases !== null && databases.length > 0 && (
        <div className="flex flex-wrap gap-3">
          <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v ?? ALL)}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All types</SelectItem>
              {DATABASE_TYPES.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
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

      {databases !== null && filtered.length === 0 && (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center">
          <Database className="mx-auto mb-3 h-8 w-8 text-slate-300" />
          <p className="text-sm font-medium text-slate-700">
            {databases.length === 0
              ? isAdmin
                ? "No databases registered yet."
                : "No databases authorized for you yet."
              : "No databases match your filters."}
          </p>
          {databases.length === 0 && !isAdmin && (
            <p className="mt-1 text-sm text-slate-500">Contact an administrator to request access.</p>
          )}
        </div>
      )}

      {filtered.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Workspace</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Host:Port</TableHead>
                <TableHead>Connection</TableHead>
                <TableHead>Health</TableHead>
                <TableHead>Monitoring</TableHead>
                <TableHead>Last Metric</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((db) => (
                <TableRow key={db.id}>
                  <TableCell>
                    <Link href={`/databases/${db.id}`} className="font-medium text-sky-700 hover:underline">
                      {db.name || db.database_name || db.host}
                    </Link>
                  </TableCell>
                  <TableCell className="text-slate-600">{db.workspace_name ?? "—"}</TableCell>
                  <TableCell className="text-slate-600">{db.type}</TableCell>
                  <TableCell className="font-mono text-xs text-slate-500">
                    {db.host}:{db.port}
                  </TableCell>
                  <TableCell>
                    <DatabaseConnectionStatusBadge status={db.connection_status} />
                  </TableCell>
                  <TableCell>{db.health ? <HealthBadge status={db.health} /> : <span className="text-slate-400">—</span>}</TableCell>
                  <TableCell className="text-slate-600">{db.monitoring_enabled ? "Enabled" : "Disabled"}</TableCell>
                  <TableCell className="text-slate-600">{formatAgo(db.last_metric_at)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

function AddDatabaseForm({ onSaved, onCancel }: { onSaved: () => void; onCancel: () => void }) {
  const [inputMode, setInputMode] = useState<"params" | "connectionString">("params");
  const [connectionString, setConnectionString] = useState("");
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [workspaceId, setWorkspaceId] = useState("");
  const [name, setName] = useState("");
  const [type, setType] = useState<DatabaseEngineType>("POSTGRESQL");
  const [provider, setProvider] = useState("");
  const [host, setHost] = useState("");
  const [port, setPort] = useState("5432");
  const [databaseName, setDatabaseName] = useState("");
  const [region, setRegion] = useState("");
  const [clusterIdentifier, setClusterIdentifier] = useState("");
  const [endpoint, setEndpoint] = useState("");
  const [tlsEnabled, setTlsEnabled] = useState(true);
  const [tlsSkipVerify, setTlsSkipVerify] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
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

    let resolvedHost = host;
    let resolvedPort = port;
    let resolvedUsername = username;
    let resolvedPassword = password;
    let resolvedDatabaseName = databaseName;

    if (inputMode === "connectionString") {
      const parsed = parseConnectionString(type, connectionString);
      if (!parsed) {
        setError("Could not parse connection string. Expected format: scheme://[user[:password]@]host[:port][/database]");
        return;
      }
      resolvedHost = parsed.host;
      resolvedPort = parsed.port;
      resolvedUsername = parsed.username;
      resolvedPassword = parsed.password;
      resolvedDatabaseName = parsed.databaseName;
    }

    const portNum = Number(resolvedPort);
    if (!workspaceId) {
      setError("Workspace is required.");
      return;
    }
    if (!resolvedHost.trim() || !portNum) {
      setError("Host and a valid port are required.");
      return;
    }
    if (!name.trim()) {
      setError("Name is required.");
      return;
    }
    setSubmitting(true);
    try {
      await createDatabase({
        workspace_id: workspaceId,
        name: name.trim(),
        type,
        provider: provider.trim() || undefined,
        host: resolvedHost.trim(),
        port: portNum,
        database_name: resolvedDatabaseName.trim() || undefined,
        region: region.trim() || undefined,
        cluster_identifier: clusterIdentifier.trim() || undefined,
        endpoint: endpoint.trim() || undefined,
        tls_enabled: tlsEnabled,
        tls_skip_verify: tlsSkipVerify,
        username: resolvedUsername.trim() || undefined,
        password: resolvedPassword || undefined,
      });
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create database.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 rounded-lg border border-slate-200 bg-white p-4">
      <h3 className="text-sm font-semibold text-slate-900">Add Database</h3>

      <div className="flex w-fit rounded-md border border-slate-200 p-0.5">
        <button
          type="button"
          onClick={() => setInputMode("params")}
          disabled={submitting}
          className={`rounded px-3 py-1 text-xs font-medium ${
            inputMode === "params" ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"
          }`}
        >
          Parameters
        </button>
        <button
          type="button"
          onClick={() => setInputMode("connectionString")}
          disabled={submitting}
          className={`rounded px-3 py-1 text-xs font-medium ${
            inputMode === "connectionString" ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"
          }`}
        >
          Connection String
        </button>
      </div>

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
          <Input value={name} onChange={(e) => setName(e.target.value)} disabled={submitting} placeholder="prod-postgres" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Type</Label>
          <Select value={type} onValueChange={(v) => setType(v as DatabaseEngineType)} disabled={submitting}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DATABASE_TYPES.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {inputMode === "connectionString" ? (
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label>Connection String</Label>
            <Input
              value={connectionString}
              onChange={(e) => setConnectionString(e.target.value)}
              disabled={submitting}
              placeholder="postgres://user:password@host:5432/dbname"
              autoComplete="off"
            />
            <p className="text-xs text-slate-500">
              Host, port, username, password, and database name are all parsed from this string.
            </p>
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-1.5">
              <Label>Host</Label>
              <Input value={host} onChange={(e) => setHost(e.target.value)} disabled={submitting} placeholder="db.internal.example.com" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Port</Label>
              <Input type="number" value={port} onChange={(e) => setPort(e.target.value)} disabled={submitting} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Database Name (optional)</Label>
              <Input value={databaseName} onChange={(e) => setDatabaseName(e.target.value)} disabled={submitting} />
            </div>
          </>
        )}

        <div className="flex flex-col gap-1.5">
          <Label>Provider (optional)</Label>
          <Input value={provider} onChange={(e) => setProvider(e.target.value)} disabled={submitting} placeholder="RDS, self-hosted, ..." />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Region (optional)</Label>
          <Input value={region} onChange={(e) => setRegion(e.target.value)} disabled={submitting} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Cluster Identifier (optional)</Label>
          <Input value={clusterIdentifier} onChange={(e) => setClusterIdentifier(e.target.value)} disabled={submitting} />
        </div>
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label>Endpoint (optional)</Label>
          <Input value={endpoint} onChange={(e) => setEndpoint(e.target.value)} disabled={submitting} />
        </div>

        {inputMode === "params" && (
          <>
            <div className="flex flex-col gap-1.5">
              <Label>Monitoring Username (optional)</Label>
              <Input value={username} onChange={(e) => setUsername(e.target.value)} disabled={submitting} autoComplete="off" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Monitoring Password (optional)</Label>
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} disabled={submitting} autoComplete="new-password" />
            </div>
          </>
        )}
      </div>

      <div className="flex flex-wrap gap-6">
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <Checkbox checked={tlsEnabled} onCheckedChange={(v) => setTlsEnabled(v === true)} disabled={submitting} />
          TLS enabled
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <Checkbox checked={tlsSkipVerify} onCheckedChange={(v) => setTlsSkipVerify(v === true)} disabled={submitting || !tlsEnabled} />
          Skip TLS certificate verification
        </label>
      </div>

      <p className="text-xs text-slate-500">
        Use a dedicated, least-privilege monitoring credential (a read-only role) -- never an administrative account. The password is
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
