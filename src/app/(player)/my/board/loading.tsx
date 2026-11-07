/**
 * The board while its published snapshot loads: the same shape as the real screen, so the heading
 * and the round row do not jump when the rows arrive. No spinner over a blank page.
 */
const PILL_WIDTHS = ["w-32", "w-28", "w-24"];

export default function BoardLoading() {
  return (
    <div className="grid gap-4" aria-busy="true" data-testid="board-skeleton">
      <div className="grid gap-4 animate-pulse motion-reduce:animate-none" aria-hidden="true">
        <div className="grid gap-1">
          <div className="h-8 w-40 rounded-md bg-surface-sunken" />
          <div className="h-3 w-64 max-w-full rounded bg-surface-sunken" />
        </div>

        <div className="flex gap-2 overflow-hidden py-1">
          {PILL_WIDTHS.map((width) => (
            <div key={width} className={`h-11 shrink-0 rounded-full bg-surface-sunken ${width}`} />
          ))}
        </div>

        <div className="grid gap-1.5">
          {[0, 1, 2, 3, 4, 5].map((row) => (
            <div
              key={row}
              className="flex h-16 items-center gap-2 rounded-[13px] border border-line bg-surface-raised px-2.5"
            >
              <div className="h-3 w-5 shrink-0 rounded bg-surface-sunken" />
              <div className="size-9 shrink-0 rounded-full bg-surface-sunken" />
              <div className="grid min-w-0 flex-1 gap-1.5">
                <div className="h-3 w-3/4 rounded bg-surface-sunken" />
                <div className="h-2.5 w-1/2 rounded bg-surface-sunken" />
              </div>
              <div className="grid shrink-0 gap-1">
                <div className="h-4 w-8 rounded bg-surface-sunken" />
                <div className="h-2 w-8 rounded bg-surface-sunken" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
