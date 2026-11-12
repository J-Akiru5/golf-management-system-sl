import type { CardEntry, CardStatus } from "../types";
import type {
  ScorecardImportCard,
  ScorecardImportFile,
  ScorecardImportProblem,
  ScorecardImportSkipped,
} from "./types";

export interface ScorecardImportRosterPlayer {
  playerId: string;
  playerName: string;
}

export interface ScorecardImportDrawGroup {
  number: number;
  playerIds: readonly string[];
}

export interface ScorecardImportExistingCard {
  playerId: string;
  scorerId: string;
  status: CardStatus;
  entries: readonly { hole: number; strokes: number | null }[];
  writtenTotal: number | null;
}

export interface ResolvedScorecardImportCard {
  card: ScorecardImportCard;
  playerId: string;
  playerName: string;
  markerPlayerId: string;
  markerName: string;
  groupNumber: number | null;
}

export interface BlockedScorecardImportCard {
  card: ScorecardImportCard;
  reasons: ScorecardImportProblem[];
}

export interface ScorecardImportPlan {
  /** Cards that passed every check and can be submitted. */
  ready: ResolvedScorecardImportCard[];
  /** The same card is already in for this player and marker. Safe to leave alone. */
  alreadyIn: ResolvedScorecardImportCard[];
  /** A card exists for this player and marker but its scores differ. */
  blocked: BlockedScorecardImportCard[];
  /** Cards the transcriber could not read. The desk enters them by hand. */
  skipped: ScorecardImportSkipped[];
  /** File-level problems. Any of these means nothing in the file may be written. */
  problems: ScorecardImportProblem[];
}

export interface ResolveScorecardImportInput {
  file: ScorecardImportFile;
  roundId: string;
  tournamentId: string;
  players: readonly ScorecardImportRosterPlayer[];
  groups: readonly ScorecardImportDrawGroup[] | null;
  cards: readonly ScorecardImportExistingCard[];
}

const ACTIVE_CARD_STATUSES = new Set<CardStatus>(["submitted", "in_review", "approved"]);

/** Case, commas and extra spaces are ignored. `ADORIO, RONNEL` and `ADORIO RONNEL` match. */
export function normalizeImportName(name: string): string {
  return name.trim().toUpperCase().replace(/[.,]/g, " ").replace(/\s+/g, " ").trim();
}

function resolvePerson(
  input: { id: string | null; name: string | null },
  players: readonly ScorecardImportRosterPlayer[],
  byId: ReadonlyMap<string, ScorecardImportRosterPlayer>,
  byName: ReadonlyMap<string, ScorecardImportRosterPlayer[]>,
  path: string,
  label: string,
): { player: ScorecardImportRosterPlayer | null; problems: ScorecardImportProblem[] } {
  const problems: ScorecardImportProblem[] = [];
  const fromId = input.id === null ? null : (byId.get(input.id) ?? null);
  if (input.id !== null && fromId === null) {
    problems.push({ path: `${path}.id`, message: `The ${label} id is not in the open round.` });
  }

  const matches = input.name === null ? [] : (byName.get(normalizeImportName(input.name)) ?? []);
  if (input.name !== null && matches.length === 0) {
    problems.push({
      path: `${path}.name`,
      message: `No player in the open round matches ${input.name}.`,
    });
  } else if (matches.length > 1) {
    problems.push({
      path: `${path}.name`,
      message: `More than one player in the open round matches ${input.name}. Use the ${label} id.`,
    });
  }

  if (fromId !== null && matches.length === 1 && matches[0]?.playerId !== fromId.playerId) {
    problems.push({
      path: `${path}.name`,
      message: `The ${label} id and name point at two different players.`,
    });
  }

  if (fromId !== null) {
    return { player: fromId, problems };
  }
  if (matches.length === 1) {
    return { player: matches[0] ?? null, problems };
  }
  return { player: null, problems };
}

function holesMatch(existing: ScorecardImportExistingCard, card: ScorecardImportCard): boolean {
  if (existing.entries.length !== 18) return false;
  const byHole = new Map(existing.entries.map((entry) => [entry.hole, entry.strokes]));
  for (let hole = 1; hole <= 18; hole += 1) {
    const expected = card.holes[String(hole)];
    if (expected === undefined || byHole.get(hole) !== expected) return false;
  }
  return true;
}

function groupForPlayer(
  groups: readonly ScorecardImportDrawGroup[] | null,
  playerId: string,
): number | null {
  if (groups === null) return null;
  return groups.find((group) => group.playerIds.includes(playerId))?.number ?? null;
}

function compareCards(
  left: ResolvedScorecardImportCard,
  right: ResolvedScorecardImportCard,
): number {
  const leftGroup = left.groupNumber ?? Number.MAX_SAFE_INTEGER;
  const rightGroup = right.groupNumber ?? Number.MAX_SAFE_INTEGER;
  if (leftGroup !== rightGroup) return leftGroup - rightGroup;
  return left.playerName.localeCompare(right.playerName);
}

/**
 * Matches a parsed file against one open round. It never guesses: an identity that cannot be
 * matched, a player outside the stated group, a self-marked card and a conflicting existing card
 * all block that card and name the reason. The rest of the file can still be imported.
 */
