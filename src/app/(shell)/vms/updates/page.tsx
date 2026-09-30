"use client";

import { VMPickerTable } from "@/components/infrastructure/vm-picker-table";

export default function VMUpdatesIndexPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Updates</h2>
        <p className="text-sm text-slate-500">Select a VM to view OS updates, package updates, and packages installed since onboarding.</p>
      </div>
      <VMPickerTable linkPrefix="/vms/updates" sshOnly emptyHint="No SSH-managed VMs yet -- register one in Compute Inventory. Agent-only VMs from Host Metrics & Logs are not listed here." />
    </div>
  );
}
