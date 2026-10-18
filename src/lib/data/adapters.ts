import type { Dispatch } from "react";
import { explainRegistration, type RoutingExplanation } from "@/lib/data/explain";
import { freezeIndex, selectIndexForCutOff } from "@/lib/data/frozen";
import type {
  HandicapRecord,
  PaymentStatus,
  PlayerRecord,
  RegistrationEntry,
  Tournament,
} from "@/lib/data/types";
import { DEMO_TEES, SAMPLE_NGAP_CSV } from "@/lib/demo/data";
import {
  buildMergeQueue,
  type ColumnMapping,
  type ImportOptions,
  type MergeQueue,
  type ParsedFile,
  parseCsv,
  suggestMapping,
} from "@/lib/ngap";
import { rawCourseHandicap } from "@/lib/routing";
import {
  type Action,
  type ApplyImportPayload,
  activeTournament,
  boardOf,
  buildRegistrations,
  type DeskState,
  entriesFor,
  recordsFor,
  tournamentTemplate,
} from "@/lib/store/state";

/**
 * The data boundary. Screens talk to these interfaces, never to the store's internals, so the
 * Supabase implementation can replace the mock one without touching a page. Today every method is
 * backed by the in-memory desk store (`src/lib/store`), which is session-only. The future
 * Supabase adapters live next to this file (`src/lib/data/supabase/*.ts`) and keep the same
 * signatures; see docs/handoffs/backend-supabase-data.md.
 */

export interface NewPlayerInput {
  firstName: string;
  lastName: string;
  nickname?: string | null;
  birthdate?: string | null;
  gender?: "M" | "F" | null;
  homeCourse?: string | null;
  contactNumber?: string | null;
  email?: string | null;
  ngapId?: string | null;
  photo?: string;
  photoConsent?: boolean;
}

export interface NewEntryInput {
  playerId: string;
  role: "member" | "guest";
  sponsor: boolean | null;
  shirt: string | null;
  teePreferences: Record<string, string | null>;
  declaredWshId: string | null;
  declaredWshHandicap: string | null;
  extra: Record<string, string>;
  paymentStatus: PaymentStatus;
}

export interface PlayerRepository {
  list(): PlayerRecord[];
  search(query: string): PlayerRecord[];
  get(id: string): PlayerRecord | null;
  recordsFor(playerId: string): HandicapRecord[];
  /** Latest record on file, whatever its date. Display only; the event uses the frozen index. */
  latestRecord(playerId: string): HandicapRecord | null;
  add(input: NewPlayerInput): PlayerRecord;
  update(id: string, patch: Partial<PlayerRecord>): void;
  remove(id: string): void;
}

export interface TournamentRepository {
  list(): Tournament[];
  get(id: string): Tournament | null;
  active(): Tournament | null;
  select(id: string | null): void;
  save(tournament: Tournament): void;
  createFromTemplate(name: string, date: string): Tournament;
}

export interface RegistrationRepository {
  list(tournamentId: string): RegistrationEntry[];
  add(tournamentId: string, input: NewEntryInput): RegistrationEntry;
  update(id: string, patch: Partial<RegistrationEntry>): void;
  remove(id: string): void;
  /** Copies the latest index on or before the cut-off onto the entries again. */
  refreeze(tournamentId: string, entryIds?: string[]): void;
}

export interface HandicapImportAdapter {
  sampleFileName: string;
  sample(): string;
  parse(text: string): ParsedFile;
  guessMapping(headers: string[]): {
    mapping: Partial<ColumnMapping>;
    missing: (keyof ColumnMapping)[];
  };
  review(file: ParsedFile, players: PlayerRecord[], options: ImportOptions): MergeQueue;
  apply(payload: ApplyImportPayload): void;
}

export interface PairingsRouter {
  /** Re-runs the proposal. Locked groups keep their players and their slots when preserved. */
  propose(preserveLocks: boolean): void;
  explain(playerId: string): RoutingExplanation | null;
}

export interface Adapters {
  players: PlayerRepository;
  tournaments: TournamentRepository;
  registrations: RegistrationRepository;
  imports: HandicapImportAdapter;
  router: PairingsRouter;
}

