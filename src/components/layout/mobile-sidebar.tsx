"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useAuth } from "@/components/auth/auth-provider";
import { APP_NAME } from "@/lib/branding";
import { navItemsForRole } from "./nav-items";
import { NavList } from "./nav-list";
import { SidebarVersion } from "./sidebar-version";

export function MobileSidebar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const { user } = useAuth();
  const navItems = navItemsForRole(user?.role);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            aria-label="Open navigation menu"
          />
        }
      >
        <Menu className="h-5 w-5" />
      </SheetTrigger>
      <SheetContent
        side="left"
        className="w-64 border-slate-800 bg-slate-900 p-0 text-slate-200"
      >
        <SheetHeader className="border-b border-slate-800 px-6 py-4">
          <SheetTitle className="flex items-center gap-2 text-white">
            {/* eslint-disable-next-line @next/next/no-img-element -- fixed static SVG mark, no benefit from next/image's raster pipeline */}
            <img src="/logo-icon.svg" alt={APP_NAME} className="h-6 w-6 shrink-0" />
            {APP_NAME}
          </SheetTitle>
        </SheetHeader>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
          <NavList items={navItems} pathname={pathname} onNavigate={() => setOpen(false)} />
        </nav>

        <SidebarVersion />
      </SheetContent>
    </Sheet>
  );
}
