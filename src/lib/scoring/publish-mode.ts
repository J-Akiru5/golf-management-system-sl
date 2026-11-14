/**
 * When a card saved on the desk reaches the public board.
 *
 * The choice is the desk's, per event and day, and it is remembered in the browser only. The round
 * still decides whether it can publish at all: a final round, or one with provisional publication
 * off, refuses every automatic publish and the button is the only way.
 *
 * Pure: no storage, no clock, no network. The screen reads and writes the stored value itself.
 */

export type PublishMode = "every" | "checked" | "manual";

export interface PublishModeOption {
  value: PublishMode;
  label: string;
  hint: string;
}

/** The three modes, in the order the desk sees them. */
export const PUBLISH_MODES: readonly PublishModeOption[] = [
  {
    value: "every",
    label: "Publish every saved card",
    hint: "A card reaches the public board about two seconds after it is saved, whether or not it has been checked. A run of saves is one publication.",
  },
  {
    value: "checked",
    label: "Publish checked cards only",
    hint: "A card reaches the public board about two seconds after it is checked and approved. A saved card waits.",
  },
  {
    value: "manual",
    label: "Manual",
    hint: "Nothing publishes by itself. Use Publish provisional when the desk is ready.",
  },
];

export const DEFAULT_PUBLISH_MODE: PublishMode = "every";

/**
 * Reads the stored choice. A browser that stored the old on/off checkbox keeps its meaning: "1" was
 * checked cards only, "0" was manual. Anything unrecognised falls back to the default, so a
 * corrupted or missing value publishes rather than silently going quiet.
 */
export function publishModeFromStored(value: string | null | undefined): PublishMode {
  if (value === "every" || value === "checked" || value === "manual") return value;
  if (value === "1") return "checked";
  if (value === "0") return "manual";
  return DEFAULT_PUBLISH_MODE;
}

export interface PublishDecisionInput {
  mode: PublishMode;
  /** True when the card that was just saved has been checked and approved. */
  checked: boolean;
  /** The round's own setting. A round that does not allow provisional publication publishes nothing. */
  provisionalPublication: boolean;
  roundStatus: "draft" | "open" | "scoring" | "provisional" | "final";
}

export type PublishRefusal =
  | "manual"
  | "awaiting_check"
  | "round_final"
  | "round_not_publishable"
  | "round_not_open";

export type PublishDecision = { publish: true } | { publish: false; reason: PublishRefusal };

/**
 * Whether a save should schedule a publication.
 *
 * The round's own limits come first, so the screen never queues a publish the database will refuse.
 * Then the desk's mode decides: every save, only a checked card, or nothing.
 */
export function publishDecision(input: PublishDecisionInput): PublishDecision {
  if (input.roundStatus === "final") return { publish: false, reason: "round_final" };
  if (input.roundStatus === "draft") return { publish: false, reason: "round_not_open" };
  if (!input.provisionalPublication) {
    return { publish: false, reason: "round_not_publishable" };
  }
  if (input.mode === "manual") return { publish: false, reason: "manual" };
  if (input.mode === "checked" && !input.checked) {
    return { publish: false, reason: "awaiting_check" };
  }
  return { publish: true };
}

/**
 * The last publication in a stable shape: "2026-11-15 07:42 UTC". Null when there is none or the
 * stored time cannot be read. Formatted from the stored ISO string rather than the browser clock,
 * so the server and the browser render the same line.
 */
export function formatPublishTime(publishedAt: string | null | undefined): string | null {
  if (!publishedAt) return null;
  const date = new Date(publishedAt);
  if (Number.isNaN(date.getTime())) return null;
  return `${date.toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

/** The label the desk sees for a mode. */
export function publishModeLabel(mode: PublishMode): string {
  return PUBLISH_MODES.find((option) => option.value === mode)?.label ?? mode;
}
