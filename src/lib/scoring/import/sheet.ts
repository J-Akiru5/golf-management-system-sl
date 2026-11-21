import { searchKey } from "@/lib/names";
import { normalizeHole } from "@/lib/scorecards/document";
import { type EventCardMarker, pickDeskMarker, teeLetter, teeLetterName } from "../event-card";
import {
  cardBoxNote,
  type EventScoringRules,
  eventPlayingHandicap,
  readCardBox,
} from "../event-rules";
import { checkCardSubmission } from "../submission";
import type { CardEntry, Scorecard, StrokeLimits, TeeRatings } from "../types";

/**
 * The scoring sheet export, as a bridge into `/scores`.
 *
 * The standalone sheet at `/scorecard/` exports its whole working state as JSON with
 * `format: "bamboo-scores-edit"`. This module reads that file and works out, card by card, what
 * importing it would do. It is separate from the transcription format in this folder, which needs
 * player ids and markers the sheet does not have.
 *
 * Pure: no database, clock or network. Nothing is guessed. A card is matched to a player by exact
 * name (case, accents, punctuation and word order ignored) or it is listed as unmatched. A blank
 * hole, a player with no tee, or a written total that does not add up blocks that card by name. The
 * HDCP box is kept as a note: the WHS playing handicap comes from the registration index and the tee
 * written on the card. The import save still scores on the registration tee, so a card whose tee
 * differs from the registration is blocked with the registration tee named as the fix, rather than
 * imported on a tee it was not played from.
 */

export const SHEET_EXPORT_FORMAT = "bamboo-scores-edit";
export const SHEET_EXPORT_VERSION = 1;

export interface SheetCard {
  id: string;
  name: string;
  group: string;
  tee: string;
  /** The HDCP box as the sheet holds it, for example "16.7". */
  hdcp: string;
  /** The total written on the paper card, as text. */
  written: string;
  /** The desk has checked this card against the paper. */
  verified: boolean;
  cls: string;
  note: string;
  /** Eighteen cells: "" blank, "X" pick-up, or a score as text. */
  holes: string[];
}

export interface SheetExport {
  slug: string;
  label: string;
  exportedAt: string;
  /**
   * The sheet's own handicap setting: "written" showed the HDCP box, "whs" converted it. The import
   * keeps the scores and works the handicap out itself, so either setting reads the same.
   */
  mode: string;
  cards: SheetCard[];
}

