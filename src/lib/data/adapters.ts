import type { Dispatch } from "react";
import { courseNumbersChanged } from "@/lib/data/course-data";
import { daysOfTournament } from "@/lib/data/dates";
import type { EmailRepository } from "@/lib/data/email";
import { explainRegistration, type RoutingExplanation } from "@/lib/data/explain";
import { freezeIndex, selectIndexForCutOff } from "@/lib/data/frozen";
import type { SetupSection } from "@/lib/data/setup-payload";
import type {
  Caddie,
  DayTeeAssignment,
  HandicapRecord,
  Hole,
  PaymentStatus,
  PlayerRecord,
  RegistrationEntry,
  Tournament,
  TournamentDay,
} from "@/lib/data/types";
import { SAMPLE_NGAP_CSV } from "@/lib/demo/data";
import { displayName } from "@/lib/format";
import {
  buildMergeQueue,
  type ColumnMapping,
  type ImportOptions,
  type MergeQueue,
  type ParsedFile,
  parseCsv,
  suggestMapping,
} from "@/lib/ngap";
import { rawCourseHandicap, type Tee } from "@/lib/routing";
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
  whsId?: string | null;
  photo?: string;
  /** Internal-use consent for the photo. */
  photoConsent?: boolean;
  /** Separate consent to show the same photo on public pairings and results. */
  photoPublicConsent?: boolean;
}

export interface NewEntryInput {
  playerId: string;
  role: "member" | "guest";
  sponsor: boolean | null;
  shirt: string | null;
  teePreferences: Record<string, string | null>;
  /** Selected tournament day numbers. Empty means the desk has not chosen yet. */
  selectedDays: number[];
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
  /** Uploads a consented photo and resolves only after both the private and public copies are settled. */
  setPhoto(
    id: string,
    photoDataUrl: string,
    consent: { internal: boolean; public: boolean },
  ): Promise<void>;
  /** Removes the private original and the public derivative, then clears both consents. */
  removePhoto(id: string): Promise<void>;
  /** Copies an existing private photo to the public bucket, or removes the public copy. */
  setPhotoPublicConsent(id: string, consent: boolean): Promise<void>;
  setMembership(id: string, type: "member" | "guest", memberNumber?: string | null): Promise<void>;
  remove(id: string): void;
}

export interface TournamentRepository {
  list(): Tournament[];
  get(id: string): Tournament | null;
  active(): Tournament | null;
  select(id: string | null): void;
  save(tournament: Tournament): void;
  createFromTemplate(
    name: string,
    date: string,
    options?: {
      hostName?: string | null;
      dates?: string[];
      /** A PNG/JPEG/WebP data URL, uploaded by the connected adapter after the event is saved. */
      logo?: string;
    },
  ): Tournament;
  /** Uploads or replaces the event logo and returns a signed staff URL. */
  setLogo(id: string, logoDataUrl: string): Promise<string | null>;
  removeLogo(id: string): Promise<void>;
  /** The structured days of one event. Demo derives them from the old date list. */
  days(tournamentId: string): TournamentDay[];
  /** Owner/organizer only; the database function enforces it. */
  saveDayRule(tournamentId: string, required: number | null, max: number | null): Promise<void>;
}

/**
 * The event setup: course, holes, tees, categories and flights, plus the tournament-level rules the
 * Settings screen edits. Kept apart from `TournamentRepository.save` because it must land as one
 * write — a half-saved setup (new Slope, old flights) would route players against numbers that never
 * existed together.
 *
 * `sections` lets the screen save one section or everything at once; the database function takes the
 * same parameters as optional, so a section save never touches the rest. Omitted means everything.
 *
 * In demo mode only the tournament row is kept, because tees and holes are the session constants; the
 * connected adapter writes every table in one transaction and is revision-guarded.
 */
