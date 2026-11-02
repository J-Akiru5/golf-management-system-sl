/**
 * Domain types for the tournament desk. These are the contracts the screens work with, and the
 * shapes a future Supabase adapter will read and write (`club_id` on every record, see
 * docs/handoffs/backend-supabase-data.md). Nothing here talks to a network; the local mock
 * adapters in `src/lib/data/adapters.ts` are the only implementations today.
 */
import type {
  CategoryRule,
  FlightRule,
  Gender,
  Registration,
  TournamentConfig,
} from "@/lib/routing";

/** The tenant boundary. IGCC is the only club now; every record below carries its id. */
export interface Club {
  id: string;
  name: string;
  shortName: string;
  location: string;
}

export interface Course {
  id: string;
  clubId: string;
  name: string;
  holes: number;
}

/**
 * A hole from the club scorecard. Par and stroke index stay null until the club supplies the real
 * values, so nothing can be mistaken for official data.
 */
export interface Hole {
  id: string;
  courseId: string;
  number: number;
  par: number | null;
  strokeIndex: number | null;
}

/**
 * A player record in the club directory. Birthdate and gender can be missing: an import can create
 * a stub that the desk completes later, and anything incomplete is marked for review rather than
 * guessed.
 */
export interface PlayerRecord {
  id: string;
  clubId: string;
  firstName: string;
  lastName: string;
  nickname: string | null;
  /** Display name used on sheets and lists, in capitals. */
  name: string;
  /** The name as stored, before the display capitalisation. Used when writing back. */
  fullName?: string;
  /** ISO date, or null when the club has not recorded it. */
  birthdate: string | null;
  gender: Gender | null;
  homeCourse: string | null;
  contactNumber: string | null;
  email: string | null;
  ngapId: string | null;
  /** The WHS/Golf ID when it is different from the NGAP id. */
  whsId?: string | null;
  /** Data URL of a shrunk photo; present only with recorded internal consent. */
  photo?: string;
  /** Internal-use consent: check-in, desk profile and posters. */
  photoConsent?: boolean;
  /** Separate consent to show the photo on public pairings and results. */
  photoPublicConsent?: boolean;
  /** The public-bucket path, when a public copy exists. Never a private path. */
  photoPublicPath?: string | null;
  /** Club membership classification, when an active membership row exists. */
  membershipType?: "member" | "guest" | null;
  memberNumber?: string | null;
  createdAt: string;
}

