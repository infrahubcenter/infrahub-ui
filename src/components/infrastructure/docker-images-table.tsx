"use client";

import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatBytes, formatAgo } from "@/lib/format";
import { listDockerContainers, listDockerImages, type DockerImage } from "@/lib/api";

// Docker Images table (Monitoring>Docker dashboard's Images tab) --
// Image/Tag/Image ID/Size/Created/Containers/Actions. Read-only: no
// pull/update/delete action exists anywhere in this table, matching the
// spec's "Images shown read-only" requirement. Admin-only -- sourced
// from the VM-scoped listDockerImages/listDockerContainers endpoints
// (gated by vm.view, a different authorization axis than the
// docker.monitor grant a Dashboard's other tabs rely on), unlike
// DockerContainersTable's cross-VM, docker.monitor-gated data source.
export function DockerImagesTable({ vmId }: { vmId: string }) {
  const [images, setImages] = useState<DockerImage[] | null>(null);
  const [containerCounts, setContainerCounts] = useState<Map<string, number>>(new Map());
  const [error, setError] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    let cancelled = false;
    Promise.all([listDockerImages(vmId), listDockerContainers(vmId, { page_size: 200 })])
      .then(([imagesRes, containersRes]) => {
        if (cancelled) return;
        setImages(imagesRes.images);
        const counts = new Map<string, number>();
        for (const c of containersRes.containers) {
          const key = `${c.image}:${c.image_tag ?? ""}`;
          counts.set(key, (counts.get(key) ?? 0) + 1);
        }
        setContainerCounts(counts);
      })
      .catch(() => !cancelled && setError(true));
    return () => {
      cancelled = true;
    };
  }, [vmId]);

  const filtered = useMemo(() => {
    if (!images) return [];
    const q = search.trim().toLowerCase();
    if (!q) return images;
    return images.filter((img) => img.repository.toLowerCase().includes(q) || img.tag.toLowerCase().includes(q));
  }, [images, search]);

  if (error) return <p className="text-sm text-red-600">Failed to load images.</p>;
  if (!images) return <p className="text-sm text-slate-500">Loading images&hellip;</p>;

  return (
    <div className="flex flex-col gap-3">
      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input placeholder="Search images..." className="pl-8" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Image</TableHead>
              <TableHead>Tag</TableHead>
              <TableHead>Image ID</TableHead>
              <TableHead>Size</TableHead>
              <TableHead>Created</TableHead>
              <TableHead>Containers</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-sm text-slate-500">
                  No images match.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((img) => (
                <TableRow key={img.id}>
                  <TableCell className="font-medium text-slate-900">{img.repository}</TableCell>
                  <TableCell className="text-slate-600">{img.tag}</TableCell>
                  <TableCell className="font-mono text-xs text-slate-500">{img.image_id.replace(/^sha256:/, "").slice(0, 12)}</TableCell>
                  <TableCell>{formatBytes(img.size_bytes)}</TableCell>
                  <TableCell className="text-slate-500">{img.created_at_remote ? formatAgo(img.created_at_remote) : "—"}</TableCell>
                  <TableCell>{containerCounts.get(`${img.repository}:${img.tag}`) ?? 0}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
