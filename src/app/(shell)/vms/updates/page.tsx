"use client";

import { VMPickerTable } from "@/components/infrastructure/vm-picker-table";

export default function VMUpdatesIndexPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Updates</h2>
        <p className="text-sm text-slate-500">Select a VM to view OS updates, package updates, and packages installed since onboarding.</p>
      </div>
      <VMPickerTable linkPrefix="/vms/updates" emptyHint="Register a VM first from the Virtual Machine tab." />
    </div>
  );
}
