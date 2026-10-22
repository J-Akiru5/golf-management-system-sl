import type { PublicPairingGroup, PublicPairingPlayer, PublicPairings } from "./types";

/**
 * The public view is built through this allow-list. Components that face players receive a
 * `PublicPairings` object and nothing else. The only player fields are the frozen name, the stable
 * id used to look up a public photo, and a public-bucket path that the database has already gated on
 * separate public consent. Birthdate, contact, private photo path, handicap history, payment and
 * notes can never leak into a public page by accident.
 */

/** The shape the publisher stores. Kept structural so this module does not import the store. */
export interface PublishedLike {
  groups: {
    number: number;
    startHole: number;
    wave: string | null;
    time: string;
    flight: string;
    players: string[];
    playerIds?: string[];
  }[];
}

export interface PublicPairingsInput {
  published: PublishedLike;
  tournamentName: string;
  dateLabel: string;
  startFormat: "shotgun" | "two_tee";
  firstTeeTime: string;
  /** Public photo paths by player id, only for players whose public consent is recorded. */
  photoByPlayerId?: Record<string, string>;
}

const onlyName = (name: string) => name.trim();

export function toPublicPairings({
  published,
  tournamentName,
  dateLabel,
  startFormat,
  firstTeeTime,
  photoByPlayerId = {},
}: PublicPairingsInput): PublicPairings {
  const groups: PublicPairingGroup[] = published.groups.map((g) => {
    const ids = g.playerIds ?? [];
    const players: PublicPairingPlayer[] = g.players
      .map((name, index) => {
        const rawId = ids[index];
        const id = rawId && rawId !== "" ? rawId : null;
        return {
          id,
          name: onlyName(name),
          photoPath: id ? (photoByPlayerId[id] ?? null) : null,
        };
      })
      .filter((player) => player.name !== "");
    return {
      number: g.number,
      startHole: g.startHole,
      wave: g.wave,
      time: g.time,
      flight: g.flight,
      players,
    };
  });
  return { tournamentName, dateLabel, startFormat, firstTeeTime, groups };
}
