"use client";

import { useEffect, useState } from "react";
import { Download, File as FileIcon, Folder, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatAgo, formatBytes } from "@/lib/format";
import {
  ApiError,
  getObjectStoragePrefixSize,
  listObjectStorageEntries,
  searchObjectStorageEntries,
  type ObjectStorageEntry,
  type ObjectStoragePrefixSize,
} from "@/lib/api";

const PAGE_SIZE = 50;

// Breadcrumb + paginated table. Pagination is continuation-token based,
// not offset -- there is no bidirectional pagination API, so "Previous"
// pages are tracked client-side via a token stack: tokenStack[i] is the
// continuation_token that was used to fetch page i (tokenStack[0] is
// always undefined, the first page needs none). "Next" pushes the
// response's next_continuation_token onto the stack; "Previous" just
// re-fetches with the token already recorded for pageIndex - 1.
export function ObjectTable({
  storageId,
  prefix,
  onNavigateToPrefix,
  onSelectObject,
  canDownload,
}: {
  storageId: string;
  prefix: string;
  onNavigateToPrefix: (prefix: string) => void;
  onSelectObject: (key: string) => void;
  canDownload: boolean;
}) {
  const [entries, setEntries] = useState<ObjectStorageEntry[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tokenStack, setTokenStack] = useState<(string | undefined)[]>([undefined]);
  const [pageIndex, setPageIndex] = useState(0);
  const [nextToken, setNextToken] = useState<string | undefined>(undefined);
  const [searchMode, setSearchMode] = useState(false);
  const [activeQuery, setActiveQuery] = useState("");
  const [searchInput, setSearchInput] = useState("");
  // Folder sizes are never in the listing response (S3 has no such
  // concept) -- fetched on demand per folder row once it's visible, one
  // bounded recursive scan each, keyed by the folder's own key so
  // switching pages/prefixes never shows a stale size for a different row.
  const [folderSizes, setFolderSizes] = useState<Record<string, ObjectStoragePrefixSize | "loading" | "error">>({});

  function fetchPage(index: number, token: string | undefined, isSearch: boolean, query: string) {
    setLoading(true);
    setError(null);
    const request = isSearch
      ? searchObjectStorageEntries(storageId, { prefix, query, limit: PAGE_SIZE, continuation_token: token })
      : listObjectStorageEntries(storageId, { prefix, limit: PAGE_SIZE, continuation_token: token });
    request
      .then((res) => {
        setEntries(res.entries);
        setNextToken(res.next_continuation_token);
        setPageIndex(index);
      })
      .catch((err) => {
        setError(err instanceof ApiError ? err.message : "Failed to load objects.");
        setEntries(null);
        setNextToken(undefined);
      })
      .finally(() => setLoading(false));
  }

  // A new prefix (breadcrumb/tree/row navigation) always resets search and
  // pagination -- the token stack only makes sense for pages within the
  // prefix it was built for.
  useEffect(() => {
    // Resets search/pagination state when navigating to a new prefix.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSearchMode(false);
    setActiveQuery("");
    setSearchInput("");
    setTokenStack([undefined]);
    setFolderSizes({});
    fetchPage(0, undefined, false, "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageId, prefix]);

  // Computes each visible folder row's size once, right after its page
  // loads -- never re-fetched on every render, and never for a folder
  // whose size this component has already fetched (e.g. paging back to a
  // previously-seen page).
  useEffect(() => {
    const folders = (entries ?? []).filter((e) => e.type === "FOLDER");
    const pending = folders.filter((f) => folderSizes[f.key] === undefined);
    if (pending.length === 0) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFolderSizes((prev) => {
      const next = { ...prev };
      for (const f of pending) next[f.key] = "loading";
      return next;
    });
    for (const folder of pending) {
      getObjectStoragePrefixSize(storageId, folder.key)
        .then((size) => {
          if (cancelled) return;
          setFolderSizes((prev) => ({ ...prev, [folder.key]: size }));
        })
        .catch(() => {
          if (cancelled) return;
          setFolderSizes((prev) => ({ ...prev, [folder.key]: "error" }));
        });
    }
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries, storageId]);

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    const q = searchInput.trim();
    if (!q) return;
    setSearchMode(true);
    setActiveQuery(q);
    setTokenStack([undefined]);
    fetchPage(0, undefined, true, q);
  }

  function handleClearSearch() {
    setSearchMode(false);
    setActiveQuery("");
    setSearchInput("");
    setTokenStack([undefined]);
    fetchPage(0, undefined, false, "");
  }

  function handleNext() {
    if (!nextToken) return;
    setTokenStack((prev) => [...prev.slice(0, pageIndex + 1), nextToken]);
    fetchPage(pageIndex + 1, nextToken, searchMode, activeQuery);
  }

  function handlePrev() {
    if (pageIndex === 0) return;
    fetchPage(pageIndex - 1, tokenStack[pageIndex - 1], searchMode, activeQuery);
  }

  const segments = prefix.split("/").filter(Boolean);
  const crumbs: { label: string; prefix: string }[] = [];
  let cumulative = "";
  for (const seg of segments) {
    cumulative += `${seg}/`;
    crumbs.push({ label: seg, prefix: cumulative });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <nav className="flex flex-wrap items-center gap-1 text-sm" aria-label="Breadcrumb">
          <button
            type="button"
            onClick={() => onNavigateToPrefix("")}
            className={`hover:underline ${prefix === "" ? "font-medium text-slate-900" : "text-sky-700"}`}
          >
            Root
          </button>
          {crumbs.map((c) => (
            <span key={c.prefix} className="flex items-center gap-1">
              <span className="text-slate-400">/</span>
              <button
                type="button"
                onClick={() => onNavigateToPrefix(c.prefix)}
                className={`hover:underline ${prefix === c.prefix ? "font-medium text-slate-900" : "text-sky-700"}`}
              >
                {c.label}
              </button>
            </span>
          ))}
        </nav>

        <form onSubmit={handleSearchSubmit} className="flex items-center gap-1.5">
          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search by name prefix..."
            className="h-8 w-56"
          />
          <Button type="submit" size="sm" variant="outline" aria-label="Search">
            <Search className="h-3.5 w-3.5" />
          </Button>
          {searchMode && (
            <Button type="button" size="sm" variant="ghost" onClick={handleClearSearch} aria-label="Clear search">
              <X className="h-3.5 w-3.5" />
            </Button>
          )}
        </form>
      </div>

      {searchMode && (
        <p className="text-xs text-slate-500">
          Matching names starting with &quot;{activeQuery}&quot; within this folder (prefix match only, not a general search).
        </p>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="rounded-lg border border-slate-200 bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Size</TableHead>
              <TableHead>Last Modified</TableHead>
              <TableHead>Storage Class</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(entries ?? []).map((entry) => (
              <TableRow
                key={entry.key}
                className="cursor-pointer"
                onClick={() => (entry.type === "FOLDER" ? onNavigateToPrefix(entry.key) : onSelectObject(entry.key))}
              >
                <TableCell>
                  <span className="flex items-center gap-1.5">
                    {entry.type === "FOLDER" ? (
                      <Folder className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                    ) : (
                      <FileIcon className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                    )}
                    <span className="truncate">{entry.name}</span>
                    {entry.type === "OBJECT" && canDownload && (
                      <Download className="h-3 w-3 shrink-0 text-slate-300" aria-label="Downloadable" />
                    )}
                  </span>
                </TableCell>
                <TableCell>{entry.type === "FOLDER" ? "Folder" : "Object"}</TableCell>
                <TableCell>{entry.type === "FOLDER" ? <FolderSizeCell size={folderSizes[entry.key]} /> : entry.size_bytes !== undefined ? formatBytes(entry.size_bytes) : "—"}</TableCell>
                <TableCell>{entry.last_modified ? formatAgo(entry.last_modified) : "—"}</TableCell>
                <TableCell>{entry.storage_class ?? "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {!loading && entries && entries.length === 0 && (
          <div className="border-t border-slate-200 p-8 text-center text-sm text-slate-500">No objects found.</div>
        )}
        {loading && <div className="border-t border-slate-200 p-8 text-center text-sm text-slate-500">Loading…</div>}
      </div>

      <div className="flex items-center justify-between">
        <span className="text-xs text-slate-500">Page {pageIndex + 1}</span>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" disabled={pageIndex === 0 || loading} onClick={handlePrev}>
            Previous
          </Button>
          <Button size="sm" variant="outline" disabled={!nextToken || loading} onClick={handleNext}>
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}

// A folder's size is never in the listing response (S3 has no such
// concept) -- ListTable fetches it separately, one bounded recursive scan
// per folder, and this just renders whatever state that fetch is in.
// truncated:true means the scan hit its safety cap before finishing --
// shown as "X+" (a real but incomplete sum), never as an exact total.
function FolderSizeCell({ size }: { size: ObjectStoragePrefixSize | "loading" | "error" | undefined }) {
  if (size === undefined || size === "loading") {
    return <span className="text-slate-400">…</span>;
  }
  if (size === "error") {
    return <span className="text-slate-400">—</span>;
  }
  return (
    <span>
      {formatBytes(size.total_size_bytes)}
      {size.truncated ? "+" : ""}
    </span>
  );
}
