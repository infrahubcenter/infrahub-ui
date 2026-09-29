"use client";

import { useEffect, useState } from "react";
import { Bookmark, FolderClosed, FolderPlus, Save, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ApiError,
  createSavedViewFolder,
  deleteSavedView,
  deleteSavedViewFolder,
  listSavedViewFolders,
  listSavedViews,
  saveView,
  type SavedDashboardView,
  type SavedViewFeature,
  type SavedViewFolder,
} from "@/lib/api";

const NO_FOLDER = "__none__";

// Grafana-style "Folder > Dashboard" organizer for the Monitoring/Logs
// pages -- a dashboard (a named, reloadable filter snapshot, same concept
// as the older SavedViewsBar it replaces) can be created either inside a
// folder or standalone at the top level ("or before folder also give
// create metrics dashboard option"). Private per-user, same as before.
// The page that embeds this owns the shape of `filters` and passes the
// current one in via `currentFilters`; picking a dashboard calls `onLoad`.
export function DashboardFolderNav<TFilters extends Record<string, unknown>>({
  feature,
  currentFilters,
  onLoad,
}: {
  feature: SavedViewFeature;
  currentFilters: TFilters;
  onLoad: (filters: TFilters) => void;
}) {
  const [folders, setFolders] = useState<SavedViewFolder[]>([]);
  const [views, setViews] = useState<SavedDashboardView<TFilters>[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState("");
  const [selectedViewId, setSelectedViewId] = useState("");
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [newDashboardName, setNewDashboardName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function load() {
    listSavedViewFolders(feature)
      .then((res) => setFolders(res.folders))
      .catch(() => setFolders([]));
    listSavedViews<TFilters>(feature)
      .then((res) => setViews(res.views))
      .catch(() => setViews([]));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feature]);

  const dashboardsInScope = views.filter((v) => (v.folder_id ?? "") === selectedFolderId);
  const selectedFolder = folders.find((f) => f.id === selectedFolderId);

  async function handleCreateFolder() {
    const name = newFolderName.trim();
    if (!name) return;
    setBusy(true);
    setError(null);
    try {
      const folder = await createSavedViewFolder(feature, name);
      setNewFolderName("");
      setShowNewFolder(false);
      load();
      setSelectedFolderId(folder.id);
      setSelectedViewId("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create folder.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteFolder() {
    if (!selectedFolder) return;
    const count = views.filter((v) => v.folder_id === selectedFolder.id).length;
    if (count > 0) {
      const ok = window.confirm(`Delete folder "${selectedFolder.name}" and its ${count} dashboard${count === 1 ? "" : "s"}? This can't be undone.`);
      if (!ok) return;
    }
    await deleteSavedViewFolder(selectedFolder.id);
    setSelectedFolderId("");
    setSelectedViewId("");
    load();
  }

  async function handleSaveDashboard() {
    const name = newDashboardName.trim();
    if (!name) return;
    setBusy(true);
    setError(null);
    try {
      const view = await saveView(feature, name, currentFilters, selectedFolderId || undefined);
      setNewDashboardName("");
      load();
      setSelectedViewId(view.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create dashboard.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteDashboard() {
    if (!selectedViewId) return;
    await deleteSavedView(selectedViewId);
    setSelectedViewId("");
    load();
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-1.5">
        <FolderClosed className="h-4 w-4 text-slate-400" />
        <Select
          value={selectedFolderId || NO_FOLDER}
          onValueChange={(id) => {
            setSelectedFolderId(!id || id === NO_FOLDER ? "" : id);
            setSelectedViewId("");
          }}
        >
          <SelectTrigger className="h-8 w-[160px] text-xs">
            <SelectValue placeholder="No Folder" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NO_FOLDER}>No Folder</SelectItem>
            {folders.map((f) => (
              <SelectItem key={f.id} value={f.id}>
                {f.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {selectedFolderId && (
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => void handleDeleteFolder()} aria-label="Delete folder">
            <Trash2 className="h-3.5 w-3.5 text-red-600" />
          </Button>
        )}
        {showNewFolder ? (
          <>
            <Input
              autoFocus
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder="Folder name"
              className="h-8 w-[130px] text-xs"
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleCreateFolder();
                if (e.key === "Escape") setShowNewFolder(false);
              }}
            />
            <Button variant="outline" size="sm" className="h-8" disabled={busy || !newFolderName.trim()} onClick={handleCreateFolder}>
              Add
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setShowNewFolder(false)} aria-label="Cancel new folder">
              <X className="h-3.5 w-3.5" />
            </Button>
          </>
        ) : (
          <Button variant="ghost" size="sm" className="h-8 gap-1 text-xs" onClick={() => setShowNewFolder(true)}>
            <FolderPlus className="h-3.5 w-3.5" /> New Folder
          </Button>
        )}
      </div>

      <div className="flex items-center gap-1.5">
        <Bookmark className="h-4 w-4 text-slate-400" />
        <Select
          value={selectedViewId}
          onValueChange={(id) => {
            setSelectedViewId(id ?? "");
            const view = dashboardsInScope.find((v) => v.id === id);
            if (view) onLoad(view.filters);
          }}
        >
          <SelectTrigger className="h-8 w-[180px] text-xs">
            <SelectValue placeholder={dashboardsInScope.length === 0 ? "No dashboards" : "Load a dashboard"} />
          </SelectTrigger>
          <SelectContent>
            {dashboardsInScope.map((v) => (
              <SelectItem key={v.id} value={v.id}>
                {v.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {selectedViewId && (
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => void handleDeleteDashboard()} aria-label="Delete dashboard">
            <Trash2 className="h-3.5 w-3.5 text-red-600" />
          </Button>
        )}
      </div>

      <div className="flex items-center gap-1.5">
        <Input
          value={newDashboardName}
          onChange={(e) => setNewDashboardName(e.target.value)}
          placeholder={selectedFolder ? `New dashboard in "${selectedFolder.name}"` : "New dashboard name"}
          className="h-8 w-[190px] text-xs"
          onKeyDown={(e) => {
            if (e.key === "Enter") void handleSaveDashboard();
          }}
        />
        <Button variant="outline" size="sm" className="h-8 gap-1" disabled={busy || !newDashboardName.trim()} onClick={handleSaveDashboard}>
          <Save className="h-3.5 w-3.5" /> Create Dashboard
        </Button>
      </div>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}
