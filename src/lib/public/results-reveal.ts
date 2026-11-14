import type { PublicReleaseState } from "@/lib/data/public";

/**
 * The results blackout and its reveal.
 *
 * The awarding on the last day needs the public pages to stop showing scores and players while the
 * room is being set up, and then to come back together at a moment the organizer chooses. The hold
 * itself is the existing `leaderboard` and `roster` release keys, enforced in the database, so this
 * module only decides what a page *says* while the hold is on: the holding screen, a countdown to
 * the stored reveal time, or the results once the database has released them.
 *
 * The awarding is released one lane at a time (Class A to D, Net overall, Gross overall), so the
 * same countdown is modelled per lane: an id, a state of held or released, the time the lane is
 * due, and the seconds left. The lane model is the one the awarding screen and the public top-three
 * boards will use; the two surface keys above stay as the database's safety net underneath it.
 *
 * Pure: no clock of its own, no network, no React. Every function takes the values it needs, so the
 * countdown, the phases and the polling interval are tested without a browser.
 */

/** The two release keys the blackout turns off. Pairings, tee times and rules stay open. */
export const BLACKOUT_SURFACES = ["leaderboard", "roster"] as const;

export type BlackoutSurface = (typeof BLACKOUT_SURFACES)[number];

/** The blackout keys as the page asks about them: true when the desk is holding that surface. */
export type BlackoutFlags = Record<BlackoutSurface, boolean>;

/** The key inside `tournaments.publish_views` that holds the reveal time. */
export const REVEAL_KEY = "resultsRevealAt";

/* -------------------------------------------------------------------------------------------------
 * The six awarding lanes.
 * ------------------------------------------------------------------------------------------------ */

/**
 * The lanes the awarding is released in, in the order the desk shows them. Four class champions and
 * two overall boards. The ids are the keys stored under `publish_views -> resultsLanes`; adding a
 * lane here without adding it to the database read (or the other way round) is a bug.
 */
export const REVEAL_LANES = [
  { id: "classA", label: "Class A" },
  { id: "classB", label: "Class B" },
  { id: "classC", label: "Class C" },
  { id: "classD", label: "Class D" },
  { id: "netOverall", label: "Net overall" },
  { id: "grossOverall", label: "Gross overall" },
] as const;

export type RevealLane = (typeof REVEAL_LANES)[number];
export type RevealLaneId = RevealLane["id"];

/** The key inside `tournaments.publish_views` that holds the six lanes. */
export const LANES_KEY = "resultsLanes";

/** `held` means the lane shows nothing yet; `released` means its board is public. */
export type LaneReleaseState = "held" | "released";

/** The board stops at three rows. Ties do not expand it. */
export const BOARD_SIZE = 3;

/** One confirmed row of an awarding board, as the public page prints it. */
export interface AwardingBoardRow {
  /** 1, 2 or 3 as the board shows it. */
  position: number;
  /** The player or pair, as the published board prints it. */
  name: string;
  /** The lane's score: Stableford points on the lane's basis. */
  score: number | null;
  /** True when the row shares its score with another row on the board. */
  tie: boolean;
}

export type AwardingBoard = AwardingBoardRow[];

export interface LaneReveal {
  state: LaneReleaseState;
  /** When the countdown ends. Null while the lane has no countdown. */
  releaseAt: string | null;
  /** The top three the desk confirmed. Empty while the lane has no confirmed board. */
  board: AwardingBoard;
}

/** All six lanes. Always complete: a missing lane is the documented default, never a gap. */
export type LaneRevealMap = Record<RevealLaneId, LaneReveal>;

const isBoardRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** One stored row, or null when it is not a row a board may print. */
export function parseAwardingBoardRow(value: unknown): AwardingBoardRow | null {
  if (!isBoardRecord(value)) return null;
  const name = typeof value.name === "string" ? value.name.trim() : "";
  if (name === "") return null;
  const position =
    typeof value.position === "number" && Number.isFinite(value.position)
      ? Math.max(1, Math.trunc(value.position))
      : null;
  if (position === null) return null;
  const score =
    typeof value.score === "number" && Number.isFinite(value.score) ? value.score : null;
  return { position, name, score, tie: value.tie === true };
}