let counter = 0;
const nextId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${(counter += 1)}`;

export function createMockAdapters(state: DeskState, dispatch: Dispatch<Action>): Adapters {
  const nameOf = (full: string, fallback: string) => full.trim() || fallback;

  const players: PlayerRepository = {
    list: () => state.players,
    search: (query) => {
      const q = query.trim().toLowerCase();
      if (!q) return state.players;
      return state.players.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.ngapId ?? "").toLowerCase().includes(q) ||
          (p.homeCourse ?? "").toLowerCase().includes(q) ||
          (p.nickname ?? "").toLowerCase().includes(q),
      );
    },
    get: (id) => state.players.find((p) => p.id === id) ?? null,
    recordsFor: (playerId) => recordsFor(state, playerId),
    latestRecord: (playerId) => {
      const list = recordsFor(state, playerId).sort((a, b) =>
        b.effectiveDate.localeCompare(a.effectiveDate),
      );
      return list[0] ?? null;
    },
    add: (input) => {
      const first = input.firstName.trim();
      const last = input.lastName.trim();
      const player: PlayerRecord = {
        id: nextId("p"),
        clubId: state.clubId,
        firstName: first,
        lastName: last,
        nickname: input.nickname?.trim() || null,
        name: nameOf(`${first} ${last}`, "Unnamed player"),
        birthdate: input.birthdate ?? null,
        gender: input.gender ?? null,
        homeCourse: input.homeCourse?.trim() || null,
        contactNumber: input.contactNumber?.trim() || null,
        email: input.email?.trim() || null,
        ngapId: input.ngapId?.trim() || null,
        photo: input.photo,
        photoConsent: input.photo ? (input.photoConsent ?? false) : undefined,
        createdAt: new Date().toISOString(),
      };
      dispatch({ type: "addPlayer", player });
      return player;
    },
    update: (id, patch) => dispatch({ type: "updatePlayer", id, patch }),
    remove: (id) => dispatch({ type: "removePlayer", id }),
  };

  const tournaments: TournamentRepository = {
    list: () => state.tournaments,
    get: (id) => state.tournaments.find((t) => t.id === id) ?? null,
    active: () => activeTournament(state),
    select: (id) => dispatch({ type: "selectTournament", id }),
    save: (tournament) => dispatch({ type: "saveTournament", tournament }),
    createFromTemplate: (name, date) => {
      const t = tournamentTemplate(state, name, date);
      dispatch({ type: "saveTournament", tournament: t });
      dispatch({ type: "selectTournament", id: t.id });
      return t;
    },
  };

  const registrations: RegistrationRepository = {
    list: (tournamentId) => entriesFor(state, tournamentId),
    add: (tournamentId, input) => {
      const selection = selectIndexForCutOff(
        recordsFor(state, input.playerId),
        cutOffOf(state, tournamentId),
      );
      const entry: RegistrationEntry = {
        id: nextId("e"),
        clubId: state.clubId,
        tournamentId,
        playerId: input.playerId,
        role: input.role,
        sponsor: input.sponsor,
        shirt: input.shirt,
        teePreferences: input.teePreferences,
        declaredWshId: input.declaredWshId,
        declaredWshHandicap: input.declaredWshHandicap,
        extra: input.extra,
        paymentStatus: input.paymentStatus,
        frozen: freezeIndex(selection, new Date().toISOString()),
        createdAt: new Date().toISOString(),
        source: "desk",
      };
      dispatch({ type: "addEntry", entry });
      return entry;
    },
    update: (id, patch) => dispatch({ type: "updateEntry", id, patch }),
    remove: (id) => dispatch({ type: "removeEntry", id }),
    refreeze: (tournamentId, entryIds) => dispatch({ type: "refreeze", tournamentId, entryIds }),
  };

  const imports: HandicapImportAdapter = {
    sampleFileName: "sample-ngap.csv",
    sample: () => SAMPLE_NGAP_CSV,
    parse: (text) => parseCsv(text),
    guessMapping: (headers) => suggestMapping(headers),
    review: (file, known, options) =>
      buildMergeQueue(
        file,
        known.map((p) => ({
          id: p.id,
          fullName: p.name,
          ngapId: p.ngapId,
          birthdate: p.birthdate,
          contactNumber: p.contactNumber,
        })),
        options,
      ),
    apply: (payload) => dispatch({ type: "applyImport", payload }),
  };

  const router: PairingsRouter = {
    propose: (preserveLocks) => dispatch({ type: "generate", preserveLocks }),
    explain: (playerId) => {
      const tournament = activeTournament(state);
      const player = state.players.find((p) => p.id === playerId);
      const entry = state.entries.find(
        (e) => e.playerId === playerId && e.tournamentId === state.activeTournamentId,
      );
      if (!tournament || !player || !entry) return null;
      const reg = buildRegistrations(state).find((r) => r.playerId === playerId);
      if (!reg) return null;
      const board = boardOf(state);
      const group = board.draw?.find((g) => g.playerIds.includes(playerId));
      const override = [...board.overrides].reverse().find((o) => o.playerId === playerId) ?? null;
      const tee = DEMO_TEES.find((t) => t.id === reg.teeId);
      return explainRegistration({
        tournament,
        player,
        entry,
        reg,
        tees: DEMO_TEES,
        group: group
          ? {
              number: group.number,
              startHole: group.startHole,
              wave: group.wave,
              time: group.time,
              locked: group.locked,
            }
          : null,
        override,
        categoryName: tournament.categories.find((c) => c.id === reg.categoryId)?.name ?? "—",
        flightName: tournament.flights.find((f) => f.id === reg.flightId)?.name ?? "—",
        teeName: tee?.name ?? "—",
      });
    },
  };

  return { players, tournaments, registrations, imports, router };
}

const cutOffOf = (s: DeskState, tournamentId: string) =>
  s.tournaments.find((t) => t.id === tournamentId)?.cutOffDate ?? "9999-12-31";
