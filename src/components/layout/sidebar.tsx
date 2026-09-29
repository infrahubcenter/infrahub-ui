"use client";

import { usePathname } from "next/navigation";
import { useAuth } from "@/components/auth/auth-provider";
import { APP_NAME } from "@/lib/branding";
import { SidebarVersion } from "./sidebar-version";
import { navItemsForRole } from "./nav-items";
import { NavList } from "./nav-list";

export function Sidebar() {
  const pathname = usePathname();
  const { user } = useAuth();
  const navItems = navItemsForRole(user?.role);

  return (
    <aside className="hidden w-64 shrink-0 flex-col bg-slate-900 text-slate-200 md:flex">
      <div className="flex h-16 items-center gap-2 border-b border-slate-800 px-6">
        {/* eslint-disable-next-line @next/next/no-img-element -- fixed static SVG mark, no benefit from next/image's raster pipeline */}
        <img src="/logo-icon.svg" alt={APP_NAME} className="h-8 w-8 shrink-0" />
        <span className="text-sm font-semibold tracking-wide text-white">
          {APP_NAME}
        </span>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        <NavList items={navItems} pathname={pathname} />
      </nav>

      <SidebarVersion />
    </aside>
  );
}
