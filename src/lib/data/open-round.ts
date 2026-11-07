import type { FinalizationAuthority } from "@/lib/scoring";

/**
 * Opening a scoring round from the published draw.
 *
 * The database function `open_round` and the in-memory demo must agree, so the decision rules and
 * the sentences the desk reads live here once. This module is pure: no I/O, no clock, no database.
 */

export type OpenRoundSettingKey =
  | "requiredCards"
  | "finalizationAuthority"
  | "tieBreakPolicyId"
  | "rulesVersion";

export const OPEN_ROUND_SETTING_LABELS: Record<OpenRoundSettingKey, string> = {
  requiredCards: "required cards",
  finalizationAuthority: "finalization authority",
  tieBreakPolicyId: "tie-break policy",
  rulesVersion: "rules version",
};

/** The prefix each database refusal starts with. The client maps them to plain sentences. */
export const OPEN_ROUND_CODES = {
  alreadyOpen: "open_round_already_open",
  notPublished: "open_round_not_published",
  missingPlayerIds: "open_round_missing_player_ids",
  drawMoved: "open_round_draw_moved",
  staleRevision: "open_round_stale_revision",
  missingSettings: "open_round_missing_settings",
  tieBreakUnconfirmed: "open_round_tie_break_unconfirmed",
  noPlayingDay: "open_round_no_playing_day",
} as const;

export const OPEN_ROUND_MESSAGES = {
  alreadyOpen: "This round is already open, so cards can be added.",
  notPublished: "The pairings are not published. Publish the draw before opening a round.",
  missingPlayerIds:
    "The published list has no player ids. Publish the pairings again so the desk can name the players.",
  drawMoved:
    "The draw changed after it was published. Publish the pairings again, then open the round.",
  staleRevision:
    "The draw changed since this screen loaded. Reload and check the pairings before opening the round.",
  tieBreakUnconfirmed:
    "The chosen tie-break policy is not confirmed yet. Confirm the organizer's written rule first.",
  noPlayingDay: "This event has no playing day to open. Set up the event days first.",
  missingSettingsPrefix: "Set these round settings before opening: ",
} as const;

export interface OpenRoundSettings {
  /** Independent approved cards per player. Null means the organizer has not named a count. */
  requiredCards: number | null;
  finalizationAuthority: FinalizationAuthority | null;
  tieBreakPolicyId: string | null;
  rulesVersion: string | null;
}

/** The settings as a caller supplies them; a missing field means null, not a guessed value. */
export interface OpenRoundSettingsInput {
  requiredCards?: number | null;
  finalizationAuthority?: FinalizationAuthority | null;
  tieBreakPolicyId?: string | null;
  rulesVersion?: string | null;
}

export function normalizeOpenRoundSettings(input: OpenRoundSettingsInput): OpenRoundSettings {
  return {
    requiredCards: input.requiredCards ?? null,
    finalizationAuthority: input.finalizationAuthority ?? null,
    tieBreakPolicyId: input.tieBreakPolicyId ?? null,
    rulesVersion: input.rulesVersion ?? null,
  };
}

export interface OpenRoundDrawGroup {
  number: number;
  playerIds: readonly string[];
}

export interface OpenRoundDraw {
  /** The draw revision the screen read from the event. */
  revision: number;
  published: boolean;
  /**
   * The groups in the published snapshot, with their player ids. Null when the published list is
   * missing or carries names only (a publish from before player ids were stored).
   */
  publishedGroups: readonly OpenRoundDrawGroup[] | null;
  /** The live board of the playing day being opened. Used only to check the publish is current. */
  liveGroups: readonly OpenRoundDrawGroup[];
}

export interface TieBreakPolicyOption {
  id: string;
  name: string;
  /** A policy with no confirmation cannot be used, because finalization checks it. */
  confirmed: boolean;
}

export interface OpenRoundSnapshot {
  draw: OpenRoundDraw;
  /** Null when no playing day has been created yet. */
  roundStatus: "draft" | "open" | "scoring" | "provisional" | "final" | null;
  /** The settings already stored on the round, used as the form's starting values. */
  storedSettings: OpenRoundSettings;
  tieBreakPolicies: readonly TieBreakPolicyOption[];
}

export type OpenRoundReadiness =
  | { state: "already_open"; message: string }
  | { state: "not_published"; message: string }
  | { state: "missing_player_ids"; message: string }
  | { state: "draw_moved"; message: string }
  | { state: "tie_break_unconfirmed"; message: string }
  | { state: "missing_settings"; message: string; missing: OpenRoundSettingKey[] }
  | { state: "ready"; message: string };

export function missingSettingsMessage(missing: readonly OpenRoundSettingKey[]): string {
  const labels = missing.map((key) => OPEN_ROUND_SETTING_LABELS[key]).join(", ");
  return `${OPEN_ROUND_MESSAGES.missingSettingsPrefix}${labels}.`;
}

