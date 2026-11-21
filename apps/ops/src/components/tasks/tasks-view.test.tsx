// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WsTaskRow } from "@/lib/db/types";
import type { TaskActions } from "@/lib/tasks/types";
import { TasksView } from "./tasks-view";

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

function makeActions(): TaskActions {
  return {
    createTask: vi.fn(),
    updateTask: vi.fn(),
    setStatus: vi.fn(),
    moveTask: vi.fn(),
    deleteTask: vi.fn(),
    listComments: vi.fn(),
    addComment: vi.fn(),
    editComment: vi.fn(),
    deleteComment: vi.fn(),
  };
}

const members = [
  { id: "user-1", displayName: "Mia Santos" },
  { id: "user-2", displayName: "Noel Reyes" },
];

function renderView(tasks: WsTaskRow[], actions: TaskActions, initialTab: "mine" | "board") {
  return render(
    <TasksView
      initialTasks={tasks}
      members={members}
      cards={[]}
      viewer={{ id: "user-1", role: "owner", displayName: "Mia Santos" }}
      today="2026-11-20"
      live={false}
      initialTab={initialTab}
      canEdit
      actions={actions}
    />,
  );
}

afterEach(() => {
  cleanup();
  window.history.replaceState(null, "", "/");
});

describe("TasksView board tab", () => {
  it("offers the board tab and opens it from the URL", () => {
    renderView([task()], makeActions(), "board");

    expect(screen.getByRole("tab", { name: "Board" }).getAttribute("aria-selected")).toBe("true");
    for (const label of ["To do", "In progress", "Blocked", "Done"]) {
      expect(screen.getByRole("region", { name: label })).toBeTruthy();
    }
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("keeps the board in the URL so it can be linked", async () => {
    const user = userEvent.setup();
    renderView([task()], makeActions(), "mine");

    await user.click(screen.getByRole("tab", { name: "Board" }));
    expect(window.location.search).toBe("?view=board");

    await user.click(screen.getByRole("tab", { name: "My tasks" }));
    expect(window.location.search).toBe("");
  });

  it("moves a card with the Move dialog and saves the status and the position", async () => {
    const user = userEvent.setup();
    const actions = makeActions();
    vi.mocked(actions.moveTask).mockResolvedValue({
      ok: true,
      value: [
        task({
          id: "task-1",
          title: "Check the tee sheet",
          status: "blocked",
          position: 4000,
          updated_at: "2026-11-20T10:00:00.000Z",
        }),
      ],
    });

    renderView(
      [
        task({ id: "task-1", title: "Check the tee sheet" }),
        task({
          id: "task-2",
          title: "Book the tablets",
          status: "blocked",
          position: 3000,
          assignee_id: "user-2",
        }),
      ],
      actions,
      "board",
    );

    await user.click(
      screen.getByRole("button", { name: "Move Check the tee sheet to another status" }),
    );
    const dialog = screen.getByRole("dialog", { name: "Move task" });
    await user.click(within(dialog).getByRole("button", { name: "Blocked" }));

    await waitFor(() => expect(actions.moveTask).toHaveBeenCalledTimes(1));
    expect(actions.moveTask).toHaveBeenCalledWith("task-1", "blocked", 4000, []);

    await waitFor(() =>
      expect(
        within(screen.getByRole("region", { name: "Blocked" })).getByText("Check the tee sheet"),
      ).toBeTruthy(),
    );
    expect(
      within(screen.getByRole("region", { name: "To do" })).queryByText("Check the tee sheet"),
    ).toBeNull();
  });

  it("puts a card back and shows a plain message when the move fails", async () => {
    const user = userEvent.setup();
    const actions = makeActions();
    vi.mocked(actions.moveTask).mockResolvedValue({
      ok: false,
      error: "Could not save the task: permission denied",
    });

    renderView([task({ id: "task-1", title: "Check the tee sheet" })], actions, "board");

    await user.click(
      screen.getByRole("button", { name: "Move Check the tee sheet to another status" }),
    );
    const dialog = screen.getByRole("dialog", { name: "Move task" });
    await user.click(within(dialog).getByRole("button", { name: "In progress" }));

    expect(await screen.findByRole("alert")).toHaveProperty(
      "textContent",
      "Could not save the task: permission denied",
    );
    expect(
      within(screen.getByRole("region", { name: "To do" })).getByText("Check the tee sheet"),
    ).toBeTruthy();
    expect(
      within(screen.getByRole("region", { name: "In progress" })).queryByText(
        "Check the tee sheet",
      ),
    ).toBeNull();
  });
});
