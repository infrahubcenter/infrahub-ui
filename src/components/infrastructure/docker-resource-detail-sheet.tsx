"use client";

import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { formatBytes, formatAgo } from "@/lib/format";
import type { DockerHostImage, DockerHostVolume, DockerHostNetwork, DockerHostBuildCacheEntry } from "@/lib/api";

// Backs the Docker Monitor dashboard's Images/Volumes/Networks/Build
// Cache stat cards -- each click opens the actual inventory behind the
// count/total-size number, sourced live from the connected Docker agent
// (docker-agent's new "host_resources" command, mirroring `docker system
// df`). Works for both a Docker Host and a VM's own Docker section.
export type DockerResourceKind = "images" | "volumes" | "networks" | "build_cache";

export function DockerResourceDetailSheet({
  kind,
  images,
  volumes,
  networks,
  buildCache,
  onClose,
}: {
  kind: DockerResourceKind | null;
  images: DockerHostImage[];
  volumes: DockerHostVolume[];
  networks: DockerHostNetwork[];
  buildCache: DockerHostBuildCacheEntry[];
  onClose: () => void;
}) {
  const title = kind ? KIND_LABELS[kind] : "";

  return (
    <Sheet open={kind !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription>Every {kind ? KIND_NOUN[kind] : ""} reported by this host&rsquo;s connected agent, live.</SheetDescription>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto px-4 pb-4">
          {kind === "images" && <ImageList items={images} />}
          {kind === "volumes" && <VolumeList items={volumes} />}
          {kind === "networks" && <NetworkList items={networks} />}
          {kind === "build_cache" && <BuildCacheList items={buildCache} />}
        </div>
      </SheetContent>
    </Sheet>
  );
}

const KIND_LABELS: Record<DockerResourceKind, string> = {
  images: "Images",
  volumes: "Volumes",
  networks: "Networks",
  build_cache: "Build Cache",
};

const KIND_NOUN: Record<DockerResourceKind, string> = {
  images: "image",
  volumes: "volume",
  networks: "network",
  build_cache: "build cache entry",
};

function EmptyRow() {
  return <p className="py-6 text-center text-sm text-slate-500">Nothing reported for this host.</p>;
}

function ImageList({ items }: { items: DockerHostImage[] }) {
  if (items.length === 0) return <EmptyRow />;
  return (
    <ul className="divide-y divide-slate-100">
      {items.map((img) => (
        <li key={img.id} className="py-2.5">
          <div className="flex items-center justify-between">
            <p className="truncate pr-2 text-sm font-medium text-slate-900">{img.repo_tags && img.repo_tags.length > 0 ? img.repo_tags.join(", ") : "<none>"}</p>
            <span className="shrink-0 text-xs text-slate-500">{formatBytes(img.size_bytes)}</span>
          </div>
          <p className="text-xs text-slate-500">
            {img.id.replace(/^sha256:/, "").slice(0, 12)}
            {img.containers > 0 ? ` · used by ${img.containers} container${img.containers === 1 ? "" : "s"}` : " · unused"}
            {img.created_at ? ` · ${formatAgo(img.created_at)}` : ""}
          </p>
        </li>
      ))}
    </ul>
  );
}

function VolumeList({ items }: { items: DockerHostVolume[] }) {
  if (items.length === 0) return <EmptyRow />;
  return (
    <ul className="divide-y divide-slate-100">
      {items.map((vol) => (
        <li key={vol.name} className="py-2.5">
          <div className="flex items-center justify-between">
            <p className="truncate pr-2 text-sm font-medium text-slate-900">{vol.name}</p>
            <span className="shrink-0 text-xs text-slate-500">{vol.size_bytes !== undefined ? formatBytes(vol.size_bytes) : "—"}</span>
          </div>
          <p className="text-xs text-slate-500">
            {vol.driver}
            {vol.mountpoint ? ` · ${vol.mountpoint}` : ""}
          </p>
        </li>
      ))}
    </ul>
  );
}

function NetworkList({ items }: { items: DockerHostNetwork[] }) {
  if (items.length === 0) return <EmptyRow />;
  return (
    <ul className="divide-y divide-slate-100">
      {items.map((n) => (
        <li key={n.id} className="flex items-center justify-between py-2.5">
          <div>
            <p className="text-sm font-medium text-slate-900">{n.name}</p>
            <p className="text-xs text-slate-500">
              {n.driver} · {n.scope}
            </p>
          </div>
          <Badge className="bg-slate-100 text-slate-600 ring-1 ring-inset ring-slate-200">
            {n.containers} container{n.containers === 1 ? "" : "s"}
          </Badge>
        </li>
      ))}
    </ul>
  );
}

function BuildCacheList({ items }: { items: DockerHostBuildCacheEntry[] }) {
  if (items.length === 0) return <EmptyRow />;
  return (
    <ul className="divide-y divide-slate-100">
      {items.map((bc) => (
        <li key={bc.id} className="py-2.5">
          <div className="flex items-center justify-between">
            <p className="truncate pr-2 text-sm font-medium text-slate-900">{bc.description || bc.type}</p>
            <span className="shrink-0 text-xs text-slate-500">{formatBytes(bc.size_bytes)}</span>
          </div>
          <p className="text-xs text-slate-500">
            {bc.type}
            {bc.in_use ? " · in use" : " · unused"}
            {bc.shared ? " · shared" : ""}
            {bc.last_used_at ? ` · last used ${formatAgo(bc.last_used_at)}` : ""}
          </p>
        </li>
      ))}
    </ul>
  );
}
