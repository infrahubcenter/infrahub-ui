import type { UserStatus } from "@/lib/api";

// Mirrors DatabaseConnectionStatusBadge/ObjectStorageStatusBadge's exact
// styling convention (rounded pill, ring-inset, no dot indicator). Wired
// into /admin/users/page.tsx's Status column (Step 18 Phase 4).

const STATUS_STYLES: Record<UserStatus, string> = {
  ACTIVE: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  INVITED: "bg-sky-50 text-sky-700 ring-sky-600/20",
  DISABLED: "bg-slate-100 text-slate-500 ring-slate-400/20",
};

const STATUS_LABEL: Record<UserStatus, string> = {
  ACTIVE: "Active",
  INVITED: "Invited",
  DISABLED: "Disabled",
};

export function UserStatusBadge({ status }: { status: UserStatus }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${STATUS_STYLES[status]}`}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}
