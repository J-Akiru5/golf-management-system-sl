import type { CardContextPart } from "@/lib/scoring/card-context";
import { cn } from "@/lib/ui/cn";

const NUMERIC_KEYS: ReadonlySet<CardContextPart["key"]> = new Set([
  "day",
  "teamHandicap",
  "playingHandicap",
  "cardHandicap",
]);

export interface CardContextLineProps {
  parts: readonly CardContextPart[];
  className?: string;
}

/**
 * The facts beside a desk scorecard, as one wrapping line of "Label value" pairs. A missing value
 * always says so in words, so the line still reads correctly on paper and in either theme.
 */
export function CardContextLine({ parts, className }: CardContextLineProps) {
  if (parts.length === 0) return null;
  return (
    <p className={cn("hint m-0 flex flex-wrap items-baseline gap-x-3 gap-y-1", className)}>
      {parts.map((part) => (
        <span key={part.key} className="inline-flex items-baseline gap-1">
          <span className="text-ink-muted">{part.label}</span>
          <span
            className={cn(
              part.tone === "missing" ? "text-warning" : "text-ink",
              part.tone !== "missing" && NUMERIC_KEYS.has(part.key) && "mono",
            )}
          >
            {part.value}
          </span>
        </span>
      ))}
    </p>
  );
}
