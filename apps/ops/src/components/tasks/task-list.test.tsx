import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { WsTaskRow } from "@/lib/db/types";
import { TaskList } from "./task-list";

function task(overrides: Partial<WsTaskRow> = {}): WsTaskRow {
  return {
    id: "task-1",
    title: "Check the tee sheet",
    description: null,
    assignee_id: null,
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

const noop = () => {};

function render(rows: WsTaskRow[]): string {
  return renderToStaticMarkup(
    <TaskList
      tasks={rows}
      memberNames={new Map([["user-1", "Mia Santos"]])}
      cardTitles={new Map([["card-1", "December Invitational"]])}
      today="2026-11-20"
      onOpen={noop}
      onStatus={noop}
      empty={{ title: "No tasks yet", body: "Create the first task to get started." }}
    />,
  );
}

describe("TaskList", () => {
  it("shows the title, the priority and the overdue wording", () => {
    const html = render([
      task({ title: "Send the sponsor deck", due_date: "2026-11-17", priority: "urgent" }),
    ]);

    expect(html).toContain("Send the sponsor deck");
    expect(html).toContain("Urgent");
    expect(html).toContain("Overdue by 3 days");
    expect(html).toContain("text-danger");
  });

  it("shows the assignee, the card and the status control", () => {
    const html = render([
      task({
        assignee_id: "user-1",
        due_date: "2026-11-25",
        pipeline_card_id: "card-1",
      }),
    ]);

    expect(html).toContain("Mia Santos");
    expect(html).toContain("December Invitational");
    expect(html).toContain("Due 25 Nov");
    expect(html).toContain("Status for Check the tee sheet");
    expect(html).toContain("In progress");
  });

  it("marks a task with no assignee and no card plainly", () => {
    const html = render([task()]);
    expect(html).toContain("Unassigned");
    expect(html).toContain("None");
  });

  it("does not call a done task overdue", () => {
    const html = render([task({ status: "done", due_date: "2026-11-17" })]);
    expect(html).toContain("Due 17 Nov");
    expect(html).not.toContain("Overdue");
  });

  it("shows the empty state instead of an empty table", () => {
    const html = render([]);
    expect(html).toContain("No tasks yet");
    expect(html).not.toContain("<table");
  });
});
