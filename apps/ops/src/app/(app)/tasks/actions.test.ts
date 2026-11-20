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
