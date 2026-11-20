import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { WsPipelineCardRow } from "@/lib/db/types";
import type { DocSummary } from "@/lib/docs/repo";
import { pipelineSummary, type TaskSummary } from "@/lib/overview/summary";
import { DocumentsCard } from "./documents-card";
import { MyTasksCard } from "./my-tasks-card";
import { PipelineCard } from "./pipeline-card";

const TODAY = "2026-11-20";

function summary(overrides: Partial<TaskSummary> = {}): TaskSummary {
  return {
    open: 3,
    overdue: 1,
    unassigned: 2,
    nextDue: [
      {
        id: "task-1",
        title: "Send the sponsor deck",
        dueDate: "2026-11-17",
        priority: "urgent",
        status: "todo",
      },
      {
        id: "task-2",
        title: "Confirm the tee sheet",
        dueDate: "2026-11-22",
        priority: "high",
        status: "in_progress",
      },
    ],
    ...overrides,
  };
}

function card(overrides: Partial<WsPipelineCardRow> = {}): WsPipelineCardRow {
  return {
    id: "card-1",
    tournament_id: null,
    title: "Cebu invitational",
    club_name: "Cebu Country Club",
    stage: "inquiry",
    position: 1000,
    start_date: null,
    end_date: null,
    expected_players: 96,
    pricing_model: null,
    quoted_amount: null,
    currency: "PHP",
    owner_id: null,
    notes: null,
    created_by: "user-1",
    created_at: "2026-11-01T08:00:00.000Z",
    updated_at: "2026-11-01T08:00:00.000Z",
    ...overrides,
  };
}

function doc(overrides: Partial<DocSummary> = {}): DocSummary {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    title: "Operations portal",
    archived: false,
    createdAt: "2026-11-02T08:30:00.000Z",
    updatedAt: "2026-11-18T09:12:00.000Z",
    lastEditedById: "user-2",
    lastEditedByName: "Mara Santos",
    ...overrides,
  };
}

describe("MyTasksCard", () => {
  it("shows the three counts, the next due rows and the task link", () => {
    const html = renderToStaticMarkup(<MyTasksCard summary={summary()} today={TODAY} />);

    expect(html).toContain("My tasks");
    expect(html).toContain("Open");
    expect(html).toContain("Overdue");
    expect(html).toContain("Unassigned");
    expect(html).toContain("Send the sponsor deck");
    expect(html).toContain("Overdue by 3 days");
    expect(html).toContain("Due 22 Nov");
    expect(html).toContain('href="/tasks"');
    expect(html).toContain("All tasks");
  });

  it("marks a late row in the danger colour", () => {
    const html = renderToStaticMarkup(<MyTasksCard summary={summary()} today={TODAY} />);

    expect(html).toContain("text-danger");
  });

  it("gives a plain next step when the viewer has no tasks", () => {
    const html = renderToStaticMarkup(
      <MyTasksCard summary={summary({ open: 0, overdue: 0, nextDue: [] })} today={TODAY} />,
    );

    expect(html).toContain("No tasks yet");
    expect(html).not.toContain("Send the sponsor deck");
  });

  it("says when open tasks simply have no due date", () => {
    const html = renderToStaticMarkup(
      <MyTasksCard summary={summary({ nextDue: [] })} today={TODAY} />,
    );

    expect(html).toContain("None of your open tasks has a due date.");
  });
});

describe("PipelineCard", () => {
  it("lists every stage, the quoted value where one exists and the open total", () => {
    const html = renderToStaticMarkup(
      <PipelineCard
        summary={pipelineSummary([
          card({ id: "a", stage: "inquiry", quoted_amount: 1250000 }),
          card({ id: "b", stage: "prep", quoted_amount: 320000 }),
          card({ id: "c", stage: "invoiced_closed", quoted_amount: 900000 }),
        ])}
      />,
    );

    expect(html).toContain("Pipeline");
    expect(html).toContain("Inquiry");
    expect(html).toContain("Proposal sent");
    expect(html).toContain("Invoiced / Closed");
    expect(html).toContain("No quoted value");
    expect(html).toContain("1,250,000");
    expect(html).toContain("Open stages");
    expect(html).toContain('href="/board"');
    expect(html).toContain("Open board");
  });

  it("says there is no quoted value rather than showing zero", () => {
    const html = renderToStaticMarkup(<PipelineCard summary={pipelineSummary([card()])} />);

    expect(html).toContain("no quoted value");
    expect(html).not.toContain("0.00");
  });
});

describe("DocumentsCard", () => {
  it("links each document to its editor and names the last editor", () => {
    const html = renderToStaticMarkup(<DocumentsCard docs={[doc()]} />);

    expect(html).toContain("Operations portal");
    expect(html).toContain('href="/docs/11111111-1111-4111-8111-111111111111"');
    expect(html).toContain("Edited");
    expect(html).toContain("Mara Santos");
    expect(html).toContain("All documents");
  });

  it("gives a plain next step when there are no documents", () => {
    const html = renderToStaticMarkup(<DocumentsCard docs={[]} />);

    expect(html).toContain("No documents yet");
    expect(html).toContain('href="/docs"');
  });
});
