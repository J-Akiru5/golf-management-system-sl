import type {
  TaskPriority,
  TaskStatus,
  WsTaskCommentRow,
  WsTaskRow,
  WorkspaceRole,
} from "@/lib/db/types";

/** A workspace member as the task screens need them: an id and a name to show. */
export type TaskMember = { id: string; displayName: string };

/** A pipeline card as the link picker needs it. */
export type TaskCardOption = { id: string; title: string };

/** Who is looking at the list. */
export type TaskViewer = { id: string; role: WorkspaceRole; displayName: string };

/** What "New task" collects. Anything left out takes the database default. */
export type TaskDraft = {
  title: string;
  description?: string | null;
  assigneeId?: string | null;
  dueDate?: string | null;
  priority?: TaskPriority;
  pipelineCardId?: string | null;
  tournamentId?: string | null;
};

/** What an edit may change. A missing key means "leave it alone". */
export type TaskPatch = {
  title?: string;
  description?: string | null;
  assigneeId?: string | null;
  dueDate?: string | null;
  priority?: TaskPriority;
  status?: TaskStatus;
  pipelineCardId?: string | null;
  tournamentId?: string | null;
};

/**
 * A server action result. The message is carried as a value because a thrown error is redacted in
 * a production build, and "Only an owner or partner can delete a task" is worth showing.
 */
export type ActionResult<T> = { ok: true; value: T } | { ok: false; error: string };

/** The task operations a screen may call. Implemented by the server actions in the route. */
export type TaskActions = {
  createTask(input: TaskDraft): Promise<ActionResult<WsTaskRow>>;
  updateTask(id: string, patch: TaskPatch): Promise<ActionResult<WsTaskRow>>;
  setStatus(id: string, status: TaskStatus): Promise<ActionResult<WsTaskRow>>;
  deleteTask(id: string): Promise<ActionResult<void>>;
  listComments(taskId: string): Promise<ActionResult<WsTaskCommentRow[]>>;
  addComment(taskId: string, body: string): Promise<ActionResult<WsTaskCommentRow>>;
  editComment(id: string, body: string): Promise<ActionResult<WsTaskCommentRow>>;
  deleteComment(id: string): Promise<ActionResult<void>>;
};

/**
 * The repository contract. RLS does the access control, so there is no role argument here. A
 * repository throws on failure; the server actions wrap the result for the screen.
 */
export interface TasksRepo {
  listTasks(): Promise<WsTaskRow[]>;
  getTask(id: string): Promise<WsTaskRow | null>;
  createTask(input: TaskDraft): Promise<WsTaskRow>;
  updateTask(id: string, patch: TaskPatch): Promise<WsTaskRow>;
  setStatus(id: string, status: TaskStatus): Promise<WsTaskRow>;
  deleteTask(id: string): Promise<void>;
  listComments(taskId: string): Promise<WsTaskCommentRow[]>;
  addComment(taskId: string, body: string): Promise<WsTaskCommentRow>;
  editComment(id: string, body: string): Promise<WsTaskCommentRow>;
  deleteComment(id: string): Promise<void>;
  listMembers(): Promise<TaskMember[]>;
  listCards(): Promise<TaskCardOption[]>;
}
