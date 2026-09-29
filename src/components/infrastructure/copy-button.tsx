"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Small "Copy" affordance for a command/token block -- shared by every
// agent install command reveal (VM Agent, Docker Agent, Docker Host,
// Kubernetes agent) so a long docker run/kubectl command never has to be
// hand-selected. Falls back to a manual-select hint if the Clipboard API
// itself is unavailable (non-HTTPS context, older browser) rather than
// silently doing nothing.
export function CopyButton({ value, className, label = "Copy" }: { value: string; className?: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const [unsupported, setUnsupported] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setUnsupported(false);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setUnsupported(true);
    }
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      <Button type="button" variant="outline" size="sm" className={cn("gap-1", className)} onClick={handleCopy}>
        {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
        {copied ? "Copied" : label}
      </Button>
      {unsupported && <span className="text-xs text-amber-600">Clipboard unavailable -- select the text manually.</span>}
    </span>
  );
}