/** A caddie profile. Caddies are club people, not login accounts and not players. */
export interface Caddie {
  id: string;
  clubId: string;
  fullName: string;
  nickname: string | null;
  phone: string | null;
  email: string | null;
  active: boolean;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

/** One caddie carrying one player on one tournament day. */
export interface CaddieAssignment {
  id: string;
  clubId: string;
  tournamentId: string;
  tournamentDayId: string;
  registrationDayId: string;
  caddieId: string;
  caddieName?: string;
  status: "assigned" | "confirmed" | "cancelled";
  note: string | null;
  assignedAt: string;
}

/** One imported (or manually corrected) handicap index. The official index comes from NGAP. */
export interface HandicapRecord {
  id: string;
  clubId: string;
  playerId: string;
  /** Plus handicaps are stored negative. null = NH (no handicap) on that revision. */
  index: number | null;
  /** ISO effective date of the revision. */
  effectiveDate: string;
  source: "ngap_import" | "manual_fix" | "demo_seed";
  /** File name of the upload this came from, for the audit trail. */
  uploadRef: string | null;
  recordedAt: string;
}

/** One upload of the club's NGAP export, kept as a reference for the records it produced. */
export interface HandicapImportBatch {
  id: string;
  clubId: string;
  fileName: string;
  importedAt: string;
  rowCount: number;
  appliedCount: number;
  skippedCount: number;
  note: string | null;
}

/** A row the organizer chose to defer at import time. It is kept for a later decision. */
export interface DeferredMatch {
  id: string;
  clubId: string;
  name: string;
  ngapId: string | null;
  index: number | null;
  effectiveDate: string;
  reason: string;
  candidatePlayerIds: string[];
  fileName: string;
  at: string;
}

/** A question the organizer sets per event. Extra answers hang off the registration. */
export interface RegistrationField {
  id: string;
  label: string;
  type: "text" | "select" | "number" | "checkbox";
  options: string[];
  required: boolean;
  appliesTo: "member" | "guest" | "both";
  help: string | null;
  /** Seeded for the demo; the organizer can rename or remove it. */
  sample: boolean;
}

/** One day of the event with the tee times a player can ask for. */
export interface DayTeePreference {
  day: number;
  label: string;
  /** ISO date. */
  date: string;
  options: string[];
  /** True when the supplied value still needs the organizer to confirm it. */
  needsConfirmation: boolean;
}

export interface TournamentPayment {
  method: string;
  bank: string;
  accountName: string;
  accountNumber: string;
  /** Shown next to the instruction; payment is recorded by hand, never taken online. */
  note: string;
}

/** One scheduled day of an event. The day number is stable; the date is what people read. */
export interface TournamentDay {
  id: string;
  dayNumber: number;
  /** ISO date. */
  playDate: string;
  label: string;
  /** HH:MM, or null when the day's start is not set. */
  startTime: string | null;
  isPlayingDay: boolean;
}

export interface TournamentRegistration {
  responseEmail: string;
  /** The supplied question wording, kept editable. */
  sponsorQuestion: string;
  /** null = cash or club arrangement, no bank instruction shown. */
  payment: TournamentPayment | null;
  teeTimes: DayTeePreference[];
  shirtSizes: string[];
  fields: RegistrationField[];
  /** Free line shown at the top of the registration desk. */
  instructions: string | null;
}

export interface Tournament {
  id: string;
  clubId: string;
  name: string;
  /** The sponsor or host named on the printed card, when one was entered. */
  hostName?: string | null;
  /** Private event-logo object path. The signed URL is loaded separately. */
  logoPath?: string | null;
  /** Short-lived signed URL for staff screens and printing. */
  logoUrl?: string;
  /** The organizers' rules of play, shown on the public page. Null until they provide them. */
  rulesOfPlay?: string | null;
  /** The supplied event name is a demo title until the club confirms it. */
  nameNeedsConfirmation: boolean;
  courseId: string;
  /** All days of play, ISO. The first day is what age is measured on until the club says otherwise. */
  dates: string[];
  /** Structured days, when the connected database has them. Demo derives them from the dates. */
  days?: TournamentDay[];
  /** How many playing days a registration must take, or null for no rule. */
  requiredDays?: number | null;
  /** The most playing days a registration may take, or null for no limit. */
  maxDays?: number | null;
  /** ISO. The index on or before this date is the one frozen onto a registration. */
  cutOffDate: string;
  /** Cut-off and dates are sample values until the organizer confirms them. */
  scheduleNeedsConfirmation: boolean;
  /**
   * An owner or organizer checked the tees and holes against the club scorecard. Until then every
   * printed sheet carries the placeholder watermark, whatever numbers are saved.
   */
  courseDataConfirmed: boolean;
  config: TournamentConfig;
  categories: CategoryRule[];
  flights: FlightRule[];
  registration: TournamentRegistration;
  /** A frozen index older than this is flagged for a fresh import. */
  staleIndexDays: number;
  state: "draft" | "open" | "closed";
  createdAt: string;
}

export type PaymentStatus = "not_recorded" | "pending" | "recorded_paid" | "waived";

export const PAYMENT_LABEL: Record<PaymentStatus, string> = {
  not_recorded: "Not recorded",
  pending: "Pending",
  recorded_paid: "Recorded paid (manual)",
  waived: "Waived",
};

/** The index copied onto a registration when it is created, so later imports cannot move it. */
export interface FrozenIndex {
  index: number | null;
  recordId: string | null;
  effectiveDate: string | null;
  frozenAt: string;
}

/** One registration's confirmed tee time on one day. Kept apart from the day selection. */
export interface DayTeeAssignment {
  /** HH:MM, or null when no time is assigned. */
  teeTime: string | null;
  /** Starting hole, or null. */
  startHole: number | null;
  confirmed: boolean;
}

/**
 * A registration: one player in one event. Member and guest are explicit roles, and every entry
 * links to a player profile.
 */
export interface RegistrationEntry {
  id: string;
  clubId: string;
  tournamentId: string;
  playerId: string;
  role: "member" | "guest";
  /** Answer to the event's sponsor question; null = not asked yet. */
  sponsor: boolean | null;
  shirt: string | null;
  /** Tee time asked for, per day (ISO date key). A preference, never a confirmed start. */
  teePreferences: Record<string, string | null>;
  /** Selected tournament day numbers. Structured; never a display string. */
  selectedDays?: number[];
  /** Confirmed tee-time assignments, keyed by tournament day number. */
  dayTee?: Record<number, DayTeeAssignment>;
  /** Active caddie assignment per tournament day, when one exists. */
  caddieByDay?: Record<number, { caddieId: string; caddieName: string; status: string }>;
  /** Given by the participant on the form; informational, not used for eligibility. */
  declaredWshId: string | null;
  declaredWshHandicap: string | null;
  /** Answers to the tournament's schema-driven extra fields. */
  extra: Record<string, string>;
  paymentStatus: PaymentStatus;
  frozen: FrozenIndex;
  /** The stored status. It is derived again unless the organizer overrode this entry. */
  status?: "ok" | "ineligible" | "needs_review";
  /** Stored notes, including the details still pending after an override. */
  reasons?: string[];
  /** Manual routing facts stored with an organizer override. */
  categoryId?: string | null;
  teeId?: string | null;
  flightId?: string | null;
  playingHandicap?: number | null;
  overridden?: boolean;
  overrideReason?: string | null;
  createdAt: string;
  source: "desk" | "demo_seed";
}

/** A change the organizer made by hand, with the reason. The router never does this. */
export interface ManualOverride {
  id: string;
  tournamentId: string;
  playerId: string;
  kind: "move" | "lock" | "unlock" | "flight";
  from: string | null;
  to: string | null;
  reason: string;
  at: string;
}

/** A registration plus the frozen-index facts the desk needs to explain its routing. */
export interface DeskRegistration extends Registration {
  entryId: string;
  role: "member" | "guest";
  /** False when the player's birthdate is not on file; `age` is then 0 and must not be shown. */
  ageKnown: boolean;
  frozenIndex: number | null;
  frozenRecordId: string | null;
  frozenEffectiveDate: string | null;
  /** Latest record after the cut-off, if any. It does not affect this event. */
  newerRecord: { index: number | null; effectiveDate: string } | null;
  /** True when the latest record on or before the cut-off differs from what was frozen. */
  frozenOutdated: boolean;
  /** True when the frozen index is older than the event's stale allowance. */
  staleIndex: boolean;
  /** Warnings that belong to the freeze, kept apart from the engine's reasons. */
  flags: string[];
  paymentStatus: PaymentStatus;
  sponsor: boolean | null;
  teePreferences: Record<string, string | null>;
}

export interface PublicPairingPlayer {
  /** Stable id when the snapshot was published with one; null for old snapshots. */
  id: string | null;
  name: string;
  /** A path in the public photo bucket, or null when public consent is absent. */
  photoPath: string | null;
}

/** What the public pairing preview is allowed to show. Built by an allow-list, never by passing a
 * player or registration object through. */
export interface PublicPairingGroup {
  number: number;
  startHole: number;
  wave: string | null;
  time: string;
  flight: string;
  players: PublicPairingPlayer[];
}

export interface PublicPairings {
  tournamentName: string;
  dateLabel: string;
  startFormat: TournamentConfig["startFormat"];
  firstTeeTime: string;
  groups: PublicPairingGroup[];
}

/**
 * One player's start on one playing day, as the public page may show it. A time that the desk has
 * not confirmed is deliberately withheld: `teeTime` is null even when a row exists, so a partly
 * entered schedule can never read as a confirmed start to a player.
 */
export interface PublicTeeTimePlayer {
  name: string;
  /** "HH:MM" when confirmed, otherwise null. */
  teeTime: string | null;
  startHole: number | null;
  confirmed: boolean;
}

/** One scheduled day of the event. */
export interface PublicTeeTimeDay {
  dayNumber: number;
  label: string;
  /** ISO date. */
  playDate: string;
  /** "HH:MM", or null when the day's start is not set. */
  startTime: string | null;
  players: PublicTeeTimePlayer[];
}

/**
 * The public player card. It is built by an allow-list, never by passing a player or registration
 * row through. Contact details, birthdate, gender, notes and photos are deliberately absent.
 */
export interface PublicPlayerProfile {
  name: string;
  homeCourse: string | null;
  /** The index frozen at the cut-off, which is the one the draw used. Null means no index on file. */
  index: number | null;
  category: string | null;
  flight: string | null;
}

/** The day schedule, the player list and the organizers' rules of play. */
export interface PublicProgramme {
  days: PublicTeeTimeDay[];
  players: PublicPlayerProfile[];
  /** Trimmed organizer text, or null when nothing has been entered. */
  rulesOfPlay: string | null;
}
