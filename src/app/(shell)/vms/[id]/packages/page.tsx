"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Boxes, RefreshCw, Search, Zap } from "lucide-react";
import { useAuth } from "@/components/auth/auth-provider";
import { SeverityBadge } from "@/components/infrastructure/severity-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
  getPackageSummary,
  getVM,
  listExternalPackages,
  listPackages,
  refreshPackageMetadata,
  scanExternalPackages,
  scanPackages,
  type ExternalPackage,
  type Package,
  type PackageSummary,
  type VMDetail,
  isAdminRole,
} from "@/lib/api";

const STATUS_LABEL: Record<Package["status"], string> = {
  UP_TO_DATE: "Up to Date",
  UPDATE_AVAILABLE: "Update Available",
  SECURITY_UPDATE: "Security Update",
};

export default function VMPackagesPage() {
  const params = useParams<{ id: string }>();
  const vmId = params.id;
  const { user } = useAuth();

  const [vm, setVm] = useState<VMDetail | null>(null);
  const [summary, setSummary] = useState<PackageSummary | null>(null);
  const [packages, setPackages] = useState<Package[] | null>(null);
  const [search, setSearch] = useState("");
  const [securityOnly, setSecurityOnly] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanMessage, setScanMessage] = useState<string | null>(null);

  const loadSummary = useCallback(() => {
    getPackageSummary(vmId).then(setSummary).catch(() => {});
  }, [vmId]);

  const loadPackages = useCallback(() => {
    listPackages(vmId, { search: search || undefined, security: securityOnly || undefined, page_size: 200 })
      .then((res) => setPackages(res.packages))
      .catch(() => setError("Failed to load packages."));
  }, [vmId, search, securityOnly]);

  useEffect(() => {
    getVM(vmId)
      .then(setVm)
      .catch((err) => setError(err instanceof ApiError && err.status === 404 ? "VM not found." : "Failed to load VM."));
  }, [vmId]);

  useEffect(() => {
    // Load-on-mount/filter-change: no external store to subscribe to.
     
    loadSummary();
    loadPackages();
  }, [loadSummary, loadPackages]);

  async function handleScan() {
    setScanning(true);
    setScanMessage(null);
    try {
      const result = await scanPackages(vmId);
      setScanMessage(
        result.status === "SUCCESS"
          ? `Scan completed: ${result.package_count} packages, ${result.update_count} updates.`
          : result.error_summary ?? `Scan ${result.status.toLowerCase()}.`
      );
      loadSummary();
      loadPackages();
    } catch (err) {
      setScanMessage(err instanceof ApiError ? err.message : "Failed to trigger scan.");
    } finally {
      setScanning(false);
    }
  }

  async function handleRefresh() {
    setScanning(true);
    setScanMessage(null);
    try {
      const result = await refreshPackageMetadata(vmId);
      setScanMessage(
        result.status === "SUCCESS"
          ? `Metadata refreshed: ${result.update_count} updates found.`
          : result.error_summary ?? `Refresh ${result.status.toLowerCase()}.`
      );
      loadSummary();
      loadPackages();
    } catch (err) {
      setScanMessage(err instanceof ApiError ? err.message : "Failed to refresh metadata.");
    } finally {
      setScanning(false);
    }
  }

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!vm) return <p className="text-sm text-slate-500">Loading&hellip;</p>;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link href={`/vms/${vmId}`} className="flex w-fit items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
          <ArrowLeft className="h-4 w-4" /> Back to {vm.name}
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
              <Boxes className="h-5 w-5" /> Packages
            </h2>
            <p className="text-sm text-slate-500">
              {vm.package_manager && vm.package_manager !== "UNSUPPORTED" ? `Detected: ${vm.package_manager} · ` : ""}
              Last scan: {formatAgo(summary?.last_scan)}
            </p>
          </div>
          {isAdminRole(user?.role) && (
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleRefresh} disabled={scanning}>
                <RefreshCw className={`h-4 w-4 ${scanning ? "animate-spin" : ""}`} /> Refresh Metadata
              </Button>
              <Button size="sm" onClick={handleScan} disabled={scanning}>
                <Zap className="h-4 w-4" /> {scanning ? "Scanning…" : "Scan Packages"}
              </Button>
            </div>
          )}
        </div>
        {scanMessage && (
          <Alert>
            <AlertDescription>{scanMessage}</AlertDescription>
          </Alert>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <SummaryCard label="Total" value={summary?.total} />
        <SummaryCard label="Updates" value={summary?.updates_available} />
        <SummaryCard label="Security" value={summary?.security_updates} tone={summary && summary.security_updates > 0 ? "text-red-600" : undefined} />
        <SummaryCard label="Up to Date" value={summary?.up_to_date} />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative max-w-sm flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input placeholder="Search packages" className="pl-8" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <Checkbox checked={securityOnly} onCheckedChange={(v) => setSecurityOnly(v === true)} />
          Security only
        </label>
      </div>

      {packages !== null && packages.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center">
          <Boxes className="mx-auto mb-3 h-8 w-8 text-slate-300" />
          <p className="text-sm font-medium text-slate-700">
            {summary?.total ? "No packages match your filters." : "No packages discovered yet."}
          </p>
          {!summary?.total && isAdminRole(user?.role) && (
            <p className="mt-1 text-sm text-slate-500">Click &ldquo;Scan Packages&rdquo; to discover installed packages.</p>
          )}
        </div>
      ) : (
        packages !== null && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Package</TableHead>
                <TableHead>Installed</TableHead>
                <TableHead>Available</TableHead>
                <TableHead>Architecture</TableHead>
                <TableHead>Security</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {packages.map((pkg) => (
                <TableRow key={pkg.id}>
                  <TableCell>
                    <Link href={`/vms/${vmId}/packages/${pkg.id}`} className="font-medium text-sky-700 hover:underline">
                      {pkg.name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-slate-600">{pkg.installed_version}</TableCell>
                  <TableCell className="text-slate-600">{pkg.available_version ?? "—"}</TableCell>
                  <TableCell className="text-slate-600">{pkg.architecture}</TableCell>
                  <TableCell className="text-slate-600">{pkg.is_security_update ? "Yes" : "No"}</TableCell>
                  <TableCell>
                    {pkg.status === "UP_TO_DATE" ? (
                      <Badge variant="outline">{STATUS_LABEL[pkg.status]}</Badge>
                    ) : (
                      <div className="flex items-center gap-2">
                        <Badge variant={pkg.status === "SECURITY_UPDATE" ? "destructive" : "secondary"}>
                          {STATUS_LABEL[pkg.status]}
                        </Badge>
                        {pkg.severity && pkg.severity !== "UNKNOWN" && <SeverityBadge severity={pkg.severity} />}
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )
      )}

      <ExternalPackagesSection vmId={vmId} isAdmin={isAdminRole(user?.role)} />
    </div>
  );
}

// Externally installed packages (pip/npm/gem/snap) -- a separate,
// simpler section: list-only, no available-version/status column, since
// there's no generic way to check an arbitrary vendor's site for a
// newer version (see ExternalPackageScanner's backend doc comment).
function ExternalPackagesSection({ vmId, isAdmin }: { vmId: string; isAdmin: boolean }) {
  const [packages, setPackages] = useState<ExternalPackage[] | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanMessage, setScanMessage] = useState<string | null>(null);

  const load = useCallback(() => {
    listExternalPackages(vmId)
      .then((res) => setPackages(res.packages))
      .catch(() => setPackages([]));
  }, [vmId]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleScan() {
    setScanning(true);
    setScanMessage(null);
    try {
      const result = await scanExternalPackages(vmId);
      setScanMessage(
        result.status === "SUCCESS"
          ? `Scan completed: ${result.package_count} externally installed packages found.`
          : (result.error_summary ?? `Scan ${result.status.toLowerCase()}.`)
      );
      load();
    } catch (err) {
      setScanMessage(err instanceof ApiError ? err.message : "Failed to trigger scan.");
    } finally {
      setScanning(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Externally Installed Packages</h3>
          <p className="text-xs text-slate-500">
            Software installed outside apt/dnf/yum (pip, npm, gem, snap). Listed only -- update availability isn&apos;t
            checked for these.
          </p>
        </div>
        {isAdmin && (
          <Button variant="outline" size="sm" onClick={handleScan} disabled={scanning}>
            <Zap className="h-4 w-4" /> {scanning ? "Scanning…" : "Scan"}
          </Button>
        )}
      </div>
      {scanMessage && (
        <Alert>
          <AlertDescription>{scanMessage}</AlertDescription>
        </Alert>
      )}

      {packages !== null && packages.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-center">
          <p className="text-sm text-slate-500">
            {isAdmin ? "No externally installed packages found yet -- click Scan to check." : "None found yet."}
          </p>
        </div>
      ) : (
        packages !== null && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Package</TableHead>
                <TableHead>Version</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Last Discovered</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {packages.map((pkg) => (
                <TableRow key={pkg.id}>
                  <TableCell className="font-medium text-slate-900">{pkg.name}</TableCell>
                  <TableCell className="text-slate-600">{pkg.installed_version}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{pkg.package_manager}</Badge>
                  </TableCell>
                  <TableCell className="text-slate-600">{formatAgo(pkg.last_discovered_at)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )
      )}
    </div>
  );
}

function SummaryCard({ label, value, tone }: { label: string; value?: number; tone?: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="text-sm text-slate-500">{label}</div>
      <div className={`mt-1 text-2xl font-semibold ${tone ?? "text-slate-900"}`}>{value ?? "—"}</div>
    </div>
  );
}