/**
 * A stored board. A board that is not a list of usable rows is an empty board, never a crash and
 * never a guessed row: the public page prints only what the desk confirmed.
 */
export function parseAwardingBoard(value: unknown): AwardingBoard {
  if (!Array.isArray(value)) return [];
  const rows: AwardingBoardRow[] = [];
  for (const entry of value) {
    const row = parseAwardingBoardRow(entry);
    if (row) rows.push(row);
    if (rows.length === BOARD_SIZE) break;
  }
  return rows;
}

/** The `T` a tied row prints, and the empty string every other row prints. */
export function tieMark(row: AwardingBoardRow): string {
  return row.tie ? "T" : "";
}

/** The score as the board prints it. A row with no score prints nothing rather than a zero. */
export function boardScoreText(row: AwardingBoardRow): string {
  return row.score === null ? "" : String(row.score);
}

/**
 * A lane nobody has touched is released with an empty board, the same default the database gate uses
 * for a surface: a read that is missing, old or malformed must never be the reason a live page goes
 * dark. An empty board on a released lane is a desk that has not confirmed one yet, and the page
 * says so instead of inventing a winner.
 */
export function defaultLaneReveal(): LaneReveal {
  return { state: "released", releaseAt: null, board: [] };
}

export function parseLaneState(value: unknown): LaneReleaseState {
  return value === "held" ? "held" : "released";
}

/** One lane from its stored object. A held lane with an unusable time has no countdown. */
export function parseLaneReveal(value: unknown): LaneReveal {
  if (!isRecord(value)) return defaultLaneReveal();
  const state = parseLaneState(value.state);
  const board = parseAwardingBoard(value.board);
  if (state === "released") return { state, releaseAt: null, board };
  return { state, releaseAt: parseRevealAt(value.releaseAt), board };
}

export function parseLaneRevealMap(value: unknown): LaneRevealMap {
  const record = isRecord(value) ? value : {};
  return {
    classA: parseLaneReveal(record.classA),
    classB: parseLaneReveal(record.classB),
    classC: parseLaneReveal(record.classC),
    classD: parseLaneReveal(record.classD),
    netOverall: parseLaneReveal(record.netOverall),
    grossOverall: parseLaneReveal(record.grossOverall),
  };
}

/** The lanes stored inside a `publish_views` object. */
export function storedLaneReveal(publishViews: unknown): LaneRevealMap {
  if (!isRecord(publishViews)) return parseLaneRevealMap(null);
  return parseLaneRevealMap(publishViews[LANES_KEY]);
}

/**
 * The `publish_views` object with one lane written and every other key and lane copied as it was.
 * A released lane keeps its confirmed board and drops its reveal time, so a stale countdown can
 * never outlive the release.
 */
export function mergeLaneReveal(
  publishViews: unknown,
  laneId: RevealLaneId,
  lane: LaneReveal,
): Record<string, unknown> {
  const next: Record<string, unknown> = isRecord(publishViews) ? { ...publishViews } : {};
  const stored = next[LANES_KEY];
  const lanes: Record<string, unknown> = isRecord(stored) ? { ...stored } : {};
  const state = parseLaneState(lane.state);
  const releaseAt = state === "held" ? parseRevealAt(lane.releaseAt) : null;
  const board = parseAwardingBoard(lane.board);
  lanes[laneId] = {
    state,
    ...(releaseAt === null ? {} : { releaseAt }),
    ...(board.length === 0 ? {} : { board }),
  };
  next[LANES_KEY] = lanes;
  return next;
}

/** True while a lane shows nothing yet. */
export function laneIsHeld(lane: LaneReveal): boolean {
  return lane.state === "held";
}

/** The lanes still held, in panel order. */
export function heldLanes(lanes: LaneRevealMap): RevealLaneId[] {
  return REVEAL_LANES.filter((lane) => lanes[lane.id].state === "held").map((lane) => lane.id);
}

/** The label a screen prints for a lane id. */
export function laneLabel(laneId: RevealLaneId): string {
  return REVEAL_LANES.find((lane) => lane.id === laneId)?.label ?? laneId;
}

/**
 * How long a lane has left, measured from the server's clock rather than the device's. Null for a
 * released lane or a lane with no countdown.
 */
