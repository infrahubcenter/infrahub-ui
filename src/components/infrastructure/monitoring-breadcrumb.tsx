import Link from "next/link";
import { ChevronRight } from "lucide-react";

export type BreadcrumbSegment = { label: string; href?: string };

// Shared "Monitoring > Docker > Production" style breadcrumb for every
// page across the four Monitoring/Logs trees.
export function MonitoringBreadcrumb({ segments }: { segments: BreadcrumbSegment[] }) {
  return (
    <nav className="flex items-center gap-1.5 text-sm text-slate-500">
      {segments.map((s, i) => (
        <span key={i} className="flex items-center gap-1.5">
          {i > 0 && <ChevronRight className="h-3.5 w-3.5 text-slate-300" />}
          {s.href ? (
            <Link href={s.href} className="hover:text-slate-700 hover:underline">
              {s.label}
            </Link>
          ) : (
            <span className={i === segments.length - 1 ? "font-medium text-slate-700" : ""}>{s.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}
