/**
 * Row <-> domain mappers for the Supabase adapter.
 *
 * The shell's domain types (`src/lib/data/types.ts`) are richer than the tables, so the mapping is
 * explicit in both directions: nothing is dropped silently, and anything the database cannot hold
 * yet is called out. Every value that the database does not carry stays null rather than being
 * guessed (AGENTS.md: never guess data).
 */
import type {
  Caddie,
  DeferredMatch,
  HandicapImportBatch,
  HandicapRecord,
  PlayerRecord,
  RegistrationEntry,
  Tournament,
  TournamentRegistration,
} from "@/lib/data/types";
import type { CategoryRule, FlightRule, TournamentConfig } from "@/lib/routing";
import type {
  CaddieRow,
  CategoryRow,
  DeferredMatchRow,
  FlightRow,
  HandicapImportBatchRow,
  HandicapRecordRow,
  PlayerRow,
  RegistrationRow,
  TournamentRow,
} from "@/lib/supabase/types";

/** "Maria Clara Santos" -> first "Maria Clara", last "Santos". */
export function splitName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length < 2) return { firstName: parts[0] ?? "", lastName: "" };
  return { firstName: parts.slice(0, -1).join(" "), lastName: parts.at(-1) ?? "" };
}

export function joinName(firstName: string, lastName: string): string {
  return `${firstName.trim()} ${lastName.trim()}`.trim();
}

// Row -> domain ---------------------------------------------------------------------------------

export function toPlayerRecord(row: PlayerRow, photoUrl?: string): PlayerRecord {
  const parts = splitName(row.full_name);
  return {
    id: row.id,
    clubId: row.club_id,
    firstName: row.first_name ?? parts.firstName,
    lastName: row.last_name ?? parts.lastName,
    nickname: row.nickname,
    name: row.full_name,
    birthdate: row.birthdate,
    gender: row.gender,
    homeCourse: row.home_course,
    contactNumber: row.phone,
    email: row.email,
    ngapId: row.ngap_id,
    whsId: row.whs_id ?? null,
    // A photo is only ever exposed where internal consent was recorded.
    photo: row.photo_consent_at ? photoUrl : undefined,
    photoConsent: Boolean(row.photo_consent_at),
    photoPublicConsent: Boolean(row.photo_public_consent_at),
    photoPublicPath: row.photo_public_path ?? null,
    createdAt: row.created_at,
  };
}

