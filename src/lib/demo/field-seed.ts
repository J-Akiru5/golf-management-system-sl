import { freezeIndex, selectIndexForCutOff } from "@/lib/data/frozen";
import type { HandicapRecord, PlayerRecord, RegistrationEntry } from "@/lib/data/types";
import { displayName } from "@/lib/format";

/**
 * A local-only way to run the demo on the club's real field (issue 195).
 *
 * The real names and indexes are never in the repository's code. A script on the developer's own
 * machine writes the field into `.env.local` (ignored by git, never deployed) as the build-time
 * variable NEXT_PUBLIC_DEMO_FIELD, and the demo seed reads it from here. With the variable unset,
 * which is every deployed build, `readLocalField` answers null and the generated demo is used.
 */

/** One player on the field, as the local script writes it. */
export interface LocalFieldRow {
  /** "LASTNAME, FIRSTNAME" as the club's sheet writes it. */
  name: string;
  /** Null when the sheet leaves the index blank. */
  index: number | null;
  /** The sheet's member and guest pair number. */
  pair: number | null;
  role: "member" | "guest";
  /** Playing day numbers. */
  days: number[];
  /** AM or PM per day number. */
  sessions: Record<string, "AM" | "PM">;
}

/** The sheet carries no birthdate or gender, so the demo gives everyone the same placeholders. */
export const DEMO_ASSUMED_BIRTHDATE = "1985-06-15";

const isSession = (value: unknown): value is "AM" | "PM" => value === "AM" || value === "PM";

function readRow(value: unknown): LocalFieldRow | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (typeof row.name !== "string" || row.name.trim() === "") return null;
  if (row.role !== "member" && row.role !== "guest") return null;
  const index = typeof row.index === "number" && Number.isFinite(row.index) ? row.index : null;
  const pair = typeof row.pair === "number" && Number.isInteger(row.pair) ? row.pair : null;
  const days = Array.isArray(row.days)
    ? row.days.filter((d): d is number => Number.isInteger(d) && d > 0)
    : [];
  const sessions: Record<string, "AM" | "PM"> = {};
  if (row.sessions && typeof row.sessions === "object") {
    for (const [day, session] of Object.entries(row.sessions)) {
      if (Number.isInteger(Number(day)) && isSession(session)) sessions[day] = session;
    }
  }
  return { name: row.name.trim(), index, pair, role: row.role, days, sessions };
}

/**
 * Reads the field from the build-time variable: base64 of a JSON array of rows. Anything wrong with
 * it, or no variable at all, answers null, so a bad local file can never break the generated demo.
 */
export function readLocalField(
  raw: string | undefined = process.env.NEXT_PUBLIC_DEMO_FIELD,
): LocalFieldRow[] | null {
  if (!raw) return null;
  try {
    const bytes = Uint8Array.from(atob(raw), (c) => c.charCodeAt(0));
    const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes));
    if (!Array.isArray(parsed)) return null;
    const rows = parsed.map(readRow).filter((row): row is LocalFieldRow => row !== null);
    return rows.length > 0 ? rows : null;
  } catch {
    return null;
  }
}

/** "LASTNAME, FIRSTNAME" to "Firstname Lastname". Names the sheet does not split are kept whole. */
function splitName(sheetName: string): { first: string; last: string } {
  const title = (text: string) =>
    text
      .toLowerCase()
      .replace(
        /(^|[\s-])(\p{L})/gu,
        (_m, lead: string, letter: string) => lead + letter.toUpperCase(),
      )
      .trim();
  const comma = sheetName.indexOf(",");
  if (comma === -1) return { first: title(sheetName), last: "" };
  return {
    last: title(sheetName.slice(0, comma)),
    first: title(sheetName.slice(comma + 1)),
  };
}

export interface FieldSeedOptions {
  clubId: string;
  tournamentId: string;
  cutOffDate: string;
  now: string;
  homeCourse: string;
}

/** The players, handicap records and entries for a field. Same shapes as the generated demo seed. */
export function makeFieldSeed(
  rows: readonly LocalFieldRow[],
  options: FieldSeedOptions,
): { players: PlayerRecord[]; records: HandicapRecord[]; entries: RegistrationEntry[] } {
  const players: PlayerRecord[] = [];
  const records: HandicapRecord[] = [];
  const entries: RegistrationEntry[] = [];

  rows.forEach((row, i) => {
    const n = i + 1;
    const { first, last } = splitName(row.name);
    const fullName = last ? `${first} ${last}` : first;
    const id = `p${n}`;
    players.push({
      id,
      clubId: options.clubId,
      firstName: first,
      lastName: last || `Sample${n}`,
      nickname: null,
      name: displayName(fullName),
      fullName,
      birthdate: DEMO_ASSUMED_BIRTHDATE,
      gender: "M",
      homeCourse: options.homeCourse,
      contactNumber: null,
      email: null,
      ngapId: String(1000 + n),
      createdAt: options.now,
    });

    // A blank stays blank: the draw reads it as 0 under the event rule and says so.
    records.push({
      id: `rec-${n}`,
      clubId: options.clubId,
      playerId: id,
      index: row.index,
      effectiveDate: "2026-10-15",
      source: "demo_seed",
      uploadRef: null,
      recordedAt: options.now,
    });
    const recordList = records.filter((r) => r.playerId === id);
    const selection = selectIndexForCutOff(recordList, options.cutOffDate);

    const days = [...new Set(row.days)].sort((a, b) => a - b);
    const daySessions: Record<number, "AM" | "PM"> = {};
    for (const day of days) {
      const session = row.sessions[String(day)];
      if (session) daySessions[day] = session;
    }
    entries.push({
      id: `e-${n}`,
      clubId: options.clubId,
      tournamentId: options.tournamentId,
      playerId: id,
      role: row.role,
      teamNo: row.pair,
      sponsor: false,
      shirt: null,
      teePreferences: {},
      selectedDays: days,
      daySessions,
      dayTee: {},
      declaredWshId: null,
      declaredWshHandicap: null,
      extra: {},
      paymentStatus: "not_recorded",
      frozen: freezeIndex(selection, options.now),
      createdAt: options.now,
      source: "demo_seed",
    });
  });

  return { players, records, entries };
}
