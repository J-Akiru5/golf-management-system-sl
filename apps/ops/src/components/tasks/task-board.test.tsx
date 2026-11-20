// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WsTaskRow } from "@/lib/db/types";
import type { TaskMember } from "@/lib/tasks/types";
import { TaskBoard, type TaskBoardMove } from "./task-board";

const members: TaskMember[] = [
  { id: "user-1", displayName: "Mia Santos" },
  { id: "user-2", displayName: "Noel Reyes" },
];

function task(overrides: Partial<WsTaskRow> = {}): WsTaskRow {
  return {
    id: "task-1",
    title: "Check the tee sheet",
    description: null,
    assignee_id: "user-1",
    due_date: null,
    priority: "normal",
    status: "todo",
    position: 1000,
    pipeline_card_id: null,
    tournament_id: null,
    completed_at: null,
    created_by: "user-1",
    created_at: "2026-11-17T08:00:00.000Z",
    updated_at: "2026-11-17T08:00:00.000Z",
    ...overrides,
  };
}

function renderBoard(tasks: WsTaskRow[], onMove: (move: TaskBoardMove) => void = () => {}) {
  return render(
    <TaskBoard
      tasks={tasks}
      members={members}
      viewerId="user-1"
      today="2026-11-20"
      onOpen={() => {}}
      onMove={onMove}
    />,
  );
}

afterEach(cleanup);