export function toCaddie(row: CaddieRow): Caddie {
  return {
    id: row.id,
    clubId: row.club_id,
    fullName: row.full_name,
    nickname: row.nickname,
    phone: row.phone,
    email: row.email,
    active: row.active,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function toHandicapRecord(row: HandicapRecordRow): HandicapRecord {
  return {
    id: row.id,
    clubId: row.club_id,
    playerId: row.player_id,
    index: row.handicap_index === null ? null : Number(row.handicap_index),
    effectiveDate: row.effective_date,
    source: row.source === "manual" ? "manual_fix" : "ngap_import",
    uploadRef: null,
    recordedAt: row.created_at,
  };
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function str(value: unknown, fallback: string | null = null): string | null {
  return typeof value === "string" ? value : fallback;
}

export function toRegistrationEntry(row: RegistrationRow): RegistrationEntry {
  const answers = record(row.answers);
  const teePreferences = record(answers.teePreferences);
  const extra = record(answers.extra);
  return {
    id: row.id,
    clubId: row.club_id,
    tournamentId: row.tournament_id,
    playerId: row.player_id,
    role:
      row.membership_type === "guest"
        ? "guest"
        : row.membership_type === "member"
          ? "member"
          : answers.role === "guest"
            ? "guest"
            : "member",
    sponsor:
      typeof row.sponsor === "boolean"
        ? row.sponsor
        : typeof answers.sponsor === "boolean"
          ? answers.sponsor
          : null,
    shirt: str(row.shirt_size) ?? str(answers.shirt),
    teePreferences: Object.fromEntries(
      Object.entries(teePreferences).map(([day, value]) => [day, str(value)]),
    ),
    declaredWshId: str(answers.declaredWshId),
    declaredWshHandicap: str(answers.declaredWshHandicap),
    extra: Object.fromEntries(
      Object.entries(extra).map(([key, value]) => [key, typeof value === "string" ? value : ""]),
    ),
    paymentStatus:
      row.payment_status === "paid"
        ? "recorded_paid"
        : row.payment_status === "waived"
          ? "waived"
          : "pending",
    frozen: {
      index: row.frozen_index === null ? null : Number(row.frozen_index),
      recordId: row.frozen_record_id,
      effectiveDate: row.frozen_effective_date,
      frozenAt: row.frozen_at ?? row.created_at,
    },
    createdAt: row.created_at,
    source: "desk",
  };
}

export function toCategoryRule(row: CategoryRow): CategoryRule {
  return {
    id: row.id,
    name: row.name,
    gender: row.gender,
    minAge: row.min_age,
    maxAge: row.max_age,
    teeId: row.tee_id,
  };
}

export function toFlightRule(row: FlightRow): FlightRule {
  return {
    id: row.id,
    categoryId: row.category_id,
    name: row.name,
    min: Number(row.min_value),
    max: Number(row.max_value),
  };
}

/** The registration-config block. Missing pieces render as empty, never as invented text. */
export function toTournamentRegistration(value: unknown): TournamentRegistration {
  const raw = record(value);
  const payment = record(raw.payment);
  const days = Array.isArray(raw.teeTimes) ? raw.teeTimes : [];
  const fields = Array.isArray(raw.fields) ? raw.fields : [];
  return {
    responseEmail: str(raw.responseEmail, "") ?? "",
    sponsorQuestion: str(raw.sponsorQuestion, "") ?? "",
    payment:
      Object.keys(payment).length > 0
        ? {
            method: str(payment.method, "") ?? "",
            bank: str(payment.bank, "") ?? "",
            accountName: str(payment.accountName, "") ?? "",
            accountNumber: str(payment.accountNumber, "") ?? "",
            note: str(payment.note, "") ?? "",
          }
        : null,
    teeTimes: days.map((day) => {
      const d = record(day);
      return {
        day: typeof d.day === "number" ? d.day : 0,
        label: str(d.label, "") ?? "",
        date: str(d.date, "") ?? "",
        options: Array.isArray(d.options)
          ? d.options.filter((o): o is string => typeof o === "string")
          : [],
        needsConfirmation: d.needsConfirmation === true,
      };
    }),
    shirtSizes: Array.isArray(raw.shirtSizes)
      ? raw.shirtSizes.filter((s): s is string => typeof s === "string")
      : [],
    fields: fields.map((field) => {
      const f = record(field);
      const type = str(f.type, "text") ?? "text";
      return {
        id: str(f.id, "") ?? "",
        label: str(f.label, "") ?? "",
        type: type === "select" || type === "number" || type === "checkbox" ? type : "text",
        options: Array.isArray(f.options)
          ? f.options.filter((o): o is string => typeof o === "string")
          : [],
        required: f.required === true,
        appliesTo:
          f.appliesTo === "member" || f.appliesTo === "guest" ? f.appliesTo : ("both" as const),
        help: str(f.help),
        sample: f.sample === true,
      };
    }),
    instructions: str(raw.instructions),
  };
}

export function toTournament(
  row: TournamentRow,
  categories: CategoryRule[],
  flights: FlightRule[],
): Tournament {
  const config: TournamentConfig = {
    date: row.play_date,
    maxIndex: Number(row.max_index),
    allowance: Number(row.allowance),
    flightBasis: row.flight_basis === "course_handicap" ? "courseHandicap" : "index",
    startFormat: row.start_format,
    holes: 18,
    groupSize: row.group_size,
    minGroupSize: row.min_group_size,
    firstTeeTime: row.first_tee_time.slice(0, 5),
    intervalMinutes: row.interval_minutes,
    waveGapMinutes: row.wave_gap_minutes,
  };
  return {
    id: row.id,
    clubId: row.club_id,
    name: row.name,
    hostName: row.host_name ?? null,
    logoPath: row.logo_path ?? null,
    nameNeedsConfirmation: row.name_needs_confirmation,
    courseId: row.course_id,
    dates: row.dates?.length ? row.dates : [row.play_date],
    requiredDays: row.required_days ?? null,
    maxDays: row.max_days ?? null,
    cutOffDate: row.cutoff_date,
    scheduleNeedsConfirmation: row.schedule_needs_confirmation,
    courseDataConfirmed: row.course_data_confirmed === true,
    config,
    categories,
    flights,
    registration: toTournamentRegistration(row.registration),
    staleIndexDays: row.stale_index_days,
    state: row.state,
    createdAt: row.created_at,
  };
}

export function toImportBatch(row: HandicapImportBatchRow): HandicapImportBatch {
  return {
    id: row.id,
    clubId: row.club_id,
    fileName: row.file_name,
    importedAt: row.imported_at,
    rowCount: row.row_count,
    appliedCount: row.applied_count,
    skippedCount: row.skipped_count,
    note: row.note,
  };
}

export function toDeferredMatch(row: DeferredMatchRow): DeferredMatch {
  return {
    id: row.id,
    clubId: row.club_id,
    name: row.name,
    ngapId: row.ngap_id,
    index: row.handicap_index === null ? null : Number(row.handicap_index),
    effectiveDate: row.effective_date,
    reason: row.reason,
    candidatePlayerIds: row.candidate_player_ids,
    fileName: row.file_name,
    at: row.created_at,
  };
}

// Domain -> row ---------------------------------------------------------------------------------

export function toPlayerInsert(player: PlayerRecord) {
  if (!player.birthdate || !player.gender) {
    throw new Error("A player added from the desk needs a birthdate and a gender.");
  }
  return {
    id: player.id,
    club_id: player.clubId,
    full_name: player.name,
    birthdate: player.birthdate,
    gender: player.gender,
    ngap_id: player.ngapId,
    whs_id: player.whsId ?? null,
    phone: player.contactNumber,
    first_name: player.firstName,
    last_name: player.lastName,
    nickname: player.nickname,
    home_course: player.homeCourse,
    email: player.email,
  };
}

/** The jsonb side of a registration: everything the columns do not carry. */
export function toRegistrationAnswers(entry: RegistrationEntry) {
  return {
    role: entry.role,
    sponsor: entry.sponsor,
    shirt: entry.shirt,
    teePreferences: entry.teePreferences,
    declaredWshId: entry.declaredWshId,
    declaredWshHandicap: entry.declaredWshHandicap,
    extra: entry.extra,
  };
}

export function toRegistrationInsert(entry: RegistrationEntry, tournamentId: string) {
  return {
    id: entry.id,
    club_id: entry.clubId,
    tournament_id: tournamentId,
    player_id: entry.playerId,
    frozen_index: entry.frozen.index,
    frozen_record_id: entry.frozen.recordId,
    frozen_effective_date: entry.frozen.effectiveDate,
    frozen_at: entry.frozen.frozenAt,
    payment_status:
      entry.paymentStatus === "recorded_paid"
        ? ("paid" as const)
        : entry.paymentStatus === "waived"
          ? ("waived" as const)
          : ("unpaid" as const),
    answers: toRegistrationAnswers(entry),
  };
}

export function toImportBatchInsert(batch: HandicapImportBatch) {
  return {
    id: batch.id,
    club_id: batch.clubId,
    file_name: batch.fileName,
    row_count: batch.rowCount,
    applied_count: batch.appliedCount,
    skipped_count: batch.skippedCount,
    note: batch.note,
  };
}

export function toDeferredMatchInsert(match: DeferredMatch) {
  return {
    id: match.id,
    club_id: match.clubId,
    name: match.name,
    ngap_id: match.ngapId,
    handicap_index: match.index,
    effective_date: match.effectiveDate,
    reason: match.reason,
    candidate_player_ids: match.candidatePlayerIds,
    file_name: match.fileName,
  };
}
