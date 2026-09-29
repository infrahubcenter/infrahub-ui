"use client";

import { useEffect } from "react";
import Link from "next/link";
import { FileQuestion } from "lucide-react";
import { Button } from "@/components/ui/button";
import { APP_NAME, pageTitle } from "@/lib/branding";

export default function NotFound() {
  useEffect(() => {
    document.title = pageTitle("Page Not Found");
  }, []);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-50 px-4 text-center">
      {/* eslint-disable-next-line @next/next/no-img-element -- fixed static SVG mark, no benefit from next/image's raster pipeline */}
      <img src="/logo-icon.svg" alt={APP_NAME} className="h-10 w-10" />
      <FileQuestion className="h-10 w-10 text-slate-400" />
      <h1 className="text-lg font-semibold text-slate-900">Page not found</h1>
      <p className="max-w-sm text-sm text-slate-500">
        The page you&apos;re looking for doesn&apos;t exist or may have been moved.
      </p>
      <Button render={<Link href="/" />}>Back to safety</Button>
    </div>
  );
}
