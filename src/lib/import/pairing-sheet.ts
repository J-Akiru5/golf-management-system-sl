/**
 * Reading the organizer's manual pairing sheet.
 *
 * The sheet is one worksheet of raw cells. A TEE-OFF TIME header starts a session and every HOLE row
 * below it holds the names typed in the columns to its right. Nothing here reads a file, calls the
 * network or writes anywhere; it only turns the matrix it is given into groups and name matches.
 */

export type PairingSession = "AM" | "PM";
export type PairingSlot = "A" | "B";
export type PairingStartFormat = "shotgun";

/** One group on the sheet: the hole and slot, the names typed after it, and where it was found. */
export interface PairingGroup {
  session: PairingSession;
  /** 24-hour "HH:MM", taken from the TEE-OFF TIME header above the row. */
  teeTime: string;
  /** "shotgun" when the header said SHOTGUN, otherwise null. */
  startFormat: PairingStartFormat | null;
  hole: number;
  slot: PairingSlot;
  names: string[];
  /** 0-based index of the group row in the worksheet matrix. */
  row: number;
}

export type PairingSheetWarningCode =
  | "no_session"
  | "bad_hole"
  | "duplicate_slot"
  | "duplicate_name"
  | "group_too_large";

/** Something odd on the sheet. The data is kept; this only says what to look at. */
export interface PairingSheetWarning {
  code: PairingSheetWarningCode;
  /** 0-based index of the row that caused the warning. */
  row: number;
  message: string;
}

export interface PairingSheetOptions {
  /** A tournament setting. When omitted, no group is called too large. */
  maxGroupSize?: number;
}

export interface ParsedPairingSheet {
  groups: PairingGroup[];
  warnings: PairingSheetWarning[];
}

const TEE_OFF_TIME = /TEE-OFF TIME:\s*(\d{1,2}):(\d{2})\s*(AM|PM)/i;
const HOLE_ROW = /^HOLE\s+(\d{1,2})\s*(B)?$/i;

/** Reads a raw cell as text. Empty cells, missing cells and invalid dates become "". */
function cellText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return "";
    return value.toISOString();
  }
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  if (typeof value === "boolean") return value ? "true" : "false";
  return String(value)
    .replace(/^\uFEFF/, "")
    .trim();
}

/** Turns a 12-hour clock time into 24-hour "HH:MM". 12:15AM is "00:15", 12:30PM is "12:30". */
function to24Hour(hourText: string, minuteText: string, period: PairingSession): string {
  const hour = Number(hourText);
  let value = Number.isFinite(hour) ? hour : 0;
  if (period === "AM" && value === 12) value = 0;
  if (period === "PM" && value > 0 && value < 12) value += 12;
  return `${String(value).padStart(2, "0")}:${minuteText}`;
}

/**
 * Reads one worksheet of the pairing sheet.
 *
 * It never guesses a session for a HOLE row, never drops a row or a name without a warning, and
 * never writes anything.
 */
