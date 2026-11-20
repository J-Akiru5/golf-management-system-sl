/**
 * Handwritten from supabase/migrations/20261017000000_init.sql and
 * supabase/migrations/20261018000000_supabase_data_layer.sql.
 * Regenerate with `supabase gen types typescript` after a project is linked.
 */
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type Table<Row, Insert, Update = Partial<Insert>> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
};

export type ClubRow = { id: string; name: string; created_at: string };
export type ClubMemberRow = {
  club_id: string;
  user_id: string;
  display_name: string | null;
  role: "owner" | "organizer" | "desk";
  created_at: string;
};
export type CourseRow = { id: string; club_id: string; name: string; holes: number };
export type TeeRow = {
  id: string;
  club_id: string;
  course_id: string;
  name: string;
  course_rating: number;
  slope: number;
  par: number;
};
export type HoleRow = {
  club_id: string;
  course_id: string;
  number: number;
  par: number;
  stroke_index: number;
};
/** One versioned course map. The app reads only the published row for its course. */
export type CourseMapRow = {
  id: string;
  club_id: string;
  course_id: string;
  version: number;
  status: string;
  note: string | null;
  base_image: string | null;
  created_by: string | null;
  created_at: string;
  technical_confirmed_at: string | null;
  validation_confirmed_at: string | null;
  published_by: string | null;
  published_at: string | null;
};

/** Marker positions on one map version, normalised 0..1 from the top-left. Not survey geometry. */
export type CourseMapHoleRow = {
  club_id: string;
  map_id: string;
  number: number;
  tee_x: number | null;
  tee_y: number | null;
  green_x: number | null;
  green_y: number | null;
  direction: string | null;
  source: string;
  notes: string | null;
};

/** A recorded confirmation or change request on a map version. Never edited once written. */
export type CourseMapReviewRow = {
  id: string;
  club_id: string;
  map_id: string;
  kind: string;
  reviewer_name: string;
  reviewer_user: string | null;
  decision: string;
  note: string | null;
  created_at: string;
};

export type PlayerRow = {
  id: string;
  club_id: string;
  full_name: string;
  // The hand-written row type keeps the historical non-null shape for the legacy mapper. The
  // database relaxes both columns in 20261037000000, and the current desk maps them through
  // `toPlayerRecord`, which allows null. The import writes through an RPC, not this insert type.
  birthdate: string;
  gender: "M" | "F";
  ngap_id: string | null;
  phone: string | null;
  photo_path: string | null;
  photo_consent_at: string | null;
  /** Added by 20261039000000. Optional so the desk still loads before that migration is applied. */
  photo_public_path?: string | null;
  photo_public_consent_at?: string | null;
  /**
   * Added by 20261111000100. The random public object name, never the player id. Optional so the
   * desk still loads before that migration is applied.
   */
  photo_public_token?: string | null;
  created_at: string;
  first_name: string | null;
  last_name: string | null;
  nickname: string | null;
  home_course: string | null;
  email: string | null;
  /** The account that claimed this record. Null until claimed; one account per entry. */
  user_id: string | null;
  /** Added by 20261037000000. Optional so code still loads on a database without it. */
  whs_id?: string | null;
  updated_at?: string;
  /** Added by 20261105000300. False when the club retired the record. */
  active?: boolean;
  /** When the desk soft-deleted the record. Null or absent while the player is in use. */
  deleted_at?: string | null;
};

/**
 * One note sent from the public feedback page. Added by 20261110000200.
 *
 * Readable only by club staff; the public writes through `submit_feedback` and never sees a row.
 * `rate_key` is a pseudonymous bucket, not an address.
 */
export type PublicFeedbackRow = {
  id: string;
  club_id: string;
  /** Added by 20261110000300. Null for general site feedback. */
  tournament_id: string | null;
  category: "improvement" | "bug" | "content" | "demo" | "concern";
  message: string;
  /** The structured part of a concern. Added by 20261122000000; null for every other category. */
  details: Json | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_consent: boolean;
  page_path: string | null;
  locale: "en" | "tl" | "hil";
  status: "new" | "read" | "planned" | "done" | "dismissed";
  /** Added by 20261110000300. Organizer-only. */
  resolution_note: string | null;
  resolution_note_updated_at: string | null;
  resolution_note_updated_by: string | null;
  rate_key: string;
  created_at: string;
  updated_at: string;
  status_changed_at: string | null;
  status_changed_by: string | null;
};

