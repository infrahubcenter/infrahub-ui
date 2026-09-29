"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Boxes } from "lucide-react";
import { useAuth } from "@/components/auth/auth-provider";
import { SeverityBadge } from "@/components/infrastructure/severity-badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  ApiError,
  acknowledgePackageUpdate,
  dismissPackageUpdate,
  getPackage,
  type Package,
  isAdminRole,
} from "@/lib/api";

export default function PackageDetailPage() {
  const params = useParams<{ id: string; packageId: string }>();
  const vmId = params.id;
  const packageId = params.packageId;
  const { user } = useAuth();

  const [pkg, setPkg] = useState<Package | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(() => {
    getPackage(vmId, packageId)
      .then(setPkg)
      .catch((err) => setError(err instanceof ApiError && err.status === 404 ? "Package not found." : "Failed to load package."));
  }, [vmId, packageId]);

  useEffect(() => {
    // Load-on-mount/param-change: no external store to subscribe to.
     
    load();
  }, [load]);

  async function handleAcknowledge() {
    setSubmitting(true);
    setActionMessage(null);
    try {
      await acknowledgePackageUpdate(vmId, packageId);
      setActionMessage("Acknowledged.");
      load();
    } catch (err) {
      setActionMessage(err instanceof ApiError ? err.message : "Failed to acknowledge.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDismiss() {
    setSubmitting(true);
    setActionMessage(null);
    try {
      await dismissPackageUpdate(vmId, packageId);
      setActionMessage("Dismissed.");
      load();
    } catch (err) {
      setActionMessage(err instanceof ApiError ? err.message : "Failed to dismiss.");
    } finally {
      setSubmitting(false);
    }
  }

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!pkg) return <p className="text-sm text-slate-500">Loading&hellip;</p>;

  const hasUpdate = pkg.status !== "UP_TO_DATE";

  return (
    <div className="flex flex-col gap-6">
      <Link href={`/vms/${vmId}/packages`} className="flex w-fit items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
        <ArrowLeft className="h-4 w-4" /> Back to Packages
      </Link>

      <div className="flex items-center gap-2">
        <Boxes className="h-5 w-5 text-slate-400" />
        <h2 className="text-lg font-semibold text-slate-900">{pkg.name}</h2>
        {hasUpdate && pkg.severity && pkg.severity !== "UNKNOWN" && <SeverityBadge severity={pkg.severity} />}
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <dl className="grid grid-cols-2 gap-y-3 text-sm">
          <dt className="text-slate-500">Installed</dt>
          <dd className="text-slate-900">{pkg.installed_version}</dd>
          <dt className="text-slate-500">Available</dt>
          <dd className="text-slate-900">{pkg.available_version ?? "—"}</dd>
          <dt className="text-slate-500">Architecture</dt>
          <dd className="text-slate-900">{pkg.architecture}</dd>
          <dt className="text-slate-500">Package Manager</dt>
          <dd className="text-slate-900">{pkg.package_manager}</dd>
          <dt className="text-slate-500">Security Update</dt>
          <dd className="text-slate-900">{pkg.is_security_update ? "Yes" : "No"}</dd>
          {pkg.description && (
            <>
              <dt className="text-slate-500">Description</dt>
              <dd className="text-slate-900">{pkg.description}</dd>
            </>
          )}
        </dl>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <h3 className="mb-2 text-sm font-semibold text-slate-900">Recommendation</h3>
        {hasUpdate ? (
          <>
            <p className="text-sm text-slate-600">
              Update available: {pkg.installed_version} &rarr; {pkg.available_version}.
              {pkg.is_security_update && " This is a security update."}
            </p>
            <p className="mt-2 text-xs text-slate-500">
              Installing or upgrading packages is not available in this step -- review only.
            </p>
            {isAdminRole(user?.role) && (
              <div className="mt-4 flex gap-2">
                <Button variant="outline" size="sm" onClick={handleAcknowledge} disabled={submitting}>
                  Acknowledge
                </Button>
                <Button variant="outline" size="sm" onClick={handleDismiss} disabled={submitting}>
                  Dismiss
                </Button>
                <Button size="sm" variant="ghost" disabled title="Not available in this step">
                  View Recommendation
                </Button>
              </div>
            )}
            {actionMessage && (
              <Alert className="mt-3">
                <AlertDescription>{actionMessage}</AlertDescription>
              </Alert>
            )}
          </>
        ) : (
          <p className="text-sm text-slate-600">This package is up to date.</p>
        )}
      </div>
    </div>
  );
}
