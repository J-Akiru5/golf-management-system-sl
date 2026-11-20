import { describe, expect, it } from "vitest";
import { PIPELINE_STAGES } from "@/lib/db/constants";
import type { PipelineStage, WsPipelineCardRow, WsTaskRow } from "@/lib/db/types";
import type { DocSummary } from "@/lib/docs/repo";
import { formatToday, pipelineSummary, recentDocs, taskSummary } from "./summary";

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
    created_at: "2026-11-01T08:00:00.000Z",
    updated_at: "2026-11-01T08:00:00.000Z",
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
    id: "doc-1",
    title: "Run sheet",
    archived: false,
    createdAt: "2026-11-01T08:00:00.000Z",
    updatedAt: "2026-11-10T08:00:00.000Z",
    lastEditedById: "user-2",
    lastEditedByName: "Mara Santos",
    ...overrides,
  };
}

describe("taskSummary", () => {
  it("returns zero counts and no rows for an empty list", () => {
    expect(taskSummary([], "user-1", "2026-11-20")).toEqual({
      open: 0,
      overdue: 0,
      unassigned: 0,
      nextDue: [],
    });
  });

  it("counts only the viewer's open tasks", () => {
    const summary = taskSummary(
      [
        task({ id: "a", assignee_id: "user-1", status: "todo" }),
        task({ id: "b", assignee_id: "user-1", status: "in_progress" }),
        task({ id: "c", assignee_id: "user-1", status: "done" }),
        task({ id: "d", assignee_id: "user-2", status: "todo" }),
      ],
      "user-1",
      "2026-11-20",
    );

    expect(summary.open).toBe(2);
  });

  it("counts an overdue task only when it is open and its date has passed", () => {
    const summary = taskSummary(
      [
        task({ id: "late", due_date: "2026-11-17", status: "todo" }),
        task({ id: "today", due_date: "2026-11-20", status: "todo" }),
        task({ id: "later", due_date: "2026-11-25", status: "blocked" }),
        task({ id: "done", due_date: "2026-11-01", status: "done" }),
        task({ id: "no-date", due_date: null, status: "todo" }),
      ],
      "user-1",
      "2026-11-20",
    );

    expect(summary.overdue).toBe(1);
  });

  it("counts every unassigned task, whatever its status", () => {
    const summary = taskSummary(
      [
        task({ id: "a", assignee_id: null, status: "todo" }),
        task({ id: "b", assignee_id: null, status: "done" }),
        task({ id: "c", assignee_id: "user-1" }),
      ],
      "user-1",
      "2026-11-20",
    );

    expect(summary.unassigned).toBe(2);
  });

  it("lists at most five open tasks in due order, ties broken by priority", () => {
    const summary = taskSummary(
      [
        task({ id: "t6", due_date: "2026-12-06" }),
        task({ id: "t1", due_date: "2026-11-21", priority: "low" }),
        task({ id: "t2", due_date: "2026-11-21", priority: "urgent" }),
        task({ id: "t3", due_date: "2026-11-18", priority: "normal" }),
        task({ id: "t4", due_date: "2026-11-22" }),
        task({ id: "t5", due_date: null }),
        task({ id: "t7", due_date: "2026-11-15", status: "done" }),
        task({ id: "t8", due_date: "2026-11-16", assignee_id: "user-2" }),
      ],
      "user-1",
      "2026-11-20",
    );

    expect(summary.nextDue.map((item) => item.id)).toEqual(["t3", "t2", "t1", "t4", "t6"]);
  });

  it("keeps the order stable when the due date and the priority match", () => {
    const summary = taskSummary(
      [task({ id: "b", due_date: "2026-11-25" }), task({ id: "a", due_date: "2026-11-25" })],
      "user-1",
      "2026-11-20",
    );

    expect(summary.nextDue.map((item) => item.id)).toEqual(["a", "b"]);
  });

  it("carries the row fields the screen shows", () => {
    const summary = taskSummary(
      [
        task({
          id: "a",
          title: "Send the sponsor deck",
          due_date: "2026-11-18",
          status: "blocked",
        }),
      ],
      "user-1",
      "2026-11-20",
    );

    expect(summary.nextDue[0]).toMatchObject({
      id: "a",
      title: "Send the sponsor deck",
      dueDate: "2026-11-18",
      status: "blocked",
    });
  });

  it("refuses to guess the viewer or the day", () => {
    expect(() => taskSummary([], "", "2026-11-20")).toThrow();
    expect(() => taskSummary([], "user-1", "20 Nov 2026")).toThrow();
    expect(() => taskSummary([], "user-1", "2026-02-30")).toThrow();
  });
});

