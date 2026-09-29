"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { APP_NAME, pageTitle } from "@/lib/branding";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    document.title = pageTitle("Something Went Wrong");
  }, []);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-50 px-4 text-center">
      {/* eslint-disable-next-line @next/next/no-img-element -- fixed static SVG mark, no benefit from next/image's raster pipeline */}
      <img src="/logo-icon.svg" alt={APP_NAME} className="h-10 w-10" />
      <AlertTriangle className="h-10 w-10 text-red-400" />
      <h1 className="text-lg font-semibold text-slate-900">Something went wrong</h1>
      <p className="max-w-sm text-sm text-slate-500">
        An unexpected error occurred. Try again, or contact an administrator if the problem persists.
      </p>
      <Button onClick={() => reset()}>Try again</Button>
    </div>
  );
}
