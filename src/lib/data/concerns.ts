/**
 * A player's concern: the contract shared by the tick-box feedback form, the chatbot and the desk.
 *
 * The list is the organizer's (Ma'am Mary Ann, 20 Nov 2026): the major concerns, as tick boxes
 * because seniors do not use drop-downs. A note may tick several. Three kinds carry a follow-up:
 * Score asks for the hole number, Tee off asks for the tee colour (radio), Others asks for a line.
 *
 * Pure module. The database function validates the same shape (`public.submit_feedback`, the
 * `p_details` argument, migration 20261122000000), so a note the form accepts is one the database
 * accepts. Change it only through the orchestrator.
 */

export const CONCERN_KINDS = [
  "inquiry",
  "name_typo",
  "schedule",
  "handicap",
  "score",
  "tee_off",
  "other",
] as const;
export type ConcernKind = (typeof CONCERN_KINDS)[number];

export const CONCERN_LABELS: Record<ConcernKind, string> = {
  inquiry: "Inquiry",
  name_typo: "Name typo",
  schedule: "Schedule",
  handicap: "Handicap",
  score: "Score",
  tee_off: "Tee off",
  other: "Others",
};

export const TEE_COLOURS = ["blue", "silver", "white", "red"] as const;
export type TeeColour = (typeof TEE_COLOURS)[number];

export const TEE_COLOUR_LABELS: Record<TeeColour, string> = {
  blue: "Blue",
  silver: "Silver",
  white: "White",
  red: "Red",
};

/** Where the note came from. The chatbot also stores its transcript. */
export const CONCERN_SOURCES = ["form", "chat"] as const;
export type ConcernSource = (typeof CONCERN_SOURCES)[number];

export const CONCERN_TEXT_MAX = 200;
export const CONCERN_TRANSCRIPT_MAX_TURNS = 40;
export const CONCERN_TRANSCRIPT_TURN_MAX = 2000;
export const HOLE_MIN = 1;
export const HOLE_MAX = 18;

export type ChatTurn = { role: "user" | "assistant"; content: string };

/**
 * The structured part of a concern, stored as `public_feedback.details` (jsonb). Every field but
 * `concerns` and `source` is optional: the form and the chatbot fill what the player gave.
 */
export type ConcernDetails = {
  concerns: ConcernKind[];
  /** Required when `concerns` includes "score". */
  holeNo?: number;
  /** Required when `concerns` includes "tee_off". */
  teeColour?: TeeColour;
  /** Required when `concerns` includes "other". */
  otherText?: string;
  playerName?: string;
  /** As the player wrote it, for example "12.4" or "+1.2". Never parsed into a rating here. */
  handicap?: string;
  /** As the player wrote it, for example "Day 2, 7:12 AM". */
  schedule?: string;
  source: ConcernSource;
  /** Chat only: the conversation, capped. */
  transcript?: ChatTurn[];
};

export type ConcernProblem =
  | "no_concern"
  | "unknown_concern"
  | "hole_required"
  | "hole_out_of_range"
  | "tee_required"
  | "tee_unknown"
  | "other_required"
  | "too_long"
  | "bad_source"
  | "bad_transcript";

function cleanText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const text = value.trim().replace(/\s+/g, " ");
  return text.length > 0 ? text : undefined;
}

/**
 * Checks and normalises a concern. Returns the cleaned details, or the first problem found. Text is
 * trimmed and collapsed; duplicates in `concerns` are dropped; follow-up fields for unticked kinds
 * are removed so the stored note says only what was asked.
 */
export function normaliseConcern(
  input: unknown,
): { ok: true; details: ConcernDetails } | { ok: false; problem: ConcernProblem } {
  if (typeof input !== "object" || input === null) return { ok: false, problem: "no_concern" };
  const raw = input as Record<string, unknown>;

  const list = Array.isArray(raw.concerns) ? raw.concerns : [];
  const concerns: ConcernKind[] = [];
  for (const item of list) {
    if (!(CONCERN_KINDS as readonly unknown[]).includes(item)) {
      return { ok: false, problem: "unknown_concern" };
    }
    if (!concerns.includes(item as ConcernKind)) concerns.push(item as ConcernKind);
  }
  if (concerns.length === 0) return { ok: false, problem: "no_concern" };

  const source = raw.source;
  if (!(CONCERN_SOURCES as readonly unknown[]).includes(source)) {
    return { ok: false, problem: "bad_source" };
  }

  const details: ConcernDetails = { concerns, source: source as ConcernSource };

  if (concerns.includes("score")) {
    const hole = typeof raw.holeNo === "string" ? Number(raw.holeNo) : raw.holeNo;
    if (hole === undefined || hole === null || hole === "") {
      return { ok: false, problem: "hole_required" };
    }
    if (typeof hole !== "number" || !Number.isInteger(hole) || hole < HOLE_MIN || hole > HOLE_MAX) {
      return { ok: false, problem: "hole_out_of_range" };
    }
    details.holeNo = hole;
  }

  if (concerns.includes("tee_off")) {
    if (raw.teeColour === undefined || raw.teeColour === null || raw.teeColour === "") {
      return { ok: false, problem: "tee_required" };
    }
    if (!(TEE_COLOURS as readonly unknown[]).includes(raw.teeColour)) {
      return { ok: false, problem: "tee_unknown" };
    }
    details.teeColour = raw.teeColour as TeeColour;
  }

  if (concerns.includes("other")) {
    const other = cleanText(raw.otherText);
    if (!other) return { ok: false, problem: "other_required" };
    if (other.length > CONCERN_TEXT_MAX) return { ok: false, problem: "too_long" };
    details.otherText = other;
  }

  for (const key of ["playerName", "handicap", "schedule"] as const) {
    const value = cleanText(raw[key]);
    if (value === undefined) continue;
    if (value.length > CONCERN_TEXT_MAX) return { ok: false, problem: "too_long" };
    details[key] = value;
  }

  if (raw.transcript !== undefined) {
    if (details.source !== "chat" || !Array.isArray(raw.transcript)) {
      return { ok: false, problem: "bad_transcript" };
    }
    const turns: ChatTurn[] = [];
    for (const turn of raw.transcript.slice(-CONCERN_TRANSCRIPT_MAX_TURNS)) {
      const t = turn as Record<string, unknown>;
      if ((t.role !== "user" && t.role !== "assistant") || typeof t.content !== "string") {
        return { ok: false, problem: "bad_transcript" };
      }
      turns.push({ role: t.role, content: t.content.slice(0, CONCERN_TRANSCRIPT_TURN_MAX) });
    }
    details.transcript = turns;
  }

  return { ok: true, details };
}

/** One readable line for the inbox and the email alert, for example "Score (hole 7), Tee off (White)". */
export function concernSummary(
  details: Pick<ConcernDetails, "concerns" | "holeNo" | "teeColour" | "otherText">,
): string {
  return details.concerns
    .map((kind) => {
      if (kind === "score" && details.holeNo) return `Score (hole ${details.holeNo})`;
      if (kind === "tee_off" && details.teeColour) {
        return `Tee off (${TEE_COLOUR_LABELS[details.teeColour]})`;
      }
      if (kind === "other" && details.otherText) return `Others: ${details.otherText}`;
      return CONCERN_LABELS[kind];
    })
    .join(", ");
}
