/**
 * The public tee-time board, in the shape the club may show.
 *
 * The board is a timetable, not a draw sheet. It lists one player per row, grouped only by the
 * session that player tees off in, so it cannot reveal a four-ball, a pair number or a starting
 * hole. The session comes from the same day list the page already uses: the stored morning and
 * afternoon starts, with the fixed defaults behind them. A time that cannot be placed is withheld
 * and the player stands under "time not assigned", never guessed into a session.
 *
 * Pure, so the sorting and the withholding are tested without a renderer.
 */
import { type SessionKey, sessionForTime } from "@/lib/data/sessions";
import type { PublicTeeTimePlayer } from "@/lib/data/types";

export type BoardSectionKey = SessionKey | "unassigned";

export interface BoardPlayer {
  name: string;
  /** A confirmed start the board can place, or null. A time it cannot place is not printed. */
  teeTime: string | null;
}

export interface BoardSection {
  key: BoardSectionKey;
  players: BoardPlayer[];
}

/** AM first, PM second, the players with no placeable time last. */
const SECTION_ORDER: readonly BoardSectionKey[] = ["AM", "PM", "unassigned"];

/**
 * The time a public row may print: a confirmed start, trimmed, or nothing. The programme
 * projection already withholds an unconfirmed time; this refuses one that arrives anyway.
 */
export function confirmedTeeTime(player: PublicTeeTimePlayer): string | null {
  if (player.confirmed !== true) return null;
  const time = player.teeTime?.trim() ?? "";
  return time === "" ? null : time;
}

/** Alphabetical by name, case and accent aware, with the raw name as a stable tie-break. */
function byName(a: BoardPlayer, b: BoardPlayer): number {
  return (
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" }) || a.name.localeCompare(b.name)
  );
}

/**
 * Splits one playing day into its AM, PM and unassigned sections, each alphabetical.
 *
 * `dayIndex` and `dayCount` select the day's session starts, exactly as `sessionForTime` does for
 * the rest of the public pages: 12:00 turns the board over on an ordinary day, and the last day's
 * earlier afternoon start moves that turn with it.
 */
export function teeBoardSections(
  day: { players: readonly PublicTeeTimePlayer[] },
  dayIndex: number,
  dayCount: number,
): BoardSection[] {
  const bySection = new Map<BoardSectionKey, BoardPlayer[]>([
    ["AM", []],
    ["PM", []],
    ["unassigned", []],
  ]);

  for (const player of day.players) {
    const name = player.name.trim();
    if (name === "") continue;
    const teeTime = confirmedTeeTime(player);
    const session = teeTime === null ? null : sessionForTime(teeTime, dayIndex, dayCount);
    if (session === null) {
      // No confirmed time, or one that does not read as a clock time: the player still appears,
      // under "time not assigned", with no time beside the name.
      bySection.get("unassigned")?.push({ name, teeTime: null });
      continue;
    }
    bySection.get(session.key)?.push({ name, teeTime });
  }

  return SECTION_ORDER.map((key) => ({
    key,
    players: (bySection.get(key) ?? []).sort(byName),
  }));
}
