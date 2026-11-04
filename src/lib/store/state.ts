import { daysOfTournament } from "@/lib/data/dates";
import { freezeIndex, selectIndexForCutOff } from "@/lib/data/frozen";
import { missingFactsFor, registrationFor } from "@/lib/data/registrations";
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
import { type DrawGroup, dropCheck, validateDraw } from "@/lib/draw/validate";
import { displayName } from "@/lib/format";
import type { MergeRow, ResolvedImportRow } from "@/lib/ngap";
import {
  type ProvisionalPlayer,
  type RoutingInput,
  route,
  type Tee,
  UNCLASSIFIED_LABEL,
} from "@/lib/routing";
// AVP THROWAWAY BRANCH ONLY: the frozen draw for the recorded demo. It loads only when the recording
// flag is set, so the product tests still start from an empty board.
import drawFixture from "../../../demo-video/fixtures/bamboo-tee-draw.json";

const AVP_DEMO = process.env.NEXT_PUBLIC_AVP_DEMO === "1";

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
  | { type: "generate"; preserveLocks: boolean }
  | { type: "move"; playerId: string; toGroup: number; reason: string }
  | { type: "setGroupLocked"; group: number; locked: boolean; reason: string }
  | { type: "publish" }
  | { type: "unpublish" }
  /** The database confirmed a publish and assigned its version number and time. */
  | { type: "publishAck"; tournamentId: string; version: number; at: string };

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
    out.push(
      registrationFor({
        tournament: t,
        tees: s.tees,
        player,
        entry,
        records: recordsFor(s, player.id),
      }),
    );
  }
  return out;
}

/**
 * The engine input: players it can classify, plus confirmed provisional players it must place
 * without a category or flight. Index always comes from the frozen entry, never from a live import.
 */
export function routingInputFor(s: DeskState): RoutingInput | null {
  const t = activeTournament(s);
  if (!t) return null;
  const players: RoutingInput["players"] = [];
  const provisional: ProvisionalPlayer[] = [];
  for (const entry of entriesFor(s, t.id)) {
    const p = s.players.find((x) => x.id === entry.playerId);
    if (!p) continue;
    // A confirmed entry missing a routing fact cannot be classified. It is handed to the engine
    // separately so it can still be placed, without a category or flight being invented for it.
    const missing = missingFactsFor(p, entry);
    if (entry.status === "ok" && missing.length > 0) {
      provisional.push({ id: p.id, name: p.name, index: entry.frozen.index, missing });
      continue;
    }
    if (p.birthdate === null || p.gender === null) continue;
    players.push({
      id: p.id,
      name: p.name,
      birthdate: p.birthdate,
      gender: p.gender,
      index: entry.frozen.index,
    });
  }
  return {
    players,
    config: t.config,
    tees: s.tees,
    categories: t.categories,
    flights: t.flights,
    provisional,
  };
}

const signatureOf = (draw: DrawGroup[]) =>
  draw.map((g) => `${g.number}:${g.playerIds.join(",")}`).join("|");

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

/** Freezes the board into what players will see. Empty groups are left off the sheet. */
export function buildPublished(
  draw: DrawGroup[],
  players: PlayerRecord[],
  tournament: Tournament,
  at: string,
  provisionalIds: ReadonlySet<string> = new Set(),
): Published {
  const nameById = new Map(players.map((p) => [p.id, p.name]));
  const flightName = (id: string | null) =>
    tournament.flights.find((f) => f.id === id)?.name ?? "—";
  const groupLabel = (g: DrawGroup) =>
    provisionalIds.size > 0 && g.playerIds.every((id) => provisionalIds.has(id))
      ? UNCLASSIFIED_LABEL
      : flightName(g.flightId);
  return {
    tournamentId: tournament.id,
    at,
    signature: signatureOf(draw),
    groups: draw
      .filter((g) => g.playerIds.length > 0)
      .map((g) => ({
        number: g.number,
        startHole: g.startHole,
        wave: g.wave,
        time: g.time,
        flight: groupLabel(g),
        players: g.playerIds.map((id) => nameById.get(id) ?? "").filter((n) => n !== ""),
        playerIds: g.playerIds.filter((id) => nameById.has(id)),
      })),
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
  const fullName = `${firstName} ${lastName}`.trim();
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
      const input = routingInputFor(state);
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
      const result = route(input, { lockedGroups: locked });
      const sameMembers = (a2: string[], b2: string[]) =>
        a2.length === b2.length && [...a2].sort().join(",") === [...b2].sort().join(",");
      const draw: DrawGroup[] = result.groups.map((g) => ({
        ...g,
        locked:
          a.preserveLocks &&
          previous.some((p) => p.locked && sameMembers(p.playerIds, g.playerIds)),
      }));
      const next: BoardState = {
        draw,
        // Small groups are checked live by validateDraw, so the engine's one-off copy would go stale.
        warnings: result.warnings.filter((w) => !/a group has only/.test(w)),
        published: a.preserveLocks ? board.published : null,
        overrides: a.preserveLocks ? board.overrides : [],
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
        id: `ov-${state.seq + 1}`,
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

    case "setGroupLocked": {
      const t = activeTournament(state);
      const board = boardOf(state);
      if (!t || !board.draw) return state;
      const draw = board.draw.map((g) => (g.number === a.group ? { ...g, locked: a.locked } : g));
      const override: ManualOverride = {
        id: `ov-${state.seq + 1}`,
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

    case "publish": {
      const t = activeTournament(state);
      const board = boardOf(state);
      if (!t || !board.draw) return state;
      const regs = buildRegistrations(state);
      // The page disables the button too; this is the backstop.
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
      });
      if (issues.some((i) => i.severity === "blocking")) return state;
      return withBoard(state, t.id, {
        ...board,
        published: buildPublished(
          board.draw,
          state.players,
          t,
          new Date().toISOString(),
          provisionalIdsOf(regs),
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