describe("TaskBoard", () => {
  it("shows the four status columns with each task in its own column", () => {
    renderBoard([
      task({ id: "todo", title: "Write the agenda", status: "todo" }),
      task({ id: "doing", title: "Send the deck", status: "in_progress" }),
      task({ id: "blocked", title: "Book the tablets", status: "blocked" }),
      task({ id: "done", title: "Wrap up October", status: "done" }),
    ]);

    for (const label of ["To do", "In progress", "Blocked", "Done"]) {
      expect(screen.getByRole("region", { name: label })).toBeTruthy();
    }

    expect(
      within(screen.getByRole("region", { name: "To do" })).getByText("Write the agenda"),
    ).toBeTruthy();
    expect(
      within(screen.getByRole("region", { name: "In progress" })).getByText("Send the deck"),
    ).toBeTruthy();
    expect(
      within(screen.getByRole("region", { name: "Blocked" })).getByText("Book the tablets"),
    ).toBeTruthy();
    expect(
      within(screen.getByRole("region", { name: "Done" })).getByText("Wrap up October"),
    ).toBeTruthy();
  });

  it("shows the priority, the assignee and an overdue due date with emphasis", async () => {
    const user = userEvent.setup();
    renderBoard([
      task({
        title: "Send the sponsor deck",
        priority: "urgent",
        due_date: "2026-11-17",
        assignee_id: "user-2",
      }),
    ]);

    // The board starts on the viewer's own tasks, so this one needs the whole list.
    await user.selectOptions(screen.getByLabelText("Show tasks"), "all");

    expect(screen.getByText("Urgent")).toBeTruthy();
    expect(screen.getByText("Noel Reyes")).toBeTruthy();
    const due = screen.getByText("Overdue by 3 days");
    expect(due.className).toContain("text-danger");
    expect(due.className).toContain("font-semibold");
  });

  it("marks a task with no assignee plainly", async () => {
    const user = userEvent.setup();
    renderBoard([task({ assignee_id: null })]);

    await user.selectOptions(screen.getByLabelText("Show tasks"), "all");

    expect(screen.getByText("Unassigned")).toBeTruthy();
  });

  it("counts the overdue tasks in the column header only when there are some", () => {
    renderBoard([
      task({ id: "late", due_date: "2026-11-17" }),
      task({ id: "later", title: "Not yet due", due_date: "2026-11-25" }),
      task({ id: "done-late", title: "Done late", status: "done", due_date: "2026-11-01" }),
    ]);

    const todo = screen.getByRole("region", { name: "To do" });
    expect(within(todo).getByText("1 overdue")).toBeTruthy();
    expect(within(screen.getByRole("region", { name: "Done" })).queryByText(/overdue/)).toBeNull();
  });

  it("starts on the viewer's own tasks and follows the filter", async () => {
    const user = userEvent.setup();
    renderBoard([
      task({ id: "mine", title: "My task", assignee_id: "user-1" }),
      task({ id: "theirs", title: "Their task", assignee_id: "user-2" }),
    ]);

    expect(screen.getByText("My task")).toBeTruthy();
    expect(screen.queryByText("Their task")).toBeNull();

    await user.selectOptions(screen.getByLabelText("Show tasks"), "all");

    expect(screen.getByText("My task")).toBeTruthy();
    expect(screen.getByText("Their task")).toBeTruthy();
  });

  it("filters by assignee", async () => {
    const user = userEvent.setup();
    renderBoard([
      task({ id: "mine", title: "My task", assignee_id: "user-1" }),
      task({
        id: "theirs",
        title: "Their late task",
        assignee_id: "user-2",
        due_date: "2026-11-10",
      }),
    ]);

    await user.selectOptions(screen.getByLabelText("Show tasks"), "assignee");
    expect(screen.getByLabelText("Assignee")).toBeTruthy();
    await user.selectOptions(screen.getByLabelText("Assignee"), "user-2");

    expect(screen.getByText("Their late task")).toBeTruthy();
    expect(screen.queryByText("My task")).toBeNull();
  });

  it("shows only open tasks past their date for the overdue filter", async () => {
    const user = userEvent.setup();
    renderBoard([
      task({ id: "mine", title: "My task", assignee_id: "user-1" }),
      task({ id: "later", title: "Due soon", due_date: "2026-11-25" }),
      task({ id: "late", title: "Late task", due_date: "2026-11-10" }),
      task({ id: "done-late", title: "Done late", status: "done", due_date: "2026-11-01" }),
    ]);

    await user.selectOptions(screen.getByLabelText("Show tasks"), "overdue");

    expect(screen.getByText("Late task")).toBeTruthy();
    expect(screen.queryByText("Due soon")).toBeNull();
    expect(screen.queryByText("Done late")).toBeNull();
    expect(screen.queryByText("My task")).toBeNull();
  });

  it("says when the filter leaves nothing to show", async () => {
    const user = userEvent.setup();
    // The third member has no task, so picking them empties the board.
    render(
      <TaskBoard
        tasks={[task({ id: "mine", title: "My task", assignee_id: "user-1" })]}
        members={[...members, { id: "user-3", displayName: "Ana Lim" }]}
        viewerId="user-1"
        today="2026-11-20"
        onOpen={() => {}}
        onMove={() => {}}
      />,
    );

    await user.selectOptions(screen.getByLabelText("Show tasks"), "assignee");
    await user.selectOptions(screen.getByLabelText("Assignee"), "user-3");

    expect(
      screen.getByText("No tasks match this filter. Choose another one to see the whole board."),
    ).toBeTruthy();
  });

  it("moves a task with the Move dialog, to the end of the target column", async () => {
    const user = userEvent.setup();
    const onMove = vi.fn();
    renderBoard(
      [
        task({ id: "mine", title: "Write the agenda" }),
        task({ id: "blocked-a", title: "First blocked", status: "blocked", position: 1000 }),
        task({
          id: "blocked-b",
          title: "Second blocked",
          status: "blocked",
          position: 3000,
          assignee_id: "user-2",
        }),
      ],
      onMove,
    );

    await user.click(
      screen.getByRole("button", { name: "Move Write the agenda to another status" }),
    );

    const dialog = screen.getByRole("dialog", { name: "Move task" });
    expect(within(dialog).getByText("Write the agenda")).toBeTruthy();
    expect(within(dialog).getByRole("button", { name: /To do/ }).hasAttribute("disabled")).toBe(
      true,
    );

    await user.click(within(dialog).getByRole("button", { name: "Blocked" }));

    expect(onMove).toHaveBeenCalledWith({
      id: "mine",
      toStatus: "blocked",
      beforeId: "blocked-b",
      afterId: null,
    });
  });

  it("names the drag handle and the open control for keyboard and touch users", () => {
    renderBoard([task({ title: "Write the agenda" })]);

    expect(screen.getByRole("button", { name: "Move Write the agenda" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Open Write the agenda" })).toBeTruthy();
  });
});
