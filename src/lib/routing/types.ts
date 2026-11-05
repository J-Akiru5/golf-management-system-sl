export type Gender = "M" | "F";

export interface Tee {
  id: string;
  name: string;
  courseRating: number;
  slope: number;
  par: number;
}

/** A category maps a gender and age band to one tee. Ranges are inclusive. maxAge null = no upper limit. */
export interface CategoryRule {
  id: string;
  name: string;
  gender: Gender | "any";
  minAge: number;
  maxAge: number | null;
  teeId: string;
}

/**
 * A class: a fixed handicap range, inclusive. Classes are the priority over tees, so a class is cut
 * over the whole field and never split by category or tee.
 *
 * `categoryId` is storage only. The flights table still hangs a row off a category, so classes are
 * kept under one carrier category; the engine ignores it when matching.
 */
export interface FlightRule {
  id: string;
  categoryId: string;
  name: string;
  min: number;
  max: number;
}

export interface Player {
  id: string;
  name: string;
  /** ISO date, YYYY-MM-DD */
  birthdate: string;
  gender: Gender;
  /** Handicap index frozen at the tournament cut-off date (from the NGAP export). */
  index: number | null;
  /**
   * The club's team or pair, when the event is played in teams. Players with the same key are kept
   * in one group; null or missing means the player is drawn on their own.
   */
  teamKey?: string | null;
}

/**
 * A player the desk confirmed while a routing fact is still missing. They cannot be classified, so
 * they are placed in their own "Unclassified" group instead of being given an invented category or
 * flight. `missing` is the plain list the desk must correct later.
 */
export interface ProvisionalPlayer {
  id: string;
  name: string;
  index: number | null;
  missing: string[];
}

export type StartFormat = "shotgun" | "two_tee";

export interface TournamentConfig {
  /** ISO date of play. Age is measured on this day. */
  date: string;
  maxIndex: number;
  /** 1 = 100%. */
  allowance: number;
  /** What flight ranges are compared against. */
  flightBasis: "index" | "courseHandicap";
  startFormat: StartFormat;
  holes: number;
  /** Largest group size. */
  groupSize: number;
  /** Groups smaller than this are flagged, not blocked. */
  minGroupSize: number;
  /** "HH:MM" 24-hour. */
  firstTeeTime: string;
  /** Minutes between groups (two-tee start). */
  intervalMinutes: number;
  /** Minutes between wave starts (shotgun). */
  waveGapMinutes: number;
}

export type RegistrationStatus = "ok" | "ineligible" | "needs_review";

export interface Registration {
  playerId: string;
  playerName: string;
  /** Copied from the player so the draw can keep a pair together. */
  teamKey?: string | null;
  status: RegistrationStatus;
  reasons: string[];
  index: number | null;
  age: number;
  categoryId: string | null;
  teeId: string | null;
  /** Rounded playing handicap after allowance. */
  playingHandicap: number | null;
  flightId: string | null;
  /** True only for a desk-confirmed entry that is still missing a routing fact. Derived, not stored. */
  provisional?: boolean;
}

export interface Group {
  /** 1-based, in play order. */
  number: number;
  flightId: string;
  playerIds: string[];
  /** Shotgun: hole to start on. Two-tee: 1 or 10. */
  startHole: number;
  /** Shotgun wave letter A, B, C... Null for a two-tee start. */
  wave: string | null;
  /** "HH:MM" */
  time: string;
}

export interface RoutingResult {
  registrations: Registration[];
  groups: Group[];
  warnings: string[];
}
