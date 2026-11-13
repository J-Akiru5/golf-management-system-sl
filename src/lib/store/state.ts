import { daysOfTournament, isFinalPlayingDay, selectedDaysOf } from "@/lib/data/dates";
import { freezeIndex, selectIndexForCutOff } from "@/lib/data/frozen";
import { isPlayerRemoved } from "@/lib/data/player-state";
import {
  hasStoredRouting,
  missingFactsFor,
  playsUnclassified,
  registrationFor,
} from "@/lib/data/registrations";
import { sessionsForDay } from "@/lib/data/sessions";
import type {
  Caddie,
  Club,
  DeferredMatch,
  DeskRegistration,
  HandicapImportBatch,
  HandicapRecord,
  Hole,
  ManualOverride,
  PlayerRecord,
  RegistrationEntry,
  Tournament,
  TournamentDay,
} from "@/lib/data/types";
import {
  DEMO_CLUB,
  DEMO_CONFIG,
  DEMO_HOLES,
  DEMO_TEES,
  makeDemoSeed,
  makeDemoTournaments,
} from "@/lib/demo/data";
import { moveGroupToHole, reorderHoleQueue, swapGroupSlots } from "@/lib/draw/group-slots";
import { moveSet, swapPlayers, swapSets } from "@/lib/draw/player-moves";
import { type DrawGroup, dropCheck, validateDraw } from "@/lib/draw/validate";
import {
  type GroupPlacement,
  removePlayerFromDraw,
  restorePlayerToDraw,
} from "@/lib/draw/withdraw";
import { displayName } from "@/lib/format";
import { formatName } from "@/lib/names";
import type { MergeRow, ResolvedImportRow } from "@/lib/ngap";
import {
  defaultCategoryFor,
  type ProvisionalPlayer,
  type RoutingInput,
  route,
  type Tee,
  UNCLASSIFIED_LABEL,
} from "@/lib/routing";
import { applyTeamClasses } from "@/lib/routing/classify";
// AVP THROWAWAY BRANCH ONLY: the frozen draw for the recorded demo. It loads only when the recording
// flag is set, so the product tests still start from an empty board.
import drawFixture from "../../../demo-video/fixtures/bamboo-tee-draw.json";

const AVP_DEMO = process.env.NEXT_PUBLIC_AVP_DEMO === "1";

/** One playing day of a publish: which day it is and the board that belongs to it. */
export interface PublishedDay {
  dayNumber: number;
  dayLabel: string;
  playDate: string;
  groups: DrawGroup[];
}

/** What players see. A frozen copy, so organizer edits never leak out before they publish again. */
export interface PublishedGroup {
  number: number;
  startHole: number;
  wave: string | null;
  time: string;
  flight: string;
  players: string[];
  /** Parallel to `players` for snapshots published after 20261039000000. */
  playerIds?: string[];
  /**
   * The playing day this group belongs to. Added when the desk began publishing every day
   * together; an older snapshot has none and is read as the event's first day.
   */
  dayNumber?: number;
  dayLabel?: string;
  /** ISO date of the day. */
  playDate?: string;
}

export interface Published {
  tournamentId: string;
  at: string;
  /** Who is in which group at publish time; compared with the board to spot unpublished changes. */
  signature: string;
  groups: PublishedGroup[];
  /** Assigned by the database on publish (1, 2, 3...). Absent in the in-memory demo. */
  version?: number;
}

/** One tournament's working board. Nothing here survives a refresh. */
export interface BoardState {
  draw: DrawGroup[] | null;
  warnings: string[];
  published: Published | null;
  overrides: ManualOverride[];
  /**
   * Demo only: each playing day's own board, kept when every day is drawn at once. `draw` and
   * `warnings` above are the day on screen. A connected desk keeps one saved round per day instead.
   */
  dayBoards?: Record<number, { draw: DrawGroup[]; warnings: string[] }>;
}

export const EMPTY_BOARD: BoardState = {
  draw: null,
  warnings: [],
  published: null,
  overrides: [],
};

export interface DeskState {
  /** The tenant boundary. Every record carries the club id (see src/lib/data/types.ts). */
  clubId: string;
  /** The club as the database names it; the demo club only in demo mode. */
  club: Club;
  /**
   * The tees and holes the draw is routed against. They live in the state, not in module
   * constants, so a rating the organizer enters changes the next draw rather than only the screen.
   */
  tees: Tee[];
  holes: Hole[];
  tournaments: Tournament[];
  activeTournamentId: string | null;
  /** Structured days per tournament. Demo derives them; connected mode reads tournament_days. */
  days: Record<string, TournamentDay[]>;
  players: PlayerRecord[];
  records: HandicapRecord[];
  entries: RegistrationEntry[];
  caddies: Caddie[];
  /** Private storage path per player, used only so a replacement can remove the old object. */
  photoPaths: Record<string, string | null>;
  batches: HandicapImportBatch[];
  /** Import rows the organizer deferred, kept for a later decision. */
  deferred: DeferredMatch[];
  boards: Record<string, BoardState>;
  /** Rows matched by imports this session, for the activity log. */
  importedCount: number;
  /** Id counter, so generated ids are deterministic and never repeat. */
  seq: number;
}

export interface ApplyImportPayload {
  fileName: string;
  rowCount: number;
  skippedCount: number;
  note: string | null;
  rows: ResolvedImportRow[];
  deferred: MergeRow[];
}

