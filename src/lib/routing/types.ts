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
  /** ISO date, YYYY-MM-DD. Null when the club has not recorded it; the player is still drawn. */
  birthdate: string | null;
  /** Null when the club has not recorded it; the player is still drawn. */
  gender: Gender | null;
  /** Handicap index frozen at the tournament cut-off date (from the NGAP export). */
  index: number | null;
  /** The desk's stored class, when a validated card overrides the index cut. */
  classId?: string | null;
  /** The card playing handicap, already converted. Null when the card has no HDCP. */
  cardHandicap?: number | null;
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

/** A playing day runs two shotguns, a morning and an afternoon. */
export type Session = "AM" | "PM";

export interface SessionStarts {
  /** "HH:MM" start of the morning shotgun. */
  AM: string;
  /** "HH:MM" start of the afternoon shotgun. */
  PM: string;
}

/**
 * One playing day's sessions. A player only appears on a day they chose, so this is the session the
 * desk recorded for that player on the day being drawn.
 */
export interface SessionInput {
  byPlayer: ReadonlyMap<string, Session | null> | Record<string, Session | null | undefined>;
  starts: SessionStarts;
  /** Playing-day number, so one board can hold every day. */
  dayNumber?: number;
  /**
   * Minutes between two starts inside one session, when a session has more groups than the holes
   * can hold. Left out, the event's long gap setting is used.
   */
  batchGapMinutes?: number;
}

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
  /**
   * "HH:MM" 24-hour afternoon start for the whole event, from `tournaments.pm_first_tee_time`.
   * Null when the club has not stored one; a playing day's own afternoon start still wins over it.
   */
  pmFirstTeeTime?: string | null;
  /** Minutes between groups (two-tee start). */
  intervalMinutes: number;
  /** Minutes between start times (shotgun): how much later the next start follows. */
  waveGapMinutes: number;
  /**
   * How many flights one session can run: Flight A is the first group on every hole, Flight B the
   * next group on every hole. Two on a real course, which is the default when this is left out. A
   * session never gets a third flight; groups that do not fit are left out of the draw and listed
   * for the organizer to move. Only applies to a shotgun day drawn in sessions.
   */
  maxFlightsPerSession?: number;
}

export type RegistrationStatus = "ok" | "ineligible" | "needs_review";

export interface Registration {
  playerId: string;
  playerName: string;
  /** Copied from the player so the draw can keep a pair together. */
  teamKey?: string | null;
  /** The pair regardless of a stored routing override, used to check a saved board. */
  pairKey?: string | null;
  status: RegistrationStatus;
  reasons: string[];
  index: number | null;
  age: number;
  categoryId: string | null;
  teeId: string | null;
  /** Rounded playing handicap after allowance. */
  playingHandicap: number | null;
  flightId: string | null;
  /** "stored" when the desk's card class is authoritative; "index" when cut from the index. */
  classSource?: "index" | "stored";
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
  /**
   * Legacy stored field from when a day ran lettered waves. A draw always writes null now: a group
   * is described by its start time and the hole it tees off on.
   */
  wave: string | null;
  /** "HH:MM" */
  time: string;
}

export interface RoutingResult {
  registrations: Registration[];
  groups: Group[];
  warnings: string[];
}
