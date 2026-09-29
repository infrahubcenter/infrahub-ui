"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ArrowUpCircle, Boxes, Sparkles } from "lucide-react";
import { useAuth } from "@/components/auth/auth-provider";
import { OSUpdateStatusBadge } from "@/components/infrastructure/update-status-badge";
import { ConfirmDialog } from "@/components/infrastructure/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatAgo } from "@/lib/format";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  ApiError,
  getVM,
  getVMUpdatesSummary,
  getPackageSummary,
  listPackages,
  resetPackageBaseline,
  scanPackages,
  scanExternalPackages,
  isAdminRole,
  type VMDetail,
  type VMUpdatesSummary,
  type PackageSummary,
  type Package,
} from "@/lib/api";

export default function VMUpdatesDetailPage() {
  const params = useParams<{ id: string }>();
  const vmId = params.id;

  const [vm, setVm] = useState<VMDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getVM(vmId)
      .then(setVm)
      .catch((err) => setError(err instanceof ApiError && err.status === 404 ? "VM not found." : "Failed to load VM."));
  }, [vmId]);

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!vm) return <p className="text-sm text-slate-500">Loading&hellip;</p>;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/vms/updates" className="flex w-fit items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
          <ArrowLeft className="h-4 w-4" /> Back to Updates
        </Link>
        <h2 className="mt-1 text-lg font-semibold text-slate-900">{vm.name}</h2>
        <p className="text-sm text-slate-500">
          {vm.workspace} &middot; {vm.address}
        </p>
      </div>

      <Tabs defaultValue="updates">
        <TabsList>
          <TabsTrigger value="updates">
            <ArrowUpCircle className="h-3.5 w-3.5" /> Updates
          </TabsTrigger>
          <TabsTrigger value="packages">
            <Boxes className="h-3.5 w-3.5" /> Packages
          </TabsTrigger>
          <TabsTrigger value="baseline">
            <Sparkles className="h-3.5 w-3.5" /> Installed Since Onboarding
          </TabsTrigger>
        </TabsList>

        <TabsContent value="updates" className="mt-4">
          <UpdatesTab vmId={vm.id} />
        </TabsContent>
        <TabsContent value="packages" className="mt-4">
          <PackagesTab vmId={vm.id} />
        </TabsContent>
        <TabsContent value="baseline" className="mt-4">
          <BaselineTab vmId={vm.id} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// OS/kernel/reboot status plus the full package-update-plan workflow
// already live on the existing /vms/[id]/updates page (refresh, per-
// package update plan creation, update/reboot history) -- genuinely
// substantial existing functionality, linked out here rather than
// duplicated, matching this tree's "merge access, not content" scope.
function UpdatesTab({ vmId }: { vmId: string }) {
  const [summary, setSummary] = useState<VMUpdatesSummary | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    getVMUpdatesSummary(vmId)
      .then(setSummary)
      .catch(() => setError(true));
  }, [vmId]);

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-900">OS &amp; Package Updates {summary && <OSUpdateStatusBadge status={summary.os.status} />}</h3>
        <Button variant="outline" size="sm" render={<Link href={`/vms/${vmId}/updates`} />}>
          Open Full Updates Page
        </Button>
      </div>
      {error && <p className="text-sm text-slate-500">Failed to load updates summary.</p>}
      {!error && !summary && <p className="text-sm text-slate-500">Loading&hellip;</p>}
      {summary && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <SummaryStat label="Package Updates" value={String(summary.packages.total_updates)} />
          <SummaryStat label="Security" value={String(summary.packages.security_updates)} />
          <SummaryStat label="Kernel" value={summary.kernel.available ? "Update Installed" : "Current"} />
          <SummaryStat label="Reboot" value={summary.kernel.reboot_required ? "Required" : "Not Required"} />
        </div>
      )}
    </div>
  );
}

// The full installed-packages table (search/filter, external packages)
// lives on the existing /vms/[id]/packages page -- linked out here rather
// than duplicated, same rationale as UpdatesTab above.
function PackagesTab({ vmId }: { vmId: string }) {
  const [summary, setSummary] = useState<PackageSummary | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    getPackageSummary(vmId)
      .then(setSummary)
      .catch(() => setError(true));
  }, [vmId]);

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-900">Packages</h3>
        <Button variant="outline" size="sm" render={<Link href={`/vms/${vmId}/packages`} />}>
          Open Full Packages Page
        </Button>
      </div>
      {error && <p className="text-sm text-slate-500">Failed to load package summary.</p>}
      {!error && !summary && <p className="text-sm text-slate-500">Loading&hellip;</p>}
      {summary && (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <SummaryStat label="Total" value={String(summary.total)} />
            <SummaryStat label="Updates" value={String(summary.updates_available)} />
            <SummaryStat label="Security" value={String(summary.security_updates)} />
            <SummaryStat label="Up to Date" value={String(summary.up_to_date)} />
          </div>
          <p className="mt-3 text-xs text-slate-500">Last scan: {formatAgo(summary.last_scan)}</p>
        </>
      )}
    </div>
  );
}

