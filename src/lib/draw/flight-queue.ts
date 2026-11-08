import type { DrawGroup } from "./validate";

/**
 * The flight queue for one day's draw (issue 195).
 *
 * A flight fills the holes at one start. The next flight queues behind it on each hole at the next
 * start. This model reads the finished draw and answers two questions for the screens: who is in the
 * queue on each hole, and where each flight sits in the queue. It never changes a group.
 */

/** One group's place in a hole's queue. */
export interface QueueEntry {
  groupNumber: number;
  flightId: string;
  /** "HH:MM" start time of the wave this group is in. */
  time: string;
  startHole: number;
  locked: boolean;
  /** How many players are in the group. */
  players: number;
}

/** The groups waiting on one hole, first to go out first. Empty when nobody starts there. */
export interface HoleQueue {
  hole: number;
  entries: QueueEntry[];
}

/** One wave of one flight: the holes it uses and the holes it leaves vacant at that start. */
export interface FlightWave {
  time: string;
  groups: number;
  /** Holes used by this flight at this start, ascending. */
  holes: number[];
  /** Holes 1..N that nobody starts on at this start, ascending. */
  vacantHoles: number[];
}

/** A flight's place in the queue. `position` is 1 for the flight that goes out first. */
export interface FlightQueue {
  flightId: string;
  flightName: string;
  position: number;
  groups: number;
  players: number;
  waves: FlightWave[];
}

export interface FlightQueueModel {
  /** How many holes the course has. */
  holes: number;
  /** One entry for every hole 1..holes, including holes nobody starts on. */
  byHole: HoleQueue[];
  /** Flights that have at least one group, in queue order (earliest first wave first). */
  flights: FlightQueue[];
}

/**
 * Builds the queue model from a draw.
 *
 * Rules:
 * - A hole's queue is its groups ordered by start time, then by group number.
 * - A flight's `position` is its rank by the time of its earliest group, then by flight order in
 *   `flights`. Flights with no groups are left out.
 * - A flight's waves are its distinct start times in ascending order. `holes` lists the holes that
 *   flight's groups use at that time; `vacantHoles` lists holes 1..holes that NO group of ANY flight
 *   starts on at that time.
 * - A group whose flight id is not in `flights` still appears in `byHole`, but not in `flights`.
 * - Pure: no input is changed.
 */
export function buildFlightQueue(
  groups: readonly DrawGroup[],
  flights: readonly { id: string; name: string }[],
  holes: number,
): FlightQueueModel {
  const holeCount = Number.isInteger(holes) && holes > 0 ? holes : 0;
  const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
  const byStart = (a: DrawGroup, b: DrawGroup) => compare(a.time, b.time) || a.number - b.number;
  // A group that starts off the course cannot sit in a hole's queue, so it is left out entirely.
  const onCourse = groups.filter(
    (g) => Number.isInteger(g.startHole) && g.startHole >= 1 && g.startHole <= holeCount,
  );

  const entryOf = (g: DrawGroup): QueueEntry => ({
    groupNumber: g.number,
    flightId: g.flightId,
    time: g.time,
    startHole: g.startHole,
    locked: g.locked,
    players: g.playerIds.length,
  });

  const byHole: HoleQueue[] = Array.from({ length: holeCount }, (_, index) => ({
    hole: index + 1,
    entries: onCourse
      .filter((g) => g.startHole === index + 1)
      .sort(byStart)
      .map(entryOf),
  }));

  // Holes taken at each start time by any flight, so a vacant hole means vacant for everyone.
  const takenAt = new Map<string, Set<number>>();
  for (const g of onCourse) {
    const taken = takenAt.get(g.time) ?? new Set<number>();
    taken.add(g.startHole);
    takenAt.set(g.time, taken);
  }
  const vacantAt = (time: string): number[] => {
    const taken = takenAt.get(time) ?? new Set<number>();
    const vacant: number[] = [];
    for (let hole = 1; hole <= holeCount; hole++) if (!taken.has(hole)) vacant.push(hole);
    return vacant;
  };

  const summaries = flights.flatMap((flight, order) => {
    const own = onCourse.filter((g) => g.flightId === flight.id);
    if (own.length === 0) return [];
    const times = [...new Set(own.map((g) => g.time))].sort(compare);
    const waves: FlightWave[] = times.map((time) => {
      const atTime = own.filter((g) => g.time === time);
      return {
        time,
        groups: atTime.length,
        holes: [...new Set(atTime.map((g) => g.startHole))].sort((a, b) => a - b),
        vacantHoles: vacantAt(time),
      };
    });
    return [
      {
        order,
        first: times[0] ?? "",
        queue: {
          flightId: flight.id,
          flightName: flight.name,
          position: 0,
          groups: own.length,
          players: own.reduce((sum, g) => sum + g.playerIds.length, 0),
          waves,
        } satisfies FlightQueue,
      },
    ];
  });

  summaries.sort((a, b) => compare(a.first, b.first) || a.order - b.order);
  const ranked = summaries.map(({ queue }, index) => ({ ...queue, position: index + 1 }));

  return { holes: holeCount, byHole, flights: ranked };
}
