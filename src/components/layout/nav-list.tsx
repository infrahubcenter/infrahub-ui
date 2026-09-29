"use client";

import Link from "next/link";
import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { NavItem } from "./nav-items";

// Shared between Sidebar (desktop) and MobileSidebar (the Sheet drawer) --
// both render the exact same item list against the same active-route
// rules, so the group expand/collapse state and active-detection logic
// live here once instead of twice.
export function NavList({
  items,
  pathname,
  onNavigate,
}: {
  items: NavItem[];
  pathname: string;
  onNavigate?: () => void;
}) {
  // Most-specific-match, computed once across the WHOLE tree, not per
  // item/child independently -- with sibling groups whose hrefs nest
  // (e.g. /vms, /vms/metrics, /vms/updates), an independent per-child
  // `pathname.startsWith(child.href)` check would light up every prefix
  // match at once (visiting /vms/metrics/some-vm would highlight both
  // "Virtual Machine" and "Metrics and Logs"). Only the single longest
  // matching href wins.
  const activeHref = computeActiveHref(pathname, collectHrefs(items));

  return (
    <>
      {items.map((item) =>
        item.children ? (
          <NavGroup key={item.label} item={item} activeHref={activeHref} onNavigate={onNavigate} />
        ) : (
          <Link
            key={item.href}
            href={item.href!}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              item.href === activeHref
                ? "bg-slate-800 text-white"
                : "text-slate-400 hover:bg-slate-800/60 hover:text-white"
            )}
          >
            <item.icon className="h-4 w-4" />
            {item.label}
          </Link>
        )
      )}
    </>
  );
}

function collectHrefs(items: NavItem[]): string[] {
  const hrefs: string[] = [];
  for (const item of items) {
    if (item.href) hrefs.push(item.href);
    for (const child of item.children ?? []) hrefs.push(child.href);
  }
  return hrefs;
}

function hrefMatches(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/");
}

// Returns the single longest href (i.e. most specific) that matches
// pathname, or null if none do -- the one and only item/child considered
// "active" anywhere in the sidebar for this route.
function computeActiveHref(pathname: string, hrefs: string[]): string | null {
  let best: string | null = null;
  for (const href of hrefs) {
    if (hrefMatches(pathname, href) && (best === null || href.length > best.length)) {
      best = href;
    }
  }
  return best;
}

function NavGroup({ item, activeHref, onNavigate }: { item: NavItem; activeHref: string | null; onNavigate?: () => void }) {
  const children = item.children ?? [];
  const hasActiveChild = children.some((c) => c.href === activeHref);
  // null = "not yet manually toggled" -- follow the active route so
  // landing on e.g. /docker/logs auto-expands its group, without an
  // effect (derived straight from render, recomputed on every pathname
  // change). Once the user manually toggles, that choice takes over.
  const [manualOpen, setManualOpen] = useState<boolean | null>(null);
  const open = manualOpen ?? hasActiveChild;

  const Icon = item.icon;
  return (
    <div>
      <button
        type="button"
        onClick={() => setManualOpen(!open)}
        aria-expanded={open}
        className={cn(
          "flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
          hasActiveChild ? "text-white" : "text-slate-400 hover:bg-slate-800/60 hover:text-white"
        )}
      >
        <Icon className="h-4 w-4" />
        <span className="flex-1 text-left">{item.label}</span>
        <ChevronDown className={cn("h-4 w-4 shrink-0 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="mt-1 flex flex-col gap-1">
          {children.map((child) => (
            <Link
              key={child.href}
              href={child.href}
              onClick={onNavigate}
              className={cn(
                "rounded-md py-1.5 pl-10 pr-3 text-sm transition-colors",
                child.href === activeHref
                  ? "bg-slate-800 text-white"
                  : "text-slate-400 hover:bg-slate-800/60 hover:text-white"
              )}
            >
              {child.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
