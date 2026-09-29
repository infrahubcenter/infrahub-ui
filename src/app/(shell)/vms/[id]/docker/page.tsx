"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Container, Search, Zap } from "lucide-react";
import { useAuth } from "@/components/auth/auth-provider";
import { DockerContainerStatusBadge, DockerDaemonStatusBadge, DockerHealthBadge } from "@/components/infrastructure/docker-status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatAgo, formatBytes } from "@/lib/format";
import {
  ApiError,
  getDockerOverview,
  getDockerSummary,
  getVM,
  listDockerContainers,
  listDockerImages,
  listDockerNetworks,
  listDockerVolumes,
  scanDocker,
  type DockerContainer,
  type DockerImage,
  type DockerNetwork,
  type DockerOverview,
  type DockerSummary,
  type DockerVolume,
  type VMDetail,
  isAdminRole,
} from "@/lib/api";

export default function VMDockerPage() {
  const params = useParams<{ id: string }>();
  const vmId = params.id;
  const { user } = useAuth();

  const [vm, setVm] = useState<VMDetail | null>(null);
  const [overview, setOverview] = useState<DockerOverview | null>(null);
  const [summary, setSummary] = useState<DockerSummary | null>(null);
  const [containers, setContainers] = useState<DockerContainer[] | null>(null);
  const [images, setImages] = useState<DockerImage[] | null>(null);
  const [networks, setNetworks] = useState<DockerNetwork[] | null>(null);
  const [volumes, setVolumes] = useState<DockerVolume[] | null>(null);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanMessage, setScanMessage] = useState<string | null>(null);

  const loadOverview = useCallback(() => {
    getDockerOverview(vmId).then(setOverview).catch(() => {});
  }, [vmId]);

  const loadSummary = useCallback(() => {
    getDockerSummary(vmId).then(setSummary).catch(() => {});
  }, [vmId]);

  const loadContainers = useCallback(() => {
    listDockerContainers(vmId, { search: search || undefined, page_size: 200 })
      .then((res) => setContainers(res.containers))
      .catch(() => setError("Failed to load containers."));
  }, [vmId, search]);

  const loadImages = useCallback(() => {
    listDockerImages(vmId)
      .then((res) => setImages(res.images))
      .catch(() => {});
  }, [vmId]);

  const loadNetworks = useCallback(() => {
    listDockerNetworks(vmId)
      .then((res) => setNetworks(res.networks))
      .catch(() => {});
  }, [vmId]);

  const loadVolumes = useCallback(() => {
    listDockerVolumes(vmId)
      .then((res) => setVolumes(res.volumes))
      .catch(() => {});
  }, [vmId]);

  useEffect(() => {
    getVM(vmId)
      .then(setVm)
      .catch((err) => setError(err instanceof ApiError && err.status === 404 ? "VM not found." : "Failed to load VM."));
  }, [vmId]);

  useEffect(() => {
    // Load-on-mount/search-change: no external store to subscribe to.

    loadOverview();
    loadSummary();
    loadContainers();
    loadImages();
    loadNetworks();
    loadVolumes();
  }, [loadOverview, loadSummary, loadContainers, loadImages, loadNetworks, loadVolumes]);

  async function handleScan() {
    setScanning(true);
    setScanMessage(null);
    try {
      const result = await scanDocker(vmId);
      setScanMessage(
        result.status === "SUCCESS"
          ? `Scan completed: ${result.container_count} containers, ${result.image_count} images, ${result.network_count} networks, ${result.volume_count} volumes.`
          : result.error_summary ?? `Scan ${result.status.toLowerCase()}.`
      );
      loadOverview();
      loadSummary();
      loadContainers();
      loadImages();
      loadNetworks();
      loadVolumes();
    } catch (err) {
      setScanMessage(err instanceof ApiError ? err.message : "Failed to trigger scan.");
    } finally {
      setScanning(false);
    }
  }

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!vm || !overview || !summary) return <p className="text-sm text-slate-500">Loading&hellip;</p>;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link href={`/vms/${vmId}`} className="flex w-fit items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
          <ArrowLeft className="h-4 w-4" /> Back to {vm.name}
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
              <Container className="h-5 w-5" /> Docker <DockerDaemonStatusBadge status={overview.daemon_status} />
            </h2>
            <p className="text-sm text-slate-500">
              {overview.engine_version ? `Engine ${overview.engine_version} · ` : ""}
              Last scan: {formatAgo(overview.last_scan?.completed_at ?? overview.last_scan?.started_at)}
            </p>
          </div>
          {isAdminRole(user?.role) && (
            <Button size="sm" onClick={handleScan} disabled={scanning}>
              <Zap className="h-4 w-4" /> {scanning ? "Scanning…" : "Scan Docker"}
            </Button>
          )}
        </div>
        {scanMessage && (
          <Alert>
            <AlertDescription>{scanMessage}</AlertDescription>
          </Alert>
        )}
        {overview.daemon_status !== "RUNNING" && overview.daemon_status !== "UNKNOWN" && (
          <Alert variant="destructive">
            <AlertDescription>
              Docker daemon is not currently reachable ({overview.daemon_status}). Inventory below reflects the last successful scan.
            </AlertDescription>
          </Alert>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <SummaryCard label="Containers" value={summary.containers_total} />
        <SummaryCard label="Running" value={summary.containers_running} />
        <SummaryCard label="Images" value={summary.images_total} />
        <SummaryCard label="Networks" value={summary.networks_total} />
      </div>

      <Tabs defaultValue="containers">
        <TabsList>
          <TabsTrigger value="containers">Containers</TabsTrigger>
          <TabsTrigger value="images">Images</TabsTrigger>
          <TabsTrigger value="networks">Networks</TabsTrigger>
          <TabsTrigger value="volumes">Volumes</TabsTrigger>
        </TabsList>

        <TabsContent value="containers" className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <div className="relative max-w-sm flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input placeholder="Search containers" className="pl-8" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
          </div>
          {containers !== null && containers.length === 0 ? (
            <EmptyState label={summary.containers_total ? "No containers match your search." : "No containers discovered yet."} />
          ) : (
            containers !== null && (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Image</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Health</TableHead>
                    <TableHead>Ports</TableHead>
                    <TableHead>Restarts</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {containers.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell>
                        <Link href={`/vms/${vmId}/docker/containers/${c.id}`} className="font-medium text-sky-700 hover:underline">
                          {c.name}
                        </Link>
                      </TableCell>
                      <TableCell className="text-slate-600">
                        {c.image}
                        {c.image_tag ? `:${c.image_tag}` : ""}
                      </TableCell>
                      <TableCell>
                        <DockerContainerStatusBadge status={c.status} />
                      </TableCell>
                      <TableCell>{c.health && <DockerHealthBadge health={c.health} />}</TableCell>
                      <TableCell className="text-slate-600">
                        {c.ports && c.ports.some((p) => p.host_port)
                          ? c.ports
                              .filter((p) => p.host_port)
                              .map((p) => `${p.host_port}→${p.container_port}/${p.protocol}`)
                              .join(", ")
                          : "—"}
                      </TableCell>
                      <TableCell className="text-slate-600">{c.restart_count ?? 0}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )
          )}
        </TabsContent>

        <TabsContent value="images" className="rounded-lg border border-slate-200 bg-white p-4">
          {images !== null && images.length === 0 ? (
            <EmptyState label="No images discovered yet." />
          ) : (
            images !== null && (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Repository</TableHead>
                    <TableHead>Tag</TableHead>
                    <TableHead>Image ID</TableHead>
                    <TableHead>Size</TableHead>
                    <TableHead>Created</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {images.map((img) => (
                    <TableRow key={img.id}>
                      <TableCell className="font-medium text-slate-900">{img.repository}</TableCell>
                      <TableCell className="text-slate-600">{img.tag}</TableCell>
                      <TableCell className="font-mono text-xs text-slate-500">{img.image_id.replace("sha256:", "").slice(0, 12)}</TableCell>
                      <TableCell className="text-slate-600">{formatBytes(img.size_bytes)}</TableCell>
                      <TableCell className="text-slate-600">{formatAgo(img.created_at_remote)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )
          )}
        </TabsContent>

        <TabsContent value="networks" className="rounded-lg border border-slate-200 bg-white p-4">
          {networks !== null && networks.length === 0 ? (
            <EmptyState label="No networks discovered yet." />
          ) : (
            networks !== null && (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Driver</TableHead>
                    <TableHead>Scope</TableHead>
                    <TableHead>Internal</TableHead>
                    <TableHead>Attachable</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {networks.map((n) => (
                    <TableRow key={n.id}>
                      <TableCell className="font-medium text-slate-900">{n.name}</TableCell>
                      <TableCell className="text-slate-600">{n.driver ?? "—"}</TableCell>
                      <TableCell className="text-slate-600">{n.scope ?? "—"}</TableCell>
                      <TableCell>{n.internal ? <Badge variant="secondary">Yes</Badge> : <Badge variant="outline">No</Badge>}</TableCell>
                      <TableCell>{n.attachable ? <Badge variant="secondary">Yes</Badge> : <Badge variant="outline">No</Badge>}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )
          )}
        </TabsContent>

        <TabsContent value="volumes" className="rounded-lg border border-slate-200 bg-white p-4">
          {volumes !== null && volumes.length === 0 ? (
            <EmptyState label="No volumes discovered yet." />
          ) : (
            volumes !== null && (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Driver</TableHead>
                    <TableHead>Mountpoint</TableHead>
                    <TableHead>Scope</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {volumes.map((v) => (
                    <TableRow key={v.id}>
                      <TableCell className="font-medium text-slate-900">{v.name}</TableCell>
                      <TableCell className="text-slate-600">{v.driver ?? "—"}</TableCell>
                      <TableCell className="font-mono text-xs text-slate-500">{v.mountpoint ?? "—"}</TableCell>
                      <TableCell className="text-slate-600">{v.scope ?? "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value?: number }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="text-sm text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-slate-900">{value ?? "—"}</div>
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="p-6 text-center">
      <Container className="mx-auto mb-3 h-8 w-8 text-slate-300" />
      <p className="text-sm font-medium text-slate-700">{label}</p>
    </div>
  );
}