/**
 * The same string the database builds: groups ordered by number, empty groups left out, each group
 * written as `number:playerId,playerId` and the groups joined with `|`.
 *
 * A publish stores one group entry per non-empty group in draw order. Sorting here removes any
 * doubt about the order of that array.
 */
export function drawSignature(groups: readonly OpenRoundDrawGroup[]): string {
  return [...groups]
    .filter((group) => group.playerIds.length > 0)
    .sort((a, b) => a.number - b.number)
    .map((group) => `${group.number}:${group.playerIds.join(",")}`)
    .join("|");
}

/**
 * Decides whether the desk may open the round, and says why not when it may not.
 *
 * `expectedRevision` is the draw revision the caller is acting on. It must match the revision in
 * the snapshot; a lower one means the screen is stale. The published signature must also match the
 * live board, which is what catches a draw that moved after the publish.
 */
export function assessOpenRound(
  snapshot: OpenRoundSnapshot,
  proposed: OpenRoundSettingsInput,
  expectedRevision: number,
): OpenRoundReadiness {
  const settings = normalizeOpenRoundSettings(proposed);

  if (snapshot.roundStatus !== null && snapshot.roundStatus !== "draft") {
    return { state: "already_open", message: OPEN_ROUND_MESSAGES.alreadyOpen };
  }

  if (!snapshot.draw.published) {
    return { state: "not_published", message: OPEN_ROUND_MESSAGES.notPublished };
  }

  if (snapshot.draw.publishedGroups === null || snapshot.draw.publishedGroups.length === 0) {
    return { state: "missing_player_ids", message: OPEN_ROUND_MESSAGES.missingPlayerIds };
  }

  if (expectedRevision !== snapshot.draw.revision) {
    return { state: "draw_moved", message: OPEN_ROUND_MESSAGES.staleRevision };
  }

  if (drawSignature(snapshot.draw.publishedGroups) !== drawSignature(snapshot.draw.liveGroups)) {
    return { state: "draw_moved", message: OPEN_ROUND_MESSAGES.drawMoved };
  }

  const missing: OpenRoundSettingKey[] = [];
  if (
    settings.requiredCards === null ||
    !Number.isInteger(settings.requiredCards) ||
    settings.requiredCards <= 0
  ) {
    missing.push("requiredCards");
  }
  if (settings.finalizationAuthority === null) missing.push("finalizationAuthority");
  const policy = settings.tieBreakPolicyId
    ? snapshot.tieBreakPolicies.find((candidate) => candidate.id === settings.tieBreakPolicyId)
    : undefined;
  if (!policy) missing.push("tieBreakPolicyId");
  if (settings.rulesVersion === null || settings.rulesVersion.trim() === "") {
    missing.push("rulesVersion");
  }

  if (missing.length > 0) {
    return {
      state: "missing_settings",
      message: missingSettingsMessage(missing),
      missing,
    };
  }

  if (policy && !policy.confirmed) {
    return { state: "tie_break_unconfirmed", message: OPEN_ROUND_MESSAGES.tieBreakUnconfirmed };
  }

  return { state: "ready", message: "Ready to open the round from the published draw." };
}

/**
 * Turns a database refusal into the sentence the desk reads. The database prefixes each refusal
 * with a code, so the same wording is used on both paths.
 */
export function openRoundErrorMessage(message: string): string {
  if (message.includes(OPEN_ROUND_CODES.staleRevision)) {
    return OPEN_ROUND_MESSAGES.staleRevision;
  }
  if (message.includes(OPEN_ROUND_CODES.drawMoved)) return OPEN_ROUND_MESSAGES.drawMoved;
  if (message.includes(OPEN_ROUND_CODES.notPublished)) return OPEN_ROUND_MESSAGES.notPublished;
  if (message.includes(OPEN_ROUND_CODES.missingPlayerIds)) {
    return OPEN_ROUND_MESSAGES.missingPlayerIds;
  }
  if (message.includes(OPEN_ROUND_CODES.tieBreakUnconfirmed)) {
    return OPEN_ROUND_MESSAGES.tieBreakUnconfirmed;
  }
  if (message.includes(OPEN_ROUND_CODES.noPlayingDay)) return OPEN_ROUND_MESSAGES.noPlayingDay;
  if (message.includes(OPEN_ROUND_CODES.alreadyOpen)) return OPEN_ROUND_MESSAGES.alreadyOpen;
  if (message.includes(OPEN_ROUND_CODES.missingSettings)) {
    const named = message.split(":").slice(1).join(":").trim();
    return named ? `${OPEN_ROUND_MESSAGES.missingSettingsPrefix}${named}.` : message;
  }
  return message;
}
