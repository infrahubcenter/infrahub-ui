"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/components/auth/auth-provider";
import { APP_NAME, pageTitle } from "@/lib/branding";
import { MobileSidebar } from "./mobile-sidebar";
import { NotificationBell } from "./notification-bell";
import { ThemeToggleButton } from "./theme-toggle-button";
import { navItemsForRole } from "./nav-items";

function currentPageLabel(pathname: string, navItems: ReturnType<typeof navItemsForRole>): string {
  // Flattens groups into their own child pages. Child labels are already
  // self-descriptive ("Docker Monitoring", "Kubernetes Log Explorer"), so
  // the header shows them as-is, without the group label prefixed.
  const flat: { href: string; label: string }[] = [];
  for (const item of navItems) {
    if (item.children) {
      for (const child of item.children) {
        flat.push({ href: child.href, label: child.label });
      }
    } else if (item.href) {
      flat.push({ href: item.href, label: item.label });
    }
  }
  // Longest (most specific) match wins, so /vms/metrics resolves to
  // "Host Metrics & Logs" rather than its /vms prefix sibling.
  let match: { href: string; label: string } | undefined;
  for (const entry of flat) {
    const hit = entry.href === "/" ? pathname === "/" : pathname === entry.href || pathname.startsWith(entry.href + "/");
    if (hit && (!match || entry.href.length > match.href.length)) match = entry;
  }
  return match?.label ?? APP_NAME;
}

export function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();
  const navItems = navItemsForRole(user?.role);
  const label = currentPageLabel(pathname, navItems);

  // Every page under the shell layout renders through this one Header,
  // so setting the browser tab title here (rather than in each of the
  // ~20 individual page files, all of which are client components and
  // can't export the App Router's server-only `metadata`) gives every
  // route a correct "Infra Hub Center | <page>" title for free.
  useEffect(() => {
    document.title = pageTitle(label);
  }, [label]);

  async function handleLogout() {
    await logout();
    router.replace("/login");
  }

  return (
    <header className="flex h-16 items-center justify-between border-b border-slate-200 bg-white px-4 sm:px-6">
      <div className="flex items-center gap-3">
        <MobileSidebar />
        <h1 className="text-base font-semibold text-slate-900">{label}</h1>
      </div>

      <div className="flex items-center gap-3">
        {user && (
          <>
            <ThemeToggleButton />
            <NotificationBell />
            <div className="hidden text-right sm:block">
              <div className="text-sm font-medium text-slate-900">{user.name}</div>
              <div className="text-xs text-slate-500">{user.email}</div>
            </div>
            <Badge variant="secondary">{user.role}</Badge>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Sign out"
              onClick={handleLogout}
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </>
        )}
      </div>
    </header>
  );
}