export interface SetupRepository {
  save(input: {
    tournament: Tournament;
    tees: Tee[];
    holes: Hole[];
    sections?: SetupSection[] | "all";
  }): void;
  /**
   * An owner or organizer vouches that the saved tees and holes match the club scorecard. Printed
   * sheets lose their placeholder watermark only after this, and any later edit to the numbers
   * withdraws it.
   */
  confirmCourse(tournamentId: string, confirmed: boolean): void;
}

export interface RegistrationRepository {
  list(tournamentId: string): RegistrationEntry[];
  add(tournamentId: string, input: NewEntryInput): RegistrationEntry;
  update(id: string, patch: Partial<RegistrationEntry>): void;
  remove(id: string): void;
  /** Copies the latest index on or before the cut-off onto the entries again. */
  refreeze(tournamentId: string, entryIds?: string[]): void;
  /** Replaces the player's selected day numbers. Resolves after the database accepts them. */
  setDays(entryId: string, days: number[]): Promise<void>;
  /** Assigns the confirmed tee time and start hole for one selected day. */
  assignDayTee(entryId: string, dayNumber: number, assignment: DayTeeAssignment): Promise<void>;
}

export interface CaddieRepository {
  list(): Caddie[];
  add(input: {
    fullName: string;
    nickname?: string | null;
    phone?: string | null;
    email?: string | null;
    notes?: string | null;
  }): Caddie;
  update(id: string, patch: Partial<Caddie>): void;
  remove(id: string): void;
  /** Assigns one caddie to a player's selected day, or clears it with null. */
  assign(entryId: string, dayNumber: number, caddieId: string | null): Promise<void>;
}

