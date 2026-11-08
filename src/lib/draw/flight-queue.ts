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
  _groups: readonly DrawGroup[],
  _flights: readonly { id: string; name: string }[],
  _holes: number,
): FlightQueueModel {
  throw new Error("buildFlightQueue is not implemented yet");
}
