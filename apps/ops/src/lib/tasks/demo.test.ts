import { beforeEach, describe, expect, it } from "vitest";
import seed from "../../../seed/nov17-next-steps.json";
import { addDays, isoToday } from "./logic";
import { createDemoTasksRepo, resetDemoTasksStore } from "./repo";

beforeEach(() => {
  resetDemoTasksStore();
});

describe("demo tasks repo", () => {
  it("seeds the eleven meeting tasks unassigned", async () => {
    const tasks = await createDemoTasksRepo().listTasks();
    const seeded = tasks.filter((task) => seed.tasks.some((item) => item.title === task.title));

    expect(seeded).toHaveLength(seed.tasks.length);
    for (const task of seeded) {
      expect(task.assignee_id).toBeNull();
      expect(task.status).toBe("todo");
      expect(task.due_date).toBeNull();
    }
    const urgent = seeded.find((task) => task.title === "Streamline scoring");
    expect(urgent?.priority).toBe("high");
  });

  it("also seeds assigned work so every view has content", async () => {
    const repo = createDemoTasksRepo();
    const tasks = await repo.listTasks();
    const today = isoToday();

    expect(tasks.some((task) => task.assignee_id === "demo-user")).toBe(true);
    expect(tasks.some((task) => task.status === "done")).toBe(true);
    expect(
      tasks.some(
        (task) => task.status !== "done" && task.due_date !== null && task.due_date < today,
      ),
    ).toBe(true);
  });

  it("lists the demo members and pipeline cards", async () => {
    const repo = createDemoTasksRepo();
    const members = await repo.listMembers();
    const cards = await repo.listCards();

    expect(members.map((member) => member.id)).toContain("demo-user");
    expect(members).toHaveLength(3);
    expect(cards.length).toBeGreaterThan(0);
  });

  it("creates a task at the end of the list", async () => {
    const repo = createDemoTasksRepo();
    const before = await repo.listTasks();
    const highest = Math.max(...before.map((task) => task.position));

    const created = await repo.createTask({
      title: "  New task  ",
      description: "   ",
      assigneeId: "demo-mia",
      dueDate: "2026-12-01",
      priority: "high",
      pipelineCardId: "demo-card-december",
    });

    expect(created.title).toBe("New task");
    expect(created.description).toBeNull();
    expect(created.assignee_id).toBe("demo-mia");
    expect(created.due_date).toBe("2026-12-01");
    expect(created.priority).toBe("high");
    expect(created.status).toBe("todo");
    expect(created.completed_at).toBeNull();
    expect(created.position).toBeGreaterThan(highest);

    const after = await repo.listTasks();
    expect(after.map((task) => task.id)).toContain(created.id);
  });

  it("refuses a task with no title", async () => {
    const repo = createDemoTasksRepo();
    await expect(repo.createTask({ title: "   " })).rejects.toThrow(/needs a title/);
  });

  it("edits every field it is given", async () => {
    const repo = createDemoTasksRepo();
    const created = await repo.createTask({ title: "Edit me" });

    const saved = await repo.updateTask(created.id, {
      title: " Edited ",
      description: "A note",
      assigneeId: "demo-noel",
      dueDate: "2026-12-05",
      priority: "urgent",
      pipelineCardId: "demo-card-championship",
    });

    expect(saved.title).toBe("Edited");
    expect(saved.description).toBe("A note");
    expect(saved.assignee_id).toBe("demo-noel");
    expect(saved.due_date).toBe("2026-12-05");
    expect(saved.priority).toBe("urgent");
    expect(saved.pipeline_card_id).toBe("demo-card-championship");
    expect(saved.updated_at >= created.updated_at).toBe(true);
  });

  it("stamps and clears completed_at with the status, like the database trigger", async () => {
    const repo = createDemoTasksRepo();
    const created = await repo.createTask({ title: "Finish me" });

    const done = await repo.setStatus(created.id, "done");
    expect(done.status).toBe("done");
    expect(done.completed_at).not.toBeNull();

    const reopened = await repo.setStatus(created.id, "todo");
    expect(reopened.status).toBe("todo");
    expect(reopened.completed_at).toBeNull();
  });

  it("stores the position a board move sets", async () => {
    const repo = createDemoTasksRepo();
    const created = await repo.createTask({ title: "Move me" });

    const moved = await repo.updateTask(created.id, { status: "blocked", position: 1500 });

    expect(moved.status).toBe("blocked");
    expect(moved.position).toBe(1500);
    expect((await repo.getTask(created.id))?.position).toBe(1500);
  });

  it("deletes a task and its comments", async () => {
    const repo = createDemoTasksRepo();
    const created = await repo.createTask({ title: "Delete me" });
    await repo.addComment(created.id, "A comment that goes with it");

    await repo.deleteTask(created.id);

    expect(await repo.getTask(created.id)).toBeNull();
    expect(await repo.listComments(created.id)).toEqual([]);
  });

  it("keeps a comment thread in order, and marks an edit", async () => {
    const repo = createDemoTasksRepo();
    const created = await repo.createTask({ title: "Talk about it" });

    const first = await repo.addComment(created.id, "  First  ");
    const second = await repo.addComment(created.id, "Second");
    expect(first.body).toBe("First");
    expect(first.edited_at).toBeNull();

    const edited = await repo.editComment(first.id, "First, revised");
    expect(edited.body).toBe("First, revised");
    expect(edited.edited_at).not.toBeNull();

    const comments = await repo.listComments(created.id);
    expect(comments.map((comment) => comment.id)).toEqual([first.id, second.id]);

    await repo.deleteComment(second.id);
    expect((await repo.listComments(created.id)).map((comment) => comment.id)).toEqual([first.id]);
  });

  it("refuses an empty comment", async () => {
    const repo = createDemoTasksRepo();
    const created = await repo.createTask({ title: "Talk about it" });
    await expect(repo.addComment(created.id, "   ")).rejects.toThrow(/needs some words/);
  });

  it("refuses to edit or delete a task that is not there", async () => {
    const repo = createDemoTasksRepo();
    await expect(repo.updateTask("missing", { title: "x" })).rejects.toThrow(/not found/);
    await expect(repo.setStatus("missing", "done")).rejects.toThrow(/not found/);
    await expect(repo.deleteTask("missing")).rejects.toThrow(/not found/);
  });

  it("hands out copies, so a caller cannot change the store", async () => {
    const repo = createDemoTasksRepo();
    const tasks = await repo.listTasks();
    const first = tasks[0];
    expect(first).toBeDefined();
    if (!first) return;
    first.title = "Changed outside the repo";

    const again = await repo.listTasks();
    expect(again[0]?.title).not.toBe("Changed outside the repo");
  });

  it("has a task due the day after today for the due label", async () => {
    const repo = createDemoTasksRepo();
    const tasks = await repo.listTasks();
    const tomorrow = addDays(isoToday(), 2);
    expect(tasks.some((task) => task.due_date === tomorrow)).toBe(true);
  });
});
