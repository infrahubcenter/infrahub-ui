"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const PRESETS: { key: string; label: string; seconds: number }[] = [
  { key: "live", label: "Live", seconds: 5 },
  { key: "10s", label: "10s", seconds: 10 },
  { key: "30s", label: "30s", seconds: 30 },
  { key: "1m", label: "1m", seconds: 60 },
  { key: "5m", label: "5m", seconds: 300 },
];

// Compact Live/10s/30s/1m/5m/Custom picker for a monitoring dashboard's
// own header, next to a manual "Refresh Now" -- lets a viewer change how
// often this page polls without going back into the create wizard.
// Editable value is `seconds`; `onChange` is responsible for persisting
// it (PATCH refresh_interval_seconds) so the choice survives a reload,
// same as the wizard's own Basic-step chips this mirrors.
export function RefreshIntervalControl({
  seconds,
  onChange,
  onRefreshNow,
  editable = true,
  refreshing = false,
}: {
  seconds: number;
  onChange?: (seconds: number) => void;
  onRefreshNow: () => void;
  editable?: boolean;
  /** True while a manual/interval poll triggered by this control is in flight -- spins the icon and disables the button instead of a silent, feedback-free click. */
  refreshing?: boolean;
}) {
  const matched = PRESETS.find((p) => p.seconds === seconds);
  // Lazily seeded from the initial `seconds` and otherwise only ever
  // flipped by this component's own handlers below (never synced back
  // from the `seconds` prop via an effect) -- in every usage in this app,
  // `seconds` only changes in response to one of those same handlers, so
  // there's nothing external to resync from.
  const [customOpen, setCustomOpen] = useState(() => !matched);
  const [customValue, setCustomValue] = useState(() => String(seconds));

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {editable &&
        PRESETS.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => {
              setCustomOpen(false);
              onChange?.(p.seconds);
            }}
            className={cn(
              "rounded-full border px-2 py-0.5 text-xs font-medium",
              !customOpen && matched?.key === p.key ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-600"
            )}
          >
            {p.label}
          </button>
        ))}
      {editable && (
        <button
          type="button"
          onClick={() => setCustomOpen(true)}
          className={cn(
            "rounded-full border px-2 py-0.5 text-xs font-medium",
            customOpen ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-600"
          )}
        >
          Custom
        </button>
      )}
      {editable && customOpen && (
        <Input
          type="number"
          min={5}
          value={customValue}
          onChange={(e) => setCustomValue(e.target.value)}
          onBlur={() => {
            const n = Number(customValue);
            if (n >= 5) onChange?.(n);
          }}
          className="h-6 w-16 px-1.5 text-xs"
        />
      )}
      <Button variant="outline" size="sm" className="h-6 gap-1 px-2 text-xs" onClick={onRefreshNow} disabled={refreshing}>
        <RefreshCw className={cn("h-3 w-3", refreshing && "animate-spin")} /> {refreshing ? "Refreshing…" : "Refresh Now"}
      </Button>
    </div>
  );
}