/** One queued or provider-confirmed email. Added by 20261040000000. */
export type EmailOutboxRow = {
  id: string;
  club_id: string;
  tournament_id: string;
  registration_id: string | null;
  recipient_email: string;
  recipient_name: string;
  kind: "confirmation" | "reminder" | "custom" | "feedback_digest" | "feedback_alert";
  subject: string;
  body: string;
  status: "queued" | "sending" | "sent" | "failed" | "skipped";
  scheduled_for: string | null;
  sent_at: string | null;
  provider_message_id: string | null;
  error: string | null;
  dedupe_key: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

/** Club-scoped member/guest classification. Added by 20261037000000. */
export type PlayerMembershipRow = {
  id: string;
  club_id: string;
  player_id: string;
  membership_type: "member" | "guest";
  member_number: string | null;
  status: "active" | "inactive";
  valid_from: string | null;
  valid_to: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
};

/** A club caddie profile. Added by 20261039000000. */
export type CaddieRow = {
  id: string;
  club_id: string;
  full_name: string;
  nickname: string | null;
  phone: string | null;
  email: string | null;
  active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

/** One caddie assignment on one player-day. Added by 20261039000000. */
export type CaddieAssignmentRow = {
  id: string;
  club_id: string;
  tournament_id: string;
  tournament_day_id: string;
  registration_day_id: string;
  caddie_id: string;
  status: "assigned" | "confirmed" | "cancelled";
  note: string | null;
  assigned_by: string | null;
  assigned_at: string;
  updated_at: string;
};
export type HandicapRecordRow = {
  id: string;
  club_id: string;
  player_id: string;
  /** Null = NH (no handicap) on that revision. */
  handicap_index: number | null;
  effective_date: string;
  source: "ngap_import" | "manual";
  created_at: string;
};
export type TournamentRow = {
  id: string;
  club_id: string;
  course_id: string;
  name: string;
  /** Added by 20261040000000. Optional so a database before that migration still loads. */
  host_name?: string | null;
  logo_path?: string | null;
  /** Added by 20261041000000. Optional so a database before that migration still loads. */
  rules_of_play?: string | null;
  /** Added by 20261110000000. The stored public release policy; read it through the RPCs. */
  publish_views?: Json;
  /** Added by 20261110000100. Audit only; never exposed by a public read. */
  publish_views_updated_at?: string | null;
  publish_views_updated_by?: string | null;
  /** Added by 20261112000100. Read only through public_advisory(); the raw object is never public. */
  public_advisory?: Json | null;
  play_date: string;
  cutoff_date: string;
  start_format: "shotgun" | "two_tee";
  first_tee_time: string;
  /** Added by 20261106000100. The club's afternoon start; optional so an older database still loads. */
  pm_first_tee_time?: string | null;
  interval_minutes: number;
  wave_gap_minutes: number;
  group_size: number;
  min_group_size: number;
  max_index: number;
  allowance: number;
  flight_basis: "index" | "course_handicap";
  published: boolean;
  published_snapshot: Json | null;
  /** Added by 20261121000000. The organizer's home page feature; set only through the RPC. */
  landing_featured?: boolean;
  created_at: string;
  dates: string[] | null;
  state: "draft" | "open" | "closed";
  name_needs_confirmation: boolean;
  schedule_needs_confirmation: boolean;
  /** Added by 20261027000000; absent on a database that has not applied it yet. */
  course_data_confirmed?: boolean;
  stale_index_days: number;
  registration: Json | null;
  // Added by 20261037000000. Optional so the desk still loads before that migration is applied.
  required_days?: number | null;
  max_days?: number | null;
  board_overrides: Json | null;
  draw_revision: number;
};

/** One stable day of an event. Added by 20261037000000. */
export type TournamentDayRow = {
  id: string;
  club_id: string;
  tournament_id: string;
  day_number: number;
  play_date: string;
  label: string;
  start_time: string | null;
  /** Added by 20261108000800. Optional so a database before that migration still loads. */
  pm_start_time?: string | null;
  notes: string | null;
  is_playing_day: boolean;
  created_at: string;
  updated_at: string;
};

/** A player's selected day and, separately, the assigned tee time. Added by 20261037000000. */
export type RegistrationDayRow = {
  id: string;
  club_id: string;
  registration_id: string;
  tournament_day_id: string;
  selected: boolean;
  session: string | null;
  tee_time: string | null;
  start_hole: number | null;
  tee_confirmed: boolean;
  wave: string | null;
  created_at: string;
  updated_at: string;
};
export type CategoryRow = {
  id: string;
  club_id: string;
  tournament_id: string;
  tee_id: string;
  name: string;
  gender: "M" | "F" | "any";
  min_age: number;
  max_age: number | null;
  sort_order: number;
};
export type FlightRow = {
  id: string;
  club_id: string;
  category_id: string;
  name: string;
  min_value: number;
  max_value: number;
};
export type RegistrationFieldRow = {
  id: string;
  club_id: string;
  tournament_id: string;
  key: string;
  label: string;
  options: Json | null;
  required: boolean;
};
export type RegistrationRow = {
  id: string;
  club_id: string;
  tournament_id: string;
  player_id: string;
  status: "ok" | "ineligible" | "needs_review";
  reasons: string[];
  frozen_index: number | null;
  category_id: string | null;
  tee_id: string | null;
  playing_handicap: number | null;
  flight_id: string | null;
  payment_status: "unpaid" | "paid" | "waived";
  answers: Json;
  overridden: boolean;
  created_at: string;
  /** Set by trigger from the session; never sent by the client. */
  registered_by: string | null;
  updated_at: string;
  updated_by: string | null;
  frozen_record_id: string | null;
  frozen_effective_date: string | null;
  frozen_at: string | null;
  // Added by 20261037000000. Optional so an older database still types.
  membership_type?: "member" | "guest" | null;
  shirt_size?: string | null;
  payment_amount?: number | null;
  payment_reference?: string | null;
  paid_at?: string | null;
  payment_note?: string | null;
  sponsor?: boolean | null;
  sponsor_details?: string | null;
  source?: "desk" | "public_form" | "import" | "demo";
  import_batch_id?: string | null;
};

/** One member-guest pair in an event. Added by 20261108002000. */
export type RegistrationPairRow = {
  id: string;
  club_id: string;
  tournament_id: string;
  number: number;
  created_at: string;
  updated_at: string;
};

/** One side of a pair. A registration id occurs at most once. Added by 20261108002000. */
export type RegistrationPairMemberRow = {
  club_id: string;
  pair_id: string;
  registration_id: string;
  side: "member" | "guest";
};

export type ImportBatchRow = {
  id: string;
  club_id: string;
  tournament_id: string | null;
  kind: "registration" | "handicap";
  file_name: string;
  worksheet: string | null;
  file_sha256: string;
  storage_path: string | null;
  mapping: Json;
  status: "pending" | "committed" | "partial" | "failed";
  row_count: number;
  inserted_count: number;
  updated_count: number;
  skipped_count: number;
  rejected_count: number;
  idempotency_key: string;
  uploaded_by: string | null;
  created_at: string;
  committed_at: string | null;
  error: string | null;
};

export type ImportRowRow = {
  id: number;
  batch_id: string;
  club_id: string;
  row_number: number;
  raw: Json | null;
  normalized: Json | null;
  action: "insert" | "update" | "skip" | "reject";
  status: "committed" | "skipped" | "rejected";
  error: string | null;
  player_id: string | null;
  registration_id: string | null;
  created_at: string;
};

export type AuditLogRow = {
  id: number;
  club_id: string;
  actor_id: string | null;
  action: string;
  entity: string;
  entity_id: string | null;
  batch_id: string | null;
  changed_columns: string[] | null;
  result: "ok" | "refused" | "failed";
  detail: Json | null;
  created_at: string;
};
export type ScoringAuditRow = {
  id: string;
  club_id: string;
  round_id: string | null;
  entity: string;
  entity_id: string | null;
  action: string;
  actor_id: string | null;
  at: string;
  reason: string | null;
  before: Json | null;
  after: Json | null;
};
export type HandicapImportBatchRow = {
  id: string;
  club_id: string;
  file_name: string;
  imported_at: string;
  row_count: number;
  applied_count: number;
  skipped_count: number;
  note: string | null;
  created_by: string | null;
};
export type DeferredMatchRow = {
  id: string;
  club_id: string;
  name: string;
  ngap_id: string | null;
  handicap_index: number | null;
  effective_date: string;
  reason: string;
  candidate_player_ids: string[];
  file_name: string;
  created_at: string;
};
export type GroupRow = {
  id: string;
  club_id: string;
  tournament_id: string;
  flight_id: string;
  number: number;
  start_hole: number;
  wave: string | null;
  tee_time: string;
  locked: boolean;
};
export type GroupMemberRow = {
  club_id: string;
  group_id: string;
  registration_id: string;
  position: number;
};
export type NotificationRow = {
  id: string;
  club_id: string;
  tournament_id: string;
  kind: string;
  subject: string;
  severity: "blocking" | "warning" | "info";
  title: string;
  detail: string | null;
  created_at: string;
  resolved_at: string | null;
};
export type NotificationReadRow = {
  club_id: string;
  notification_id: string;
  user_id: string;
  read_at: string;
};

/** One person's dismissal of one help panel. Interface state, not club data: see the migration. */
export type HelpSeenRow = {
  user_id: string;
  guide_id: string;
  seen_at: string;
};

type PublicPairingRow = {
  tournament_id: string;
  tournament_name: string;
  play_date: string;
  start_format: "shotgun" | "two_tee";
  first_tee_time: string;
  published_at: string | null;
  version: number | null;
  group_number: number | null;
  wave: string | null;
  start_hole: number | null;
  tee_time: string | null;
  flight_name: string | null;
  player_id?: string | null;
  player_name: string | null;
  photo_path?: string | null;
  /** Absent from the older public_pairings(); those rows are day 1. */
  day_number?: number | null;
  day_label?: string | null;
};

/** The row returned by public_pairings_by_day(), with the playing day always present. */
type PublicPairingByDayRow = PublicPairingRow & {
  day_number: number;
  day_label: string | null;
};

export interface Database {
  public: {
    Tables: {
      clubs: Table<ClubRow, { id?: string; name: string; created_at?: string }>;
      // One row per playing day; a draw board is stored against the day's round.
      competition_rounds: Table<
        {
          id: string;
          club_id: string;
          tournament_id: string;
          day_number: number;
          play_date: string;
          hole_count: number;
          status: string;
          allowance: number;
          handicap_rounding: string;
        },
        {
          id?: string;
          club_id: string;
          tournament_id: string;
          day_number: number;
          play_date: string;
          hole_count?: number;
          status?: string;
          allowance?: number;
          handicap_rounding?: string;
        }
      >;
      club_members: Table<
        ClubMemberRow,
        {
          club_id: string;
          user_id: string;
          display_name?: string | null;
          role?: ClubMemberRow["role"];
          created_at?: string;
        }
      >;
      courses: Table<CourseRow, { id?: string; club_id: string; name: string; holes?: number }>;
      tees: Table<
        TeeRow,
        {
          id?: string;
          club_id: string;
          course_id: string;
          name: string;
          course_rating: number;
          slope: number;
          par: number;
        }
      >;
      holes: Table<
        HoleRow,
        { club_id: string; course_id: string; number: number; par: number; stroke_index: number }
      >;
      players: Table<
        PlayerRow,
        {
          id?: string;
          club_id: string;
          full_name: string;
          // Nullable in the database since 20261037000000: the desk adds a player before the
          // birthdate and gender are known.
          birthdate?: string | null;
          gender?: PlayerRow["gender"] | null;
          ngap_id?: string | null;
          phone?: string | null;
          photo_path?: string | null;
          photo_consent_at?: string | null;
          photo_public_path?: string | null;
          photo_public_consent_at?: string | null;
          photo_public_token?: string | null;
          created_at?: string;
          first_name?: string | null;
          last_name?: string | null;
          nickname?: string | null;
          home_course?: string | null;
          email?: string | null;
          whs_id?: string | null;
          updated_at?: string;
          active?: boolean;
          deleted_at?: string | null;
        },
        {
          full_name?: string;
          birthdate?: string | null;
          gender?: PlayerRow["gender"] | null;
          ngap_id?: string | null;
          phone?: string | null;
          first_name?: string | null;
          last_name?: string | null;
          nickname?: string | null;
          home_course?: string | null;
          email?: string | null;
          whs_id?: string | null;
          updated_at?: string;
          photo_path?: string | null;
          photo_consent_at?: string | null;
          photo_public_path?: string | null;
          photo_public_consent_at?: string | null;
          photo_public_token?: string | null;
          active?: boolean;
          deleted_at?: string | null;
        }
      >;
      player_memberships: Table<
        PlayerMembershipRow,
        {
          id?: string;
          club_id: string;
          player_id: string;
          membership_type: "member" | "guest";
          member_number?: string | null;
          status?: "active" | "inactive";
          valid_from?: string | null;
          valid_to?: string | null;
          note?: string | null;
        }
      >;
      caddies: Table<
        CaddieRow,
        {
          id?: string;
          club_id: string;
          full_name: string;
          nickname?: string | null;
          phone?: string | null;
          email?: string | null;
          active?: boolean;
          notes?: string | null;
        }
      >;
      caddie_assignments: Table<
        CaddieAssignmentRow,
        {
          id?: string;
          club_id: string;
          tournament_id: string;
          tournament_day_id: string;
          registration_day_id: string;
          caddie_id: string;
          status?: CaddieAssignmentRow["status"];
          note?: string | null;
          assigned_by?: string | null;
        }
      >;
      public_feedback: Table<
        PublicFeedbackRow,
        {
          id?: string;
          club_id: string;
          tournament_id?: string | null;
          category: PublicFeedbackRow["category"];
          message: string;
          /** The concern's ticked boxes and follow-up answers. Null for every other category. */
          details?: Json | null;
          contact_name?: string | null;
          contact_email?: string | null;
          contact_consent?: boolean;
          page_path?: string | null;
          locale?: PublicFeedbackRow["locale"];
          status?: PublicFeedbackRow["status"];
          resolution_note?: string | null;
          resolution_note_updated_at?: string | null;
          resolution_note_updated_by?: string | null;
          rate_key: string;
          created_at?: string;
          updated_at?: string;
          status_changed_at?: string | null;
          status_changed_by?: string | null;
        },
        {
          status?: PublicFeedbackRow["status"];
          resolution_note?: string | null;
          resolution_note_updated_at?: string | null;
          resolution_note_updated_by?: string | null;
          updated_at?: string;
          status_changed_at?: string | null;
          status_changed_by?: string | null;
        }
      >;
      email_outbox: Table<
        EmailOutboxRow,
        {
          id?: string;
          club_id: string;
          tournament_id: string;
          registration_id?: string | null;
          recipient_email: string;
          recipient_name: string;
          kind: EmailOutboxRow["kind"];
          subject: string;
          body: string;
          status?: EmailOutboxRow["status"];
          scheduled_for?: string | null;
          sent_at?: string | null;
          provider_message_id?: string | null;
          error?: string | null;
          dedupe_key: string;
          created_by?: string | null;
        }
      >;
      handicap_import_batches: Table<
        HandicapImportBatchRow,
        {
          id?: string;
          club_id: string;
          file_name: string;
          imported_at?: string;
          row_count?: number;
          applied_count?: number;
          skipped_count?: number;
          note?: string | null;
          created_by?: string | null;
        }
      >;
      deferred_matches: Table<
        DeferredMatchRow,
        {
          id?: string;
          club_id: string;
          name: string;
          ngap_id?: string | null;
          handicap_index?: number | null;
          effective_date: string;
          reason: string;
          candidate_player_ids?: string[];
          file_name: string;
          created_at?: string;
        }
      >;
      handicap_records: Table<
        HandicapRecordRow,
        {
          id?: string;
          club_id: string;
          player_id: string;
          handicap_index: number | null;
          effective_date: string;
          source: HandicapRecordRow["source"];
          created_at?: string;
        }
      >;
      tournaments: Table<
        TournamentRow,
        {
          id?: string;
          club_id: string;
          course_id: string;
          name: string;
          host_name?: string | null;
          logo_path?: string | null;
          rules_of_play?: string | null;
          play_date: string;
          cutoff_date: string;
          start_format: TournamentRow["start_format"];
          first_tee_time: string;
          pm_first_tee_time?: string | null;
          interval_minutes?: number;
          wave_gap_minutes?: number;
          group_size?: number;
          min_group_size?: number;
          max_index?: number;
          allowance?: number;
          flight_basis?: TournamentRow["flight_basis"];
          published?: boolean;
          published_snapshot?: Json | null;
          /** Added by 20261121000000. At most one event per club carries it. */
          landing_featured?: boolean;
          /** Added by 20261110000000. The stored public release policy, including the reveal time. */
          publish_views?: Json;
          /** Added by 20261110000100. Audit only; never exposed by a public read. */
          publish_views_updated_at?: string | null;
          publish_views_updated_by?: string | null;
          created_at?: string;
          dates?: string[] | null;
          state?: TournamentRow["state"];
          name_needs_confirmation?: boolean;
          schedule_needs_confirmation?: boolean;
          course_data_confirmed?: boolean;
          stale_index_days?: number;
          registration?: Json | null;
          board_overrides?: Json | null;
          draw_revision?: number;
          required_days?: number | null;
          max_days?: number | null;
        }
      >;
      tournament_days: Table<
        TournamentDayRow,
        {
          id?: string;
          club_id: string;
          tournament_id: string;
          day_number: number;
          play_date: string;
          label: string;
          start_time?: string | null;
          pm_start_time?: string | null;
          notes?: string | null;
          is_playing_day?: boolean;
        }
      >;
      registration_days: Table<
        RegistrationDayRow,
        {
          id?: string;
          club_id: string;
          registration_id: string;
          tournament_day_id: string;
          selected?: boolean;
          session?: string | null;
          tee_time?: string | null;
          start_hole?: number | null;
          tee_confirmed?: boolean;
        }
      >;
      import_batches: Table<
        ImportBatchRow,
        {
          id?: string;
          club_id: string;
          tournament_id?: string | null;
          kind: ImportBatchRow["kind"];
          file_name: string;
          worksheet?: string | null;
          file_sha256: string;
          storage_path?: string | null;
          mapping?: Json;
          status?: ImportBatchRow["status"];
          row_count?: number;
          inserted_count?: number;
          updated_count?: number;
          skipped_count?: number;
          rejected_count?: number;
          idempotency_key: string;
          uploaded_by?: string | null;
          committed_at?: string | null;
          error?: string | null;
        }
      >;
      import_rows: Table<
        ImportRowRow,
        {
          id?: number;
          batch_id: string;
          club_id: string;
          row_number: number;
          raw?: Json | null;
          normalized?: Json | null;
          action: ImportRowRow["action"];
          status: ImportRowRow["status"];
          error?: string | null;
          player_id?: string | null;
          registration_id?: string | null;
        }
      >;
      audit_log: Table<
        AuditLogRow,
        {
          id?: number;
          club_id: string;
          actor_id?: string | null;
          action: string;
          entity: string;
          entity_id?: string | null;
          batch_id?: string | null;
          changed_columns?: string[] | null;
          result?: AuditLogRow["result"];
          detail?: Json | null;
        }
      >;
      scoring_audit: Table<
        ScoringAuditRow,
        {
          id?: string;
          club_id: string;
          round_id?: string | null;
          entity: string;
          entity_id?: string | null;
          action: string;
          actor_id?: string | null;
          at?: string;
          reason?: string | null;
          before?: Json | null;
          after?: Json | null;
        }
      >;
      categories: Table<
        CategoryRow,
        {
          id?: string;
          club_id: string;
          tournament_id: string;
          tee_id: string;
          name: string;
          gender?: CategoryRow["gender"];
          min_age?: number;
          max_age?: number | null;
          sort_order?: number;
        }
      >;
      flights: Table<
        FlightRow,
        {
          id?: string;
          club_id: string;
          category_id: string;
          name: string;
          min_value: number;
          max_value: number;
        }
      >;
      registration_fields: Table<
        RegistrationFieldRow,
        {
          id?: string;
          club_id: string;
          tournament_id: string;
          key: string;
          label: string;
          options?: Json | null;
          required?: boolean;
        }
      >;
      registrations: Table<
        RegistrationRow,
        {
          id?: string;
          club_id: string;
          tournament_id: string;
          player_id: string;
          status?: RegistrationRow["status"];
          reasons?: string[];
          frozen_index?: number | null;
          category_id?: string | null;
          tee_id?: string | null;
          playing_handicap?: number | null;
          flight_id?: string | null;
          payment_status?: RegistrationRow["payment_status"];
          answers?: Json;
          overridden?: boolean;
          created_at?: string;
          frozen_record_id?: string | null;
          frozen_effective_date?: string | null;
          frozen_at?: string | null;
          membership_type?: "member" | "guest" | null;
          shirt_size?: string | null;
          payment_amount?: number | null;
          payment_reference?: string | null;
          paid_at?: string | null;
          payment_note?: string | null;
          sponsor?: boolean | null;
          sponsor_details?: string | null;
          source?: RegistrationRow["source"];
          import_batch_id?: string | null;
        }
      >;
      registration_pairs: Table<
        RegistrationPairRow,
        {
          id?: string;
          club_id: string;
          tournament_id: string;
          number: number;
        }
      >;
      registration_pair_members: Table<
        RegistrationPairMemberRow,
        {
          club_id: string;
          pair_id: string;
          registration_id: string;
          side: RegistrationPairMemberRow["side"];
        }
      >;
      groups: Table<
        GroupRow,
        {
          id?: string;
          club_id: string;
          tournament_id: string;
          flight_id: string;
          number: number;
          start_hole: number;
          wave?: string | null;
          tee_time: string;
          locked?: boolean;
        }
      >;
      group_members: Table<
        GroupMemberRow,
        { club_id: string; group_id: string; registration_id: string; position: number }
      >;
      notifications: Table<
        NotificationRow,
        {
          id?: string;
          club_id: string;
          tournament_id: string;
          kind: string;
          subject?: string;
          severity: NotificationRow["severity"];
          title: string;
          detail?: string | null;
          created_at?: string;
          resolved_at?: string | null;
        }
      >;
      notification_reads: Table<
        NotificationReadRow,
        { club_id: string; notification_id: string; user_id: string; read_at?: string }
      >;
      help_seen: Table<HelpSeenRow, { guide_id: string; user_id?: string; seen_at?: string }>;
      course_maps: Table<
        CourseMapRow,
        {
          club_id: string;
          course_id: string;
          version: number;
          status?: string;
          note?: string | null;
          base_image?: string | null;
          created_by?: string | null;
        }
      >;
      course_map_holes: Table<
        CourseMapHoleRow,
        {
          club_id: string;
          map_id: string;
          number: number;
          tee_x?: number | null;
          tee_y?: number | null;
          green_x?: number | null;
          green_y?: number | null;
          direction?: string | null;
          source?: string;
          notes?: string | null;
        }
      >;
      course_map_reviews: Table<
        CourseMapReviewRow,
        {
          club_id: string;
          map_id: string;
          kind: string;
          reviewer_name: string;
          reviewer_user?: string | null;
          decision: string;
          note?: string | null;
        }
      >;
    };
    Views: Record<string, never>;
    Functions: {
      is_club_member: { Args: { p_club: string }; Returns: boolean };
      /** Added by 20261039000000. */
      set_player_membership: {
        Args: { p_player: string; p_type: string; p_member_number?: string | null };
        Returns: Json;
      };
      assign_caddie: {
        Args: { p_registration: string; p_day: number; p_caddie: string | null };
        Returns: Json;
      };
      public_published_rounds: { Args: Record<string, never>; Returns: Json };
      public_round_results: {
        Args: { p_round: string };
        Returns: {
          version: number;
          state: string;
          published_at: string;
          snapshot: Json;
        }[];
      };
      /**
       * Public photo paths. Added a second optional argument in 20261110000100 so the event's
       * `photos` hold applies; a one-argument call resolves against the event the public
       * programme selects.
       */
      public_player_photos: {
        Args: { p_ids: string[]; p_tournament?: string | null };
        Returns: Json;
      };
      /** Booleans only: which public surfaces the desk is holding for one event. */
      public_release_state: {
        Args: { p_tournament?: string | null };
        Returns: Json;
      };
      /**
       * The reveal time of a results blackout, or null. Added by 20261115000200 (NOT applied yet);
       * an older database answers PGRST202 and the public shows the holding screen without a
       * countdown.
       */
      public_reveal_state: {
        Args: { p_tournament?: string | null };
        Returns: Json;
      };
      /** The allow-listed organizer advisory, or null. Added by 20261112000100. */
      public_advisory: {
        Args: { p_tournament?: string | null };
        Returns: Json;
      };
      /** Owner or organizer only. Changes one release key and returns the new release state. */
      set_public_release: {
        Args: { p_tournament: string; p_surface: string; p_released: boolean };
        Returns: Json;
      };
      /**
       * Owner or organizer only. Turns the home page feature on or off for one event and returns
       * `{ tournamentId, featured }`. Added by hand with
       * 20261121000000_landing_showcase_and_demo.sql.
       */
      set_landing_feature: {
        Args: { p_tournament: string; p_featured: boolean };
        Returns: Json;
      };
      /** Added by 20261037000000; all return JSON and are granted to authenticated only. */
      save_day_rule: {
        Args: { p_tournament: string; p_required: number | null; p_max: number | null };
        Returns: Json;
      };
      set_registration_days: {
        Args: { p_registration: string; p_days: number[]; p_sessions: Json };
        Returns: Json;
      };
      assign_registration_day_tee: {
        Args: {
          p_registration: string;
          p_day: number;
          p_tee_time: string | null;
          p_start_hole: number | null;
          p_confirmed: boolean | null;
        };
        Returns: Json;
      };
      commit_registration_import: {
        Args: {
          p_tournament: string;
          p_file_name: string;
          p_worksheet: string | null;
          p_file_sha256: string;
          p_storage_path: string | null;
          p_mapping: Json;
          p_rows: Json;
          p_idempotency_key: string;
        };
        Returns: Json;
      };
      commit_handicap_import: {
        Args: {
          p_file_name: string;
          p_file_sha256: string;
          p_rows: Json;
          p_deferred: Json;
          p_idempotency_key: string;
        };
        Returns: Json;
      };
      create_course_map: { Args: { p_course: string; p_note?: string | null }; Returns: string };
      save_course_map_holes: { Args: { p_map: string; p_holes: Json }; Returns: number };
      record_course_map_review: {
        Args: {
          p_map: string;
          p_kind: string;
          p_reviewer_name: string;
          p_decision: string;
          p_note?: string | null;
        };
        Returns: string;
      };
      publish_course_map: { Args: { p_map: string }; Returns: string };
      sync_notifications: { Args: { p_tournament: string }; Returns: number };
      mark_notifications_read: { Args: { p_tournament: string }; Returns: number };
      mark_notification_read: { Args: { p_notification: string }; Returns: number };
      has_club_role: { Args: { p_club: string; p_roles: string[] }; Returns: boolean };
      save_event_setup: {
        Args: {
          p_tournament: string;
          p_expected_revision: number | null;
          p_course?: Json | null;
          p_holes?: Json | null;
          p_tees?: Json | null;
          p_categories?: Json | null;
          p_flights?: Json | null;
          p_basics?: Json | null;
          p_rules?: Json | null;
          p_start?: Json | null;
          p_registration?: Json | null;
        };
        Returns: Json;
      };
      public_registration_form: { Args: { p_tournament: string }; Returns: Json };
      /**
       * The one write an anonymous visitor can make on the feedback page. Added by hand with
       * 20261110000200_public_feedback.sql and extended with p_tournament by
       * 20261110000300_feedback_followups.sql.
       */
      submit_feedback: {
        Args: {
          p_category: string;
          p_message: string;
          p_contact_name?: string | null;
          p_contact_email?: string | null;
          p_contact_consent?: boolean;
          p_page_path?: string | null;
          p_locale?: string;
          p_honeypot?: string | null;
          p_tournament?: string | null;
          /** The concern's details. Added by 20261122000000, which is not applied yet. */
          p_details?: Json | null;
        };
        Returns: Json;
      };
      /**
       * Everything a signed-out visitor may see about an event, including events whose entries have
       * closed. `entriesOpen` says whether the entry form still applies. Added by hand with
       * 20261103000000_public_events_entries_closed.sql.
       */
      public_events: { Args: Record<string, never>; Returns: Json };
      /**
       * The landing page's events, including events finished in the last year, each with `finished`
       * and `featured` flags. Added by hand with 20261121000000_landing_showcase_and_demo.sql,
       * which is not applied yet, so `supabase gen types typescript` cannot produce it.
       */
      public_showcase_events: { Args: Record<string, never>; Returns: Json };
      /**
       * Every public event, in state open or closed, with no time limit, newest first, each with
       * finished, featured and hasRules. Added by hand with
       * 20261122000000_concerns_and_event_archive.sql, which is not applied yet, so
       * `supabase gen types typescript` cannot produce it.
       */
      public_event_archive: { Args: Record<string, never>; Returns: Json };
      /**
       * The events a signed-out visitor may see: open, cut-off not passed. Added by hand with
       * 20261033000000_public_open_events.sql, which is not applied to the live project yet, so
       * `supabase gen types typescript` cannot produce it. Remove this comment when it can.
       */
      public_open_events: { Args: Record<string, never>; Returns: Json };
      submit_registration: {
        Args: { p_tournament: string; p_player: Json; p_answers: Json };
        Returns: Json;
      };
      public_pairings: {
        Args: { p_tournament?: string | null };
        Returns: PublicPairingRow[];
      };
      /**
       * The same rows as public_pairings, split by playing day. Added by hand with
       * 20261108000600_public_pairings_by_day.sql, which is not applied yet, so
       * `supabase gen types typescript` cannot produce it.
       */
      public_pairings_by_day: {
        Args: { p_tournament?: string | null };
        Returns: PublicPairingByDayRow[];
      };
      /** The day schedule, public player cards and rules of play. Added by 20261041000000. */
      public_programme: {
        Args: { p_tournament?: string | null };
        Returns: Json;
      };
      /** One player's frozen scorecards, for the public profile tab. Added by 20261108003000. */
      public_player_scorecard: {
        Args: { p_player: string; p_tournament?: string | null };
        Returns: Json;
      };
      /** One row per player per published round, for the cumulative team leaderboard. */
      public_team_leaderboard: {
        Args: { p_tournament?: string | null };
        Returns: Json;
      };
      current_player_id: { Args: Record<string, never>; Returns: string | null };
      /** Two factors: NGAP plus birthdate, or the account email when the record holds it. */
      claim_player_record: {
        Args: { p_ngap_id: string | null; p_birthdate: string | null };
        Returns: Json;
      };
      player_portal_entries: { Args: Record<string, never>; Returns: Json };
      /** The caller's own record, contact details and photo booleans. Added by 20261108000300. */
      player_own_profile: { Args: Record<string, never>; Returns: Json };
      /** Creates, replaces, moves or removes one member-guest pair. Added by 20261108002000. */
      save_pair: {
        Args: {
          p_tournament: string;
          p_number: number;
          p_member?: string | null;
          p_guest?: string | null;
          p_action?: string;
          p_reason?: string | null;
        };
        Returns: Json;
      };
      /** Exchanges one side between two full pairs in one transaction. Added by 20261108002000. */
      swap_pair_members: {
        Args: {
          p_tournament: string;
          p_number_a: number;
          p_number_b: number;
          p_side?: string;
          p_reason?: string | null;
        };
        Returns: Json;
      };
      /** Writes only the caller's own phone, email and nickname. Added by 20261108000300. */
      player_update_own_contact: {
        Args: { p_phone: string | null; p_email: string | null; p_nickname: string | null };
        Returns: Json;
      };
      save_draw: {
        Args: {
          p_tournament: string;
          p_expected_revision: number;
          p_groups: Json;
          p_overrides?: Json | null;
          /** The playing day's round. Left out, the whole event board is replaced. */
          p_round?: string | null;
        };
        Returns: number;
      };
      publish_pairings: {
        Args: {
          p_tournament: string;
          p_expected_revision: number;
          p_groups: Json;
          p_signature: string;
          p_note?: string | null;
        };
        Returns: Json;
      };
      unpublish_pairings: { Args: { p_tournament: string }; Returns: undefined };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}

export type TableName = keyof Database["public"]["Tables"];
export type TableRow<T extends TableName> = Database["public"]["Tables"][T]["Row"];
export type TableInsert<T extends TableName> = Database["public"]["Tables"][T]["Insert"];
export type TableUpdate<T extends TableName> = Database["public"]["Tables"][T]["Update"];
export type PublicPairing = PublicPairingRow;
export type PublicPairingByDay = PublicPairingByDayRow;