export type Action =
  | { type: "hydrate"; state: DeskState }
  | { type: "selectTournament"; id: string | null }
  | { type: "saveTournament"; tournament: Tournament }
  /** A logo upload completes after a branding save; merge only the logo fields. */
  | { type: "setTournamentLogo"; id: string; logoPath: string | null; logoUrl?: string }
  /** One setup edit: the event row together with the tees and holes it is routed against. */
  | { type: "saveSetup"; tournament: Tournament; tees: Tee[]; holes: Hole[] }
  /** One playing day opens at its own time; null clears it back to the event's first tee time. */
  | { type: "setDayStart"; tournamentId: string; dayNumber: number; time: string | null }
  /**
   * One playing day's afternoon start on its own; null clears it back to the event's afternoon
   * start (`tournaments.pm_first_tee_time`) or the fixed default.
   */
  | { type: "setDayPmStart"; tournamentId: string; dayNumber: number; time: string | null }
  | { type: "addPlayer"; player: PlayerRecord }
  | { type: "updatePlayer"; id: string; patch: Partial<PlayerRecord> }
  | { type: "removePlayer"; id: string }
  | { type: "addEntry"; entry: RegistrationEntry }
  | { type: "updateEntry"; id: string; patch: Partial<RegistrationEntry> }
  | { type: "removeEntry"; id: string }
  | { type: "addCaddie"; caddie: Caddie }
  | { type: "updateCaddie"; id: string; patch: Partial<Caddie> }
  | { type: "removeCaddie"; id: string }
  | { type: "refreeze"; tournamentId: string; entryIds?: string[] }
  | { type: "applyImport"; payload: ApplyImportPayload }
  | { type: "resolveDeferred"; id: string; decision: "link" | "create" | "drop" }
  /** Draws one playing day. `dayNumber` null keeps the old whole-event behaviour. */
  | { type: "generate"; preserveLocks: boolean; dayNumber?: number | null }
  /** Demo only: draws every playing day at once, each with its own AM and PM sessions. */
  | { type: "generateAllDays"; showDay: number | null }
  /** Demo only: shows another playing day's board, keeping the edits made to the one left. */
  | { type: "showDay"; from: number | null; to: number }
  /**
   * Replaces the groups on the playing day on screen with groups read from the organizer's pairing
   * sheet. The published copy and every other day stay as they are.
   */
  | { type: "replaceDraw"; draw: DrawGroup[]; dayNumber?: number | null }
  | { type: "move"; playerId: string; toGroup: number; reason: string }
  /** Swaps two players between their groups, even when both groups are full. */
  | { type: "swapPlayers"; a: string; b: string; reason: string }
  /** Moves several players into one group, within the event's group size. */
  | { type: "moveSet"; playerIds: string[]; toGroup: number; reason: string }
  /** Exchanges two sets of players, one for one, when both sets are the same size. */
  | { type: "swapSets"; setA: string[]; setB: string[]; reason: string }
  /** Takes a withdrawn player off the day's board, leaving their group slot open. */
  | { type: "withdrawFromDraw"; playerId: string }
  /** Puts a withdrawn player back where they were, for the undo. */
  | { type: "restoreToDraw"; playerId: string; placement: GroupPlacement }
  /** Puts a walk-up into a group the staff screen already found an open place in. */
  | { type: "placeOnDraw"; playerId: string; groupNumber: number }
  | { type: "setGroupLocked"; group: number; locked: boolean; reason: string }
  /** Swaps two groups' start slots (time and hole); both groups end up locked. */
  | { type: "swapGroupSlots"; a: number; b: number; reason: string }
  /** Moves a group to another hole at the same start time. */
  | { type: "moveGroupToHole"; groupNumber: number; hole: number; reason: string }
  /** Reorders the groups waiting on one hole, earliest start first. */
  | { type: "reorderHoleQueue"; hole: number; order: number[]; reason: string }
  /**
   * Puts a board back exactly as it was before an edit, as a new board edit. The store keeps the
   * snapshot and carries it here, so the restore is saved and published like any other change.
   */
  | {
      type: "undoBoard";
      tournamentId: string;
      dayNumber: number | null;
      draw: DrawGroup[];
      overrides: ManualOverride[];
    }
  /**
   * Publishes one playing day and keeps the days already published. The store fills the day
   * fields from the day on screen, so a screen only asks to publish.
   */
  | { type: "publish"; dayNumber?: number | null; dayLabel?: string; playDate?: string }
  | { type: "unpublish" }
  /** The database confirmed a publish and assigned its version number and time. */
  | { type: "publishAck"; tournamentId: string; version: number; at: string };

/**
 * Where this browser remembers that Live mode was left on. Live mode publishes board edits by
 * itself, so the choice is remembered per browser and never assumed.
 */
export const LIVE_MODE_STORAGE_KEY = "teeline.draw.liveMode";

/**
 * How long Live mode waits after the last board edit before it publishes. A burst of moves becomes
 * one published version instead of one per move.
 */
export const LIVE_PUBLISH_DELAY_MS = 2000;

/** Whether this browser left Live mode on. A server render, a refusal, or nothing stored reads off. */
export function readLiveMode(storage: Pick<Storage, "getItem"> | null): boolean {
  if (!storage) return false;
  try {
    return storage.getItem(LIVE_MODE_STORAGE_KEY) === "on";
  } catch {
    // Storage switched off: the desk starts with Live mode off, which is the safe default.
    return false;
  }
}

/** Remembers the choice. A browser that refuses storage keeps the choice for this visit only. */
export function writeLiveMode(storage: Pick<Storage, "setItem"> | null, on: boolean): void {
  if (!storage) return;
  try {
    storage.setItem(LIVE_MODE_STORAGE_KEY, on ? "on" : "off");
  } catch {
    // Nothing else changes: the toggle still works until the page reloads.
  }
}

/**
 * Every board edit: each one can be taken back, and each one is what Live mode publishes by itself.
 *
 * One list on purpose, so the two never drift apart. The swap actions another builder is adding
 * (`swapPlayers`, `moveSet`, `swapSets`) each need one line here once their action exists.
 */
export const BOARD_EDIT_ACTIONS: ReadonlySet<Action["type"]> = new Set<Action["type"]>([
  "move",
  "swapGroupSlots",
  "moveGroupToHole",
  "reorderHoleQueue",
  "setGroupLocked",
  "withdrawFromDraw",
  "restoreToDraw",
  "placeOnDraw",
]);

/**
 * Nothing at all: the state a connected desk starts from, so a screen never shows invented players
 * or the sample event while the real ones load, or when loading fails.
 */
export const emptyState = (): DeskState => ({
  clubId: "",
  club: { id: "", name: "", shortName: "", location: "" },
  tees: [],
  holes: [],
  tournaments: [],
  activeTournamentId: null,
  days: {},
  players: [],
  records: [],
  entries: [],
  caddies: [],
  photoPaths: {},
  batches: [],
  deferred: [],
  boards: {},
  importedCount: 0,
  seq: 0,
});

