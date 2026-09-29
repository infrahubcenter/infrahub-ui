"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { VMConsoleTerminal } from "@/components/infrastructure/vm-console-terminal";
import { ApiError, getVM, type VMDetail } from "@/lib/api";

// Step 22 spec: before ever opening a session, show a warning dialog
// naming the exact VM and stating that commands run here can modify it.
// Authorization is never decided here -- vm.permissions (from getVM,
// itself authorization-scoped) only gates whether this page offers the
// button at all; the backend re-authorizes vm.connect independently on
// the WebSocket handshake regardless of what this page renders.
export default function VMConsolePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const vmId = params.id;

  const [vm, setVm] = useState<VMDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => {
    getVM(vmId)
      .then(setVm)
      .catch((err) => setError(err instanceof ApiError && err.status === 404 ? "VM not found." : "Failed to load VM."));
  }, [vmId]);

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!vm) return <p className="text-sm text-slate-500">Loading&hellip;</p>;

  const canConnect = vm.permissions.includes("vm.connect");

  return (
    <div className="flex flex-col gap-4">
      <Link href={`/vms/${vmId}`} className="flex w-fit items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
        <ArrowLeft className="h-4 w-4" /> Back to {vm.name}
      </Link>

      {!canConnect ? (
        <p className="text-sm text-slate-500">You don&apos;t have permission to open the Console for this VM.</p>
      ) : !confirmed ? (
        <AlertDialog open onOpenChange={(open) => { if (!open) router.push(`/vms/${vmId}`); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>VM Console</AlertDialogTitle>
              <AlertDialogDescription>
                You are opening an interactive shell on: <span className="font-semibold text-slate-900">{vm.name}</span>.
                Commands executed here can modify the VM.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => setConfirmed(true)}>Open Console</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : (
        <VMConsoleTerminal vmId={vmId} vmName={vm.name} hasSavedKey={Boolean(vm.ssh_key_credential_id)} />
      )}
    </div>
  );
}
