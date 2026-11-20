"use client";

export type LiveState = "off" | "connecting" | "live" | "reconnecting";

const COPY: Record<Exclude<LiveState, "off">, { label: string; dot: string }> = {
  connecting: { label: "Connecting", dot: "bg-ink-muted" },
  live: { label: "Live", dot: "bg-success" },
  reconnecting: { label: "Reconnecting", dot: "bg-warning" },
};

/** A quiet word about the change feed. It says nothing at all when there is no feed. */
export function LiveIndicator({ state }: { state: LiveState }) {
  if (state === "off") return null;
  const { label, dot } = COPY[state];

  return (
    <span
      role="status"
      className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-muted"
    >
      <span aria-hidden="true" className={`size-1.5 rounded-full ${dot}`} />
      {label}
    </span>
  );
}