/** The in-memory demo, used only when no Supabase URL is configured. */
export const initialState = (): DeskState => {
  const seed = makeDemoSeed();
  const tournaments = makeDemoTournaments();
  return {
    clubId: DEMO_CLUB.id,
    club: DEMO_CLUB,
    tees: DEMO_TEES,
    holes: DEMO_HOLES,
    tournaments,
    activeTournamentId: "bamboo-tee-2026",
    days: Object.fromEntries(tournaments.map((t) => [t.id, daysOfTournament(t)])),
    players: seed.players,
    records: seed.records,
    entries: seed.entries,
    caddies: [
      {
        id: "caddie-nilo",
        clubId: DEMO_CLUB.id,
        fullName: "Nilo Cadiao",
        nickname: "Nilo",
        phone: null,
        email: null,
        active: true,
        notes: "Demo caddie",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
      {
        id: "caddie-ramon",
        clubId: DEMO_CLUB.id,
        fullName: "Ramon Dela Cruz",
        nickname: "Mon",
        phone: null,
        email: null,
        active: true,
        notes: "Demo caddie",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ],
    photoPaths: {},
    batches: [],
    deferred: [],
    // AVP THROWAWAY BRANCH ONLY: start with a populated board when the recording flag is set, so
    // /draw and /print have something to show. It starts unpublished, so the video publishes in
    // scene 7. On the product branches, and in the tests, this is `{}`.
    boards: AVP_DEMO
      ? {
          "bamboo-tee-2026": {
            draw: drawFixture as unknown as DrawGroup[],
            warnings: [],
            published: null,
            overrides: [],
          },
        }
      : {},
    importedCount: 0,
    seq: 0,
  };
};

export const activeTournament = (s: DeskState): Tournament | null =>
  s.tournaments.find((t) => t.id === s.activeTournamentId) ?? null;

export const boardOf = (s: DeskState): BoardState =>
  (s.activeTournamentId && s.boards[s.activeTournamentId]) || EMPTY_BOARD;

export const entriesFor = (s: DeskState, tournamentId: string): RegistrationEntry[] =>
  s.entries.filter((e) => e.tournamentId === tournamentId);

export const recordsFor = (s: DeskState, playerId: string): HandicapRecord[] =>
  s.records.filter((r) => r.playerId === playerId);

/** The desk's view of every registration in the active tournament. */
export function buildRegistrations(s: DeskState): DeskRegistration[] {
  const t = activeTournament(s);
  if (!t) return [];
  const out: DeskRegistration[] = [];
  for (const entry of entriesFor(s, t.id)) {
    const player = s.players.find((p) => p.id === entry.playerId);
    if (!player) continue;
    const reg = registrationFor({
      tournament: t,
      tees: s.tees,
      player,
      entry,
      records: recordsFor(s, player.id),
    });
    // A pair is classed together, so the team number rides along. An organizer override keeps the
    // class the organizer chose and is left out of the team class.
    out.push({
      ...reg,
      reasons: [...reg.reasons],
      teamKey: entry.teamNo != null && !hasStoredRouting(entry) ? `team-${entry.teamNo}` : null,
      pairKey: entry.teamNo == null ? null : `team-${entry.teamNo}`,
    });
  }
  // The class of a member-guest pair is the average of both indexes, the same rule the engine
  // draws by. Without it each partner is judged on their own index and the draw checks report a
  // pair as "from another flight" although the engine grouped it correctly.
  applyTeamClasses(out, t.flights, t.config.maxIndex);
  return out;
}

/** The playing days of an event, in day order, with any non-playing day left out. */
export function playingDaysOfEvent(days: TournamentDay[]): TournamentDay[] {
  const seen = new Set<number>();
  return days
    .filter((day) => day.isPlayingDay !== false)
    .slice()
    .sort((a, b) => a.dayNumber - b.dayNumber || a.playDate.localeCompare(b.playDate))
    .filter((day) => {
      if (seen.has(day.dayNumber)) return false;
      seen.add(day.dayNumber);
      return true;
    });
}

/**
 * The engine input: players it can classify, plus confirmed provisional players it must place
 * without a category or flight. Index always comes from the frozen entry, never from a live import.
 *
 * With a playing day, only the players who chose that day are included, and each one carries the
 * session the desk recorded for that day. That is what keeps day 1's board from holding players who
 * registered for day 3, and what sends a confirmed afternoon player off in the afternoon.
 */
export function routingInputFor(
  s: DeskState,
  dayNumber: number | null = null,
): RoutingInput | null {
  const t = activeTournament(s);
  if (!t) return null;
  const days = playingDaysOfEvent(s.days[t.id] ?? daysOfTournament(t));
  const day = dayNumber === null ? null : (days.find((d) => d.dayNumber === dayNumber) ?? null);
  const byPlayer = new Map<string, "AM" | "PM" | null>();
  const players: RoutingInput["players"] = [];
  const provisional: ProvisionalPlayer[] = [];
  for (const entry of entriesFor(s, t.id)) {
    const chosen = selectedDaysOf(entry, days);
    // An entry that recorded no day at all is treated as playing every day, the same rule the
    // draw screen uses. Only a player who chose other days is left out.
    if (dayNumber !== null && chosen.length > 0 && !chosen.includes(dayNumber)) continue;
    // A stored review means the desk already decided this entry cannot be routed. Feeding it back
    // into the engine would give it a phantom group on the next proposal.
    if (entry.status === "needs_review" || entry.status === "ineligible") continue;
    const p = s.players.find((x) => x.id === entry.playerId);
    if (!p) continue;
    // A disabled or soft-deleted player is never drawn. The entry stays on file, so putting the
    // record back and running the draw again returns them to the board.
    if (isPlayerRemoved(p)) continue;
    // A confirmed entry missing a routing fact cannot be classified. It is handed to the engine
    // separately so it can still be placed, without a category or flight being invented for it.
    const missing = missingFactsFor(p, entry);
    // An explicit null means the player is on this day but has no session recorded; the engine
    // draws them in the morning and says so. A missing key means they are not playing this day.
    if (dayNumber !== null) byPlayer.set(p.id, entry.daySessions?.[dayNumber] ?? null);
    if (playsUnclassified(p, entry)) {
      provisional.push({ id: p.id, name: p.name, index: entry.frozen.index, missing });
      continue;
    }
    // A missing birthdate or gender is not a reason to leave a player out: the class comes from the
    // handicap and the club's open division carries the tee. The missing facts travel with the entry.
    players.push({
      id: p.id,
      name: p.name,
      birthdate: p.birthdate,
      gender: p.gender,
      index: entry.frozen.index,
      // A desk override carries the validated card class and card handicap. Without the override
      // the draw keeps the index path, so uncarded events behave exactly as before.
      classId: entry.overridden === true ? entry.flightId : null,
      cardHandicap: entry.overridden === true ? entry.playingHandicap : null,
      teamKey: entry.teamNo === null || entry.teamNo === undefined ? null : `team-${entry.teamNo}`,
    });
  }
  // The day's own stored times decide its sessions: the day's morning start, then its own afternoon
  // start, then the event's afternoon start (`tournaments.pm_first_tee_time`), and only then the
  // fixed defaults. A day's position in the list never decides a time, so a sparse day list is safe.
  const drawSessions =
    dayNumber !== null
      ? sessionsForDay(
          // A day with no start of its own still opens at the event's first tee time, the same
          // fallback the tee-time screen uses. The afternoon comes from the stored settings only.
          { startTime: day?.startTime ?? t.config.firstTeeTime, pmStartTime: day?.pmStartTime },
          {
            eventPmStart: t.config.pmFirstTeeTime,
            finalDay: day ? isFinalPlayingDay(day, days) : false,
          },
        )
      : null;
  const sessions: RoutingInput["sessions"] =
    dayNumber !== null
      ? {
          byPlayer,
          starts: {
            AM: drawSessions?.[0]?.time ?? t.config.firstTeeTime,
            PM: drawSessions?.[1]?.time ?? "12:30",
          },
          dayNumber,
          // A second start inside a session is spaced by the batch interval, never by the long
          // gap between the morning and the afternoon.
          batchGapMinutes: t.config.intervalMinutes,
        }
      : undefined;
  return {
    players,
    config: t.config,
    tees: s.tees,
    categories: t.categories,
    flights: t.flights,
    defaultCategoryId: defaultCategoryFor(t.categories)?.id,
    provisional,
    sessions,
  };
}

// Number order, so the same board compares equal whether it came from the engine or from the
// stored snapshot, which is sorted by day and tee time.
const signatureOf = (draw: DrawGroup[], dayNumber: number | null = null) =>
  draw
    .slice()
    .sort((a, b) => a.number - b.number)
    .map((g) => `${dayNumber === null ? "" : `${dayNumber}:`}${g.number}:${g.playerIds.join(",")}`)
    .join("|");

/** The signature of one day's board, compared with that day's published copy. */
export const drawSignatureForDay = (draw: DrawGroup[], dayNumber: number | null) =>
  signatureOf(draw, dayNumber);

/** The published groups that belong to another playing day. Older snapshots carry no day. */
export function publishedGroupsForOtherDays(
  published: Published | null,
  dayNumber: number | null,
): PublishedGroup[] {
  if (!published || dayNumber === null) return [];
  return published.groups.filter(
    (group) => typeof group.dayNumber === "number" && group.dayNumber !== dayNumber,
  );
}

/** The published groups of one day. A snapshot written before days existed is one day. */
export function publishedGroupsForDay(
  published: Published | null,
  dayNumber: number | null,
): PublishedGroup[] {
  if (!published) return [];
  if (dayNumber === null) return published.groups;
  if (!published.groups.some((group) => typeof group.dayNumber === "number")) {
    return published.groups;
  }
  return published.groups.filter((group) => group.dayNumber === dayNumber);
}

/** The publication signature for one day, so a day is compared with its own published copy. */
export function publishedSignatureForDay(
  published: Published | null,
  dayNumber: number | null,
): string {
  return signatureOf(
    publishedGroupsForDay(published, dayNumber).map((group) => ({
      number: group.number,
      flightId: "",
      startHole: group.startHole,
      wave: group.wave,
      time: group.time,
      locked: false,
      playerIds: group.playerIds ?? [],
    })),
    dayNumber,
  );
}

/**
 * Whose group starts where, as players see it. The publication signature only names the players, so
 * it misses a group that moved to another hole or time; comparing the start as well is what stops
 * Live mode from skipping a change players would notice.
 */
const publishedGroupKey = (group: {
  number: number;
  startHole: number;
  time: string;
  playerIds?: string[];
}): string =>
  `${group.number}|${group.startHole}|${group.time}|${(group.playerIds ?? []).join(",")}`;

/**
 * Whether the board on screen holds anything players would see differently from the frozen copy.
 * True when nothing has been published at all, because then everything is news.
 */
export function unpublishedChange(board: BoardState, dayNumber: number | null): boolean {
  if (!board.published) return true;
  const published = new Map(
    publishedGroupsForDay(board.published, dayNumber).map((group) => [
      group.number,
      publishedGroupKey(group),
    ]),
  );
  // A group with nobody in it is not published, so it is not a difference either.
  const groups = (board.draw ?? []).filter((group) => group.playerIds.length > 0);
  if (groups.length !== published.size) return true;
  return groups.some((group) => published.get(group.number) !== publishedGroupKey(group));
}

/** The player ids of the confirmed provisional entries in a set of desk registrations. */
export const provisionalIdsOf = (regs: DeskRegistration[]): Set<string> =>
  new Set(regs.filter((r) => r.provisional).map((r) => r.playerId));

/**
 * True when every player in a group is a confirmed provisional entry. Such a group is labelled
 * Unclassified from its members; no category or flight is stored on any of them.
 */
export function isUnclassifiedGroup(
  playerIds: string[],
  regById: ReadonlyMap<string, DeskRegistration>,
): boolean {
  return playerIds.length > 0 && playerIds.every((id) => regById.get(id)?.provisional === true);
}

/**
 * Freezes one playing day's board into what players will see, and keeps the other days that were
 * already published. Empty groups are left off the sheet. Publishing day 3 therefore updates day 3
 * and leaves day 1 and day 2 on the public page instead of replacing the whole week.
 */
export function buildPublished(
  draw: DrawGroup[],
  players: PlayerRecord[],
  tournament: Tournament,
  at: string,
  provisionalIds: ReadonlySet<string> = new Set(),
  day?: { dayNumber: number; dayLabel: string; playDate: string } | null,
  alreadyPublished: Published | null = null,
): Published {
  const nameById = new Map(players.map((p) => [p.id, p.name]));
  const flightName = (id: string | null) =>
    tournament.flights.find((f) => f.id === id)?.name ?? "—";
  const groupLabel = (g: DrawGroup) =>
    provisionalIds.size > 0 && g.playerIds.every((id) => provisionalIds.has(id))
      ? UNCLASSIFIED_LABEL
      : flightName(g.flightId);
  const dayNumber = day?.dayNumber ?? null;
  const dayGroups: PublishedGroup[] = draw
    .filter((g) => g.playerIds.length > 0)
    .map((g) => ({
      number: g.number,
      startHole: g.startHole,
      wave: g.wave,
      time: g.time,
      flight: groupLabel(g),
      players: g.playerIds.map((id) => nameById.get(id) ?? "").filter((n) => n !== ""),
      playerIds: g.playerIds.filter((id) => nameById.has(id)),
      ...(day ? { dayNumber: day.dayNumber, dayLabel: day.dayLabel, playDate: day.playDate } : {}),
    }));
  // A publish that names no day cannot say which day it replaces. On a multi-day event it must not
  // take the days already on the public page with it, so keep every published group that still
  // carries its day. A publish that names a day only replaces that day.
  const multiDay = playingDaysOfEvent(daysOfTournament(tournament)).length > 1;
  const otherDays =
    dayNumber === null && multiDay
      ? (alreadyPublished?.groups ?? []).filter((group) => typeof group.dayNumber === "number")
      : publishedGroupsForOtherDays(alreadyPublished, dayNumber);
  return {
    tournamentId: tournament.id,
    at,
    signature: [...otherDays.map((group) => group), ...dayGroups]
      .sort(
        (a, b) =>
          (a.dayNumber ?? 1) - (b.dayNumber ?? 1) ||
          a.time.localeCompare(b.time) ||
          a.number - b.number,
      )
      .map((g) => `${g.dayNumber ?? 1}:${g.number}:${(g.playerIds ?? []).join(",")}`)
      .join("|"),
    groups: [...otherDays, ...dayGroups].sort(
      (a, b) =>
        (a.dayNumber ?? 1) - (b.dayNumber ?? 1) ||
        a.time.localeCompare(b.time) ||
        a.number - b.number,
    ),
  };
}

/** Desk flags the draw should show as warnings: an old or outdated frozen index. */
export const flagsOf = (regs: DeskRegistration[]): { playerId: string; message: string }[] =>
  regs.flatMap((r) =>
    r.flags.map((message) => ({ playerId: r.playerId, message: `${r.playerName}: ${message}` })),
  );

const splitName = (full: string): { firstName: string; lastName: string } => {
  const trimmed = full.replace(/\s+/g, " ").trim();
  if (trimmed.includes(",")) {
    const [last = "", first = ""] = trimmed.split(",").map((s) => s.trim());
    return { firstName: first || last, lastName: last };
  }
  const parts = trimmed.split(" ");
  const last = parts.pop() ?? "";
  return { firstName: parts.join(" ") || last, lastName: last };
};

const stubPlayer = (
  s: DeskState,
  seq: number,
  name: string,
  ngapId: string | null,
): PlayerRecord => {
  const { firstName, lastName } = splitName(name);
  const fullName = formatName(firstName, lastName);
  return {
    id: `p-${seq}`,
    clubId: s.clubId,
    firstName,
    lastName,
    nickname: null,
    name: displayName(fullName),
    fullName,
    birthdate: null,
    gender: null,
    homeCourse: null,
    contactNumber: null,
    email: null,
    ngapId,
    createdAt: new Date().toISOString(),
  };
};

function withBoard(s: DeskState, tournamentId: string | null, board: BoardState): DeskState {
  if (!tournamentId) return s;
  return { ...s, boards: { ...s.boards, [tournamentId]: board } };
}

/** A short plain description of where a group starts, for the manual override log. */
const slotLabel = (group: DrawGroup | undefined): string | null =>
  group ? `G${group.number} ${group.time} hole ${group.startHole}` : null;

/** The groups waiting on one hole, earliest start first, for the manual override log. */
const queueLabel = (draw: DrawGroup[], hole: number): string => {
  const numbers = draw
    .filter((g) => g.startHole === hole)
    .sort((x, y) => x.time.localeCompare(y.time))
    .map((g) => `G${g.number}`);
  return `Hole ${hole}: ${numbers.join(", ")}`;
};

/**
 * A fresh id for a manual override: one the board does not already hold. The old `seq + 1` id was
 * reused when two overrides were made in a row, which gave the overrides list duplicate keys.
 */
const nextOverrideId = (overrides: readonly ManualOverride[]): string => {
  let n = overrides.length + 1;
  while (overrides.some((o) => o.id === `ov-${n}`)) n += 1;
  return `ov-${n}`;
};

/** The manual override a slot edit records: no player, a move, and where the slot went. */
const slotOverride = (
  overrides: readonly ManualOverride[],
  tournamentId: string,
  from: string | null,
  to: string | null,
  reason: string,
): ManualOverride => ({
  id: nextOverrideId(overrides),
  tournamentId,
  playerId: "",
  kind: "move",
  from,
  to,
  reason,
  at: new Date().toISOString(),
});

/**
 * Everything the publish path needs to judge the board on screen: the event, the board, the
 * registrations the checks read from, and the problems found. Null when there is nothing to publish.
 */
function publishCheck(s: DeskState, dayNumber: number | null) {
  const t = activeTournament(s);
  const board = boardOf(s);
  if (!t || !board.draw) return null;
  const regs = buildRegistrations(s);
  const dayList = playingDaysOfEvent(s.days[t.id] ?? daysOfTournament(t));
  const dayMembers =
    dayNumber === null
      ? undefined
      : new Set(
          entriesFor(s, t.id)
            .filter((entry) => {
              const chosen = selectedDaysOf(entry, dayList);
              return chosen.length === 0 || chosen.includes(dayNumber);
            })
            .map((entry) => entry.playerId),
        );
  const issues = validateDraw({
    draw: board.draw,
    registrations: regs,
    config: t.config,
    engineWarnings: board.warnings,
    flags: flagsOf(regs),
    names: {
      flight: (id) => t.flights.find((f) => f.id === id)?.name ?? "—",
      category: (id) => t.categories.find((c) => c.id === id)?.name ?? "—",
    },
    dayNumber,
    dayMembers,
  });
  return { tournament: t, board, regs, dayMembers, issues };
}

/**
 * Why publishing is refused, in plain words. Empty when the board can be published.
 *
 * The publish action and Live mode both read this, so they cannot disagree about what stops a
 * publish. Only blocking problems refuse; warnings are acknowledged by hand in the review dialog and
 * Live mode does not tick that box for the organizer.
 */
export function publishProblems(s: DeskState, dayNumber: number | null): string[] {
  const check = publishCheck(s, dayNumber);
  if (!check) return ["There is no draw to publish."];
  return check.issues
    .filter((issue) => issue.severity === "blocking")
    .map((issue) => issue.message);
}

/** What Live mode should do after a board edit, in plain values, so the store and its tests agree. */
export type LivePublishDecision =
  | { kind: "publish" }
  | { kind: "skip"; reason: "no-board" | "unchanged" }
  | { kind: "refuse"; reason: string };

export interface LivePublishInput {
  /** The signed-in role. Undefined in demo mode, where there is nobody to gate. */
  role?: "owner" | "organizer" | "desk" | null;
  /** The last draw save failed, so the board on screen is not what the database holds. */
  saveFailed?: boolean;
}

/**
 * Whether Live mode may publish the board on screen, and why not when it may not.
 *
 * It uses the same refusals as the publish button: the problems list, the role, and a board the
 * database never stored. The draw revision is checked by the database on the write; a refusal there
 * comes back as an error and the store turns Live mode off.
 */
export function livePublishPlan(
  s: DeskState,
  dayNumber: number | null,
  { role, saveFailed }: LivePublishInput = {},
): LivePublishDecision {
  const t = activeTournament(s);
  const board = boardOf(s);
  if (!t || !board.draw) return { kind: "skip", reason: "no-board" };
  if (role === "desk") {
    return {
      kind: "refuse",
      reason: "Only the owner or an organizer can publish this event.",
    };
  }
  if (role === null) {
    return {
      kind: "refuse",
      reason: "This account has no desk role, so it cannot publish.",
    };
  }
  if (saveFailed) {
    return {
      kind: "refuse",
      reason: "The last change was not saved, so there is nothing safe to publish yet.",
    };
  }
  const problems = publishProblems(s, dayNumber);
  if (problems.length > 0) {
    return { kind: "refuse", reason: problems.join(" ") };
  }
  // Nothing players would see has changed, for example only a group lock moved. Publishing would add
  // an identical version to the public history and notify nobody, so it is skipped.
  if (!unpublishedChange(board, dayNumber)) {
    return { kind: "skip", reason: "unchanged" };
  }
  return { kind: "publish" };
}

/**
 * One manual override per player who ended up in another group, the same row a single move writes.
 * A swap, a set move and a set swap can touch several players at once, so the list is built from the
 * difference between the board before and after, never from the players the action was given.
 */
const moveOverrides = (
  overrides: readonly ManualOverride[],
  tournamentId: string,
  before: readonly DrawGroup[],
  after: readonly DrawGroup[],
  reason: string,
): ManualOverride[] => {
  const was = new Map<string, number>();
  for (const g of before) for (const id of g.playerIds) was.set(id, g.number);
  const at = new Date().toISOString();
  const rows: ManualOverride[] = [];
  for (const g of after) {
    for (const id of g.playerIds) {
      const from = was.get(id);
      if (from === undefined || from === g.number) continue;
      rows.push({
        id: nextOverrideId([...overrides, ...rows]),
        tournamentId,
        playerId: id,
        kind: "move",
        from: String(from),
        to: String(g.number),
        reason,
        at,
      });
    }
  }
  return rows;
};

export function reducer(state: DeskState, a: Action): DeskState {
  switch (a.type) {
    // The Supabase adapter replaces the whole desk once it has read the club's data. Nothing is
    // merged: a half-merged state would mix demo rows with real ones.
    case "hydrate":
      return a.state;

    case "selectTournament":
      return { ...state, activeTournamentId: a.id };

    case "saveTournament": {
      const exists = state.tournaments.some((t) => t.id === a.tournament.id);
      const previous = state.tournaments.find((t) => t.id === a.tournament.id);
      const datesChanged = !previous || previous.dates.join("|") !== a.tournament.dates.join("|");
      return {
        ...state,
        tournaments: exists
          ? state.tournaments.map((t) => (t.id === a.tournament.id ? a.tournament : t))
          : [...state.tournaments, a.tournament],
        days: datesChanged
          ? {
              ...state.days,
              [a.tournament.id]: daysOfTournament({ ...a.tournament, days: undefined }),
            }
          : state.days,
      };
    }

    case "setTournamentLogo":
      return {
        ...state,
        tournaments: state.tournaments.map((t) =>
          t.id === a.id ? { ...t, logoPath: a.logoPath, logoUrl: a.logoUrl } : t,
        ),
      };

    case "saveSetup": {
      const exists = state.tournaments.some((t) => t.id === a.tournament.id);
      const previous = state.tournaments.find((t) => t.id === a.tournament.id);
      const datesChanged = !previous || previous.dates.join("|") !== a.tournament.dates.join("|");
      return {
        ...state,
        tees: a.tees,
        holes: a.holes,
        tournaments: exists
          ? state.tournaments.map((t) => (t.id === a.tournament.id ? a.tournament : t))
          : [...state.tournaments, a.tournament],
        days: datesChanged
          ? {
              ...state.days,
              [a.tournament.id]: daysOfTournament({ ...a.tournament, days: undefined }),
            }
          : state.days,
      };
    }

    case "setDayStart": {
      const tournament = state.tournaments.find((t) => t.id === a.tournamentId);
      const list = state.days[a.tournamentId] ?? (tournament ? daysOfTournament(tournament) : []);
      return {
        ...state,
        days: {
          ...state.days,
          [a.tournamentId]: list.map((day) =>
            day.dayNumber === a.dayNumber ? { ...day, startTime: a.time } : day,
          ),
        },
      };
    }

    case "setDayPmStart": {
      const tournament = state.tournaments.find((t) => t.id === a.tournamentId);
      const list = state.days[a.tournamentId] ?? (tournament ? daysOfTournament(tournament) : []);
      return {
        ...state,
        days: {
          ...state.days,
          [a.tournamentId]: list.map((day) =>
            day.dayNumber === a.dayNumber ? { ...day, pmStartTime: a.time } : day,
          ),
        },
      };
    }

    case "addPlayer":
      return { ...state, players: [...state.players, a.player], seq: state.seq + 1 };

    case "updatePlayer":
      return {
        ...state,
        players: state.players.map((p) => (p.id === a.id ? { ...p, ...a.patch, id: p.id } : p)),
      };

    case "removePlayer": {
      const boards: Record<string, BoardState> = {};
      for (const [id, b] of Object.entries(state.boards)) {
        boards[id] = {
          ...b,
          draw: b.draw
            ? b.draw.map((g) => ({
                ...g,
                playerIds: g.playerIds.filter((x) => x !== a.id),
              }))
            : null,
        };
      }
      return {
        ...state,
        players: state.players.filter((p) => p.id !== a.id),
        records: state.records.filter((r) => r.playerId !== a.id),
        entries: state.entries.filter((e) => e.playerId !== a.id),
        photoPaths: Object.fromEntries(
          Object.entries(state.photoPaths).filter(([id]) => id !== a.id),
        ),
        boards,
      };
    }

    case "addCaddie":
      return { ...state, caddies: [...state.caddies, a.caddie], seq: state.seq + 1 };

    case "updateCaddie":
      return {
        ...state,
        caddies: state.caddies.map((c) => (c.id === a.id ? { ...c, ...a.patch, id: c.id } : c)),
      };

    case "removeCaddie":
      return { ...state, caddies: state.caddies.filter((c) => c.id !== a.id) };

    case "addEntry":
      return { ...state, entries: [...state.entries, a.entry] };

    case "updateEntry":
      return {
        ...state,
        entries: state.entries.map((e) => (e.id === a.id ? { ...e, ...a.patch, id: e.id } : e)),
      };

    case "removeEntry":
      return { ...state, entries: state.entries.filter((e) => e.id !== a.id) };

    case "refreeze": {
      const now = new Date().toISOString();
      return {
        ...state,
        entries: state.entries.map((e) => {
          if (e.tournamentId !== a.tournamentId) return e;
          if (a.entryIds && !a.entryIds.includes(e.id)) return e;
          const selection = selectIndexForCutOff(recordsFor(state, e.playerId), cutOffOf(state, e));
          return { ...e, frozen: freezeIndex(selection, now) };
        }),
      };
    }

    case "applyImport": {
      let seq = state.seq;
      const now = new Date().toISOString();
      const newPlayers: PlayerRecord[] = [];
      const newRecords: HandicapRecord[] = [];
      for (const row of a.payload.rows) {
        let playerId = row.playerId;
        if (row.createNew) {
          seq += 1;
          const stub = stubPlayer(state, seq, row.name, row.ngapId);
          newPlayers.push(stub);
          playerId = stub.id;
        }
        if (!playerId) continue;
        newRecords.push({
          id: `rec-${seq}-${newRecords.length + 1}`,
          clubId: state.clubId,
          playerId,
          index: row.index,
          effectiveDate: row.effectiveDate,
          source: "ngap_import",
          uploadRef: a.payload.fileName,
          recordedAt: now,
        });
      }
      const batch: HandicapImportBatch = {
        id: `batch-${seq + 1}`,
        clubId: state.clubId,
        fileName: a.payload.fileName,
        importedAt: now,
        rowCount: a.payload.rowCount,
        appliedCount: newRecords.length,
        skippedCount: a.payload.skippedCount,
        note: a.payload.note,
      };
      const deferred: DeferredMatch[] = a.payload.deferred.map((row, i) => ({
        id: `defer-${seq + 1}-${i + 1}`,
        clubId: state.clubId,
        name: row.name,
        ngapId: row.ngapId,
        index: row.index,
        effectiveDate: row.effectiveDate,
        reason: row.conflicts[0] ?? "Deferred by the organizer.",
        candidatePlayerIds: row.candidates.map((c) => c.playerId),
        fileName: a.payload.fileName,
        at: now,
      }));
      return {
        ...state,
        seq: seq + 1,
        players: [...state.players, ...newPlayers],
        records: [...state.records, ...newRecords],
        batches: [batch, ...state.batches],
        deferred: [...deferred, ...state.deferred],
        importedCount: state.importedCount + newRecords.filter((r) => r.playerId).length,
      };
    }

    case "resolveDeferred": {
      const row = state.deferred.find((d) => d.id === a.id);
      if (!row) return state;
      const rest = state.deferred.filter((d) => d.id !== a.id);
      if (a.decision === "drop") return { ...state, deferred: rest };
      const now = new Date().toISOString();
      let seq = state.seq;
      let playerId = row.candidatePlayerIds[0] ?? null;
      const newPlayers: PlayerRecord[] = [];
      if (a.decision === "create" || !playerId) {
        seq += 1;
        const stub = stubPlayer(state, seq, row.name, row.ngapId);
        newPlayers.push(stub);
        playerId = stub.id;
      }
      const record: HandicapRecord = {
        id: `rec-${seq}-deferred`,
        clubId: state.clubId,
        playerId,
        index: row.index,
        effectiveDate: row.effectiveDate,
        source: "ngap_import",
        uploadRef: row.fileName,
        recordedAt: now,
      };
      return {
        ...state,
        seq,
        players: [...state.players, ...newPlayers],
        records: [...state.records, record],
        deferred: rest,
        importedCount: state.importedCount + 1,
      };
    }

    case "generate": {
      const t = activeTournament(state);
      const dayNumber = a.dayNumber ?? null;
      const input = routingInputFor(state, dayNumber);
      if (!t || !input) return state;
      const board = boardOf(state);
      const previous = board.draw ?? [];
      const locked = a.preserveLocks
        ? previous
            .filter((g) => g.locked)
            .map((g) => ({
              number: g.number,
              flightId: g.flightId,
              playerIds: g.playerIds,
              startHole: g.startHole,
              wave: g.wave,
              time: g.time,
            }))
        : [];
      // The club fills a day as it goes: the first start takes groups until the holes are used,
      // and the next start takes whoever is left, rather than moving a whole class on.
      const result = route(input, { lockedGroups: locked, splitClassesAcrossWaves: true });
      const sameMembers = (a2: string[], b2: string[]) =>
        a2.length === b2.length && [...a2].sort().join(",") === [...b2].sort().join(",");
      const draw: DrawGroup[] = result.groups.map((g) => ({
        ...g,
        locked:
          a.preserveLocks &&
          previous.some((p) => p.locked && sameMembers(p.playerIds, g.playerIds)),
      }));
      // A fresh proposal for one day does not take another day's published list down: only a
      // snapshot with no day left in it is cleared, which is the case until days are published.
      const keepsOtherDays = publishedGroupsForOtherDays(board.published, dayNumber).length > 0;
      // Small groups are checked live by validateDraw, so the engine's one-off copy would go stale.
      const warnings = result.warnings.filter((w) => !/a group has only/.test(w));
      const next: BoardState = {
        draw,
        warnings,
        published: a.preserveLocks || keepsOtherDays ? board.published : null,
        overrides: a.preserveLocks ? board.overrides : [],
        // The other days' boards stay as they were; only the day drawn now is replaced.
        dayBoards:
          board.dayBoards && dayNumber !== null
            ? { ...board.dayBoards, [dayNumber]: { draw, warnings } }
            : board.dayBoards,
      };
      return withBoard(state, t.id, next);
    }

    case "move": {
      const t = activeTournament(state);
      const board = boardOf(state);
      if (!t || !board.draw) return state;
      const regs = new Map(buildRegistrations(state).map((r) => [r.playerId, r]));
      const names = {
        flight: (id: string | null) => t.flights.find((f) => f.id === id)?.name ?? "—",
      };
      const check = dropCheck(board.draw, t.config, regs, a.playerId, a.toGroup, names);
      if (!check.ok) return state;
      const from = board.draw.find((g) => g.playerIds.includes(a.playerId));
      const draw = board.draw.map((g) => {
        if (g.number === a.toGroup) return { ...g, playerIds: [...g.playerIds, a.playerId] };
        if (g.playerIds.includes(a.playerId)) {
          return { ...g, playerIds: g.playerIds.filter((id) => id !== a.playerId) };
        }
        return g;
      });
      const override: ManualOverride = {
        id: nextOverrideId(board.overrides),
        tournamentId: t.id,
        playerId: a.playerId,
        kind: "move",
        from: from ? String(from.number) : null,
        to: String(a.toGroup),
        reason: a.reason,
        at: new Date().toISOString(),
      };
      return withBoard(state, t.id, {
        ...board,
        draw,
        overrides: [...board.overrides, override],
      });
    }

    case "swapPlayers": {
      const t = activeTournament(state);
      const board = boardOf(state);
      if (!t || !board.draw) return state;
      const result = swapPlayers(board.draw, a.a, a.b);
      if (!result.ok) return state;
      return withBoard(state, t.id, {
        ...board,
        draw: result.draw,
        overrides: [
          ...board.overrides,
          ...moveOverrides(board.overrides, t.id, board.draw, result.draw, a.reason),
        ],
      });
    }

    case "moveSet": {
      const t = activeTournament(state);
      const board = boardOf(state);
      if (!t || !board.draw) return state;
      const result = moveSet(board.draw, a.playerIds, a.toGroup, t.config.groupSize);
      if (!result.ok) return state;
      return withBoard(state, t.id, {
        ...board,
        draw: result.draw,
        overrides: [
          ...board.overrides,
          ...moveOverrides(board.overrides, t.id, board.draw, result.draw, a.reason),
        ],
      });
    }

    case "swapSets": {
      const t = activeTournament(state);
      const board = boardOf(state);
      if (!t || !board.draw) return state;
      const result = swapSets(board.draw, a.setA, a.setB);
      if (!result.ok) return state;
      return withBoard(state, t.id, {
        ...board,
        draw: result.draw,
        overrides: [
          ...board.overrides,
          ...moveOverrides(board.overrides, t.id, board.draw, result.draw, a.reason),
        ],
      });
    }

    case "withdrawFromDraw": {
      const t = activeTournament(state);
      const board = boardOf(state);
      if (!t || !board.draw) return state;
      return withBoard(state, t.id, {
        ...board,
        draw: removePlayerFromDraw(board.draw, a.playerId),
      });
    }

    case "restoreToDraw": {
      const t = activeTournament(state);
      const board = boardOf(state);
      if (!t || !board.draw) return state;
      return withBoard(state, t.id, {
        ...board,
        draw: restorePlayerToDraw(board.draw, a.playerId, a.placement),
      });
    }

    case "placeOnDraw": {
      const t = activeTournament(state);
      const board = boardOf(state);
      if (!t || !board.draw) return state;
      if (board.draw.some((group) => group.playerIds.includes(a.playerId))) return state;
      if (!board.draw.some((group) => group.number === a.groupNumber)) return state;
      return withBoard(state, t.id, {
        ...board,
        draw: board.draw.map((group) =>
          group.number === a.groupNumber
            ? { ...group, playerIds: [...group.playerIds, a.playerId] }
            : group,
        ),
      });
    }

    case "generateAllDays": {
      const t = activeTournament(state);
      if (!t) return state;
      const days = playingDaysOfEvent(state.days[t.id] ?? []);
      const firstDay = days[0];
      if (!firstDay) return reducer(state, { type: "generate", preserveLocks: false });
      const dayBoards: Record<number, { draw: DrawGroup[]; warnings: string[] }> = {};
      let next = state;
      for (const day of days) {
        next = reducer(next, { type: "generate", dayNumber: day.dayNumber, preserveLocks: false });
        const drawn = boardOf(next);
        if (drawn.draw) dayBoards[day.dayNumber] = { draw: drawn.draw, warnings: drawn.warnings };
      }
      const shown = days.some((d) => d.dayNumber === a.showDay) ? a.showDay : firstDay.dayNumber;
      const showing = (shown !== null ? dayBoards[shown] : undefined) ?? null;
      const board = boardOf(next);
      return withBoard(next, t.id, {
        ...board,
        dayBoards,
        draw: showing?.draw ?? board.draw,
        warnings: showing?.warnings ?? board.warnings,
      });
    }

    case "showDay": {
      const t = activeTournament(state);
      const board = boardOf(state);
      if (!t || !board.dayBoards) return state;
      const target = board.dayBoards[a.to];
      if (!target) return state;
      const dayBoards = { ...board.dayBoards };
      // The edits made to the day being left are kept, so coming back finds them.
      if (a.from !== null && board.draw) {
        dayBoards[a.from] = { draw: board.draw, warnings: board.warnings };
      }
      return withBoard(state, t.id, {
        ...board,
        dayBoards,
        draw: target.draw,
        warnings: target.warnings,
      });
    }

    case "replaceDraw": {
      const t = activeTournament(state);
      if (!t) return state;
      const board = boardOf(state);
      const dayNumber = a.dayNumber ?? null;
      const warnings: string[] = [];
      return withBoard(state, t.id, {
        ...board,
        draw: a.draw,
        warnings,
        // The published list is not touched: the organizer reviews the new board and publishes it.
        dayBoards:
          board.dayBoards && dayNumber !== null
            ? { ...board.dayBoards, [dayNumber]: { draw: a.draw, warnings } }
            : board.dayBoards,
      });
    }

    case "setGroupLocked": {
      const t = activeTournament(state);
      const board = boardOf(state);
      if (!t || !board.draw) return state;
      const draw = board.draw.map((g) => (g.number === a.group ? { ...g, locked: a.locked } : g));
      const override: ManualOverride = {
        id: nextOverrideId(board.overrides),
        tournamentId: t.id,
        playerId: "",
        kind: a.locked ? "lock" : "unlock",
        from: String(a.group),
        to: String(a.group),
        reason: a.reason,
        at: new Date().toISOString(),
      };
      return withBoard(state, t.id, {
        ...board,
        draw,
        overrides: [...board.overrides, override],
      });
    }

    case "swapGroupSlots": {
      const t = activeTournament(state);
      const board = boardOf(state);
      if (!t || !board.draw) return state;
      const result = swapGroupSlots(board.draw, a.a, a.b);
      if (!result.ok) return state;
      const from = slotLabel(board.draw.find((g) => g.number === a.a));
      const to = slotLabel(result.draw.find((g) => g.number === a.a));
      return withBoard(state, t.id, {
        ...board,
        draw: result.draw,
        overrides: [...board.overrides, slotOverride(board.overrides, t.id, from, to, a.reason)],
      });
    }

    case "moveGroupToHole": {
      const t = activeTournament(state);
      const board = boardOf(state);
      if (!t || !board.draw) return state;
      const result = moveGroupToHole(board.draw, a.groupNumber, a.hole, t.config.holes);
      if (!result.ok) return state;
      const from = slotLabel(board.draw.find((g) => g.number === a.groupNumber));
      const to = slotLabel(result.draw.find((g) => g.number === a.groupNumber));
      return withBoard(state, t.id, {
        ...board,
        draw: result.draw,
        overrides: [...board.overrides, slotOverride(board.overrides, t.id, from, to, a.reason)],
      });
    }

    case "reorderHoleQueue": {
      const t = activeTournament(state);
      const board = boardOf(state);
      if (!t || !board.draw) return state;
      const result = reorderHoleQueue(board.draw, a.hole, a.order);
      if (!result.ok) return state;
      const from = queueLabel(board.draw, a.hole);
      const to = queueLabel(result.draw, a.hole);
      return withBoard(state, t.id, {
        ...board,
        draw: result.draw,
        overrides: [...board.overrides, slotOverride(board.overrides, t.id, from, to, a.reason)],
      });
    }

    case "undoBoard": {
      const board = state.boards[a.tournamentId];
      if (!board) return state;
      const dayNumber = a.dayNumber ?? null;
      return withBoard(state, a.tournamentId, {
        ...board,
        draw: a.draw,
        overrides: a.overrides,
        // The demo keeps a copy of each day's board. The restore is that day's board now, so a day
        // switch away and back does not bring the undone edit back.
        dayBoards:
          board.dayBoards && dayNumber !== null
            ? { ...board.dayBoards, [dayNumber]: { draw: a.draw, warnings: board.warnings } }
            : board.dayBoards,
      });
    }

    case "publish": {
      const publishDay = a.dayNumber ?? null;
      const check = publishCheck(state, publishDay);
      if (!check) return state;
      const { tournament: t, board, regs } = check;
      // The page disables the button too; this is the backstop, and the same rules Live mode reads.
      if (check.issues.some((i) => i.severity === "blocking")) return state;
      const day =
        a.dayNumber === undefined || a.dayNumber === null
          ? null
          : {
              dayNumber: a.dayNumber,
              dayLabel: a.dayLabel?.trim() || `Day ${a.dayNumber}`,
              playDate: a.playDate ?? t.config.date,
            };
      return withBoard(state, t.id, {
        ...board,
        published: buildPublished(
          board.draw ?? [],
          state.players,
          t,
          new Date().toISOString(),
          provisionalIdsOf(regs),
          day,
          board.published,
        ),
      });
    }

    case "unpublish":
      return withBoard(state, state.activeTournamentId, { ...boardOf(state), published: null });

    case "publishAck": {
      const board = state.boards[a.tournamentId];
      if (!board?.published) return state;
      return withBoard(state, a.tournamentId, {
        ...board,
        published: { ...board.published, version: a.version, at: a.at },
      });
    }
  }
}

/** The cut-off of the tournament an entry belongs to. */
function cutOffOf(s: DeskState, entry: RegistrationEntry): string {
  return s.tournaments.find((t) => t.id === entry.tournamentId)?.cutOffDate ?? "9999-12-31";
}

/** A new tournament copied from the active one, ready for the organizer to edit. */
export function tournamentTemplate(s: DeskState, name: string, date: string): Tournament {
  const base = activeTournament(s);
  const now = new Date().toISOString();
  return {
    id: `t-${s.seq + 1}-${Date.now().toString(36)}`,
    clubId: s.clubId,
    name,
    hostName: null,
    nameNeedsConfirmation: true,
    courseId: base?.courseId ?? "igcc-main",
    dates: [date],
    cutOffDate: date,
    scheduleNeedsConfirmation: true,
    courseDataConfirmed: false,
    config: { ...(base?.config ?? DEMO_CONFIG), date },
    categories: base?.categories ?? [],
    flights: base?.flights ?? [],
    registration: {
      responseEmail: "",
      sponsorQuestion: "Are you a sponsor?",
      payment: null,
      teeTimes: [
        {
          day: 1,
          label: "Day 1",
          date,
          options: ["6:30 AM", "12:30 PM"],
          needsConfirmation: false,
        },
      ],
      shirtSizes: ["XS", "S", "M", "L", "XL", "2XL", "3XL", "4XL", "5XL"],
      fields: [],
      instructions: null,
    },
    staleIndexDays: base?.staleIndexDays ?? 60,
    state: "draft",
    createdAt: now,
  };
}