describe("pipelineSummary", () => {
  it("keeps every stage in board order with an empty list", () => {
    const summary = pipelineSummary([]);

    expect(summary.stages.map((stage) => stage.stage)).toEqual(
      PIPELINE_STAGES.map((stage) => stage.id),
    );
    expect(summary.stages.every((stage) => stage.count === 0)).toBe(true);
    expect(summary.stages.every((stage) => stage.totals.length === 0)).toBe(true);
    expect(summary.openCount).toBe(0);
    expect(summary.openTotals).toEqual([]);
  });

  it("counts a card in its stage and leaves the quoted total empty when there is no amount", () => {
    const summary = pipelineSummary([
      card({ id: "a", stage: "inquiry", quoted_amount: null }),
      card({ id: "b", stage: "inquiry", quoted_amount: 1000 }),
      card({ id: "c", stage: "prep", quoted_amount: null }),
    ]);

    const inquiry = summary.stages.find((stage) => stage.stage === "inquiry");
    const prep = summary.stages.find((stage) => stage.stage === "prep");

    expect(inquiry).toMatchObject({ count: 2, totals: [{ currency: "PHP", amount: 1000 }] });
    expect(prep).toMatchObject({ count: 1, totals: [] });
  });

  it("totals the open stages and leaves the closed stage out", () => {
    const summary = pipelineSummary([
      card({ id: "a", stage: "inquiry", quoted_amount: 100 }),
      card({ id: "b", stage: "confirmed", quoted_amount: 250 }),
      card({ id: "c", stage: "confirmed", quoted_amount: null }),
      card({ id: "d", stage: "invoiced_closed", quoted_amount: 900 }),
    ]);

    expect(summary.openCount).toBe(3);
    expect(summary.openTotals).toEqual([{ currency: "PHP", amount: 350 }]);
  });

  it("keeps each currency apart instead of adding them together", () => {
    const summary = pipelineSummary([
      card({ id: "a", stage: "inquiry", quoted_amount: 1000, currency: "PHP" }),
      card({ id: "b", stage: "inquiry", quoted_amount: 500, currency: "USD" }),
      card({ id: "c", stage: "inquiry", quoted_amount: 250, currency: "PHP" }),
    ]);

    const inquiry = summary.stages.find((stage) => stage.stage === "inquiry");

    expect(inquiry?.totals).toEqual([
      { currency: "PHP", amount: 1250 },
      { currency: "USD", amount: 500 },
    ]);
    expect(summary.openTotals).toEqual([
      { currency: "PHP", amount: 1250 },
      { currency: "USD", amount: 500 },
    ]);
  });

  it("refuses a stage the board does not know", () => {
    expect(() => pipelineSummary([card({ stage: "archive" as PipelineStage })])).toThrow();
  });
});

describe("recentDocs", () => {
  it("returns the newest edits first and leaves archived documents out", () => {
    const docs = recentDocs(
      [
        doc({ id: "old", updatedAt: "2026-11-02T08:00:00.000Z" }),
        doc({ id: "newest", updatedAt: "2026-11-18T08:00:00.000Z" }),
        doc({ id: "archived", updatedAt: "2026-11-19T08:00:00.000Z", archived: true }),
        doc({ id: "middle", updatedAt: "2026-11-10T08:00:00.000Z" }),
      ],
      5,
    );

    expect(docs.map((entry) => entry.id)).toEqual(["newest", "middle", "old"]);
  });

  it("stops at the limit", () => {
    const docs = recentDocs(
      [
        doc({ id: "a", updatedAt: "2026-11-18T08:00:00.000Z" }),
        doc({ id: "b", updatedAt: "2026-11-17T08:00:00.000Z" }),
        doc({ id: "c", updatedAt: "2026-11-16T08:00:00.000Z" }),
      ],
      2,
    );

    expect(docs.map((entry) => entry.id)).toEqual(["a", "b"]);
  });

  it("returns nothing for an empty list or a limit of zero", () => {
    expect(recentDocs([], 5)).toEqual([]);
    expect(recentDocs([doc()], 0)).toEqual([]);
  });

  it("refuses a limit that is not a whole number of zero or more", () => {
    expect(() => recentDocs([], -1)).toThrow();
    expect(() => recentDocs([], 2.5)).toThrow();
  });
});

describe("formatToday", () => {
  it("writes a fixed day in words", () => {
    expect(formatToday("2026-11-20")).toBe("Friday, 20 November 2026");
  });

  it("refuses a value that is not a calendar date", () => {
    expect(() => formatToday("2026-13-01")).toThrow();
    expect(() => formatToday("today")).toThrow();
  });
});
