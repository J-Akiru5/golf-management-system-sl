import { Badge } from "@/components/ui/badge";

/**
 * The demo banner. It says plainly that nothing is saved, and who the demo is signed in as when
 * `?as=` chose someone other than the default owner.
 */
export function DemoBanner({ viewer }: { viewer?: string }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md border border-line-strong bg-surface-sunken px-4 py-3">
      <Badge tone="gold">Demo</Badge>
      <p className="text-sm text-ink">Demo data. Nothing is saved to a database.</p>
      {viewer ? <p className="text-sm text-ink-muted">Viewing as {viewer}.</p> : null}
    </div>
  );
}