export function laneRemainingMs({
  lane,
  serverNow,
  receivedAt,
  now,
}: {
  lane: LaneReveal;
  serverNow: string | number;
  receivedAt: number;
  now: number;
}): number | null {
  if (lane.state === "released") return null;
  return revealRemainingMs({ revealAt: lane.releaseAt, serverNow, receivedAt, now });
}

/** The whole seconds left on a lane, rounding up so the last second is shown. Null if released. */
export function laneSecondsRemaining(input: {
  lane: LaneReveal;
  serverNow: string | number;
  receivedAt: number;
  now: number;
}): number | null {
  const remaining = laneRemainingMs(input);
  if (remaining === null) return null;
  return Math.max(0, Math.ceil(remaining / 1000));
}

/**
 * What a lane's board should say. The same four phases as the whole-page hold, per lane:
 * `revealed` (show the top three), `hidden` (held, no countdown), `counting`, and `due` (the time
 * has passed but the desk has not released it yet, so it stays hidden).
 */
export type LanePhase = "released" | "hidden" | "counting" | "due";

export function lanePhase({
  lane,
  remainingMs,
}: {
  lane: LaneReveal;
  remainingMs: number | null;
}): LanePhase {
  if (lane.state === "released") return "released";
  if (remainingMs === null) return "hidden";
  return remainingMs > 0 ? "counting" : "due";
}

/** What identifies the six lanes on screen: state and countdown end, lane by lane. */
export function laneSignature(lanes: LaneRevealMap): string {
  return REVEAL_LANES.map((lane) => {
    const value = lanes[lane.id];
    return `${lane.id}:${value.state}@${parseRevealAt(value.releaseAt) ?? "-"}`;
  }).join("|");
}

export const REVEAL_MIN_SECONDS = 1;
export const REVEAL_MAX_SECONDS = 600;
export const REVEAL_DEFAULT_SECONDS = 15;

/** The countdown switches to a 2-3 second poll for the last half minute. */
export const NEAR_END_MS = 30_000;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** A meaningful ISO timestamp, or null. A stored value that is not one is ignored, never guessed. */
export function parseRevealAt(value: unknown): string | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

/** The reveal time stored inside a `publish_views` object, or null when there is none. */
export function storedRevealAt(publishViews: unknown): string | null {
  if (!isRecord(publishViews)) return null;
  return parseRevealAt(publishViews[REVEAL_KEY]);
}

/**
 * The `publish_views` object with the reveal key set, cleared, or added. Other keys are copied as
 * they are, including keys this build does not know, so writing the reveal time never turns a
 * released surface back on or drops a policy another page wrote.
 */
export function mergeRevealKey(
  publishViews: unknown,
  revealAt: string | null,
): Record<string, unknown> {
  const next: Record<string, unknown> = isRecord(publishViews) ? { ...publishViews } : {};
  const parsed = parseRevealAt(revealAt);
  if (parsed) next[REVEAL_KEY] = parsed;
  else delete next[REVEAL_KEY];
  return next;
}

/** The number of seconds a reveal starts in, clamped to 1-600. Anything unusable is the default. */
export function revealSeconds(input: unknown): number {
  let value = Number.NaN;
  if (typeof input === "number") value = input;
  else if (typeof input === "string" && input.trim() !== "") value = Number(input.trim());
  if (!Number.isFinite(value)) return REVEAL_DEFAULT_SECONDS;
  return Math.min(REVEAL_MAX_SECONDS, Math.max(REVEAL_MIN_SECONDS, Math.round(value)));
}

/** The reveal time: the organizer's clock plus the chosen seconds, as an ISO timestamp. */
export function revealAtFromSeconds(seconds: number, nowMs: number): string {
  return new Date(nowMs + revealSeconds(seconds) * 1000).toISOString();
}

/** True when the deadline has arrived according to the clock given. */
export function revealIsDue(revealAt: string | null, nowMs: number): boolean {
  const parsed = parseRevealAt(revealAt);
  return parsed !== null && Date.parse(parsed) <= nowMs;
}

/** True while the desk is holding at least one of the surfaces this page shows. */
export function blackoutHeld(
  state: Pick<PublicReleaseState, BlackoutSurface> | null | undefined,
  surfaces: readonly BlackoutSurface[] = BLACKOUT_SURFACES,
): boolean {
  if (!state) return false;
  return surfaces.some((surface) => state[surface] === false);
}

