// Extracted verbatim from vms/[id]/monitoring/page.tsx's local `ChartCard`
// helper (Step 19 decision #11) -- the identical title+h-56-wrapper markup
// was also duplicated inline (without a named component) in
// databases/[id]/page.tsx and object-storage/[id]/page.tsx's own History
// sections. Only the new /monitoring dashboard consumes this; the 3
// existing pages keep their own local copies untouched.
export function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <h3 className="mb-2 text-sm font-semibold text-slate-900">{title}</h3>
      <div className="h-56">{children}</div>
    </div>
  );
}
