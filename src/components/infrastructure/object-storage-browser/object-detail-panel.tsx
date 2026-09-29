"use client";

import { Fragment, useEffect, useState } from "react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { formatAgo, formatBytes } from "@/lib/format";
import { ApiError, getObjectStorageObjectMetadata, type ObjectStorageObjectMetadata } from "@/lib/api";
import { ObjectPreview } from "./object-preview";
import { openObjectStorageDownload } from "./download";

// A Sheet (already installed, no new Dialog dependency) that fetches
// metadata lazily -- only once opened for a given key, never prefetched
// per row while scrolling the table, to avoid N+1 calls.
export function ObjectDetailPanel({
  storageId,
  objectKey,
  open,
  onClose,
  canDownload,
  previewMaxBytes,
}: {
  storageId: string;
  objectKey: string | null;
  open: boolean;
  onClose: () => void;
  canDownload: boolean;
  previewMaxBytes?: number;
}) {
  const [metadata, setMetadata] = useState<ObjectStorageObjectMetadata | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !objectKey) {
      // Resets stale metadata when the panel closes or the selection clears.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setMetadata(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    setDownloadError(null);
    getObjectStorageObjectMetadata(storageId, objectKey)
      .then((res) => {
        if (!cancelled) setMetadata(res);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : "Failed to load object metadata.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [storageId, objectKey, open]);

  async function handleDownload() {
    if (!objectKey) return;
    setDownloading(true);
    setDownloadError(null);
    try {
      await openObjectStorageDownload(storageId, objectKey);
    } catch (err) {
      setDownloadError(err instanceof ApiError ? err.message : "Failed to generate download link.");
    } finally {
      setDownloading(false);
    }
  }

  const basename = objectKey ? (objectKey.split("/").filter(Boolean).pop() ?? objectKey) : "";
  const metadataEntries = metadata ? Object.entries(metadata.metadata) : [];

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <SheetContent side="right" className="flex w-full flex-col gap-0 overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle className="break-all">{basename || "Object"}</SheetTitle>
          {objectKey && <SheetDescription className="break-all">{objectKey}</SheetDescription>}
        </SheetHeader>

        <div className="flex flex-col gap-4 px-4 pb-4">
          {loading && <p className="text-sm text-slate-500">Loading…</p>}
          {error && <p className="text-sm text-red-600">{error}</p>}

          {metadata && objectKey && (
            <>
              <dl className="grid grid-cols-2 gap-y-2 text-sm">
                <dt className="text-slate-500">Size</dt>
                <dd className="text-slate-900">{formatBytes(metadata.size_bytes)}</dd>
                <dt className="text-slate-500">Content Type</dt>
                <dd className="text-slate-900">{metadata.content_type ?? "—"}</dd>
                <dt className="text-slate-500">ETag</dt>
                <dd className="break-all text-slate-900">{metadata.etag ?? "—"}</dd>
                <dt className="text-slate-500">Last Modified</dt>
                <dd className="text-slate-900">{formatAgo(metadata.last_modified)}</dd>
                <dt className="text-slate-500">Storage Class</dt>
                <dd className="text-slate-900">{metadata.storage_class ?? "—"}</dd>
              </dl>

              {metadataEntries.length > 0 && (
                <div>
                  <h4 className="mb-2 text-sm font-semibold text-slate-900">Metadata</h4>
                  <dl className="grid grid-cols-2 gap-y-1.5 text-xs">
                    {metadataEntries.map(([k, v]) => (
                      <Fragment key={k}>
                        <dt className="truncate text-slate-500">{k}</dt>
                        <dd className="break-all text-slate-900">{v}</dd>
                      </Fragment>
                    ))}
                  </dl>
                </div>
              )}

              {canDownload && (
                <div>
                  <Button size="sm" onClick={handleDownload} disabled={downloading}>
                    {downloading ? "Preparing…" : "Download"}
                  </Button>
                  {downloadError && <p className="mt-1 text-xs text-red-600">{downloadError}</p>}
                </div>
              )}

              <div className="border-t border-slate-100 pt-4">
                <h4 className="mb-2 text-sm font-semibold text-slate-900">Preview</h4>
                <ObjectPreview
                  storageId={storageId}
                  objectKey={objectKey}
                  contentType={metadata.content_type}
                  sizeBytes={metadata.size_bytes}
                  previewMaxBytes={previewMaxBytes}
                  canDownload={canDownload}
                />
              </div>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
