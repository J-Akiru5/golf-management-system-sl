import { toPublicPairings } from "@/lib/data/public";
import type { PublicPairings } from "@/lib/data/types";
import type { PrintStartFormat } from "./start-sheet";

/** The fields a draft sheet may take from the desk's board. Nothing else is read. */
export interface DraftPairingPlayer {
  id: string;
  name: string;
}

export interface DraftPairingGroup {
  number: number;
  startHole: number;
  time: string;
  flight: string;
  players: readonly DraftPairingPlayer[];
}

export interface DraftPairingDay {
  dayNumber: number | null;
  dayLabel: string | null;
  playDate: string | null;
  groups: readonly DraftPairingGroup[];
}

export interface DraftPairingsInput {
  tournamentName: string;
  dateLabel: string;
  startFormat: PrintStartFormat;
  firstTeeTime: string;
  days: readonly DraftPairingDay[];
}

/**
 * The player-facing pairings sheet built from the desk's current board, for printing while the
 * event is still a draft. It goes through the same allow-list projection as the published list,
 * so the sheet carries names, ids, flight, hole and time only. The caller marks it as a draft and
 * the public pages never read it: they still read the published snapshot.
 */
export function draftPairings({
  tournamentName,
  dateLabel,
  startFormat,
  firstTeeTime,
  days,
}: DraftPairingsInput): PublicPairings | null {
  const groups = days.flatMap((day) =>
    day.groups
      .filter((group) => group.players.length > 0)
      .map((group) => ({
        number: group.number,
        startHole: group.startHole,
        time: group.time,
        flight: group.flight,
        players: group.players.map((player) => player.name),
        playerIds: group.players.map((player) => player.id),
        ...(day.dayNumber === null
          ? {}
          : {
              dayNumber: day.dayNumber,
              ...(day.dayLabel ? { dayLabel: day.dayLabel } : {}),
              ...(day.playDate ? { playDate: day.playDate } : {}),
            }),
      })),
  );
  if (groups.length === 0) return null;

  return toPublicPairings({
    published: { groups },
    tournamentName,
    dateLabel,
    startFormat,
    firstTeeTime,
  });
}
