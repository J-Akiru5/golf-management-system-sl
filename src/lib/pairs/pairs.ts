import type { RegistrationEntry } from "@/lib/data/types";

export type PairSide = "member" | "guest";

export interface PairSlots {
  number: number;
  member: RegistrationEntry | null;
  guest: RegistrationEntry | null;
}

/** The two entries that carry one pair number. A malformed third entry is left out of this view. */
export function pairSlots(entries: readonly RegistrationEntry[], number: number): PairSlots {
  const rows = entries.filter((entry) => entry.teamNo === number);
  return {
    number,
    member: rows.find((entry) => entry.role === "member") ?? null,
    guest: rows.find((entry) => entry.role === "guest") ?? null,
  };
}

/** The next free number, so a new pair never collides with one already on the board. */
export function nextPairNumber(entries: readonly RegistrationEntry[]): number {
  const used = entries
    .map((entry) => entry.teamNo)
    .filter((number): number is number => typeof number === "number" && number > 0);
  return used.length === 0 ? 1 : Math.max(...used) + 1;
}

/**
 * The players who may fill a side. A player already in another pair is left out; the database
 * would move them, but the picker should show the consequence before the organizer chooses.
 */
export function partnerCandidates(
  entries: readonly RegistrationEntry[],
  side: PairSide,
  options: {
    excludeEntryId?: string | null;
    /** Keep the current pair's players visible when the dialog is replacing a partner. */
    pairNumber?: number | null;
  } = {},
): RegistrationEntry[] {
  return entries.filter((entry) => {
    if (entry.role !== side) return false;
    if (entry.id === options.excludeEntryId) return false;
    if (entry.teamNo === null || entry.teamNo === undefined) return true;
    return options.pairNumber !== null && entry.teamNo === options.pairNumber;
  });
}

export interface PairProblem {
  code: string;
  message: string;
}

/** The rules the dialog can check before the database sees the write. */
export function pairProblems(input: {
  entries: readonly RegistrationEntry[];
  number: number;
  memberEntryId: string | null;
  guestEntryId: string | null;
  creating?: boolean;
  allowEmpty?: boolean;
}): PairProblem[] {
  const problems: PairProblem[] = [];
  if (!Number.isInteger(input.number) || input.number < 1) {
    problems.push({ code: "number", message: "A pair number must be a whole number above zero." });
  }
  if (input.memberEntryId !== null && input.memberEntryId === input.guestEntryId) {
    problems.push({ code: "same", message: "A player cannot fill both sides of one pair." });
  }
  if (input.memberEntryId === null && input.guestEntryId === null && input.allowEmpty !== true) {
    problems.push({ code: "empty", message: "A pair needs at least one player." });
  }

  const slots: { side: PairSide; id: string | null }[] = [
    { side: "member", id: input.memberEntryId },
    { side: "guest", id: input.guestEntryId },
  ];
  for (const slot of slots) {
    if (!slot.id) continue;
    const entry = input.entries.find((row) => row.id === slot.id);
    if (!entry) {
      problems.push({ code: "missing", message: "That player is not entered in this event." });
      continue;
    }
    if (entry.role !== slot.side) {
      problems.push({
        code: "role",
        message: `That player is a ${entry.role}, not a ${slot.side}.`,
      });
    }
    if (entry.teamNo !== null && entry.teamNo !== undefined && entry.teamNo !== input.number) {
      problems.push({
        code: "taken",
        message: `That player is already in pair ${entry.teamNo}.`,
      });
    }
  }

  if (input.creating === true && input.entries.some((entry) => entry.teamNo === input.number)) {
    problems.push({
      code: "exists",
      message: `Pair ${input.number} already exists. Choose another number.`,
    });
  }

  return problems;
}
