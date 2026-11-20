"use server";

import { revalidatePath } from "next/cache";
import { getViewer } from "@/lib/auth/viewer";
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
    const repos = await getRepos();
    const row = await repos.tasks.createTask(input);
    revalidatePath("/tasks");
    return row;
  });
}

export async function updateTask(id: string, patch: TaskPatch): Promise<ActionResult<WsTaskRow>> {
  return run(async () => {
    await requireViewer();
    const repos = await getRepos();
    const row = await repos.tasks.updateTask(id, patch);
    revalidatePath("/tasks");
    return row;
  });
}

export async function setStatus(id: string, status: TaskStatus): Promise<ActionResult<WsTaskRow>> {
  return run(async () => {
    await requireViewer();
    const repos = await getRepos();
    const row = await repos.tasks.setStatus(id, status);
    revalidatePath("/tasks");
    return row;
  });
}

export async function deleteTask(id: string): Promise<ActionResult<void>> {
  return run(async () => {
    const viewer = await requireViewer();
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
    const repos = await getRepos();
    // The author, or an owner or partner. RLS enforces the same rule.
    await repos.tasks.deleteComment(id);
    revalidatePath("/tasks");
  });
}
