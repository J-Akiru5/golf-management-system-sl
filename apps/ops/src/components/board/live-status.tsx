import { Badge } from "@/components/ui/badge";

export type LiveState = "live" | "reconnecting" | "demo";

/**
 * The board's connection state. "Reconnecting" is not an error page: the board keeps showing what
 * it has and starts listening again when the channel comes back.
 */
export function LiveStatus({ state }: { state: LiveState }) {
  if (state === "demo") {
    return (
      <span role="status">
        <Badge tone="neutral">Demo data</Badge>
      </span>
    );
  }

  return (
    <span role="status" aria-live="polite">
      {state === "live" ? (
        <Badge tone="success">
          <span aria-hidden="true" className="size-1.5 rounded-full bg-success" />
          Live
        </Badge>
      ) : (
        <Badge tone="warning">
          <span aria-hidden="true" className="size-1.5 rounded-full bg-warning" />
          Reconnecting
        </Badge>
      )}
    </span>
  );
}
