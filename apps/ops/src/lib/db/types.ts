/**
 * Database types for the workspace tables.
 *
 * Written by hand from supabase/migrations/20261120000100 to 20261120000400 and owned by the
 * orchestrator. Workstreams import from here and never edit it. If a column is missing, report it;
 * the schema is the contract.
 *
 * Shape follows what supabase-js expects for its `Database` generic.
 */

export type WorkspaceRole = "owner" | "partner" | "member";
export type WorkspaceMemberStatus = "active" | "suspended";

export type PipelineStage =
  | "inquiry"
  | "proposal_sent"
  | "confirmed"
  | "prep"
  | "live"
  | "wrap_up"
  | "invoiced_closed";

export type PricingModel = "per_player" | "annual" | "promo_discount";
export type TaskStatus = "todo" | "in_progress" | "blocked" | "done";
export type TaskPriority = "low" | "normal" | "high" | "urgent";
export type SnapshotKind = "manual" | "auto" | "pre_restore";

/** Tiptap / ProseMirror JSON. Kept loose on purpose: the editor owns its own schema. */
export type EditorJson = { type: string; [key: string]: unknown };

export type WorkspaceMemberRow = {
  user_id: string;
  role: WorkspaceRole;
  status: WorkspaceMemberStatus;
  display_name: string;
  invited_by: string | null;
  created_at: string;
  updated_at: string;
};

export type WsDocRow = {
  id: string;
  title: string;
  archived: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type WsDocStateRow = {
  doc_id: string;
  /** Base64 of the full Yjs update, the format @supabase-labs/y-supabase persists. */
  state: string;
  updated_by: string | null;
  updated_at: string;
};

export type WsDocSnapshotRow = {
  id: string;
  doc_id: string;
  name: string;
  kind: SnapshotKind;
  state: string;
  content: EditorJson;
  created_by: string | null;
  created_at: string;
};

export type WsPipelineCardRow = {
  id: string;
  tournament_id: string | null;
  title: string;
  club_name: string;
  stage: PipelineStage;
  position: number;
  start_date: string | null;
  end_date: string | null;
  expected_players: number | null;
  pricing_model: PricingModel | null;
  quoted_amount: number | null;
  currency: string;
  owner_id: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type WsTaskRow = {
  id: string;
  title: string;
  description: string | null;
  assignee_id: string | null;
  due_date: string | null;
  priority: TaskPriority;
  status: TaskStatus;
  position: number;
  pipeline_card_id: string | null;
  tournament_id: string | null;
  completed_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type WsTaskCommentRow = {
  id: string;
  task_id: string;
  body: string;
  author_id: string | null;
  created_at: string;
  edited_at: string | null;
};

/** Returned by ws_list_members(); owners only. */
export type WorkspaceMemberWithEmail = {
  user_id: string;
  email: string;
  role: WorkspaceRole;
  status: WorkspaceMemberStatus;
  display_name: string;
  created_at: string;
};

type Table<Row, Insert, Update> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
};

// Columns the database fills in. A client may omit them on insert.
type Generated = "id" | "created_at" | "updated_at";

export type Database = {
  public: {
    Tables: {
      // Rows are created through ws_add_member(), never by a direct insert.
      workspace_members: Table<
        WorkspaceMemberRow,
        never,
        Partial<Pick<WorkspaceMemberRow, "role" | "status" | "display_name">>
      >;
      ws_docs: Table<
        WsDocRow,
        Partial<Pick<WsDocRow, Generated | "archived">> & Pick<WsDocRow, "title" | "created_by">,
        Partial<Pick<WsDocRow, "title" | "archived">>
      >;
      ws_doc_states: Table<
        WsDocStateRow,
        Pick<WsDocStateRow, "doc_id" | "state">,
        Partial<Pick<WsDocStateRow, "state">>
      >;
      ws_doc_snapshots: Table<
        WsDocSnapshotRow,
        Partial<Pick<WsDocSnapshotRow, "id" | "kind" | "created_at">> &
          Pick<WsDocSnapshotRow, "doc_id" | "name" | "state" | "content" | "created_by">,
        never
      >;
      ws_pipeline_cards: Table<
        WsPipelineCardRow,
        Partial<Omit<WsPipelineCardRow, "created_by">> &
          Pick<WsPipelineCardRow, "title" | "club_name" | "created_by">,
        Partial<Omit<WsPipelineCardRow, "id" | "created_by" | "created_at" | "updated_at">>
      >;
      ws_tasks: Table<
        WsTaskRow,
        Partial<Omit<WsTaskRow, "created_by" | "completed_at">> &
          Pick<WsTaskRow, "title" | "created_by">,
        Partial<
          Omit<WsTaskRow, "id" | "created_by" | "created_at" | "updated_at" | "completed_at">
        >
      >;
      ws_task_comments: Table<
        WsTaskCommentRow,
        Partial<Pick<WsTaskCommentRow, "id" | "created_at">> &
          Pick<WsTaskCommentRow, "task_id" | "body" | "author_id">,
        Partial<Pick<WsTaskCommentRow, "body" | "edited_at">>
      >;
    };
    Views: Record<string, never>;
    Functions: {
      ws_is_member: { Args: Record<string, never>; Returns: boolean };
      ws_has_role: { Args: { p_roles: WorkspaceRole[] }; Returns: boolean };
      ws_add_member: {
        Args: { p_email: string; p_role: WorkspaceRole; p_display_name: string };
        Returns: string;
      };
      ws_list_members: { Args: Record<string, never>; Returns: WorkspaceMemberWithEmail[] };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
