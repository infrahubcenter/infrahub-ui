"use client";

import { Suspense, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { PrefixTree } from "./prefix-tree";
import { ObjectTable } from "./object-table";
import { ObjectDetailPanel } from "./object-detail-panel";

// Top-level Browser tab: owns current prefix, selected object (for the
// detail Sheet), and renders a 2-panel layout (PrefixTree | ObjectTable).
// Current prefix is synced to the URL (?prefix=) via useSearchParams/
// router.replace so back/forward and reload preserve place -- mirrors
// alerts/page.tsx's filter-in-URL convention. useSearchParams requires a
// Suspense boundary at build time, same split as that page.
export function ObjectStorageBrowserTab(props: {
  storageId: string;
  bucket: string;
  canDownload: boolean;
  previewMaxBytes?: number;
}) {
  return (
    <Suspense fallback={<p className="text-sm text-slate-500">Loading…</p>}>
      <ObjectStorageBrowserTabContent {...props} />
    </Suspense>
  );
}

function ObjectStorageBrowserTabContent({
  storageId,
  bucket,
  canDownload,
  previewMaxBytes,
}: {
  storageId: string;
  bucket: string;
  canDownload: boolean;
  previewMaxBytes?: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [prefix, setPrefix] = useState(searchParams.get("prefix") ?? "");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  // Keeps local state in sync with the URL for actual browser back/forward
  // navigation (our own navigateToPrefix below already updates the URL, so
  // this just converges back to the same value in that case -- harmless).
  useEffect(() => {
    const paramPrefix = searchParams.get("prefix") ?? "";
    // Syncs local state to the URL on actual back/forward navigation.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPrefix((prev) => (prev === paramPrefix ? prev : paramPrefix));
  }, [searchParams]);

  function navigateToPrefix(next: string) {
    setPrefix(next);
    const params = new URLSearchParams(searchParams.toString());
    if (next) params.set("prefix", next);
    else params.delete("prefix");
    const qs = params.toString();
    router.replace(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
      <div className="lg:col-span-1">
        <PrefixTree storageId={storageId} bucket={bucket} currentPrefix={prefix} onSelectPrefix={navigateToPrefix} />
      </div>
      <div className="lg:col-span-3">
        <ObjectTable
          storageId={storageId}
          prefix={prefix}
          onNavigateToPrefix={navigateToPrefix}
          onSelectObject={setSelectedKey}
          canDownload={canDownload}
        />
      </div>
      <ObjectDetailPanel
        storageId={storageId}
        objectKey={selectedKey}
        open={selectedKey !== null}
        onClose={() => setSelectedKey(null)}
        canDownload={canDownload}
        previewMaxBytes={previewMaxBytes}
      />
    </div>
  );
}
