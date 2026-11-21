// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import type { WsTaskRow } from "@/lib/db/types";
import type { TaskMember } from "@/lib/tasks/types";
import { TaskBoard } from "./task-board";

const members: TaskMember[] = [{ id: "user-1", displayName: "Mia Santos" }];

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
    created_at: "2026-11-21T08:00:00.000Z",
    updated_at: "2026-11-21T08:00:00.000Z",
    ...overrides,
  };
}

function linkedRow(overrides: Record<string, unknown> = {}): WsTaskRow {
  return Object.assign(task({ id: "task-linked", title: "Two-way GitHub sync" }), {
    github_issue_number: 350,
    github_url: "https://github.com/J-Akiru5/golf-management-system-sl/issues/350",
    github_state: "open",
    github_labels: ["ops"],
    github_milestone: "v1.0.0",
    github_assignees: ["karlcalimotan"],
    github_updated_at: "2026-11-21T09:00:00Z",
    synced_at: "2026-11-21T09:00:00Z",
    ...overrides,
  });
}

function renderBoard(tasks: WsTaskRow[]) {
  return render(
    <TaskBoard
      tasks={tasks}
      members={members}
      viewerId="user-1"
      today="2026-11-21"
      onOpen={() => {}}
      onMove={() => {}}
      canEdit
    />,
  );
}

afterEach(cleanup);

describe("the board's GitHub filter", () => {
  it("counts the linked tasks and hides the others when it is checked", async () => {
    const user = userEvent.setup();
    renderBoard([linkedRow(), task({ id: "task-plain", title: "Plain task" })]);

    expect(screen.getByText("Two-way GitHub sync")).toBeTruthy();
    expect(screen.getByText("Plain task")).toBeTruthy();

    const filter = screen.getByRole("checkbox", { name: /Linked to GitHub/ });
    expect(screen.getByText("(1)")).toBeTruthy();

    await user.click(filter);
    expect(screen.getByText("Two-way GitHub sync")).toBeTruthy();
    expect(screen.queryByText("Plain task")).toBeNull();

    await user.click(filter);
    expect(screen.getByText("Plain task")).toBeTruthy();
  });

  it("says when the current view has nothing from GitHub", async () => {
    const user = userEvent.setup();
    renderBoard([task({ id: "task-plain", title: "Plain task" })]);

    await user.click(screen.getByRole("checkbox", { name: /Linked to GitHub/ }));
    expect(screen.queryByText("Plain task")).toBeNull();
    expect(screen.getByText(/No tasks match this filter/)).toBeTruthy();
  });
});
