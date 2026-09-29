"use client";

import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight, Folder } from "lucide-react";
import { ApiError, listObjectStorageEntries, type ObjectStorageEntry } from "@/lib/api";

type NodeChildren = { entries: ObjectStorageEntry[]; nextToken?: string };

// Lazily-expanding accordion, not an eagerly-fetched full tree -- no API
// can cheaply return "the whole tree" for a large bucket. Root node =
// bucket name, always expanded, fetches its own first-level children on
// mount. Each folder node fetches its children only when first expanded,
// caching results per-prefix in a Map so re-expanding never re-fetches.
// Plain nested <button> rows with indentation -- no new tree widget, this
// matches how the Database Browser tab's table/schema list already works
// with plain buttons at this list scale (<=200 items per level,
// server-clamped). Indentation uses inline styles rather than a
// template-literal Tailwind class (`pl-${depth * 4}`) because Tailwind's
// build-time scanner can't see dynamically interpolated class names.
export function PrefixTree({
  storageId,
  bucket,
  currentPrefix,
  onSelectPrefix,
}: {
  storageId: string;
  bucket: string;
  currentPrefix: string;
  onSelectPrefix: (prefix: string) => void;
}) {
  const [cache, setCache] = useState<Map<string, NodeChildren>>(new Map());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState<Set<string>>(new Set());
  const [errors, setErrors] = useState<Map<string, string>>(new Map());

  // Not wrapped in useCallback: it's only ever invoked from click handlers
  // and the one mount-only effect below (whose dependency array is
  // intentionally limited to storageId), so there's no need to chase a
  // stable identity here -- it can simply close over the latest `cache`
  // state on every render.
  function loadChildren(prefix: string, append: boolean) {
    setLoading((prev) => new Set(prev).add(prefix));
    setErrors((prev) => {
      if (!prev.has(prefix)) return prev;
      const next = new Map(prev);
      next.delete(prefix);
      return next;
    });
    const token = append ? cache.get(prefix)?.nextToken : undefined;
    listObjectStorageEntries(storageId, { prefix, limit: 50, continuation_token: token })
      .then((res) => {
        const folders = res.entries.filter((e) => e.type === "FOLDER");
        setCache((prev) => {
          const next = new Map(prev);
          const existing = append ? next.get(prefix)?.entries ?? [] : [];
          next.set(prefix, { entries: [...existing, ...folders], nextToken: res.next_continuation_token });
          return next;
        });
      })
      .catch((err) => {
        setErrors((prev) => new Map(prev).set(prefix, err instanceof ApiError ? err.message : "Failed to load."));
      })
      .finally(() => {
        setLoading((prev) => {
          const next = new Set(prev);
          next.delete(prefix);
          return next;
        });
      });
  }

  useEffect(() => {
    // Root's children, fetched once per storage id. Expansion/caching of
    // every other node is driven entirely by user interaction afterward.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadChildren("", false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageId]);

  function toggleExpand(prefix: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(prefix)) {
        next.delete(prefix);
      } else {
        next.add(prefix);
        if (!cache.has(prefix)) loadChildren(prefix, false);
      }
      return next;
    });
  }

  function renderNodes(prefix: string, depth: number) {
    const node = cache.get(prefix);
    if (!node) return null;
    return (
      <ul className="flex flex-col">
        {node.entries.map((entry) => (
          <li key={entry.key}>
            <div className="flex items-center gap-1 rounded-md hover:bg-slate-50" style={{ paddingLeft: `${depth * 14}px` }}>
              <button
                type="button"
                onClick={() => toggleExpand(entry.key)}
                className="flex h-6 w-6 shrink-0 items-center justify-center text-slate-400 hover:text-slate-600"
                aria-label={expanded.has(entry.key) ? "Collapse" : "Expand"}
              >
                {expanded.has(entry.key) ? (
                  <ChevronDown className="h-3.5 w-3.5" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5" />
                )}
              </button>
              <button
                type="button"
                onClick={() => onSelectPrefix(entry.key)}
                className={`flex flex-1 items-center gap-1.5 truncate py-1 pr-2 text-left text-sm ${
                  currentPrefix === entry.key ? "font-medium text-sky-700" : "text-slate-700"
                }`}
                title={entry.key}
              >
                <Folder className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                <span className="truncate">{entry.name}</span>
              </button>
            </div>
            {expanded.has(entry.key) && (
              <>
                {loading.has(entry.key) && (
                  <p className="text-xs text-slate-400" style={{ paddingLeft: `${(depth + 1) * 14 + 24}px` }}>
                    Loading…
                  </p>
                )}
                {errors.has(entry.key) && (
                  <p className="text-xs text-red-600" style={{ paddingLeft: `${(depth + 1) * 14 + 24}px` }}>
                    {errors.get(entry.key)}
                  </p>
                )}
                {renderNodes(entry.key, depth + 1)}
                {cache.get(entry.key)?.nextToken && !loading.has(entry.key) && (
                  <button
                    type="button"
                    onClick={() => loadChildren(entry.key, true)}
                    className="text-xs text-sky-700 hover:underline"
                    style={{ paddingLeft: `${(depth + 1) * 14 + 24}px` }}
                  >
                    Load more…
                  </button>
                )}
              </>
            )}
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-2">
      <button
        type="button"
        onClick={() => onSelectPrefix("")}
        className={`flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-sm font-semibold ${
          currentPrefix === "" ? "bg-sky-50 text-sky-700" : "text-slate-900 hover:bg-slate-50"
        }`}
      >
        <Folder className="h-4 w-4 shrink-0 text-slate-500" />
        <span className="truncate">{bucket}</span>
      </button>
      {loading.has("") && !cache.has("") && <p className="px-2 py-1 text-xs text-slate-400">Loading…</p>}
      {errors.has("") && <p className="px-2 py-1 text-xs text-red-600">{errors.get("")}</p>}
      {renderNodes("", 1)}
      {cache.get("")?.nextToken && !loading.has("") && (
        <button
          type="button"
          onClick={() => loadChildren("", true)}
          className="px-2 py-1 text-xs text-sky-700 hover:underline"
        >
          Load more…
        </button>
      )}
    </div>
  );
}
