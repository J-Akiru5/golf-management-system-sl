import type { PublicPairingGroup, PublicPairings } from "./types";

/**
 * The public view is built through this allow-list. Components that face players receive a
 * `PublicPairings` object and nothing else, so a player or registration object (birthdate,
 * contact, photo, raw handicap history, payment, notes) can never leak into a public page by
 * accident.
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
  }[];
}

export interface PublicPairingsInput {
  published: PublishedLike;
  tournamentName: string;
  dateLabel: string;
  startFormat: "shotgun" | "two_tee";
  firstTeeTime: string;
}

const onlyName = (name: string) => name.trim();

export function toPublicPairings({
  published,
  tournamentName,
  dateLabel,
  startFormat,
  firstTeeTime,
}: PublicPairingsInput): PublicPairings {
  const groups: PublicPairingGroup[] = published.groups.map((g) => ({
    number: g.number,
    startHole: g.startHole,
    wave: g.wave,
    time: g.time,
    flight: g.flight,
    // Player name only. Everything else about a player stays out of the public view.
    players: g.players.map(onlyName).filter((n) => n !== ""),
  }));
  return { tournamentName, dateLabel, startFormat, firstTeeTime, groups };
}
