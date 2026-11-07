import { sessionForTime } from "@/lib/data/sessions";
import type { DeskRegistration } from "@/lib/data/types";
import type { DrawGroup } from "@/lib/draw/validate";

export interface WalkUpPlacementInput {
  /** The board for the staff member's playing day. Null when no draw has been made. */
  draw: readonly DrawGroup[] | null;
  /** The routing result the desk already derives for this player. */
  registration: Pick<DeskRegistration, "playerId" | "status" | "flightId" | "reasons">;
  session: "AM" | "PM";
  dayIndex: number;
  dayCount: number;
  groupSize: number;
}

export type WalkUpPlacement =
  | {
      ok: true;
      /** The group the player joined. */
      groupNumber: number;
      /** A copy of the board with the player in that group. */
      draw: DrawGroup[];
    }
  | {
      ok: false;
      /** What the desk must fix. Shown to staff, never hidden behind a default group. */
      reason: string;
    };

/**
 * Places one walk-up on the board the way the routing rules would: same class, same AM/PM session,
 * and an open place in a group that is not locked. It never creates a group and never chooses a
 * group in another class or session. When there is no honest place, it says why and leaves the
 * board alone so the player can be shown as needing review.
 */
export function placeWalkUp(input: WalkUpPlacementInput): WalkUpPlacement {
  const { registration } = input;

  if (registration.status === "needs_review") {
    return {
      ok: false,
      reason: registration.reasons[0] ?? "The routing rules need the desk to review this player.",
    };
  }
  if (registration.status === "ineligible") {
    return {
      ok: false,
      reason: registration.reasons[0] ?? "The player is not eligible for this event.",
    };
  }
  if (!registration.flightId) {
    return { ok: false, reason: "The player has no class yet; the desk must classify them first." };
  }
  if (!input.draw || input.draw.length === 0) {
    return { ok: false, reason: "No draw has been made for this day yet." };
  }
  if (input.draw.some((group) => group.playerIds.includes(registration.playerId))) {
    return { ok: false, reason: "This player is already in a group." };
  }

  const open = input.draw.filter(
    (group) =>
      !group.locked &&
      group.flightId === registration.flightId &&
      group.playerIds.length < input.groupSize &&
      sessionForTime(group.time, input.dayIndex, input.dayCount)?.key === input.session,
  );
  if (open.length === 0) {
    return {
      ok: false,
      reason: `No group in this player's class has an open place in the ${input.session} session.`,
    };
  }

  // Fill the fullest compatible group first, so a three-ball becomes a four-ball before a new
  // group is opened. The number breaks a tie, so the same board always places the same player.
  const target = [...open].sort(
    (a, b) => b.playerIds.length - a.playerIds.length || a.number - b.number,
  )[0] as DrawGroup;

  return {
    ok: true,
    groupNumber: target.number,
    draw: input.draw.map((group) =>
      group.number === target.number
        ? { ...group, playerIds: [...group.playerIds, registration.playerId] }
        : group,
    ),
  };
}
