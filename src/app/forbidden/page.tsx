"use client";

import { useEffect } from "react";
import Link from "next/link";
import { ShieldX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/components/auth/auth-provider";
import { isAdminRole } from "@/lib/api";
import { APP_NAME, pageTitle } from "@/lib/branding";

export default function ForbiddenPage() {
  const { user } = useAuth();
  const homeHref = isAdminRole(user?.role) ? "/" : "/workspaces";

  useEffect(() => {
    document.title = pageTitle("Access Denied");
  }, []);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-50 px-4 text-center">
      {/* eslint-disable-next-line @next/next/no-img-element -- fixed static SVG mark, no benefit from next/image's raster pipeline */}
      <img src="/logo-icon.svg" alt={APP_NAME} className="h-10 w-10" />
      <ShieldX className="h-10 w-10 text-slate-400" />
      <h1 className="text-lg font-semibold text-slate-900">Access denied</h1>
      <p className="max-w-sm text-sm text-slate-500">
        You don&apos;t have permission to view this page. If you think this
        is a mistake, contact an administrator.
      </p>
      <Button render={<Link href={homeHref} />}>Back to safety</Button>
    </div>
  );
}
