import { APP_RELEASE_CHANNEL, APP_VERSION } from "@/lib/branding";
import { CURRENT_PLAN } from "@/lib/plans";

// Bottom-left release + plan tag, deliberately low-contrast so it reads as
// metadata rather than competing with the nav. Shared by Sidebar and
// MobileSidebar.
export function SidebarVersion() {
  return (
    <div className="mt-auto flex items-center justify-between border-t border-slate-800/60 px-6 py-3 text-[11px] text-slate-600">
      <span title={`${APP_RELEASE_CHANNEL} release`}>v{APP_VERSION}</span>
      <span className="text-slate-700">{CURRENT_PLAN.name}</span>
    </div>
  );
}
