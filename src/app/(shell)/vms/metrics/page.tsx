"use client";

import { VMPickerTable } from "@/components/infrastructure/vm-picker-table";
import { VMAgentConfigureTable } from "@/components/infrastructure/vm-agent-configure-table";
import { VMMetricsCardGrid } from "@/components/infrastructure/vm-metrics-card-grid";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function VMMetricsIndexPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Host Metrics &amp; Logs</h2>
        <p className="text-sm text-slate-500">Configure the VM Agent, browse live metrics, or search logs -- per VM.</p>
      </div>

      <Tabs defaultValue="metrics">
        <TabsList>
          <TabsTrigger value="configure">Configure</TabsTrigger>
          <TabsTrigger value="metrics">Metrics</TabsTrigger>
          <TabsTrigger value="logs">Logs</TabsTrigger>
        </TabsList>

        <TabsContent value="configure">
          <VMAgentConfigureTable />
        </TabsContent>

        <TabsContent value="metrics">
          <VMMetricsCardGrid />
        </TabsContent>

        <TabsContent value="logs">
          <VMPickerTable linkPrefix="/vms/metrics" linkSuffix="?view=logs" emptyHint="Register a VM first from Compute Inventory." />
        </TabsContent>
      </Tabs>
    </div>
  );
}
