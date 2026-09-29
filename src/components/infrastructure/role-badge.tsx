import type { Role } from "@/lib/api";

// Mirrors UserStatusBadge's exact styling convention (rounded pill,
// ring-inset, no dot indicator). OWNER gets its own amber styling so it's
// visually distinguishable from ADMIN at a glance -- Owner sits above
// Admin (every Admin capability, plus a couple of Owner-exclusive ones,
// see settings/page.tsx) rather than being a synonym for it.

const ROLE_STYLES: Record<Role, string> = {
  OWNER: "bg-amber-50 text-amber-700 ring-amber-600/20",
  ADMIN: "bg-sky-50 text-sky-700 ring-sky-600/20",
  MEMBER: "bg-slate-100 text-slate-600 ring-slate-400/20",
};

const ROLE_LABEL: Record<Role, string> = {
  OWNER: "Owner",
  ADMIN: "Admin",
  MEMBER: "Member",
};

export function RoleBadge({ role }: { role: Role }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${ROLE_STYLES[role]}`}
    >
      {ROLE_LABEL[role]}
    </span>
  );
}
