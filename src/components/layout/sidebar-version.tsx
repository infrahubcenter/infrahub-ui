"use client";

import { useEffect, useState } from "react";
import { getLicense } from "@/lib/api";
import { APP_RELEASE_CHANNEL, APP_VERSION } from "@/lib/branding";
import { CURRENT_PLAN } from "@/lib/plans";

// Bottom-left release + plan tag, deliberately low-contrast so it reads as
// metadata rather than competing with the nav. Shared by Sidebar and
// MobileSidebar. The plan is the API's licensed one (GET /api/license).
export function SidebarVersion() {
  const [plan, setPlan] = useState(CURRENT_PLAN.name);

  useEffect(() => {
    let cancelled = false;
    getLicense()
      .then((info) => !cancelled && setPlan(info.license.plan.name))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="mt-auto flex items-center justify-between border-t border-slate-800/60 px-6 py-3 text-[11px] text-slate-600">
      <span title={`${APP_RELEASE_CHANNEL} release`}>v{APP_VERSION}</span>
      <span className="text-slate-700">{plan}</span>
    </div>
  );
}
