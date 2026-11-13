import type { FlightRule, Registration } from "@/lib/routing";
import type { DrawGroup, Issue } from "./validate";

/**
 * Class mismatches on the pairings board.
 *
 * A class (a flight row) is cut over the whole field, so a group is drawn in one class. The desk can
 * still correct a player's index straight from the board. The owner's decision for that case is that
 * the player stays in the group they were drawn in and the board says the class no longer matches.
 * Nothing is re-routed here, and nothing is blocked: a mismatch is a note for the organizer, never a
 * reason to hold a publish back.
 *
 * Pure: it reads the draw, the registrations and the event's classes, and reports what differs.
 */

export interface ClassMismatchPlayer {
  playerId: string;
  playerName: string;
  /** The class the player's own registration now names. */
  classId: string;
  /** That class's name, from the event's classes; the id when the class row is missing. */
  className: string;
  /** The class the group was drawn in. */
  groupClassName: string;
  /** The row badge, for example "Class B, group is Class A". */
  note: string;
}

/** One group whose drawn class no longer matches at least one of its players. */
export interface GroupClassMismatch {
  group: number;
  groupClassName: string;
  players: ClassMismatchPlayer[];
}

export interface ClassMismatchInput {
  draw: DrawGroup[];
  registrations: Registration[];
  /** The event's classes (flight rows). Classes are field-wide, never per category. */
  flights: FlightRule[];
}

/**
 * For every group, the players whose own class differs from the group's class.
 *
 * Groups with nothing to report are left out, so an empty result means the board agrees with the
 * entries. A player whose entry names no class is left out too: that is the separate Unclassified
 * case, and guessing a class for them here would invent data.
 */
export function classMismatches({
  draw,
  registrations,
  flights,
}: ClassMismatchInput): GroupClassMismatch[] {
  const regById = new Map(registrations.map((r) => [r.playerId, r]));
  // Classes are compared by id, not by name: two class rows can share a name, and the id is what the
  // draw stores. A missing class row is shown as its id rather than given an invented name.
  const classNameOf = (id: string) => flights.find((f) => f.id === id)?.name ?? id;
  const result: GroupClassMismatch[] = [];

  for (const g of draw) {
    const groupClassName = classNameOf(g.flightId);
    const players: ClassMismatchPlayer[] = [];
    for (const id of g.playerIds) {
      const r = regById.get(id);
      if (!r) continue;
      const classId = r.flightId;
      if (!classId || classId === g.flightId) continue;
      const className = classNameOf(classId);
      players.push({
        playerId: id,
        playerName: r.playerName,
        classId,
        className,
        groupClassName,
        note: `${className}, group is ${groupClassName}`,
      });
    }
    if (players.length > 0) result.push({ group: g.number, groupClassName, players });
  }

  return result;
}

/**
 * The mismatches as checks-panel notes. They are information only: never blocking, so a publish is
 * not held up by a class that is out of step with its group.
 */
export function classMismatchIssues(mismatches: GroupClassMismatch[]): Issue[] {
  return mismatches.flatMap((g) =>
    g.players.map((p) => ({
      id: `class-mismatch-${p.playerId}`,
      severity: "info" as const,
      message: `Group ${g.group} is ${p.groupClassName}, but ${p.playerName} is now ${p.className}. They stay in that group until the organizer moves them.`,
      group: g.group,
      playerId: p.playerId,
    })),
  );
}
