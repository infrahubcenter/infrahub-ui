"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { ApiError, getObjectStorageDownloadUrl, getObjectStoragePreview } from "@/lib/api";
import { openObjectStorageDownload } from "./download";

const DEFAULT_PREVIEW_MAX_BYTES = 5 * 1024 * 1024;

// Decision tree (per Step 17's design): oversized files never call any
// preview/download endpoint proactively -- only a click does. Text/JSON
// renders inline via the byte-capped preview endpoint. Images/PDF preview
// via the same short-lived presigned URL as Download, never through the
// JSON preview endpoint (that would base64-inflate a multi-MB file through
// JSON) -- and both require canDownload since they need that same
// presigned-URL mechanism. Everything else gets a plain "not available"
// message with no wasted network call.
export function ObjectPreview({
  storageId,
  objectKey,
  contentType,
  sizeBytes,
  previewMaxBytes,
  canDownload,
}: {
  storageId: string;
  objectKey: string;
  contentType?: string;
  sizeBytes?: number;
  previewMaxBytes?: number;
  canDownload: boolean;
}) {
  const maxBytes = previewMaxBytes ?? DEFAULT_PREVIEW_MAX_BYTES;
  const tooLarge = sizeBytes !== undefined && sizeBytes > maxBytes;
  const isTextLike = !!contentType && (contentType.startsWith("text/") || contentType === "application/json");
  const isImage = !!contentType && contentType.startsWith("image/");
  const isPdf = contentType === "application/pdf";

  const [text, setText] = useState<{ content: string; truncated: boolean } | null>(null);
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    // Clears any previous object's preview state before deciding (below)
    // whether this one needs a fetch at all.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setText(null);
    setMediaUrl(null);
    setError(null);

    // Oversized: never fetch preview or a presigned URL automatically.
    if (tooLarge) return;

    if (isTextLike) {
      let cancelled = false;
      setLoading(true);
      getObjectStoragePreview(storageId, objectKey)
        .then((res) => {
          if (cancelled) return;
          const raw = res.encoding === "base64" ? atob(res.content) : res.content;
          if (res.content_type === "application/json") {
            try {
              setText({ content: JSON.stringify(JSON.parse(raw), null, 2), truncated: res.truncated });
              return;
            } catch {
              // Not valid JSON (or truncated mid-object) -- fall back to
              // the raw text below rather than failing the whole preview.
            }
          }
          setText({ content: raw, truncated: res.truncated });
        })
        .catch((err) => {
          if (!cancelled) setError(err instanceof ApiError ? err.message : "Failed to load preview.");
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
      return () => {
        cancelled = true;
      };
    }

    if ((isImage || isPdf) && canDownload) {
      let cancelled = false;
      setLoading(true);
      getObjectStorageDownloadUrl(storageId, objectKey)
        .then((res) => {
          if (!cancelled) setMediaUrl(res.url);
        })
        .catch((err) => {
          if (!cancelled) setError(err instanceof ApiError ? err.message : "Failed to load preview.");
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
      return () => {
        cancelled = true;
      };
    }
  }, [storageId, objectKey, contentType, tooLarge, isTextLike, isImage, isPdf, canDownload]);

  async function handleDownloadClick() {
    setDownloading(true);
    setError(null);
    try {
      await openObjectStorageDownload(storageId, objectKey);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to generate download link.");
    } finally {
      setDownloading(false);
    }
  }

  if (tooLarge) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">
        <p>File too large to preview.</p>
        {canDownload && (
          <Button size="sm" variant="outline" onClick={handleDownloadClick} disabled={downloading}>
            {downloading ? "Preparing…" : "Download"}
          </Button>
        )}
        {error && <p className="text-xs text-red-600">{error}</p>}
      </div>
    );
  }

  if (isTextLike) {
    if (loading) return <p className="text-sm text-slate-500">Loading preview…</p>;
    if (error) return <p className="text-sm text-red-600">{error}</p>;
    if (!text) return null;
    return (
      <div className="flex flex-col gap-2">
        <pre className="max-h-96 overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-800">
          {text.content}
        </pre>
        {text.truncated && <p className="text-xs text-slate-500">Content truncated — download for the full file.</p>}
      </div>
    );
  }

  if (isImage) {
    if (!canDownload) return <p className="text-sm text-slate-500">Preview requires download permission.</p>;
    if (loading) return <p className="text-sm text-slate-500">Loading preview…</p>;
    if (error) return <p className="text-sm text-red-600">{error}</p>;
    if (!mediaUrl) return null;
    // A short-lived presigned URL from an arbitrary S3-compatible endpoint,
    // not a static asset next/image can optimize.
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={mediaUrl} alt={objectKey} className="max-h-96 max-w-full rounded-lg border border-slate-200" />
    );
  }

  if (isPdf) {
    if (!canDownload) return <p className="text-sm text-slate-500">Preview requires download permission.</p>;
    if (loading) return <p className="text-sm text-slate-500">Loading preview…</p>;
    if (error) return <p className="text-sm text-red-600">{error}</p>;
    if (!mediaUrl) return null;
    return <iframe src={mediaUrl} title={objectKey} className="h-128 w-full rounded-lg border border-slate-200" />;
  }

  return <p className="text-sm text-slate-500">Preview not available for this file type.</p>;
}