export interface SheetParseResult {
  /** Null when the file is not a sheet export at all. */
  file: SheetExport | null;
  /** Everything wrong, including the cards left out of `file.cards`. */
  problems: string[];
  /** How many cards the raw file listed. */
  cardCount: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asText(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

export function parseSheetExport(value: unknown): SheetParseResult {
  if (!isRecord(value)) {
    return { file: null, problems: ["The file is not a sheet export."], cardCount: 0 };
  }
  if (value.format !== SHEET_EXPORT_FORMAT) {
    return {
      file: null,
      problems: [
        `The file is not a sheet export: its format is ${
          typeof value.format === "string" ? `"${value.format}"` : "missing"
        }, not "${SHEET_EXPORT_FORMAT}".`,
      ],
      cardCount: 0,
    };
  }
  if (value.version !== SHEET_EXPORT_VERSION) {
    return {
      file: null,
      problems: [`The sheet export version must be ${SHEET_EXPORT_VERSION}.`],
      cardCount: 0,
    };
  }
  if (!Array.isArray(value.cards) || value.cards.length === 0) {
    return { file: null, problems: ["The sheet export has no cards."], cardCount: 0 };
  }

  const problems: string[] = [];
  const cards: SheetCard[] = [];
  const seen = new Set<string>();
  for (const [index, raw] of value.cards.entries()) {
    const where = `Card ${index + 1}`;
    if (!isRecord(raw)) {
      problems.push(`${where} is not an object, so it was left out.`);
      continue;
    }
    const id = asText(raw.id);
    const name = asText(raw.name);
    const label = name ? `${where} (${name})` : where;
    if (!id) {
      problems.push(`${label} has no id, so it was left out.`);
      continue;
    }
    if (seen.has(id)) {
      problems.push(`${label} repeats the card id ${id}, so the second one was left out.`);
      continue;
    }
    if (!Array.isArray(raw.holes) || raw.holes.length !== 18) {
      problems.push(`${label} must have 18 holes, so it was left out.`);
      continue;
    }
    const holes: string[] = [];
    let unreadable = 0;
    for (const [holeIndex, cell] of raw.holes.entries()) {
      const text = normalizeHole(cell);
      if (text === null) {
        problems.push(
          `${label}, hole ${holeIndex + 1} is not a score from 1 to 20 or X, so the card was left out.`,
        );
        unreadable += 1;
        break;
      }
      holes.push(text);
    }
    if (unreadable > 0) continue;

    seen.add(id);
    cards.push({
      id,
      name,
      group: asText(raw.group),
      tee: asText(raw.tee),
      hdcp: asText(raw.hdcp),
      written: asText(raw.written),
      verified: raw.verified === true,
      cls: asText(raw.cls),
      note: asText(raw.note),
      holes,
    });
  }

  return {
    file: {
      slug: asText(value.slug) || "scorecard",
      label: asText(value.label),
      exportedAt: asText(value.exportedAt),
      mode: asText(value.mode) || "written",
      cards,
    },
    problems,
    cardCount: value.cards.length,
  };
}

export interface SheetRosterPlayer {
  playerId: string;
  playerName: string;
  /** The registration's frozen index, when the caller loaded it. */
  frozenIndex?: number | null;
  /** The tee on the registration, when the caller loaded it. Null means there is none. */
  tee?: TeeRatings | null;
}

export interface ResolvedSheetCard {
  sheetCardId: string;
  name: string;
  playerId: string;
  playerName: string;
  marker: EventCardMarker;
  entries: CardEntry[];
  /** The written total, or null when the sheet has none. */
  writtenTotal: number | null;
  /** The HDCP box as typed on the sheet. A note only: the WHS figure decides the handicap. */
  cardHandicap: string;
  /** The WHS playing handicap the card will be saved with, or null when it cannot be worked out. */
  playingHandicap: number | null;
  /** The HDCP box beside the WHS number when the two differ, else null. */
  cardNote: string | null;
  /** The sheet marks the card verified, so it is approved as well as saved. */
  approve: boolean;
  pickups: number;
  gross: number;
  group: string;
  note: string;
  captureKey: string;
  /** What lets the desk trace the card back to the sheet. */
  trace: { sheetCardId: string; slug: string; exportedAt: string; group: string; tee: string };
}

export interface UnmatchedSheetCard {
  card: SheetCard;
  reason: string;
}

export interface BlockedSheetCard {
  card: SheetCard;
  playerName: string | null;
  reasons: string[];
}

export interface SheetImportPlan {
  /** Will be saved: new, or already in but still waiting for the approval the sheet gives it. */
  ready: ResolvedSheetCard[];
  /** Identical to a card already in, and nothing left to do. */
  alreadyIn: ResolvedSheetCard[];
  /** No single player in the round carries this name. Nothing was guessed. */
  unmatched: UnmatchedSheetCard[];
  blocked: BlockedSheetCard[];
  /** Whole-file problems. When there is one, nothing may be written. */
  fileProblems: string[];
}

export interface ResolveSheetImportInput {
  file: SheetExport;
  roundId: string;
  rules: EventScoringRules;
  strokeLimits: StrokeLimits;
  holes: readonly { number: number }[];
  players: readonly SheetRosterPlayer[];
  cards: readonly Scorecard[];
  /** The round's tee, used when the caller did not load the player's own tee. */
  tee: TeeRatings;
}

/** Name, accents, case, punctuation and word order ignored: `ADORIO, RONNEL` is `Ronnel Adorio`. */
export function sheetNameKey(name: string): string {
  return searchKey(name).split(" ").filter(Boolean).sort().join(" ");
}

export function sheetCaptureKey(roundId: string, slug: string, sheetCardId: string): string {
  return `sheet:${roundId}:${slug}:${sheetCardId}`;
}

/**
 * Why a card cannot be imported on the tee it was played from. The import save works the playing
 * handicap out from the registration index and tee, so a card whose own tee differs would be scored
 * on the wrong tee (finding T3). The fix is the registration tee, which also makes the draw and the
 * printed card agree. A card tee with no rating is not guessed at (finding T7).
 */
function cardTeeProblem(
  cardTee: string,
  tee: TeeRatings | null | undefined,
  fromRegistration: boolean,
): string | null {
  const written = cardTee.trim();
  if (written === "") return null;

  const letter = teeLetter(written);
  if (!letter) {
    return `The tee on the card ("${written}") is not one of B, W, L or S. Check the card, set the registration tee to the tee written on it, then import it again.`;
  }

  const registrationLetter = tee ? teeLetter(tee.name) || teeLetter(tee.id) : "";
  if (registrationLetter === letter) return null;

  const onFile = tee?.name
    ? `${fromRegistration ? "the registration tee is" : "the round's tee is"} ${tee.name}`
    : "the registration has no tee";
  const name = written.length > 1 ? written : teeLetterName(letter);
  return `The card says ${name} (${letter}), but ${onFile}. Set the registration tee to ${name} in the field list, then import the card again.`;
}

export function resolveSheetImport(input: ResolveSheetImportInput): SheetImportPlan {
  const plan: SheetImportPlan = {
    ready: [],
    alreadyIn: [],
    unmatched: [],
    blocked: [],
    fileProblems: [],
  };

  // The sheet's own handicap setting no longer matters: this import keeps the hole scores and works
  // the playing handicap out from the registration index and tee under the event rule. A sheet
  // exported with either setting is read the same way.
  if (input.holes.length !== 18) {
    plan.fileProblems.push(
      `The sheet has 18 holes per card, but this round has ${input.holes.length}.`,
    );
    return plan;
  }

  const byName = new Map<string, SheetRosterPlayer[]>();
  for (const player of input.players) {
    const key = sheetNameKey(player.playerName);
    byName.set(key, [...(byName.get(key) ?? []), player]);
  }

  const claimed = new Map<string, string>();
  for (const card of input.file.cards) {
    const key = sheetNameKey(card.name);
    const matches = key ? (byName.get(key) ?? []) : [];
    if (matches.length === 0) {
      plan.unmatched.push({
        card,
        reason: card.name
          ? "No player in this day's round has that name."
          : "The card has no name.",
      });
      continue;
    }
    if (matches.length > 1) {
      plan.unmatched.push({
        card,
        reason: "More than one player in this day's round has that name.",
      });
      continue;
    }
    const player = matches[0] as SheetRosterPlayer;
    const reasons: string[] = [];

    const earlier = claimed.get(player.playerId);
    if (earlier !== undefined) {
      plan.blocked.push({
        card,
        playerName: player.playerName,
        reasons: [`The file already has a card for ${player.playerName} (card ${earlier}).`],
      });
      continue;
    }
    claimed.set(player.playerId, card.id);

    const entries: CardEntry[] = [];
    let pickups = 0;
    let gross = 0;
    for (const hole of input.holes) {
      const cell = card.holes[hole.number - 1] ?? "";
      if (cell === "") {
        reasons.push(`Hole ${hole.number} is blank.`);
        entries.push({
          hole: hole.number,
          strokes: null,
          confidence: null,
          manuallyConfirmed: true,
        });
      } else if (cell === "X") {
        pickups += 1;
        entries.push({
          hole: hole.number,
          strokes: null,
          pickedUp: true,
          confidence: null,
          manuallyConfirmed: true,
        });
      } else {
        const strokes = Number(cell);
        if (strokes < input.strokeLimits.min || strokes > input.strokeLimits.max) {
          reasons.push(
            `Hole ${hole.number} is ${strokes}, outside this round's range of ${input.strokeLimits.min} to ${input.strokeLimits.max}.`,
          );
        }
        gross += strokes;
        entries.push({ hole: hole.number, strokes, confidence: null, manuallyConfirmed: true });
      }
    }

    let writtenTotal: number | null = null;
    if (card.written !== "") {
      const parsed = Number(card.written);
      if (!Number.isInteger(parsed) || parsed < 1) {
        reasons.push(`The written total "${card.written}" is not a whole number.`);
      } else {
        writtenTotal = parsed;
        // A pick-up has no stroke count, so a card with an X cannot add up to its written total.
        if (pickups === 0 && reasons.length === 0 && parsed !== gross) {
          reasons.push(`The written total is ${parsed}, but the holes add up to ${gross}.`);
        }
      }
    }

    // The playing handicap comes from the player's registration index and tee under the event
    // rule. The HDCP box on the sheet is kept as a note beside it, never as the number to play off.
    // A card that names a different tee is blocked: the save path still scores the registration
    // tee, so importing it would publish a number the card was not played from.
    const registration = player.tee;
    const tee = registration === undefined ? input.tee : registration;
    const teeProblem = cardTeeProblem(card.tee, tee, registration !== undefined);
    if (teeProblem) reasons.push(teeProblem);
    const handicap = eventPlayingHandicap({
      index: player.frozenIndex ?? null,
      tee,
      rule: input.rules.handicap,
    });
    if (!handicap.ok) reasons.push(`${player.playerName}: ${handicap.message}`);

    const marker = pickDeskMarker(input.players, player.playerId, input.cards);
    if (!marker) reasons.push("The round has no second player to stand as marker.");

    if (reasons.length > 0 || !handicap.ok || !marker) {
      plan.blocked.push({ card, playerName: player.playerName, reasons });
      continue;
    }

    const resolved: ResolvedSheetCard = {
      sheetCardId: card.id,
      name: card.name,
      playerId: player.playerId,
      playerName: player.playerName,
      marker,
      entries,
      writtenTotal,
      cardHandicap: card.hdcp,
      playingHandicap: handicap.playingHandicap,
      cardNote: cardBoxNote({
        box: readCardBox(card.hdcp),
        playingHandicap: handicap.playingHandicap,
        index: handicap.index,
        teeName: tee?.name ?? input.tee.name,
      }),
      approve: card.verified,
      pickups,
      gross,
      group: card.group,
      note: card.note,
      captureKey: sheetCaptureKey(input.roundId, input.file.slug, card.id),
      trace: {
        sheetCardId: card.id,
        slug: input.file.slug,
        exportedAt: input.file.exportedAt,
        group: card.group,
        tee: card.tee,
      },
    };

    const verdict = checkCardSubmission({
      cards: input.cards,
      playerId: player.playerId,
      scorerId: marker.playerId,
      entries,
      playerName: player.playerName,
    });
    if (verdict.kind === "needs_correction") {
      plan.blocked.push({ card, playerName: player.playerName, reasons: [verdict.message] });
      continue;
    }
    if (verdict.kind === "repeat") {
      const existing = input.cards
        .filter(
          (candidate) =>
            candidate.playerId === player.playerId &&
            candidate.scorerId === marker.playerId &&
            (candidate.status === "submitted" ||
              candidate.status === "in_review" ||
              candidate.status === "approved"),
        )
        .sort((left, right) => right.revision - left.revision)[0];
      if (existing && existing.status !== "approved" && resolved.approve) {
        plan.ready.push(resolved);
      } else {
        plan.alreadyIn.push(resolved);
      }
      continue;
    }
    plan.ready.push(resolved);
  }

  return plan;
}
