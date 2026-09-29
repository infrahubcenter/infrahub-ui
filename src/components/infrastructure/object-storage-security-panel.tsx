import type { ObjectStorageDetail } from "@/lib/api";

// Read-only display of the deep-metrics security snapshot (versioning/
// encryption/object-lock/public-access) -- no toggle controls, no edit
// affordance anywhere here, per the plan. Hard requirement: never assume
// secure/insecure without evidence -- every value independently renders as
// "Unknown" (neutral gray, never colored as good or bad) when the backend
// hasn't determined it, and the whole panel falls back to all-Unknown (with
// an honest caption) when `security` itself hasn't been collected yet,
// rather than hiding the panel or spinning forever.

const NEUTRAL = "bg-slate-100 text-slate-500 ring-slate-400/20";
const SAFE = "bg-emerald-50 text-emerald-700 ring-emerald-600/20";
const CAUTION = "bg-amber-50 text-amber-700 ring-amber-600/20";
const RISK = "bg-red-50 text-red-700 ring-red-600/20";

function Pill({ label, style }: { label: string; style: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${style}`}
    >
      {label}
    </span>
  );
}

// PUBLIC is a real risk (red "Allowed"), PRIVATE is the safe state (green
// "Blocked"), UNKNOWN is always neutral gray -- never colored either way.
function PublicAccessPill({ value }: { value?: "PUBLIC" | "PRIVATE" | "UNKNOWN" }) {
  if (value === "PUBLIC") return <Pill label="Allowed" style={RISK} />;
  if (value === "PRIVATE") return <Pill label="Blocked" style={SAFE} />;
  return <Pill label="Unknown" style={NEUTRAL} />;
}

// ENABLED is always the safe state (green). DISABLED severity differs by
// field: encryption off is a real risk (red); versioning/object-lock off is
// merely a caution (amber) -- plenty of buckets legitimately run without
// them. UNKNOWN is always neutral gray.
function EnabledPill({ value, disabledStyle }: { value?: "ENABLED" | "DISABLED" | "UNKNOWN"; disabledStyle: string }) {
  if (value === "ENABLED") return <Pill label="Enabled" style={SAFE} />;
  if (value === "DISABLED") return <Pill label="Disabled" style={disabledStyle} />;
  return <Pill label="Unknown" style={NEUTRAL} />;
}

export function ObjectStorageSecurityPanel({ security }: { security?: ObjectStorageDetail["security"] }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <h3 className="mb-3 text-sm font-semibold text-slate-900">Security Posture</h3>
      <dl className="grid grid-cols-2 gap-y-3 text-sm">
        <dt className="text-slate-500">Public Access</dt>
        <dd>
          <PublicAccessPill value={security?.public_access} />
        </dd>
        <dt className="text-slate-500">Encryption</dt>
        <dd>
          <EnabledPill value={security?.encryption} disabledStyle={RISK} />
        </dd>
        <dt className="text-slate-500">Versioning</dt>
        <dd>
          <EnabledPill value={security?.versioning} disabledStyle={CAUTION} />
        </dd>
        <dt className="text-slate-500">Object Lock</dt>
        <dd>
          <EnabledPill value={security?.object_lock} disabledStyle={CAUTION} />
        </dd>
      </dl>
      {!security && <p className="mt-3 text-xs text-slate-500">Security posture not yet assessed.</p>}
    </div>
  );
}
