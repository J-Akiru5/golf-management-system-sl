import type { HoleDefinition } from "../types";
import type { ScorecardImportDrawGroup, ScorecardImportRosterPlayer } from "./resolve";
import type { ScorecardImportFile } from "./types";
import { SCORECARD_IMPORT_FORMAT, SCORECARD_IMPORT_VERSION } from "./types";

export interface ScorecardImportTemplateCard {
  cardKey: string;
  groupNumber: number | null;
  playerId: string | null;
  playerName: string | null;
  markerPlayerId: string | null;
  markerName: string | null;
  writtenTotal: number | null;
  holes: Record<string, number | null>;
  notes: string | null;
}

export interface ScorecardImportTemplate extends Omit<ScorecardImportFile, "cards"> {
  cards: ScorecardImportTemplateCard[];
}

export interface ScorecardImportTemplateInput {
  tournamentId: string;
  roundId: string;
  dayNumber: number;
  players: readonly ScorecardImportRosterPlayer[];
  groups: readonly ScorecardImportDrawGroup[] | null;
  holes: readonly HoleDefinition[];
  /** The proposed marker for each player. Missing players are left for the desk to fill. */
  markers: readonly { playerId: string; scorerId: string }[];
}

/**
 * Builds a fill-in file for the open round. Every player id, marker id, group and hole key is
 * already in place, so the transcriber only types the 18 gross scores and the name and time.
 * The null holes are placeholders; the import refuses the card until every one is filled.
 */
export function buildScorecardImportTemplate(
  input: ScorecardImportTemplateInput,
): ScorecardImportTemplate {
  const markerByPlayer = new Map(input.markers.map((marker) => [marker.playerId, marker.scorerId]));
  const groupByPlayer = new Map<string, number>();
  for (const group of input.groups ?? []) {
    for (const playerId of group.playerIds) groupByPlayer.set(playerId, group.number);
  }
  const byId = new Map(input.players.map((player) => [player.playerId, player]));
  const holeKeys = [...input.holes]
    .sort((left, right) => left.number - right.number)
    .map((hole) => String(hole.number));

  const cards: ScorecardImportTemplateCard[] = input.players.map((player) => {
    const proposedMarker = markerByPlayer.get(player.playerId) ?? null;
    const fallbackMarker =
      input.players.find((candidate) => candidate.playerId !== player.playerId)?.playerId ?? null;
    const markerId = proposedMarker ?? fallbackMarker;
    const marker = markerId === null ? null : (byId.get(markerId) ?? null);
    const groupNumber = groupByPlayer.get(player.playerId) ?? null;
    return {
      cardKey: `d${input.dayNumber}-g${groupNumber ?? "na"}-${player.playerId}-${markerId ?? "unassigned"}`,
      groupNumber,
      playerId: player.playerId,
      playerName: player.playerName,
      markerPlayerId: marker?.playerId ?? null,
      markerName: marker?.playerName ?? null,
      writtenTotal: null,
      holes: Object.fromEntries(holeKeys.map((hole) => [hole, null])),
      notes: null,
    };
  });

  cards.sort((left, right) => {
    const leftGroup = left.groupNumber ?? Number.MAX_SAFE_INTEGER;
    const rightGroup = right.groupNumber ?? Number.MAX_SAFE_INTEGER;
    if (leftGroup !== rightGroup) return leftGroup - rightGroup;
    return (left.playerName ?? "").localeCompare(right.playerName ?? "");
  });

  return {
    format: SCORECARD_IMPORT_FORMAT,
    version: SCORECARD_IMPORT_VERSION,
    roundId: input.roundId,
    tournamentId: input.tournamentId,
    dayNumber: input.dayNumber,
    extractedBy: "",
    extractedAt: "",
    cards,
    skipped: [],
  };
}