export interface ImportCommitResult {
  ok: boolean;
  partial?: boolean;
  alreadyCommitted?: boolean;
  batchId?: string;
  inserted?: number;
  updated?: number;
  skipped?: number;
  rejected?: number;
  message?: string;
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
  /** Resolves only after the database has committed the batch, or rejects with the reason. */
  apply(payload: ApplyImportPayload): Promise<ImportCommitResult>;
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
  caddies: CaddieRepository;
  email: EmailRepository;
  imports: HandicapImportAdapter;
  router: PairingsRouter;
  setup: SetupRepository;
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
      if (input.photo && !input.photoConsent) {
        throw new Error("A player photo cannot be saved without recorded consent.");
      }
      const first = input.firstName.trim();
      const last = input.lastName.trim();
      const fullName = nameOf(`${first} ${last}`, "Unnamed player");
      const player: PlayerRecord = {
        id: nextId("p"),
        clubId: state.clubId,
        firstName: first,
        lastName: last,
        nickname: input.nickname?.trim() || null,
        name: displayName(fullName),
        fullName,
        birthdate: input.birthdate ?? null,
        gender: input.gender ?? null,
        homeCourse: input.homeCourse?.trim() || null,
        contactNumber: input.contactNumber?.trim() || null,
        email: input.email?.trim() || null,
        ngapId: input.ngapId?.trim() || null,
        whsId: input.whsId?.trim() || null,
        photo: input.photo,
        photoConsent: input.photo ? (input.photoConsent ?? false) : undefined,
        photoPublicConsent:
          input.photo && input.photoConsent ? (input.photoPublicConsent ?? false) : undefined,
        createdAt: new Date().toISOString(),
      };
      dispatch({ type: "addPlayer", player });
      return player;
    },
    update: (id, patch) => dispatch({ type: "updatePlayer", id, patch }),
    setPhoto: async (id, photoDataUrl, consent) => {
      if (!consent.internal) throw new Error("A player photo needs recorded internal consent.");
      dispatch({
        type: "updatePlayer",
        id,
        patch: {
          photo: photoDataUrl,
          photoConsent: true,
          photoPublicConsent: consent.public,
        },
      });
    },
    removePhoto: async (id) => {
      dispatch({
        type: "updatePlayer",
        id,
        patch: { photo: undefined, photoConsent: false, photoPublicConsent: false },
      });
    },
    setPhotoPublicConsent: async (id, consent) => {
      const player = state.players.find((item) => item.id === id);
      if (consent && !player?.photoConsent) throw new Error("Save a consented photo first.");
      dispatch({
        type: "updatePlayer",
        id,
        patch: { photoPublicConsent: consent },
      });
    },
    setMembership: async (id, type, memberNumber) => {
      dispatch({
        type: "updatePlayer",
        id,
        patch: {
          membershipType: type,
          memberNumber: type === "member" ? memberNumber?.trim() || null : null,
        },
      });
    },
    remove: (id) => dispatch({ type: "removePlayer", id }),
  };

  const tournaments: TournamentRepository = {
    list: () => state.tournaments,
    get: (id) => state.tournaments.find((t) => t.id === id) ?? null,
    active: () => activeTournament(state),
    select: (id) => dispatch({ type: "selectTournament", id }),
    save: (tournament) => dispatch({ type: "saveTournament", tournament }),
    createFromTemplate: (name, date, options) => {
      const t = tournamentTemplate(state, name, date);
      const dates = options?.dates?.length ? options.dates : t.dates;
      const created: Tournament = {
        ...t,
        name,
        hostName: options?.hostName?.trim() || null,
        logoUrl: options?.logo,
        dates,
        config: { ...t.config, date: dates[0] ?? date },
      };
      dispatch({ type: "saveTournament", tournament: created });
      dispatch({ type: "selectTournament", id: created.id });
      return created;
    },
    setLogo: async (id, logoDataUrl) => {
      const tournament = state.tournaments.find((t) => t.id === id);
      if (!tournament) throw new Error("That event was not found.");
      dispatch({
        type: "setTournamentLogo",
        id,
        logoPath: null,
        logoUrl: logoDataUrl,
      });
      return logoDataUrl;
    },
    removeLogo: async (id) => {
      const tournament = state.tournaments.find((t) => t.id === id);
      if (!tournament) return;
      dispatch({
        type: "setTournamentLogo",
        id,
        logoPath: null,
        logoUrl: undefined,
      });
    },
    days: (tournamentId) => {
      const existing = state.days[tournamentId];
      if (existing?.length) return existing;
      const tournament = state.tournaments.find((t) => t.id === tournamentId);
      return tournament ? daysOfTournament(tournament) : [];
    },
    saveDayRule: async (tournamentId, required, max) => {
      const tournament = state.tournaments.find((t) => t.id === tournamentId);
      if (!tournament) throw new Error("That event was not found.");
      dispatch({
        type: "saveTournament",
        tournament: { ...tournament, requiredDays: required, maxDays: max },
      });
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
        selectedDays: input.selectedDays,
        dayTee: {},
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
    setDays: async (entryId, days) => {
      const entry = state.entries.find((item) => item.id === entryId);
      if (!entry) throw new Error("That registration was not found.");
      const caddieByDay = { ...(entry.caddieByDay ?? {}) };
      for (const key of Object.keys(caddieByDay)) {
        if (!days.includes(Number(key))) delete caddieByDay[Number(key)];
      }
      dispatch({
        type: "updateEntry",
        id: entryId,
        patch: { selectedDays: days, caddieByDay },
      });
    },
    assignDayTee: async (entryId, dayNumber, assignment) => {
      const entry = state.entries.find((item) => item.id === entryId);
      if (!entry) throw new Error("That registration was not found.");
      dispatch({
        type: "updateEntry",
        id: entryId,
        patch: { dayTee: { ...(entry.dayTee ?? {}), [dayNumber]: assignment } },
      });
    },
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
    apply: (payload) => {
      dispatch({ type: "applyImport", payload });
      return Promise.resolve({
        ok: true,
        inserted: payload.rows.length,
        skipped: payload.deferred.length,
        batchId: `demo-${Date.now().toString(36)}`,
      });
    },
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
      const tee = state.tees.find((t) => t.id === reg.teeId);
      return explainRegistration({
        tournament,
        player,
        entry,
        reg,
        tees: state.tees,
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

  // Demo mode keeps the setup in the session only. The connected adapter writes all five tables in
  // one transaction.
  const caddies: CaddieRepository = {
    list: () => state.caddies,
    add: (input) => {
      const now = new Date().toISOString();
      const caddie: Caddie = {
        id: nextId("c"),
        clubId: state.clubId,
        fullName: input.fullName.trim(),
        nickname: input.nickname?.trim() || null,
        phone: input.phone?.trim() || null,
        email: input.email?.trim() || null,
        active: true,
        notes: input.notes?.trim() || null,
        createdAt: now,
        updatedAt: now,
      };
      dispatch({ type: "addCaddie", caddie });
      return caddie;
    },
    update: (id, patch) => {
      if (patch.active === false) {
        const assigned = state.entries.some((entry) =>
          Object.values(entry.caddieByDay ?? {}).some((assignment) => assignment.caddieId === id),
        );
        if (assigned) {
          throw new Error(
            "This caddie still has an active assignment. Clear or reassign it first.",
          );
        }
      }
      dispatch({
        type: "updateCaddie",
        id,
        patch: { ...patch, updatedAt: new Date().toISOString() },
      });
    },
    remove: (id) => {
      const assigned = state.entries.some((entry) =>
        Object.values(entry.caddieByDay ?? {}).some((assignment) => assignment.caddieId === id),
      );
      if (assigned) {
        throw new Error("This caddie still has an active assignment. Clear or reassign it first.");
      }
      dispatch({ type: "removeCaddie", id });
    },
    assign: async (entryId, dayNumber, caddieId) => {
      const entry = state.entries.find((item) => item.id === entryId);
      if (!entry) throw new Error("That player entry was not found.");
      const next = { ...(entry.caddieByDay ?? {}) };
      if (!caddieId) {
        delete next[dayNumber];
      } else {
        const caddie = state.caddies.find((item) => item.id === caddieId && item.active);
        if (!caddie) throw new Error("That caddie is not active.");
        next[dayNumber] = {
          caddieId,
          caddieName: caddie.fullName,
          status: "assigned",
        };
      }
      dispatch({ type: "updateEntry", id: entryId, patch: { caddieByDay: next } });
    },
  };

  const setup: SetupRepository = {
    save: ({ tournament, tees, holes }) => {
      // Changing a rating or a hole after the card was confirmed withdraws the confirmation: what is
      // on screen is then no longer what was checked.
      const changed = courseNumbersChanged(
        { tees: state.tees, holes: state.holes },
        { tees, holes },
      );
      // saveSetup, not saveTournament: in demo mode the tees and holes belong to the session, and
      // dropping them here would lose the edit on the next render.
      dispatch({
        type: "saveSetup",
        tournament:
          changed && tournament.courseDataConfirmed
            ? { ...tournament, courseDataConfirmed: false }
            : tournament,
        tees,
        holes,
      });
    },
    confirmCourse: (tournamentId, confirmed) => {
      const t = state.tournaments.find((x) => x.id === tournamentId);
      if (t)
        dispatch({ type: "saveTournament", tournament: { ...t, courseDataConfirmed: confirmed } });
    },
  };

  const email: EmailRepository = {
    list: async () => [],
    queue: async () => ({
      queued: 0,
      skipped: 0,
      message: "Email reminders are available when the desk is connected to Supabase.",
    }),
    sendQueued: async () => ({
      configured: false,
      sent: 0,
      failed: 0,
      message: "Email reminders are available when the desk is connected to Supabase.",
    }),
    retryFailed: async () => 0,
  };

  return { players, tournaments, registrations, caddies, email, imports, router, setup };
}

const cutOffOf = (s: DeskState, tournamentId: string) =>
  s.tournaments.find((t) => t.id === tournamentId)?.cutOffDate ?? "9999-12-31";
