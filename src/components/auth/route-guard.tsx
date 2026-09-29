"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "./auth-provider";
import type { Role } from "@/lib/api";

// OWNER has every ADMIN capability plus a couple of Owner-exclusive ones
// (see settings/page.tsx) -- so a requireRole="ADMIN" page must admit an
// OWNER too, not exact-match the role string.
function satisfiesRole(userRole: Role, requireRole: Role): boolean {
  if (userRole === requireRole) return true;
  if (requireRole === "ADMIN" && userRole === "OWNER") return true;
  return false;
}

/**
 * Client-side route gate: redirects to /login when unauthenticated, or to
 * /forbidden when authenticated but missing requireRole. This is UX only --
 * every API call is independently authorized by the backend, which is the
 * actual security boundary (see docs/authorization.md).
 */
export function RouteGuard({
  requireRole,
  children,
}: {
  requireRole?: Role;
  children: React.ReactNode;
}) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace("/login");
      return;
    }
    if (requireRole && !satisfiesRole(user.role, requireRole)) {
      router.replace("/forbidden");
    }
  }, [loading, user, requireRole, router]);

  if (loading || !user || (requireRole && !satisfiesRole(user.role, requireRole))) {
    return (
      <div className="flex h-full min-h-[50vh] items-center justify-center text-sm text-slate-500">
        Loading&hellip;
      </div>
    );
  }

  return <>{children}</>;
}
