import { Button } from "@/components/ui/button";

// The exact Button-row markup already used 4x across vms/[id]/monitoring
// (implicitly, via its own range-less refresh interval) and, verbatim,
// databases/[id]/page.tsx's MetricsTab/PerformanceTab/StorageTab and
// object-storage/[id]/page.tsx's PerformanceTab: a row of toggle Buttons,
// `variant="default"` for the selected option and `variant="outline"`
// otherwise. Extracted per Step 19 decision #11 for the new /monitoring
// dashboard only -- the source pages keep their own inline copies.
export function RangeSelector({
  options,
  selectedIndex,
  onSelect,
}: {
  options: readonly { label: string; ms: number }[];
  selectedIndex: number;
  onSelect: (index: number) => void;
}) {
  return (
    <div className="flex gap-1">
      {options.map((r, i) => (
        <Button key={r.label} size="sm" variant={i === selectedIndex ? "default" : "outline"} onClick={() => onSelect(i)}>
          {r.label}
        </Button>
      ))}
    </div>
  );
}
