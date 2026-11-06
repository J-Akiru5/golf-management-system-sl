/**
 * The group a volunteer's phone is walking with.
 *
 * It is a fact about this phone, not about the tournament: two volunteers may score the same
 * group, and a phone put back in the drawer must not keep the claim. So it lives in this browser's
 * storage, is keyed by event and day, and is cleared on sign-out with the offline snapshot.
 */

export interface GroupClaim {
  tournamentId: string;
  /** The tournament day number. */
  dayNumber: number;
  groupId: string;
  groupNumber: number;
}

export const claimKey = (tournamentId: string, dayNumber: number): string =>
  `staff:claim:${tournamentId}:${dayNumber}`;

/** Reads a stored claim. Anything malformed is treated as no claim, never repaired by guessing. */
export function parseClaim(raw: string | null): GroupClaim | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<GroupClaim> | null;
    if (!value || typeof value !== "object") return null;
    const { tournamentId, dayNumber, groupId, groupNumber } = value;
    if (typeof tournamentId !== "string" || tournamentId === "") return null;
    if (typeof groupId !== "string" || groupId === "") return null;
    if (typeof groupNumber !== "number" || !Number.isInteger(groupNumber)) return null;
    if (typeof dayNumber !== "number" || !Number.isInteger(dayNumber)) return null;
    return { tournamentId, dayNumber, groupId, groupNumber };
  } catch {
    return null;
  }
}

export function serializeClaim(claim: GroupClaim): string {
  return JSON.stringify(claim);
}

/** True when the stored claim belongs to the event and day on screen. */
export function claimMatches(
  claim: GroupClaim | null,
  tournamentId: string,
  dayNumber: number,
): boolean {
  return Boolean(claim && claim.tournamentId === tournamentId && claim.dayNumber === dayNumber);
}

export function readClaim(tournamentId: string, dayNumber: number): GroupClaim | null {
  if (typeof window === "undefined") return null;
  try {
    return parseClaim(window.localStorage.getItem(claimKey(tournamentId, dayNumber)));
  } catch {
    // Private browsing or a blocked storage area: no claim, and the screens still work.
    return null;
  }
}

export function writeClaim(claim: GroupClaim): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      claimKey(claim.tournamentId, claim.dayNumber),
      serializeClaim(claim),
    );
  } catch {
    // A phone that refuses storage keeps the claim for this visit only.
  }
}

export function clearClaim(tournamentId: string, dayNumber: number): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(claimKey(tournamentId, dayNumber));
  } catch {
    // Nothing to clear.
  }
}
