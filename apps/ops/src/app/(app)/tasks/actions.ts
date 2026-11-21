"use server";

import { revalidatePath } from "next/cache";
import { requireAccess } from "@/lib/access/server";
import { getViewer } from "@/lib/auth/viewer";
import { TASK_STATUSES } from "@/lib/db/constants";
import { can, type Viewer as PermissionViewer } from "@/lib/db/permissions";
import type { TaskStatus, WsTaskCommentRow, WsTaskRow } from "@/lib/db/types";
import { demoMode } from "@/lib/flags";
import { getRepos } from "@/lib/repos";
import type { ActionResult, TaskDraft, TaskPatch, TaskViewer } from "@/lib/tasks/types";

/**
 * The task screen's server actions. Each one runs as the caller: the repository uses the session's
 * Supabase client, so RLS decides what may be written. The role check here is for a plain message
 * and for demo mode, which has no database to enforce it.
 */

async function requireViewer(): Promise<TaskViewer> {
  if (demoMode()) {
    return { id: "demo-user", role: "owner", displayName: "Demo user" };
  }

  const viewer = await getViewer();
  if (!viewer?.member || viewer.member.status !== "active") {
    throw new Error("You are not an active workspace member.");
  }
  return {
    id: viewer.user.id,
    role: viewer.member.role,
    displayName: viewer.member.display_name,
  };
}

function permissionViewer(viewer: TaskViewer): PermissionViewer {
  return { role: viewer.role, status: "active" };
}

/** A thrown error is redacted in a production build, so the message travels as a value. */
async function run<T>(work: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, value: await work() };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error && error.message.trim() !== ""
          ? error.message
          : "Something went wrong. Try again.",
    };
  }
}

export async function createTask(input: TaskDraft): Promise<ActionResult<WsTaskRow>> {
  return run(async () => {
    await requireViewer();
    await requireAccess("tasks", "edit");
    const repos = await getRepos();
    const row = await repos.tasks.createTask(input);
    revalidatePath("/tasks");
    return row;
  });
}

export async function updateTask(id: string, patch: TaskPatch): Promise<ActionResult<WsTaskRow>> {
  return run(async () => {
    await requireViewer();
    await requireAccess("tasks", "edit");
    const repos = await getRepos();
    const row = await repos.tasks.updateTask(id, patch);
    revalidatePath("/tasks");
    return row;
  });
}

export async function setStatus(id: string, status: TaskStatus): Promise<ActionResult<WsTaskRow>> {
  return run(async () => {
    await requireViewer();
    await requireAccess("tasks", "edit");
    const repos = await getRepos();
    const row = await repos.tasks.setStatus(id, status);
    revalidatePath("/tasks");
    return row;
  });
}

/**
 * A board move. The task gets its new status and position in one write; `others` carries the
 * target column's new positions when the move triggered a renumber. Every changed row comes back.
 *
 * The browser computed the position, so it is checked here again: a status the database does not
 * allow, or a position that is not a finite number, is refused rather than saved.
 */
export async function moveTask(
  id: string,
  status: TaskStatus,
  position: number,
  others: ReadonlyArray<{ id: string; position: number }> = [],
): Promise<ActionResult<WsTaskRow[]>> {
  return run(async () => {
    await requireViewer();
    await requireAccess("tasks", "edit");
    if (id.trim() === "") throw new Error("That task is no longer on the board.");
    if (!TASK_STATUSES.some((entry) => entry.id === status)) throw new Error("Choose a status.");
    if (typeof position !== "number" || !Number.isFinite(position)) {
      throw new Error("The new position is not a number.");
    }

    const updates: Array<{ id: string; position: number }> = [];
    for (const entry of Array.isArray(others) ? others.slice(0, 100) : []) {
      const other = entry as { id?: unknown; position?: unknown };
      if (typeof other.id !== "string" || other.id.trim() === "") {
        throw new Error("The renumbering was not valid.");
      }
      if (typeof other.position !== "number" || !Number.isFinite(other.position)) {
        throw new Error("The renumbering was not valid.");
      }
      if (other.id !== id) updates.push({ id: other.id, position: other.position });
    }

    const repos = await getRepos();
    const rows: WsTaskRow[] = [await repos.tasks.updateTask(id, { status, position })];
    for (const other of updates) {
      rows.push(await repos.tasks.updateTask(other.id, { position: other.position }));
    }
    revalidatePath("/tasks");
    return rows;
  });
}

export async function deleteTask(id: string): Promise<ActionResult<void>> {
  return run(async () => {
    const viewer = await requireViewer();
    await requireAccess("tasks", "edit");
    if (!can(permissionViewer(viewer), "content.delete")) {
      throw new Error("Only an owner or partner can delete a task.");
    }
    const repos = await getRepos();
    await repos.tasks.deleteTask(id);
    revalidatePath("/tasks");
  });
}

export async function listComments(taskId: string): Promise<ActionResult<WsTaskCommentRow[]>> {
  return run(async () => {
    await requireViewer();
    await requireAccess("tasks", "view");
    const repos = await getRepos();
    return repos.tasks.listComments(taskId);
  });
}

export async function addComment(
  taskId: string,
  body: string,
): Promise<ActionResult<WsTaskCommentRow>> {
  return run(async () => {
    await requireViewer();
    await requireAccess("tasks", "edit");
    const repos = await getRepos();
    const row = await repos.tasks.addComment(taskId, body);
    revalidatePath("/tasks");
    return row;
  });
}

export async function editComment(
  id: string,
  body: string,
): Promise<ActionResult<WsTaskCommentRow>> {
  return run(async () => {
    await requireViewer();
    await requireAccess("tasks", "edit");
    const repos = await getRepos();
    // Only the author may edit, and the database enforces it. The button is hidden for anyone else.
    const row = await repos.tasks.editComment(id, body);
    revalidatePath("/tasks");
    return row;
  });
}

export async function deleteComment(id: string): Promise<ActionResult<void>> {
  return run(async () => {
    await requireViewer();
    await requireAccess("tasks", "edit");
    const repos = await getRepos();
    // The author, or an owner or partner. RLS enforces the same rule.
    await repos.tasks.deleteComment(id);
    revalidatePath("/tasks");
  });
}