export function parsePairingSheet(
  rows: unknown[][],
  options: PairingSheetOptions = {},
): ParsedPairingSheet {
  const groups: PairingGroup[] = [];
  const warnings: PairingSheetWarning[] = [];
  const maxGroupSize = options.maxGroupSize;

  let session: PairingSession | null = null;
  let teeTime = "";
  let startFormat: PairingStartFormat | null = null;
  let slotRows = new Map<string, number>();
  let nameRows = new Map<string, number>();

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index] ?? [];

    let headerFound = false;
    for (const cell of row) {
      const text = cellText(cell);
      const header = TEE_OFF_TIME.exec(text);
      if (!header) continue;
      const period = (header[3] ?? "AM").toUpperCase() === "PM" ? "PM" : "AM";
      session = period;
      teeTime = to24Hour(header[1] ?? "0", header[2] ?? "00", period);
      startFormat = /SHOTGUN/i.test(text) ? "shotgun" : null;
      // A new session starts with its own duplicate checks.
      slotRows = new Map();
      nameRows = new Map();
      headerFound = true;
      break;
    }
    if (headerFound) continue;

    const holeRow = HOLE_ROW.exec(cellText(row[0]));
    if (!holeRow) continue;

    const names = row
      .slice(1)
      .map(cellText)
      .filter((name) => name !== "");
    // An empty slot is simply skipped.
    if (names.length === 0) continue;

    if (!session) {
      warnings.push({
        code: "no_session",
        row: index,
        message: `Row ${index + 1} has names but no TEE-OFF TIME header comes before it.`,
      });
      continue;
    }

    const hole = Number(holeRow[1] ?? "");
    const slot: PairingSlot = (holeRow[2] ?? "").toUpperCase() === "B" ? "B" : "A";
    if (!Number.isInteger(hole) || hole < 1 || hole > 18) {
      warnings.push({
        code: "bad_hole",
        row: index,
        message: `Row ${index + 1} says hole ${holeRow[1] ?? ""}; only holes 1 to 18 are read.`,
      });
      continue;
    }

    const slotKey = `${hole}${slot}`;
    const earlierSlotRow = slotRows.get(slotKey);
    if (earlierSlotRow === undefined) {
      slotRows.set(slotKey, index);
    } else {
      warnings.push({
        code: "duplicate_slot",
        row: index,
        message: `Hole ${hole}${slot} appears twice in the ${session} session; row ${earlierSlotRow + 1} has the first group.`,
      });
    }

    for (const name of names) {
      const key = normalizeSheetName(name);
      if (key === "") continue;
      const earlierNameRow = nameRows.get(key);
      if (earlierNameRow === undefined) {
        nameRows.set(key, index);
      } else {
        warnings.push({
          code: "duplicate_name",
          row: index,
          message: `"${name}" repeats a name already on row ${earlierNameRow + 1} in the ${session} session.`,
        });
      }
    }

    if (
      maxGroupSize !== undefined &&
      Number.isFinite(maxGroupSize) &&
      names.length > maxGroupSize
    ) {
      warnings.push({
        code: "group_too_large",
        row: index,
        message: `Hole ${hole}${slot} has ${names.length} names but the limit is ${maxGroupSize}.`,
      });
    }

    groups.push({ session, teeTime, startFormat, hole, slot, names, row: index });
  }

  return { groups, warnings };
}

const SUFFIX_WORDS = new Set(["SR", "JR", "II", "III"]);

/**
 * Reduces a typed name to the words used for comparison: upper case, no accents, no SR/JR/II/III
 * suffixes, letters only, words sorted. It never decides who a name is and never writes anything.
 */
export function normalizeSheetName(name: string): string {
  const words = name
    .replace(/\uFFFD/g, "N")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^\p{L}]+/gu, " ")
    .split(/\s+/)
    .filter((word) => word !== "" && !SUFFIX_WORDS.has(word));
  return words.sort().join(" ");
}

export interface PairingCandidate {
  registrationId: string;
  fullName: string;
}

export type PairingMatchStatus = "matched" | "fuzzy" | "ambiguous" | "not_found";

/** One typed name and what the roster could say about it. */
export interface PairingNameMatch {
  groupIndex: number;
  nameIndex: number;
  /** The name exactly as typed on the sheet. */
  raw: string;
  status: PairingMatchStatus;
  /** Set only for a matched name or a single fuzzy suggestion. */
  registrationId?: string;
  /** The registration name behind a fuzzy suggestion, so a person can confirm it. */
  candidateName?: string;
  /** The candidates that tied. No registrationId is set while a tie stands. */
  alternatives?: PairingCandidate[];
  /** True when a person must confirm the suggestion before it is used. */
  needsConfirmation: boolean;
}

export type PairingMatchSummary = Record<PairingMatchStatus, number>;

export interface PairingMatchResult {
  matches: PairingNameMatch[];
  /** Registered players that no name matched or was suggested for. */
  unlisted: PairingCandidate[];
  summary: PairingMatchSummary;
}

