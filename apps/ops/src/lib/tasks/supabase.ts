import type { SupabaseClient } from "@supabase/supabase-js";
import { POSITION_STEP } from "@/lib/db/constants";
import type { Database, TaskStatus, WsTaskCommentRow, WsTaskRow } from "@/lib/db/types";
import { cleanBody, cleanText, cleanTitle } from "./text";
import type { TaskCardOption, TaskDraft, TaskMember, TaskPatch, TasksRepo } from "./types";

/**
 * The Supabase implementation. Every query runs as the caller's session, so row level security
 * decides what may be read or written. Nothing here decides who is allowed to do what.
 */

type TaskUpdate = Database["public"]["Tables"]["ws_tasks"]["Update"];

function fail(context: string, message: string): never {
  throw new Error(`${context}: ${message}`);
}

function taskPatch(patch: TaskPatch): TaskUpdate {
  const row: TaskUpdate = {};
  if (patch.title !== undefined) row.title = cleanTitle(patch.title);
  if (patch.description !== undefined) row.description = cleanText(patch.description);
  if (patch.assigneeId !== undefined) row.assignee_id = patch.assigneeId;
  if (patch.dueDate !== undefined) row.due_date = patch.dueDate;
  if (patch.priority !== undefined) row.priority = patch.priority;
  if (patch.status !== undefined) row.status = patch.status;
  if (patch.pipelineCardId !== undefined) row.pipeline_card_id = patch.pipelineCardId;
  if (patch.tournamentId !== undefined) row.tournament_id = patch.tournamentId;
  return row;
}

export function createSupabaseTasksRepo(client: SupabaseClient<Database>): TasksRepo {
  async function currentUserId(): Promise<string> {
    const { data, error } = await client.auth.getUser();
    if (error || !data.user) throw new Error("You must be signed in to change tasks.");
    return data.user.id;
  }

  async function nextPosition(): Promise<number> {
    const { data, error } = await client
      .from("ws_tasks")
      .select("position")
      .order("position", { ascending: false })
      .limit(1);
    if (error) fail("Could not read the task order", error.message);
    return (data?.[0]?.position ?? 0) + POSITION_STEP;
  }

  async function listTasks(): Promise<WsTaskRow[]> {
    const { data, error } = await client.from("ws_tasks").select("*");
    if (error) fail("Could not read the tasks", error.message);
    return data ?? [];
  }

  async function getTask(id: string): Promise<WsTaskRow | null> {
    const { data, error } = await client.from("ws_tasks").select("*").eq("id", id).maybeSingle();
    if (error) fail("Could not read the task", error.message);
    return data ?? null;
  }

  async function createTask(input: TaskDraft): Promise<WsTaskRow> {
    const createdBy = await currentUserId();
    const position = await nextPosition();

    const { data, error } = await client
      .from("ws_tasks")
      .insert({
        title: cleanTitle(input.title),
        description: cleanText(input.description),
        assignee_id: input.assigneeId ?? null,
        due_date: input.dueDate ?? null,
        priority: input.priority ?? "normal",
        position,
        pipeline_card_id: input.pipelineCardId ?? null,
        tournament_id: input.tournamentId ?? null,
        created_by: createdBy,
      })
      .select("*")
      .single();
    if (error) fail("Could not create the task", error.message);
    return data;
  }

  async function updateTask(id: string, patch: TaskPatch): Promise<WsTaskRow> {
    const row = taskPatch(patch);
    if (Object.keys(row).length === 0) {
      const current = await getTask(id);
      if (!current) throw new Error("Task not found.");
      return current;
    }

    const { data, error } = await client
      .from("ws_tasks")
      .update(row)
      .eq("id", id)
      .select("*")
      .single();
    if (error) fail("Could not save the task", error.message);
    return data;
  }

  async function setStatus(id: string, status: TaskStatus): Promise<WsTaskRow> {
    // completed_at is the database trigger's job; it is not sent from here.
    return updateTask(id, { status });
  }

  async function deleteTask(id: string): Promise<void> {
    const { data, error } = await client.from("ws_tasks").delete().eq("id", id).select("id");
    if (error) fail("Could not delete the task", error.message);
    // Row level security refuses a delete by changing zero rows, not by raising an error.
    if (!data || data.length === 0) fail("Could not delete the task", "nothing was deleted");
  }

  async function listComments(taskId: string): Promise<WsTaskCommentRow[]> {
    const { data, error } = await client
      .from("ws_task_comments")
      .select("*")
      .eq("task_id", taskId)
      .order("created_at", { ascending: true });
    if (error) fail("Could not read the comments", error.message);
    return data ?? [];
  }

  async function addComment(taskId: string, body: string): Promise<WsTaskCommentRow> {
    const authorId = await currentUserId();
    const { data, error } = await client
      .from("ws_task_comments")
      .insert({ task_id: taskId, body: cleanBody(body), author_id: authorId })
      .select("*")
      .single();
    if (error) fail("Could not add the comment", error.message);
    return data;
  }

  async function editComment(id: string, body: string): Promise<WsTaskCommentRow> {
    const { data, error } = await client
      .from("ws_task_comments")
      .update({ body: cleanBody(body), edited_at: new Date().toISOString() })
      .eq("id", id)
      .select("*")
      .single();
    if (error) fail("Could not save the comment", error.message);
    return data;
  }

  async function deleteComment(id: string): Promise<void> {
    const { data, error } = await client
      .from("ws_task_comments")
      .delete()
      .eq("id", id)
      .select("id");
    if (error) fail("Could not delete the comment", error.message);
    if (!data || data.length === 0) fail("Could not delete the comment", "nothing was deleted");
  }

  async function listMembers(): Promise<TaskMember[]> {
    const { data, error } = await client
      .from("workspace_members")
      .select("user_id, display_name")
      .order("display_name", { ascending: true });
    if (error) fail("Could not read the members", error.message);
    return (data ?? []).map((row) => ({ id: row.user_id, displayName: row.display_name }));
  }

  async function listCards(): Promise<TaskCardOption[]> {
    const { data, error } = await client
      .from("ws_pipeline_cards")
      .select("id, title")
      .order("title", { ascending: true });
    if (error) fail("Could not read the pipeline cards", error.message);
    return (data ?? []).map((row) => ({ id: row.id, title: row.title }));
  }

  return {
    listTasks,
    getTask,
    createTask,
    updateTask,
    setStatus,
    deleteTask,
    listComments,
    addComment,
    editComment,
    deleteComment,
    listMembers,
    listCards,
  };
}
