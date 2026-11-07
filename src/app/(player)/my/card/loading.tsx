/**
 * The scorecard while the published cards load: a heading, the swipe line and one table-shaped
 * block, so the page keeps its height instead of flashing a spinner.
 */
const ROWS = [0, 1, 2, 3, 4, 5, 6, 7, 8];

export default function CardLoading() {
  return (
    <div className="grid gap-5" aria-busy="true" data-testid="card-skeleton">
      <div className="grid gap-5 animate-pulse motion-reduce:animate-none" aria-hidden="true">
        <div className="grid gap-1">
          <div className="h-8 w-36 rounded-md bg-surface-sunken" />
          <div className="h-3 w-56 max-w-full rounded bg-surface-sunken" />
        </div>

        <div className="h-3 w-64 max-w-full rounded bg-surface-sunken" />

        <div className="grid gap-3">
          <div className="h-6 w-44 max-w-full rounded bg-surface-sunken" />
          <div className="overflow-hidden rounded-[14px] border border-line bg-surface-raised">
            <div className="h-10 bg-surface-sunken" />
            {ROWS.map((row) => (
              <div key={row} className="flex items-center gap-3 border-t border-line px-3 py-2.5">
                <div className="h-3 w-4 shrink-0 rounded bg-surface-sunken" />
                <div className="h-3 flex-1 rounded bg-surface-sunken" />
                <div className="h-3 w-8 shrink-0 rounded bg-surface-sunken" />
                <div className="h-3 w-8 shrink-0 rounded bg-surface-sunken" />
                <div className="h-3 w-8 shrink-0 rounded bg-surface-sunken" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
