import type { DrawGroup } from "./validate";

/**
 * The flight queue for one day's draw (issue 195).
 *
 * A flight is a wave of groups, not a class. Inside one session (morning or afternoon) the first
 * group on every hole is Flight A, the next group on each hole is Flight B, and so on: slot 1A,
 * slot 1B, slot 2A. Classes only decide the order groups are listed in, so a class can straddle two
 * flights. This model reads the finished draw and tells the screens who is in the queue on each hole
 * and what each flight holds. It never changes a group.
 */

/** One group's place in a hole's queue. */
export interface QueueEntry {
  groupNumber: number;
  /** The class the group was drawn in, for display. */
  className: string;
  /** "HH:MM" start time of the flight this group is in. */
  time: string;
  startHole: number;
  locked: boolean;
  /** How many players are in the group. */
  players: number;
  /** "AM" or "PM" when the draw knows sessions, otherwise null. */
  session: string | null;
  /** The flight letter inside its session: "A" is first on the hole. */
  letter: string;
  /** The slot the group holds, for example "1A" or "12B". */
  slot: string;
}

/** The groups waiting on one hole, first to go out first. Empty when nobody starts there. */
export interface HoleQueue {
  hole: number;
  entries: QueueEntry[];
}

/** One flight: every group that starts at the same time in the same session. */
export interface QueueFlight {
  /** Unique within the model: session and letter together, for example "AM-A". */
  key: string;
  session: string | null;
  letter: string;
  /** "Flight A". */
  label: string;
  time: string;
  groups: number;
  players: number;
  /** Holes this flight uses, ascending. */
  holes: number[];
  /** Holes 1..N that nobody starts on at this time, ascending. */
  vacantHoles: number[];
  /** The classes that appear in this flight, in group order. */
  classNames: string[];
}

export interface FlightQueueModel {
  /** How many holes the course has. */
  holes: number;
  /** One entry for every hole 1..holes, including holes nobody starts on. */
  byHole: HoleQueue[];
  /** Flights in start order: the morning's A, B, ... then the afternoon's A, B, ... */
  flights: QueueFlight[];
}

/** A, B, C ... Z, then 27, 28 ... so a very long day still gets a distinct label. */
export function flightLetter(index: number): string {
  return index >= 0 && index < 26 ? String.fromCharCode(65 + index) : String(index + 1);
}

/**
 * Builds the queue model from a draw.
 *
 * Rules:
 * - A flight is the set of groups that share a start time inside one session. Within a session the
 *   distinct start times, earliest first, are Flight A, Flight B and so on. `sessionOf` names the
 *   session of a start time; when it is left out, or answers null, the whole draw is one session.
 * - A group's slot is its hole plus its flight letter: hole 7 in Flight B is "7B".
 * - A hole's queue is its groups ordered by start time, then by group number.
 * - A flight's vacant holes are the holes 1..holes that no group of any flight starts on at that time.
 * - A group that starts off the course (hole below 1 or above `holes`) is left out entirely.
 * - A class id that is not in `classes` is shown by its id.
 * - Pure: no input is changed.
 */
export function buildFlightQueue(
  groups: readonly DrawGroup[],
  classes: readonly { id: string; name: string }[],
  holes: number,
  sessionOf?: (time: string) => string | null,
): FlightQueueModel {
  const holeCount = Number.isInteger(holes) && holes > 0 ? holes : 0;
  const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
  const byStart = (a: DrawGroup, b: DrawGroup) => compare(a.time, b.time) || a.number - b.number;
  const onCourse = groups.filter(
    (g) => Number.isInteger(g.startHole) && g.startHole >= 1 && g.startHole <= holeCount,
  );
  const nameOfClass = (id: string) => classes.find((c) => c.id === id)?.name ?? id;
  const sessionAt = (time: string) => sessionOf?.(time) ?? null;

  // Flight letters: the distinct start times of each session, earliest first.
  const timesBySession = new Map<string | null, string[]>();
  for (const g of onCourse) {
    const session = sessionAt(g.time);
    const times = timesBySession.get(session) ?? [];
    if (!times.includes(g.time)) times.push(g.time);
    timesBySession.set(session, times);
  }
  for (const times of timesBySession.values()) times.sort(compare);
  const letterOf = (time: string): string =>
    flightLetter((timesBySession.get(sessionAt(time)) ?? []).indexOf(time));

  const entryOf = (g: DrawGroup): QueueEntry => {
    const letter = letterOf(g.time);
    return {
      groupNumber: g.number,
      className: nameOfClass(g.flightId),
      time: g.time,
      startHole: g.startHole,
      locked: g.locked,
      players: g.playerIds.length,
      session: sessionAt(g.time),
      letter,
      slot: `${g.startHole}${letter}`,
    };
  };

  const byHole: HoleQueue[] = Array.from({ length: holeCount }, (_, index) => ({
    hole: index + 1,
    entries: onCourse
      .filter((g) => g.startHole === index + 1)
      .sort(byStart)
      .map(entryOf),
  }));

  // One flight per (session, start time).
  const flightKeys = new Map<string, DrawGroup[]>();
  for (const g of [...onCourse].sort(byStart)) {
    const key = `${sessionAt(g.time) ?? ""}|${g.time}`;
    const members = flightKeys.get(key) ?? [];
    members.push(g);
    flightKeys.set(key, members);
  }
  const flights: QueueFlight[] = [...flightKeys.values()]
    .map((members) => {
      const first = members[0] as DrawGroup;
      const session = sessionAt(first.time);
      const letter = letterOf(first.time);
      const taken = new Set(members.map((g) => g.startHole));
      const vacantHoles: number[] = [];
      for (let hole = 1; hole <= holeCount; hole++) if (!taken.has(hole)) vacantHoles.push(hole);
      return {
        key: `${session ?? "day"}-${letter}`,
        session,
        letter,
        label: `Flight ${letter}`,
        time: first.time,
        groups: members.length,
        players: members.reduce((sum, g) => sum + g.playerIds.length, 0),
        holes: [...taken].sort((a, b) => a - b),
        vacantHoles,
        classNames: [...new Set(members.map((g) => nameOfClass(g.flightId)))],
      };
    })
    .sort((a, b) => compare(a.time, b.time));

  return { holes: holeCount, byHole, flights };
}