// New: every OS package whose row was first seen after this VM's package
// baseline (auto-stamped on the first successful package scan, or reset
// explicitly below) -- distinct from the pre-existing "Externally
// Installed Packages" (pip/npm/gem/snap) section on the Packages page,
// which this does not touch.
function BaselineTab({ vmId }: { vmId: string }) {
  const { user } = useAuth();
  const [summary, setSummary] = useState<PackageSummary | null>(null);
  const [packages, setPackages] = useState<Package[] | null>(null);
  const [error, setError] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanMessage, setScanMessage] = useState<string | null>(null);

  const load = useCallback(() => {
    Promise.all([getPackageSummary(vmId), listPackages(vmId, { new_since_baseline: true, page_size: 100 })])
      .then(([s, p]) => {
        setSummary(s);
        setPackages(p.packages);
      })
      .catch(() => setError(true));
  }, [vmId]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleReset() {
    setResetting(true);
    try {
      await resetPackageBaseline(vmId);
      load();
    } finally {
      setResetting(false);
    }
  }

  // This tab only ever reflects packages seen by the *last completed*
  // scan -- a package installed on the VM after that scan won't appear
  // here until a fresh one runs (6h scheduler, or this button). That gap
  // is the #1 cause of "I installed something and it's not showing up."
  // Runs BOTH scanners: the OS package manager (apt/dnf/...) and the
  // external one (pip/npm/gem/snap) -- a pip/npm install would otherwise
  // never be discovered at all, since only the OS scan runs on the
  // scheduler by default. "Installed Since Onboarding" itself now also
  // accepts any package manager, not just OS ones (see packages.sql).
  async function handleScanNow() {
    setScanning(true);
    setScanMessage(null);
    try {
      const [osResult, externalResult] = await Promise.allSettled([scanPackages(vmId), scanExternalPackages(vmId)]);
      const parts: string[] = [];
      if (osResult.status === "fulfilled") {
        const r = osResult.value;
        parts.push(
          r.status === "FAILED"
            ? `OS scan failed${r.error_summary ? `: ${r.error_summary}` : ""}`
            : `${r.package_count} OS packages${r.status === "PARTIAL" && r.error_summary ? ` (${r.error_summary})` : ""}`
        );
      } else {
        parts.push("OS scan failed");
      }
      if (externalResult.status === "fulfilled") {
        const r = externalResult.value;
        parts.push(r.status === "FAILED" ? `external scan failed${r.error_summary ? `: ${r.error_summary}` : ""}` : `${r.package_count} pip/npm/gem/snap packages`);
      } else {
        parts.push("external scan failed");
      }
      setScanMessage(`Scanned -- ${parts.join("; ")}.`);
      load();
    } catch (err) {
      setScanMessage(err instanceof ApiError ? err.message : "Failed to scan.");
    } finally {
      setScanning(false);
    }
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Installed Since Onboarding</h3>
          <p className="mt-1 text-xs text-slate-500">
            Baseline set: {summary?.package_baseline_at ? new Date(summary.package_baseline_at).toLocaleString() : "Not yet set (runs on the first successful package scan)"}
          </p>
          <p className="mt-0.5 text-xs text-slate-500">
            Reflects the last scan: {summary?.last_scan ? formatAgo(summary.last_scan) : "never scanned yet"} -- a package installed after that
            won&rsquo;t show here until a fresh scan runs.
          </p>
        </div>
        {isAdminRole(user?.role) && (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleScanNow} disabled={scanning}>
              {scanning ? "Scanning…" : "Scan Now"}
            </Button>
            <ConfirmDialog
              trigger={<Button variant="outline" size="sm" disabled={resetting}>{resetting ? "Resetting…" : "Reset Baseline to Now"}</Button>}
              title="Reset the package baseline to now?"
              description={'Every currently-installed package will stop counting as "installed since onboarding" -- only packages installed after this moment will show here going forward.'}
              confirmLabel="Reset"
              onConfirm={handleReset}
            />
          </div>
        )}
      </div>

      {scanMessage && (
        <Alert className="mb-3">
          <AlertDescription>{scanMessage}</AlertDescription>
        </Alert>
      )}

      {error && <p className="text-sm text-slate-500">Failed to load packages.</p>}
      {!error && packages === null && <p className="text-sm text-slate-500">Loading&hellip;</p>}
      {packages && packages.length === 0 && (
        <p className="text-sm text-slate-500">
          No packages installed since the baseline was set. Installed something recently? Click &ldquo;Scan Now&rdquo; above to pick it up.
        </p>
      )}
      {packages && packages.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-slate-200">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Package</TableHead>
                <TableHead>Version</TableHead>
                <TableHead>Manager</TableHead>
                <TableHead>Installed</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {packages.map((pkg) => (
                <TableRow key={pkg.id}>
                  <TableCell className="font-medium text-slate-900">{pkg.name}</TableCell>
                  <TableCell className="text-slate-600">{pkg.installed_version}</TableCell>
                  <TableCell className="text-slate-600">{pkg.package_manager}</TableCell>
                  <TableCell className="text-slate-600">{formatAgo(pkg.installed_at ?? pkg.created_at)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-slate-500">{label}</div>
      <div className="text-lg font-semibold text-slate-900">{value}</div>
    </div>
  );
}
