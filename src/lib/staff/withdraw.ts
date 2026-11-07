import type { GroupPlacement } from "@/lib/draw/withdraw";

/**
 * What is needed to undo one day's withdrawal: the entry, the days it had, and where the player sat
 * on the board. It lives in this tab's session storage, so leaving Players and coming back does not
 * lose the undo. No name or contact is stored; the screen looks the player up from the desk.
 */
export interface WithdrawUndo {
  tournamentId: string;
  dayNumber: number;
  entryId: string;
  playerId: string;
  previousDays: number[];
  previousSessions: Record<number, "AM" | "PM">;
  placement: GroupPlacement | null;
  at: string;
}

const KEY = "staff:withdraw";

const keyFor = (tournamentId: string, dayNumber: number) => `${KEY}:${tournamentId}:${dayNumber}`;

const storage = (): Storage | null => {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
};

const isPlacement = (value: unknown): value is GroupPlacement => {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as { groupNumber?: unknown; index?: unknown };
  return (
    typeof candidate.groupNumber === "number" &&
    Number.isInteger(candidate.groupNumber) &&
    typeof candidate.index === "number" &&
    Number.isInteger(candidate.index) &&
    candidate.index >= 0
  );
};

const sessionsOf = (value: unknown): Record<number, "AM" | "PM"> => {
  if (typeof value !== "object" || value === null) return {};
  const sessions: Record<number, "AM" | "PM"> = {};
  for (const [key, choice] of Object.entries(value as Record<string, unknown>)) {
    const day = Number(key);
    if (Number.isInteger(day) && (choice === "AM" || choice === "PM")) sessions[day] = choice;
  }
  return sessions;
};

export function readWithdrawal(tournamentId: string, dayNumber: number): WithdrawUndo | null {
  const store = storage();
  if (!store) return null;
  try {
    const raw = store.getItem(keyFor(tournamentId, dayNumber));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<WithdrawUndo>;
    if (parsed.tournamentId !== tournamentId || parsed.dayNumber !== dayNumber) return null;
    if (
      typeof parsed.entryId !== "string" ||
      typeof parsed.playerId !== "string" ||
      typeof parsed.at !== "string" ||
      !Array.isArray(parsed.previousDays) ||
      !parsed.previousDays.every((day) => Number.isInteger(day))
    ) {
      return null;
    }
    return {
      tournamentId,
      dayNumber,
      entryId: parsed.entryId,
      playerId: parsed.playerId,
      previousDays: parsed.previousDays as number[],
      previousSessions: sessionsOf(parsed.previousSessions),
      placement: isPlacement(parsed.placement) ? parsed.placement : null,
      at: parsed.at,
    };
  } catch {
    return null;
  }
}

export function writeWithdrawal(token: WithdrawUndo): void {
  const store = storage();
  if (!store) return;
  try {
    store.setItem(keyFor(token.tournamentId, token.dayNumber), JSON.stringify(token));
  } catch {
    // A browser that refuses storage still keeps the undo on screen for this visit.
  }
}

export function clearWithdrawal(tournamentId: string, dayNumber: number): void {
  const store = storage();
  if (!store) return;
  try {
    store.removeItem(keyFor(tournamentId, dayNumber));
  } catch {
    // Nothing to do: a stale token is spent the next time it is read and fails its checks.
  }
}