/** Levenshtein distance, stopped once it is larger than `max`. */
function levenshteinWithin(a: string, b: string, max: number): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;

  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    const current: number[] = [i];
    let rowBest = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const value = Math.min(
        (previous[j] ?? 0) + 1,
        (current[j - 1] ?? 0) + 1,
        (previous[j - 1] ?? 0) + cost,
      );
      current[j] = value;
      if (value < rowBest) rowBest = value;
    }
    if (rowBest > max) return max + 1;
    previous = current;
  }
  return previous[b.length] ?? max + 1;
}

function asCandidate(candidate: PairingCandidate): PairingCandidate {
  return { registrationId: candidate.registrationId, fullName: candidate.fullName };
}

/** Counts the letters in a normalised name, ignoring the spaces between words. */
function letterCount(key: string): number {
  return key.replace(/\s/g, "").length;
}

/**
 * Matches every typed name to a registered player.
 *
 * Exact matches are resolved first, then fuzzy ones. A fuzzy hit is only a suggestion,
 * a tie is left for a person, and an unmatched name stays not_found. It never guesses an identity
 * and never writes anything.
 */
export function matchPairingNames(
  groups: PairingGroup[],
  candidates: PairingCandidate[],
): PairingMatchResult {
  const roster = candidates.map((candidate) => ({
    registrationId: candidate.registrationId,
    fullName: candidate.fullName,
    key: normalizeSheetName(candidate.fullName),
  }));
  const used = new Set<string>();
  const matches: PairingNameMatch[] = [];
  const fuzzyQueue: number[] = [];

  for (let groupIndex = 0; groupIndex < groups.length; groupIndex += 1) {
    const group = groups[groupIndex];
    if (!group) continue;
    for (let nameIndex = 0; nameIndex < group.names.length; nameIndex += 1) {
      const raw = group.names[nameIndex];
      if (raw === undefined) continue;
      const key = normalizeSheetName(raw);
      const exact = roster.filter(
        (candidate) => !used.has(candidate.registrationId) && candidate.key === key,
      );

      if (exact.length === 1) {
        const pick = exact[0];
        if (pick) {
          used.add(pick.registrationId);
          matches.push({
            groupIndex,
            nameIndex,
            raw,
            status: "matched",
            registrationId: pick.registrationId,
            needsConfirmation: false,
          });
          continue;
        }
      }

      if (exact.length > 1) {
        matches.push({
          groupIndex,
          nameIndex,
          raw,
          status: "ambiguous",
          alternatives: exact.map(asCandidate),
          needsConfirmation: true,
        });
        continue;
      }

      // Remember where this entry sits so the fuzzy pass can fill it in.
      fuzzyQueue.push(matches.length);
      matches.push({ groupIndex, nameIndex, raw, status: "not_found", needsConfirmation: false });
    }
  }

  for (const index of fuzzyQueue) {
    const entry = matches[index];
    if (!entry) continue;
    const key = normalizeSheetName(entry.raw);
    if (letterCount(key) < 6) continue;

    const close = roster.filter(
      (candidate) =>
        !used.has(candidate.registrationId) && levenshteinWithin(key, candidate.key, 2) <= 2,
    );

    if (close.length === 1) {
      const pick = close[0];
      if (!pick) continue;
      used.add(pick.registrationId);
      entry.status = "fuzzy";
      entry.registrationId = pick.registrationId;
      entry.candidateName = pick.fullName;
      entry.needsConfirmation = true;
      continue;
    }

    if (close.length > 1) {
      entry.status = "ambiguous";
      entry.alternatives = close.map(asCandidate);
      entry.needsConfirmation = true;
    }
  }

  const summary: PairingMatchSummary = {
    matched: 0,
    fuzzy: 0,
    ambiguous: 0,
    not_found: 0,
  };
  for (const match of matches) summary[match.status] += 1;

  return {
    matches,
    unlisted: roster.filter((candidate) => !used.has(candidate.registrationId)).map(asCandidate),
    summary,
  };
}
