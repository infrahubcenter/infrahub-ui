"use client";

import { useState } from "react";
import { Check, Pencil, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ApiError } from "@/lib/api";

// A custom "App Name" label, editable inline by an Admin -- shown instead
// of the container/pod's real name wherever set (Monitoring, Logs), purely
// cosmetic. Used identically for Docker containers and K8s pods; only the
// save callback differs.
export function RenameLabel({
  name,
  displayName,
  editable,
  onSave,
  className,
}: {
  name: string;
  displayName?: string;
  editable: boolean;
  onSave: (newDisplayName: string) => Promise<void>;
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(displayName ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const label = displayName || name;

  if (!editing) {
    return (
      <span className={`group inline-flex min-w-0 items-center gap-1 ${className ?? ""}`}>
        <span className="truncate" title={displayName ? `${displayName} (${name})` : name}>
          {label}
        </span>
        {editable && (
          <button
            type="button"
            onClick={() => {
              setValue(displayName ?? "");
              setError(null);
              setEditing(true);
            }}
            className="shrink-0 text-slate-300 opacity-0 transition-opacity hover:text-slate-600 group-hover:opacity-100"
            aria-label={`Rename ${name}`}
          >
            <Pencil className="h-3 w-3" />
          </button>
        )}
      </span>
    );
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      await onSave(value.trim());
      setEditing(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to rename.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <span className="inline-flex min-w-0 flex-col gap-1" onClick={(e) => e.stopPropagation()}>
      <span className="inline-flex items-center gap-1">
        <Input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={name}
          disabled={saving}
          className="h-6 px-1.5 text-xs"
          onKeyDown={(e) => {
            if (e.key === "Enter") void handleSave();
            if (e.key === "Escape") setEditing(false);
          }}
        />
        <Button variant="ghost" size="icon" className="h-6 w-6" disabled={saving} onClick={handleSave}>
          <Check className="h-3 w-3" />
        </Button>
        <Button variant="ghost" size="icon" className="h-6 w-6" disabled={saving} onClick={() => setEditing(false)}>
          <X className="h-3 w-3" />
        </Button>
      </span>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </span>
  );
}
