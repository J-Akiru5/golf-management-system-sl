import { DEFAULT_STROKE_LIMITS } from "../validation";
import {
  SCORECARD_IMPORT_FORMAT,
  SCORECARD_IMPORT_VERSION,
  type ScorecardImportCard,
  type ScorecardImportFile,
  type ScorecardImportHoles,
  type ScorecardImportProblem,
  type ScorecardImportSkipped,
} from "./types";

const CARD_KEY = /^[A-Za-z0-9._:-]+$/;
const ISO_WITH_ZONE = /(Z|[+-]\d{2}:\d{2})$/;

export interface ScorecardImportParseResult {
  /**
   * The file with its structurally valid cards. Null when a top-level field is wrong, because a
   * partial file cannot be trusted to name the right round or event.
   */
  file: ScorecardImportFile | null;
  /** Every problem found, including the cards that were left out of `file.cards`. */
  problems: ScorecardImportProblem[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(
  value: unknown,
  path: string,
  problems: ScorecardImportProblem[],
  options: { required: boolean; max: number; label: string },
): string | null {
  if (value === null || value === undefined) {
    if (options.required) problems.push({ path, message: `${options.label} is required.` });
    return null;
  }
  if (typeof value !== "string") {
    problems.push({ path, message: `${options.label} must be text.` });
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    if (options.required) problems.push({ path, message: `${options.label} is required.` });
    return null;
  }
  if (trimmed.length > options.max) {
    problems.push({
      path,
      message: `${options.label} is longer than ${options.max} characters.`,
    });
    return null;
  }
  return trimmed;
}

function textOrNull(
  value: unknown,
  path: string,
  problems: ScorecardImportProblem[],
  options: { max: number; label: string },
): string | null {
  return text(value, path, problems, { ...options, required: false });
}

function identifier(
  value: unknown,
  path: string,
  problems: ScorecardImportProblem[],
  options: { required: boolean; label: string },
): string | null {
  return text(value, path, problems, {
    required: options.required,
    max: 120,
    label: options.label,
  });
}

function wholeNumber(
  value: unknown,
  path: string,
  problems: ScorecardImportProblem[],
  options: { min: number; max: number; label: string },
): number | null {
  if (
    value === null ||
    value === undefined ||
    value === "" ||
    typeof value === "boolean" ||
    Array.isArray(value) ||
    (typeof value !== "number" && typeof value !== "string")
  ) {
    problems.push({
      path,
      message: `${options.label} must be a whole number from ${options.min} to ${options.max}.`,
    });
    return null;
  }
  const number = typeof value === "number" ? value : Number(value);
  if (
    !Number.isFinite(number) ||
    !Number.isInteger(number) ||
    number < options.min ||
    number > options.max
  ) {
    problems.push({
      path,
      message: `${options.label} must be a whole number from ${options.min} to ${options.max}.`,
    });
    return null;
  }
  return number;
}

function wholeNumberOrNull(
  value: unknown,
  path: string,
  problems: ScorecardImportProblem[],
  options: { min: number; max: number; label: string },
): number | null {
  if (value === null || value === undefined || value === "") return null;
  return wholeNumber(value, path, problems, options);
}

function timestamp(
  value: unknown,
  path: string,
  problems: ScorecardImportProblem[],
): string | null {
  const raw = text(value, path, problems, {
    required: true,
    max: 40,
    label: "Extracted at",
  });
  if (raw === null) return null;
  if (!ISO_WITH_ZONE.test(raw) || Number.isNaN(Date.parse(raw))) {
    problems.push({
      path,
      message:
        "Extracted at must be an ISO date and time with a time zone, for example 2026-11-12T18:40:00+08:00.",
    });
    return null;
  }
  return raw;
}

function readHoles(
  value: unknown,
  path: string,
  problems: ScorecardImportProblem[],
): ScorecardImportHoles | null {
  if (!isRecord(value)) {
    problems.push({ path, message: "Holes must be an object keyed from 1 to 18." });
    return null;
  }

  for (const key of Object.keys(value)) {
    const number = Number(key);
    if (!Number.isInteger(number) || number < 1 || number > 18 || String(number) !== key) {
      problems.push({
        path: `${path}.${key}`,
        message: `"${key}" is not a hole number from 1 to 18.`,
      });
    }
  }

  const holes: ScorecardImportHoles = {};
  const missing: number[] = [];
  const empty: number[] = [];

  for (let number = 1; number <= 18; number += 1) {
    const key = String(number);
    if (!(key in value)) {
      missing.push(number);
      continue;
    }
    const raw = value[key];
    if (raw === null || raw === undefined || raw === "") {
      empty.push(number);
      continue;
    }
    const strokes = wholeNumber(raw, `${path}.${key}`, problems, {
      min: DEFAULT_STROKE_LIMITS.min,
      max: DEFAULT_STROKE_LIMITS.max,
      label: `Hole ${number}`,
    });
    if (strokes !== null) holes[key] = strokes;
  }

  if (missing.length > 0) {
    problems.push({
      path,
      message:
        missing.length === 1
          ? `Hole ${missing[0]} is missing.`
          : `Holes ${missing.join(", ")} are missing.`,
    });
  }
  if (empty.length > 0) {
    problems.push({
      path,
      message:
        empty.length === 1
          ? `Hole ${empty[0]} is empty. Fill every hole or move the card to skipped.`
          : `Holes ${empty.join(", ")} are empty. Fill every hole or move the card to skipped.`,
    });
  }

  return Object.keys(holes).length === 18 ? holes : null;
}

function readCard(
  value: unknown,
  path: string,
): { card: ScorecardImportCard | null; problems: ScorecardImportProblem[] } {
  const problems: ScorecardImportProblem[] = [];
  if (!isRecord(value)) {
    return {
      card: null,
      problems: [{ path, message: "Each card must be an object." }],
    };
  }

  const cardKey = text(value.cardKey, `${path}.cardKey`, problems, {
    required: true,
    max: 120,
    label: "Card key",
  });
  if (cardKey !== null && !CARD_KEY.test(cardKey)) {
    problems.push({
      path: `${path}.cardKey`,
      message: "Card key may use letters, numbers, dot, colon, underscore and hyphen only.",
    });
  }

  const groupNumber = wholeNumberOrNull(value.groupNumber, `${path}.groupNumber`, problems, {
    min: 1,
    max: 999,
    label: "Group number",
  });

  const playerId = identifier(value.playerId, `${path}.playerId`, problems, {
    required: false,
    label: "Player id",
  });
  const playerName = textOrNull(value.playerName, `${path}.playerName`, problems, {
    max: 120,
    label: "Player name",
  });
  if (playerId === null && playerName === null) {
    problems.push({
      path,
      message: "A card needs a player id, a player name, or both.",
    });
  }

  const markerPlayerId = identifier(value.markerPlayerId, `${path}.markerPlayerId`, problems, {
    required: false,
    label: "Marker player id",
  });
  const markerName = textOrNull(value.markerName, `${path}.markerName`, problems, {
    max: 120,
    label: "Marker name",
  });
  if (markerPlayerId === null && markerName === null) {
    problems.push({
      path,
      message: "A card needs a marker player id, a marker name, or both.",
    });
  }

  const writtenTotal = wholeNumberOrNull(value.writtenTotal, `${path}.writtenTotal`, problems, {
    min: 1,
    max: 300,
    label: "Written total",
  });

  const holes = readHoles(value.holes, `${path}.holes`, problems);

  if (writtenTotal !== null && holes !== null) {
    const sum = Object.values(holes).reduce((total, strokes) => total + strokes, 0);
    if (sum !== writtenTotal) {
      problems.push({
        path: `${path}.writtenTotal`,
        message: `The written total is ${writtenTotal}, but the holes add up to ${sum}. Set the total to null and explain the paper total in notes if the card itself is wrong.`,
      });
    }
  }

  const notes = textOrNull(value.notes, `${path}.notes`, problems, {
    max: 2000,
    label: "Notes",
  });

  if (
    problems.length > 0 ||
    cardKey === null ||
    holes === null ||
    (playerId === null && playerName === null) ||
    (markerPlayerId === null && markerName === null)
  ) {
    return { card: null, problems };
  }

  return {
    card: {
      cardKey,
      groupNumber,
      playerId,
      playerName,
      markerPlayerId,
      markerName,
      writtenTotal,
      holes,
      notes,
    },
    problems,
  };
}

function readSkipped(
  value: unknown,
  path: string,
  problems: ScorecardImportProblem[],
): ScorecardImportSkipped[] {
  if (value === null || value === undefined) return [];
  if (!Array.isArray(value)) {
    problems.push({ path, message: "Skipped must be an array." });
    return [];
  }

  const skipped: ScorecardImportSkipped[] = [];
  for (const [index, candidate] of value.entries()) {
    const candidatePath = `${path}[${index}]`;
    if (!isRecord(candidate)) {
      problems.push({ path: candidatePath, message: "Each skipped card must be an object." });
      continue;
    }
    const local: ScorecardImportProblem[] = [];
    const groupNumber = wholeNumberOrNull(
      candidate.groupNumber,
      `${candidatePath}.groupNumber`,
      local,
      { min: 1, max: 999, label: "Group number" },
    );
    const playerName = text(candidate.playerName, `${candidatePath}.playerName`, local, {
      required: true,
      max: 120,
      label: "Player name",
    });
    const reason = text(candidate.reason, `${candidatePath}.reason`, local, {
      required: true,
      max: 500,
      label: "Reason",
    });
    if (local.length > 0 || playerName === null || reason === null) {
      problems.push(...local);
      continue;
    }
    skipped.push({ groupNumber, playerName, reason });
  }
  return skipped;
}

/**
 * Parses an untrusted JSON value into the transcription contract. Structural problems never stop
 * a different card in the same file from being usable: every valid card is returned and every
 * problem names the path that caused it.
 */
export function parseScorecardImport(value: unknown): ScorecardImportParseResult {
  const problems: ScorecardImportProblem[] = [];

  if (!isRecord(value)) {
    return {
      file: null,
      problems: [{ path: "", message: "The file must contain a JSON object." }],
    };
  }

  if (value.format !== SCORECARD_IMPORT_FORMAT) {
    problems.push({
      path: "format",
      message: `Format must be "${SCORECARD_IMPORT_FORMAT}".`,
    });
  }
  if (value.version !== SCORECARD_IMPORT_VERSION) {
    problems.push({ path: "version", message: `Version must be ${SCORECARD_IMPORT_VERSION}.` });
  }

  const roundId = identifier(value.roundId, "roundId", problems, {
    required: true,
    label: "Round id",
  });
  const tournamentId = identifier(value.tournamentId, "tournamentId", problems, {
    required: true,
    label: "Tournament id",
  });
  const dayNumber = wholeNumber(value.dayNumber, "dayNumber", problems, {
    min: 1,
    max: 4,
    label: "Day number",
  });
  const extractedBy = text(value.extractedBy, "extractedBy", problems, {
    required: true,
    max: 120,
    label: "Extracted by",
  });
  const extractedAt = timestamp(value.extractedAt, "extractedAt", problems);

  const cards: ScorecardImportCard[] = [];
  if (!Array.isArray(value.cards) || value.cards.length === 0) {
    problems.push({ path: "cards", message: "Cards must be a non-empty array." });
  } else {
    const seen = new Set<string>();
    for (const [index, candidate] of value.cards.entries()) {
      const parsed = readCard(candidate, `cards[${index}]`);
      problems.push(...parsed.problems);
      if (!parsed.card) continue;
      if (seen.has(parsed.card.cardKey)) {
        problems.push({
          path: `cards[${index}].cardKey`,
          message: `Card key "${parsed.card.cardKey}" is used more than once.`,
        });
        continue;
      }
      seen.add(parsed.card.cardKey);
      cards.push(parsed.card);
    }
  }

  const skipped = readSkipped(value.skipped, "skipped", problems);

  if (
    problems.length > 0 &&
    (value.format !== SCORECARD_IMPORT_FORMAT ||
      value.version !== SCORECARD_IMPORT_VERSION ||
      roundId === null ||
      tournamentId === null ||
      dayNumber === null ||
      extractedBy === null ||
      extractedAt === null)
  ) {
    return { file: null, problems };
  }

  if (
    roundId === null ||
    tournamentId === null ||
    dayNumber === null ||
    extractedBy === null ||
    extractedAt === null
  ) {
    return { file: null, problems };
  }

  return {
    file: {
      format: SCORECARD_IMPORT_FORMAT,
      version: SCORECARD_IMPORT_VERSION,
      roundId,
      tournamentId,
      dayNumber,
      extractedBy,
      extractedAt,
      cards,
      skipped,
    },
    problems,
  };
}
