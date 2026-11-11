import type {
  PairingCandidate,
  PairingGroup,
  PairingMatchResult,
  PairingNameMatch,
  PairingSession,
} from "@/lib/import/pairing-sheet";
import type { DrawGroup } from "./validate";

/** A sheet name that cannot be placed, kept with where it was typed. */
export interface UnplacedPairingName {
  raw: string;
  status: "ambiguous" | "not_found";
  session: PairingSession;
  hole: number;
  /** The candidates that tied, so the review can say who needs a decision. */
  alternatives?: PairingCandidate[];
}

/** A fuzzy name the organizer may tick before it is placed. */
export interface PairingSheetSuggestion {
  key: string;
  raw: string;
  candidateName: string;
  registrationId: string;
  session: PairingSession;
  hole: number;
}

export interface ApplyPairingSheetInput {
  /** The groups the parser read from one worksheet. */
  sheetGroups: readonly PairingGroup[];
  /** What the roster said about every name on the sheet. */
  match: PairingMatchResult;
  /** Keys of the fuzzy matches the organizer ticked. */
  confirmed: ReadonlySet<string>;
  /** The groups on the board for the playing day being replaced. */
  currentGroups: readonly DrawGroup[];
  /** The flight of a registration, from the day's registrations. */
  flightOf: (registrationId: string) => string | null;
}

export interface ApplyPairingSheetReport {
  /** Names placed in a group. */
  placed: number;
  /** Exact matches placed. */
  matchedPlaced: number;
  /** Ticked fuzzy suggestions placed. */
  fuzzyPlaced: number;
  /** Fuzzy suggestions left unticked. */
  fuzzySkipped: number;
  ambiguous: number;
  notFound: number;
  groupsCreated: number;
  /** Groups that were on the board before the import. */
  groupsReplaced: number;
  /** Ambiguous and not found names, with their sheet hole and session. */
  unplaced: UnplacedPairingName[];
  suggestions: PairingSheetSuggestion[];
  summary: PairingMatchResult["summary"];
}

export interface ApplyPairingSheetResult {
  groups: DrawGroup[];
  report: ApplyPairingSheetReport;
}

/**
 * A stable key for one typed name. The match result and the review panel address the same name with
 * it, so a tick cannot land on a different row after the sheet is read again.
 */
export function pairingMatchKey(match: Pick<PairingNameMatch, "groupIndex" | "nameIndex">): string {
  return `${match.groupIndex}:${match.nameIndex}`;
}

/**
 * Turns the sheet's groups into the board's groups for one playing day.
 *
 * Only an exact match, or a fuzzy suggestion the organizer ticked, is placed. An ambiguous or not
 * found name is never guessed: it is reported with the hole and session it was typed under. A sheet
 * row with no placeable name makes no group. The function is pure and never touches another day.
 */
export function applyPairingSheet({
  sheetGroups,
  match,
  confirmed,
  currentGroups,
  flightOf,
}: ApplyPairingSheetInput): ApplyPairingSheetResult {
  const byKey = new Map<string, PairingNameMatch>();
  for (const entry of match.matches) byKey.set(pairingMatchKey(entry), entry);

  const groups: DrawGroup[] = [];
  const unplaced: UnplacedPairingName[] = [];
  const suggestions: PairingSheetSuggestion[] = [];
  let placed = 0;
  let matchedPlaced = 0;
  let fuzzyPlaced = 0;
  let fuzzySkipped = 0;

  for (let groupIndex = 0; groupIndex < sheetGroups.length; groupIndex += 1) {
    const sheetGroup = sheetGroups[groupIndex];
    if (!sheetGroup) continue;
    const playerIds: string[] = [];

    for (let nameIndex = 0; nameIndex < sheetGroup.names.length; nameIndex += 1) {
      const key = `${groupIndex}:${nameIndex}`;
      const entry = byKey.get(key);

      // The parser and the match result are built from the same groups. A missing entry is still
      // reported rather than silently dropped.
      if (!entry) {
        unplaced.push({
          raw: sheetGroup.names[nameIndex] ?? "",
          status: "not_found",
          session: sheetGroup.session,
          hole: sheetGroup.hole,
        });
        continue;
      }

      if (entry.status === "matched") {
        if (entry.registrationId) {
          playerIds.push(entry.registrationId);
          placed += 1;
          matchedPlaced += 1;
        } else {
          unplaced.push({
            raw: entry.raw,
            status: "not_found",
            session: sheetGroup.session,
            hole: sheetGroup.hole,
          });
        }
        continue;
      }

      if (entry.status === "fuzzy") {
        if (entry.registrationId && entry.candidateName) {
          suggestions.push({
            key,
            raw: entry.raw,
            candidateName: entry.candidateName,
            registrationId: entry.registrationId,
            session: sheetGroup.session,
            hole: sheetGroup.hole,
          });
        }
        if (confirmed.has(key) && entry.registrationId) {
          playerIds.push(entry.registrationId);
          placed += 1;
          fuzzyPlaced += 1;
        } else {
          fuzzySkipped += 1;
          // A ticked suggestion with no registration behind it still cannot be placed.
          if (confirmed.has(key)) {
            unplaced.push({
              raw: entry.raw,
              status: "not_found",
              session: sheetGroup.session,
              hole: sheetGroup.hole,
            });
          }
        }
        continue;
      }

      if (entry.status === "ambiguous") {
        unplaced.push({
          raw: entry.raw,
          status: "ambiguous",
          session: sheetGroup.session,
          hole: sheetGroup.hole,
          ...(entry.alternatives ? { alternatives: entry.alternatives } : {}),
        });
        continue;
      }

      unplaced.push({
        raw: entry.raw,
        status: "not_found",
        session: sheetGroup.session,
        hole: sheetGroup.hole,
      });
    }

    // A row with nobody placeable is not a group on the board.
    if (playerIds.length === 0) continue;

    // A group needs a flight id. The sheet never names a flight, so the first placed player's
    // flight stands for the group. A provisional player with no flight leaves it empty.
    const first = playerIds[0];
    const flightId = first ? (flightOf(first) ?? "") : "";

    groups.push({
      number: groups.length + 1,
      flightId,
      playerIds,
      startHole: sheetGroup.hole,
      wave: null,
      time: sheetGroup.teeTime,
      locked: false,
    });
  }

  return {
    groups,
    report: {
      placed,
      matchedPlaced,
      fuzzyPlaced,
      fuzzySkipped,
      ambiguous: match.summary.ambiguous,
      notFound: match.summary.not_found,
      groupsCreated: groups.length,
      groupsReplaced: currentGroups.length,
      unplaced,
      suggestions,
      summary: match.summary,
    },
  };
}
