/**
 * What still stops a scan from being confirmed or turned into a card, and what the desk should
 * check but may accept. Pure: no I/O, no clock.
 *
 * Blockers are facts the contract requires. Warnings are useful signals only, and the desk decides.
 */

import { matchPlayers } from "../match";
import type { ScanRecord } from "./types";

/** A hole below this reader confidence is called doubtful. Named so callers can share the default. */
export const LOW_CONFIDENCE_THRESHOLD = 0.6;

/** A name score below this means the card name and the player name look strongly different. */
const NAME_DIFFERENCE_SCORE = 0.5;

export type ScanBlockerCode =
  | "no_player"
  | "no_marker"
  | "marker_is_player"
  | "no_image"
  | "set_aside"
  | "already_card";

export type ScanWarningCode =
  | "player_has_card"
  | "written_total_missing"
  | "low_confidence_holes"
  | "name_differs";

/** Something that must be fixed before confirming or creating a card. */
export interface ScanBlocker {
  code: ScanBlockerCode;
  message: string;
}

/** Something worth looking at that does not stop the desk. */
export interface ScanWarning {
  code: ScanWarningCode;
  message: string;
}

export interface ScanReadiness {
  canConfirm: boolean;
  canCreateCard: boolean;
  blockers: ScanBlocker[];
  warnings: ScanWarning[];
}

export interface ScanReadinessOptions {
  /** Players who already have a card in this round. */
  playersWithCards?: readonly string[];
  /** A hole below this is doubtful. Defaults to `LOW_CONFIDENCE_THRESHOLD`. */
  lowConfidenceThreshold?: number;
  /** The picked player's registered name, when the caller has it. */
  playerName?: string | null;
}

function isPlayerList(value: readonly string[] | ScanReadinessOptions): value is readonly string[] {
  return Array.isArray(value);
}

function resolvedThreshold(value: number | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? value : LOW_CONFIDENCE_THRESHOLD;
}

function warningsFor(
  scan: ScanRecord,
  options: ScanReadinessOptions,
  threshold: number,
): ScanWarning[] {
  const warnings: ScanWarning[] = [];
  const playerId = scan.playerId;

  if (playerId !== null && (options.playersWithCards ?? []).includes(playerId)) {
    warnings.push({
      code: "player_has_card",
      message: "This player already has a card in this round. Check it before making another.",
    });
  }

  if (scan.reading === null || scan.reading.writtenTotal === null) {
    warnings.push({
      code: "written_total_missing",
      message: "The total written on the card was not read. Compare it with the card yourself.",
    });
  }

  const doubtful = (scan.reading?.holes ?? []).filter(
    (hole) => hole.confidence !== null && hole.confidence < threshold,
  );
  if (doubtful.length > 0) {
    warnings.push({
      code: "low_confidence_holes",
      message: `${doubtful.length} ${
        doubtful.length === 1 ? "hole was" : "holes were"
      } read at low confidence. Check them against the paper card.`,
    });
  }

  const cardName = scan.reading?.name ?? "";
  const playerName = options.playerName ?? "";
  if (playerId !== null && cardName.trim() !== "" && playerName.trim() !== "") {
    const [best] = matchPlayers({ name: cardName }, [{ playerId, name: playerName }]);
    if (!best || best.score < NAME_DIFFERENCE_SCORE) {
      warnings.push({
        code: "name_differs",
        message: "The name read on the card looks quite different from the picked player.",
      });
    }
  }

  return warnings;
}

function blockersFor(scan: ScanRecord): ScanBlocker[] {
  if (scan.state === "set_aside") {
    return [{ code: "set_aside", message: "This scan was set aside. Restore it before using it." }];
  }
  if (scan.state === "card_created") {
    return [{ code: "already_card", message: "This scan is already a card." }];
  }

  const blockers: ScanBlocker[] = [];
  if (scan.playerId === null) {
    blockers.push({ code: "no_player", message: "Pick the player on the card." });
  }
  if (scan.markerId === null) {
    blockers.push({
      code: "no_marker",
      message: "Pick a marker from the other team in the group.",
    });
  } else if (scan.markerId === scan.playerId) {
    blockers.push({
      code: "marker_is_player",
      message: "The marker must be another player, not the player on the card.",
    });
  }
  if (scan.image === null) {
    blockers.push({ code: "no_image", message: "The photo for this scan is missing." });
  }
  return blockers;
}

/**
 * Reports what is ready. Confirming needs a matched scan; creating a card needs a confirmed one.
 * Both also need a player, a different marker and an image. The blockers explain anything missing.
 *
 * Call it as `scanReadiness(scan, options)` or
 * `scanReadiness(scan, playersWithCards, lowConfidenceThreshold, playerName)`.
 */
export function scanReadiness(
  scan: ScanRecord,
  context: readonly string[] | ScanReadinessOptions = [],
  lowConfidenceThreshold?: number,
  playerName?: string | null,
): ScanReadiness {
  const options: ScanReadinessOptions = isPlayerList(context)
    ? { playersWithCards: context, lowConfidenceThreshold, playerName }
    : context;
  const threshold = resolvedThreshold(options.lowConfidenceThreshold);
  const blockers = blockersFor(scan);
  const warnings = warningsFor(scan, options, threshold);
  const ready = blockers.length === 0;

  return {
    canConfirm: ready && scan.state === "matched",
    canCreateCard: ready && scan.state === "confirmed",
    blockers,
    warnings,
  };
}
