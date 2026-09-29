import { getObjectStorageDownloadUrl } from "@/lib/api";

// Fetches a fresh short-lived presigned URL and opens it immediately in a
// new tab -- never cache/store the URL beyond this single call (it's a
// temporary credential in the query string, per docs/object-storage
// decisions on presigned links). Shared by the detail panel's Download
// button and the preview pane's oversized-file fallback so the
// "fetch fresh, open, discard" rule lives in exactly one place. Throws on
// failure -- callers surface their own error state via catch.
export async function openObjectStorageDownload(storageId: string, key: string): Promise<void> {
  const result = await getObjectStorageDownloadUrl(storageId, key);
  window.open(result.url, "_blank", "noopener,noreferrer");
}
