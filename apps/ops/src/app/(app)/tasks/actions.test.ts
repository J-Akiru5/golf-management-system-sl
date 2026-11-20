import { beforeEach, describe, expect, it, vi } from "vitest";
import { getViewer } from "@/lib/auth/viewer";
import { resetDemoTasksStore } from "@/lib/tasks/repo";
import {
  addComment,
  createTask,
  deleteComment,
  deleteTask,
  editComment,
  listComments,
  moveTask,
  setStatus,
  updateTask,
} from "./actions";

/**
 * The actions in demo mode, which is the mode the browser check runs in. Demo mode is switched
 * through the mocked flag so the same file can also check the role refusal.
 */

const state = vi.hoisted(() => ({ demo: true }));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/flags", () => ({
  demoMode: () => state.demo,
  opsEnabled: () => true,
}));
vi.mock("@/lib/auth/viewer", () => ({ getViewer: vi.fn() }));

const viewerMock = vi.mocked(getViewer);

beforeEach(() => {
  state.demo = true;
  viewerMock.mockReset();
  resetDemoTasksStore();
});

describe("task actions in demo mode", () => {
  it("creates, edits, moves and deletes a task", async () => {
    const created = await createTask({ title: "From the action", priority: "high" });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.value.title).toBe("From the action");
    expect(created.value.priority).toBe("high");

    const saved = await updateTask(created.value.id, { title: "Renamed", dueDate: "2026-12-01" });
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    expect(saved.value.title).toBe("Renamed");
    expect(saved.value.due_date).toBe("2026-12-01");

    const done = await setStatus(created.value.id, "done");
    expect(done.ok).toBe(true);
    if (!done.ok) return;
    expect(done.value.status).toBe("done");
    expect(done.value.completed_at).not.toBeNull();

    const removed = await deleteTask(created.value.id);
    expect(removed).toEqual({ ok: true, value: undefined });
  });

  it("adds, edits and deletes a comment", async () => {
    const task = await createTask({ title: "Talk about it" });
    if (!task.ok) throw new Error("the demo task was not created");

    const added = await addComment(task.value.id, "  First  ");
    expect(added.ok).toBe(true);
    if (!added.ok) return;
    expect(added.value.body).toBe("First");

    const edited = await editComment(added.value.id, "First, revised");
    expect(edited.ok).toBe(true);
    if (!edited.ok) return;
    expect(edited.value.edited_at).not.toBeNull();

    const listed = await listComments(task.value.id);
    expect(listed.ok).toBe(true);
    if (!listed.ok) return;
    expect(listed.value.map((comment) => comment.body)).toEqual(["First, revised"]);

    const removed = await deleteComment(added.value.id);
    expect(removed.ok).toBe(true);

    const after = await listComments(task.value.id);
    expect(after.ok).toBe(true);
    if (after.ok) expect(after.value).toEqual([]);
  });

  it("returns a plain message instead of throwing", async () => {
    const result = await createTask({ title: "   " });
    expect(result).toEqual({ ok: false, error: "A task needs a title." });
  });

  it("moves a task to a status and position in one write", async () => {
    const created = await createTask({ title: "Set the start list" });
    if (!created.ok) throw new Error("the demo task was not created");

    const moved = await moveTask(created.value.id, "in_progress", 2500, []);
    expect(moved.ok).toBe(true);
    if (!moved.ok) return;

    expect(moved.value).toHaveLength(1);
    const row = moved.value[0];
    expect(row?.status).toBe("in_progress");
    expect(row?.position).toBe(2500);
    expect(row?.completed_at).toBeNull();

    const reopened = await moveTask(created.value.id, "done", 2500, []);
    expect(reopened.ok).toBe(true);
    if (!reopened.ok) return;
    expect(reopened.value[0]?.completed_at).not.toBeNull();
  });

  it("saves the renumbered positions a move carries", async () => {
    const first = await createTask({ title: "First" });
    const second = await createTask({ title: "Second" });
    if (!first.ok || !second.ok) throw new Error("the demo tasks were not created");

    const moved = await moveTask(first.value.id, "blocked", 1500, [
      { id: second.value.id, position: 2000 },
    ]);
    expect(moved.ok).toBe(true);
    if (!moved.ok) return;

    expect(moved.value).toHaveLength(2);
    const rows = new Map(moved.value.map((row) => [row.id, row]));
    expect(rows.get(first.value.id)?.position).toBe(1500);
    expect(rows.get(second.value.id)?.position).toBe(2000);
  });

  it("refuses a move that is not a status or not a position", async () => {
    const created = await createTask({ title: "Hold still" });
    if (!created.ok) throw new Error("the demo task was not created");

    expect(await moveTask(created.value.id, "archived" as never, 1000, [])).toEqual({
      ok: false,
      error: "Choose a status.",
    });
    expect(await moveTask(created.value.id, "done", Number.NaN, [])).toEqual({
      ok: false,
      error: "The new position is not a number.",
    });
    expect(await moveTask("  ", "done", 1000, [])).toEqual({
      ok: false,
      error: "That task is no longer on the board.",
    });
    expect(await moveTask(created.value.id, "done", 1000, [{ id: "", position: 2000 }])).toEqual({
      ok: false,
      error: "The renumbering was not valid.",
    });
  });
});

describe("task actions for a member", () => {
  it("refuses to delete a task", async () => {
    state.demo = false;
    viewerMock.mockResolvedValue({
      user: { id: "member-1" } as never,
      member: {
        user_id: "member-1",
        role: "member",
        status: "active",
        display_name: "A member",
        invited_by: null,
        created_at: "2026-11-01T00:00:00.000Z",
        updated_at: "2026-11-01T00:00:00.000Z",
      },
    });

    const result = await deleteTask("demo-task-1");

    expect(result).toEqual({
      ok: false,
      error: "Only an owner or partner can delete a task.",
    });
  });

  it("refuses a signed-in account with no member row", async () => {
    state.demo = false;
    viewerMock.mockResolvedValue({ user: { id: "outsider" } as never, member: null });

    const result = await createTask({ title: "Not allowed" });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/not an active workspace member/);
  });
});