/** The blackout keys as held flags, for a signature the server render and the poll both build. */
export function blackoutFlags(
  state: Pick<PublicReleaseState, BlackoutSurface> | null | undefined,
): BlackoutFlags {
  return {
    leaderboard: state ? state.leaderboard === false : false,
    roster: state ? state.roster === false : false,
  };
}

/**
 * What the page should say.
 *
 * - `revealed`: the database has released the results; show them.
 * - `hidden`: held, with no reveal time. The calm holding screen, no countdown.
 * - `counting`: held, with a reveal time still to come.
 * - `due`: the reveal time has passed but the database still holds the results (the organizer's
 *   browser was closed, say). The screen stays hidden: the database is the gate, never this clock.
 */
export type RevealPhase = "revealed" | "hidden" | "counting" | "due";

export function revealPhase({
  held,
  remainingMs,
}: {
  held: boolean;
  remainingMs: number | null;
}): RevealPhase {
  if (!held) return "revealed";
  if (remainingMs === null) return "hidden";
  return remainingMs > 0 ? "counting" : "due";
}

/**
 * How long is left, measured from the server's clock rather than the device's.
 *
 * Phone clocks drift, and the person reading the screen may have set theirs by hand. The server
 * says what time it is at render; the browser only measures how long it has been since that render
 * arrived. A device whose clock is hours off therefore still shows the right remaining time, and a
 * countdown that starts a few seconds late (a slow network) is a few seconds late, not wrong.
 */
export function revealRemainingMs({
  revealAt,
  serverNow,
  receivedAt,
  now,
}: {
  revealAt: string | null;
  serverNow: string | number;
  receivedAt: number;
  now: number;
}): number | null {
  const parsed = parseRevealAt(revealAt);
  if (parsed === null) return null;
  const serverMs = typeof serverNow === "number" ? serverNow : Date.parse(serverNow);
  if (!Number.isFinite(serverMs)) return null;
  const elapsed = Math.max(0, now - receivedAt);
  return Math.max(0, Date.parse(parsed) - (serverMs + elapsed));
}

/** `0:15`, `1:05`, `10:00`. Whole seconds, rounding up so the last second is shown, not skipped. */
export function formatCountdown(remainingMs: number | null): string {
  if (remainingMs === null) return "";
  const seconds = Math.max(0, Math.ceil(remainingMs / 1000));
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

/**
 * How often the holding screen asks whether the reveal has happened. Five seconds is enough while
 * nothing is imminent; the last half minute asks every 2.5 seconds so the results appear with the
 * countdown, not up to five seconds after it.
 */
export function revealPollBaseMs(remainingMs: number | null): number {
  if (remainingMs !== null && remainingMs <= NEAR_END_MS) return 2_500;
  return 5_000;
}

/** What identifies the hold a page is showing: both keys (true = held) plus the reveal time. */
export function revealSignature(held: BlackoutFlags, revealAt: string | null): string {
  const flags = BLACKOUT_SURFACES.map((surface) => (held[surface] ? "1" : "0")).join("");
  return `${flags}|${parseRevealAt(revealAt) ?? "-"}`;
}

/** The body `/api/results/reveal` answers with: the surface keys, the reveal time, and the lanes. */
export interface RevealPoll {
  held: BlackoutFlags;
  revealAt: string | null;
  /** The six awarding lanes, always complete. */
  lanes: LaneRevealMap;
}

/**
 * Validates the poll's answer. A malformed body is a failed check, never a release. The lanes are
 * read leniently: an older endpoint that does not send them is six released lanes, which is the
 * same default the database gate uses, so a page never freezes on a missing section.
 */
export function parseRevealPoll(value: unknown): RevealPoll | null {
  if (!isRecord(value) || !isRecord(value.held)) return null;
  const held = value.held;
  if (typeof held.leaderboard !== "boolean" || typeof held.roster !== "boolean") return null;
  return {
    held: { leaderboard: held.leaderboard, roster: held.roster },
    revealAt: parseRevealAt(value.revealAt),
    lanes: parseLaneRevealMap(value.lanes),
  };
}