export function resolveScorecardImport(input: ResolveScorecardImportInput): ScorecardImportPlan {
  const problems: ScorecardImportProblem[] = [];
  if (input.file.roundId !== input.roundId) {
    problems.push({
      path: "roundId",
      message: "This file is for another scoring round. Download the template for the open round.",
    });
  }
  if (input.file.tournamentId !== input.tournamentId) {
    problems.push({
      path: "tournamentId",
      message: "This file is for another event. Check the event before importing.",
    });
  }

  // A file that names another round or event is never partially imported. The cards may be real,
  // but they do not belong to the round the desk is looking at.
  if (problems.length > 0) {
    return {
      ready: [],
      alreadyIn: [],
      blocked: [],
      skipped: input.file.skipped,
      problems,
    };
  }

  const byId = new Map(input.players.map((player) => [player.playerId, player]));
  const byName = new Map<string, ScorecardImportRosterPlayer[]>();
  for (const player of input.players) {
    const key = normalizeImportName(player.playerName);
    const list = byName.get(key) ?? [];
    list.push(player);
    byName.set(key, list);
  }

  const ready: ResolvedScorecardImportCard[] = [];
  const alreadyIn: ResolvedScorecardImportCard[] = [];
  const blocked: BlockedScorecardImportCard[] = [];
  /** One card per player and marker. A repeated pair in the file is a duplicate, not evidence. */
  const plannedPairs = new Set<string>();

  for (const [index, card] of input.file.cards.entries()) {
    const path = `cards[${index}]`;
    const reasons: ScorecardImportProblem[] = [];

    const playerResult = resolvePerson(
      { id: card.playerId, name: card.playerName },
      input.players,
      byId,
      byName,
      `${path}.player`,
      "player",
    );
    reasons.push(...playerResult.problems);

    const markerResult = resolvePerson(
      { id: card.markerPlayerId, name: card.markerName },
      input.players,
      byId,
      byName,
      `${path}.marker`,
      "marker",
    );
    reasons.push(...markerResult.problems);

    if (
      playerResult.player !== null &&
      markerResult.player !== null &&
      playerResult.player.playerId === markerResult.player.playerId
    ) {
      reasons.push({
        path: `${path}.marker`,
        message: "A player cannot mark their own card.",
      });
    }

    if (playerResult.player !== null) {
      const playerGroup = groupForPlayer(input.groups, playerResult.player.playerId);
      if (input.groups !== null && playerGroup === null) {
        reasons.push({
          path: `${path}.player`,
          message: `${playerResult.player.playerName} is not in the published draw.`,
        });
      } else if (
        card.groupNumber !== null &&
        playerGroup !== null &&
        card.groupNumber !== playerGroup
      ) {
        reasons.push({
          path: `${path}.groupNumber`,
          message: `${playerResult.player.playerName} is in group ${playerGroup}, not group ${card.groupNumber}.`,
        });
      }
    }

    if (playerResult.player === null || markerResult.player === null || reasons.length > 0) {
      blocked.push({ card, reasons });
      continue;
    }

    const resolved: ResolvedScorecardImportCard = {
      card,
      playerId: playerResult.player.playerId,
      playerName: playerResult.player.playerName,
      markerPlayerId: markerResult.player.playerId,
      markerName: markerResult.player.playerName,
      groupNumber: card.groupNumber ?? groupForPlayer(input.groups, playerResult.player.playerId),
    };

    const pairKey = `${resolved.playerId}:${resolved.markerPlayerId}`;
    if (plannedPairs.has(pairKey)) {
      blocked.push({
        card,
        reasons: [
          {
            path,
            message:
              "This player and marker appear more than once in the file. Keep one card and remove the other.",
          },
        ],
      });
      continue;
    }
    plannedPairs.add(pairKey);

    const existing = input.cards.filter(
      (candidate) =>
        candidate.playerId === resolved.playerId &&
        candidate.scorerId === resolved.markerPlayerId &&
        ACTIVE_CARD_STATUSES.has(candidate.status),
    );

    if (existing.some((candidate) => holesMatch(candidate, card))) {
      alreadyIn.push(resolved);
      continue;
    }
    if (existing.length > 0) {
      blocked.push({
        card,
        reasons: [
          {
            path,
            message:
              "A card from this marker is already in for this player with different scores. Correct the existing card from the Cards table instead.",
          },
        ],
      });
      continue;
    }

    ready.push(resolved);
  }

  ready.sort(compareCards);
  alreadyIn.sort(compareCards);

  return {
    ready,
    alreadyIn,
    blocked,
    skipped: input.file.skipped,
    problems,
  };
}

/** The card entries the scoring repository expects. A transcription is a confirmed manual read. */
export function importCardEntries(card: ResolvedScorecardImportCard): CardEntry[] {
  return Object.entries(card.card.holes)
    .map(([hole, strokes]) => ({
      hole: Number(hole),
      strokes,
      confidence: null,
      manuallyConfirmed: true,
    }))
    .sort((left, right) => left.hole - right.hole);
}

/** A stable key so re-importing the same card does not create a second revision. */
export function importCaptureKey(cardKey: string): string {
  return `import:${cardKey}`;
}
