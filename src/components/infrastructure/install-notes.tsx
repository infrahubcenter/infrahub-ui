import { ShieldAlert } from "lucide-react";

// "Permissions & troubleshooting" list shown under every agent install
// command (VM agent, Docker host, Kubernetes) -- the usual reasons a
// pasted command fails on someone's laptop: missing sudo/docker group,
// Docker Desktop not running, wrong shell, missing cluster-admin.
export function InstallNotes({ notes }: { notes: string[] }) {
  if (notes.length === 0) return null;
  return (
    <div className="mt-2 rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
      <div className="mb-1 flex items-center gap-1 font-medium">
        <ShieldAlert className="h-3.5 w-3.5" /> Permissions &amp; troubleshooting
      </div>
      <ul className="ml-4 list-disc space-y-0.5">
        {notes.map((n) => (
          <li key={n}>{n}</li>
        ))}
      </ul>
    </div>
  );
}
