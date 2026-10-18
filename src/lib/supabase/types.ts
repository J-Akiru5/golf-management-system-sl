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
export type PlayerRow = {
  id: string;
  club_id: string;
  full_name: string;
  birthdate: string;
  gender: "M" | "F";
  ngap_id: string | null;
  phone: string | null;
  photo_path: string | null;
  photo_consent_at: string | null;
  created_at: string;
  first_name: string | null;
  last_name: string | null;
  nickname: string | null;
  home_course: string | null;
  email: string | null;
  /** The account that claimed this record. Null until claimed; one account per entry. */
  user_id: string | null;
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
  play_date: string;
  cutoff_date: string;
  start_format: "shotgun" | "two_tee";
  first_tee_time: string;
  interval_minutes: number;
  wave_gap_minutes: number;
  group_size: number;
  min_group_size: number;
  max_index: number;
  allowance: number;
  flight_basis: "index" | "course_handicap";
  published: boolean;
  published_snapshot: Json | null;
  created_at: string;
  dates: string[] | null;
  state: "draft" | "open" | "closed";
  name_needs_confirmation: boolean;
  schedule_needs_confirmation: boolean;
  stale_index_days: number;
  registration: Json | null;
  board_overrides: Json | null;
  draw_revision: number;
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
  player_name: string | null;
};

export interface Database {
  public: {
    Tables: {
      clubs: Table<ClubRow, { id?: string; name: string; created_at?: string }>;
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
          birthdate: string;
          gender: PlayerRow["gender"];
          ngap_id?: string | null;
          phone?: string | null;
          photo_path?: string | null;
          photo_consent_at?: string | null;
          created_at?: string;
          first_name?: string | null;
          last_name?: string | null;
          nickname?: string | null;
          home_course?: string | null;
          email?: string | null;
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
          play_date: string;
          cutoff_date: string;
          start_format: TournamentRow["start_format"];
          first_tee_time: string;
          interval_minutes?: number;
          wave_gap_minutes?: number;
          group_size?: number;
          min_group_size?: number;
          max_index?: number;
          allowance?: number;
          flight_basis?: TournamentRow["flight_basis"];
          published?: boolean;
          published_snapshot?: Json | null;
          created_at?: string;
          dates?: string[] | null;
          state?: TournamentRow["state"];
          name_needs_confirmation?: boolean;
          schedule_needs_confirmation?: boolean;
          stale_index_days?: number;
          registration?: Json | null;
          board_overrides?: Json | null;
          draw_revision?: number;
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
    };
    Views: Record<string, never>;
    Functions: {
      is_club_member: { Args: { p_club: string }; Returns: boolean };
      sync_notifications: { Args: { p_tournament: string }; Returns: number };
      mark_notifications_read: { Args: { p_tournament: string }; Returns: number };
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
        };
        Returns: Json;
      };
      public_registration_form: { Args: { p_tournament: string }; Returns: Json };
      submit_registration: {
        Args: { p_tournament: string; p_player: Json; p_answers: Json };
        Returns: Json;
      };
      public_pairings: {
        Args: { p_tournament?: string | null };
        Returns: PublicPairingRow[];
      };
      current_player_id: { Args: Record<string, never>; Returns: string | null };
      claim_player_record: {
        Args: { p_name: string | null; p_ngap_id: string | null };
        Returns: Json;
      };
      player_portal_entries: { Args: Record<string, never>; Returns: Json };
      save_draw: {
        Args: {
          p_tournament: string;
          p_expected_revision: number;
          p_groups: Json;
          p_overrides?: Json | null;
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
