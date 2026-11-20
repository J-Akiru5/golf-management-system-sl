import { describe, expect, it } from "vitest";
import type { WsTaskRow } from "@/lib/db/types";
import {
  addDays,
  daysBetween,
  dueLabel,
  filterTasks,
  isOverdue,
  isoToday,
  mergeTaskChange,
  parseRealtimeChange,
  sortTasks,
  type TaskChange,
} from "./logic";

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
    created_at: "2026-11-01T08:00:00.000Z",
    updated_at: "2026-11-01T08:00:00.000Z",
    ...overrides,
  };
}

describe("date helpers", () => {
  it("reads the local calendar date", () => {
    expect(isoToday(new Date(2026, 10, 20, 23, 30))).toBe("2026-11-20");
  });

  it("moves across a month boundary", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2026-11-01", -1)).toBe("2026-10-31");
  });

  it("moves across a year boundary", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2027-01-01", -1)).toBe("2026-12-31");
  });

  it("counts whole days in both directions", () => {
    expect(daysBetween("2026-11-20", "2026-11-23")).toBe(3);
    expect(daysBetween("2026-11-20", "2026-11-17")).toBe(-3);
    expect(daysBetween("2026-10-31", "2026-11-01")).toBe(1);
  });

  it("refuses a value that is not a date", () => {
    expect(() => daysBetween("2026-11-20", "20 Nov")).toThrow(/Not a date/);
    expect(() => daysBetween("2026-02-30", "2026-03-01")).toThrow(/Not a date/);
  });
});

describe("isOverdue", () => {
  it("is true when the due date is before today and the task is open", () => {
    expect(isOverdue(task({ due_date: "2026-11-19" }), "2026-11-20")).toBe(true);
  });

  it("is false today and in the future", () => {
    expect(isOverdue(task({ due_date: "2026-11-20" }), "2026-11-20")).toBe(false);
    expect(isOverdue(task({ due_date: "2026-11-21" }), "2026-11-20")).toBe(false);
  });

  it("is false for a done task and for a task with no date", () => {
    expect(isOverdue(task({ due_date: "2026-11-19", status: "done" }), "2026-11-20")).toBe(false);
    expect(isOverdue(task(), "2026-11-20")).toBe(false);
  });

  it("works across a month boundary", () => {
    expect(isOverdue(task({ due_date: "2026-10-31" }), "2026-11-01")).toBe(true);
  });

  it("works across a year boundary", () => {
    expect(isOverdue(task({ due_date: "2026-12-31" }), "2027-01-01")).toBe(true);
  });
});

describe("dueLabel", () => {
  const today = "2026-11-20";

  it("says when there is no date", () => {
    expect(dueLabel(task(), today)).toBe("No due date");
  });

  it("names today and tomorrow", () => {
    expect(dueLabel(task({ due_date: "2026-11-20" }), today)).toBe("Due today");
    expect(dueLabel(task({ due_date: "2026-11-21" }), today)).toBe("Due tomorrow");
  });

  it("counts the days late, with a singular day", () => {
    expect(dueLabel(task({ due_date: "2026-11-19" }), today)).toBe("Overdue by 1 day");
    expect(dueLabel(task({ due_date: "2026-11-17" }), today)).toBe("Overdue by 3 days");
  });

  it("counts days late across a month boundary", () => {
    expect(dueLabel(task({ due_date: "2026-10-31" }), "2026-11-03")).toBe("Overdue by 3 days");
  });

  it("shows the day and month for a later date", () => {
    expect(dueLabel(task({ due_date: "2026-11-25" }), today)).toBe("Due 25 Nov");
    expect(dueLabel(task({ due_date: "2026-12-02" }), today)).toBe("Due 2 Dec");
  });

  it("shows the day and month across a month boundary", () => {
    expect(dueLabel(task({ due_date: "2026-11-02" }), "2026-10-31")).toBe("Due 2 Nov");
  });

  it("adds the year only when it differs from today", () => {
    expect(dueLabel(task({ due_date: "2027-01-02" }), "2026-12-30")).toBe("Due 2 Jan 2027");
    expect(dueLabel(task({ due_date: "2026-12-31" }), "2026-12-30")).toBe("Due tomorrow");
  });

  it("does not call a done task overdue", () => {
    expect(dueLabel(task({ due_date: "2026-11-19", status: "done" }), today)).toBe("Due 19 Nov");
    expect(dueLabel(task({ due_date: "2026-11-20", status: "done" }), today)).toBe("Due today");
  });
});

describe("filterTasks", () => {
  const mine = task({ id: "mine", assignee_id: "user-1" });
  const theirs = task({ id: "theirs", assignee_id: "user-2" });
  const loose = task({ id: "loose" });
  const late = task({ id: "late", assignee_id: "user-2", due_date: "2026-11-10" });
  const finishedLate = task({
    id: "finished-late",
    assignee_id: "user-1",
    due_date: "2026-11-10",
    status: "done",
  });
  const tasks = [mine, theirs, loose, late, finishedLate];

  it("shows the viewer's tasks, done ones included", () => {
    expect(filterTasks(tasks, "mine", "user-1").map((row) => row.id)).toEqual([
      "mine",
      "finished-late",
    ]);
  });

  it("shows every task", () => {
    expect(filterTasks(tasks, "all", "user-1")).toHaveLength(5);
  });

  it("shows one member's tasks, and nothing without a member", () => {
    expect(filterTasks(tasks, "assignee", "user-1", "user-2").map((row) => row.id)).toEqual([
      "theirs",
      "late",
    ]);
    expect(filterTasks(tasks, "assignee", "user-1")).toEqual([]);
  });

  it("shows open tasks past their date only", () => {
    expect(
      filterTasks(tasks, "overdue", "user-1", undefined, "2026-11-20").map((row) => row.id),
    ).toEqual(["late"]);
  });

  it("refuses to compute overdue without the day", () => {
    expect(() => filterTasks(tasks, "overdue", "user-1")).toThrow(/needs the current day/);
  });

  it("refuses an unknown view", () => {
    expect(() => filterTasks(tasks, "everything" as never, "user-1")).toThrow(/Unknown task view/);
  });
});

describe("sortTasks", () => {
  it("orders by status, then due date, then priority, then position", () => {
    const rows = [
      task({ id: "done", status: "done", position: 1000 }),
      task({ id: "blocked", status: "blocked", position: 1000 }),
      task({ id: "later", status: "todo", due_date: "2026-11-25", position: 1000 }),
      task({ id: "no-date", status: "todo", position: 1000 }),
      task({ id: "sooner-urgent", status: "todo", due_date: "2026-11-22", priority: "urgent" }),
      task({
        id: "sooner-normal",
        status: "todo",
        due_date: "2026-11-22",
        priority: "normal",
        position: 2000,
      }),
      task({ id: "sooner-normal-first", status: "todo", due_date: "2026-11-22", position: 1000 }),
      task({ id: "in-progress", status: "in_progress", position: 1000 }),
    ];

    expect(sortTasks(rows).map((row) => row.id)).toEqual([
      "sooner-urgent",
      "sooner-normal-first",
      "sooner-normal",
      "later",
      "no-date",
      "in-progress",
      "blocked",
      "done",
    ]);
  });

  it("puts a task with no due date after dated tasks in the same status", () => {
    const rows = [
      task({ id: "none", due_date: null }),
      task({ id: "dated", due_date: "2026-12-01" }),
    ];
    expect(sortTasks(rows).map((row) => row.id)).toEqual(["dated", "none"]);
  });

  it("falls back to the id so the order is stable", () => {
    const rows = [task({ id: "b" }), task({ id: "a" })];
    expect(sortTasks(rows).map((row) => row.id)).toEqual(["a", "b"]);
  });

  it("does not change the array it is given", () => {
    const rows = [task({ id: "b" }), task({ id: "a" })];
    sortTasks(rows);
    expect(rows.map((row) => row.id)).toEqual(["b", "a"]);
  });
});

describe("mergeTaskChange", () => {
  const existing = task({ id: "task-1", updated_at: "2026-11-20T10:00:00.000Z" });

  it("adds a task it has not seen", () => {
    const incoming = task({ id: "task-2" });
    const next = mergeTaskChange([existing], { type: "upsert", task: incoming }, new Set());
    expect(next.map((row) => row.id)).toEqual(["task-1", "task-2"]);
  });

  it("replaces a task with a newer row", () => {
    const incoming = task({
      id: "task-1",
      title: "Renamed elsewhere",
      updated_at: "2026-11-20T11:00:00.000Z",
    });
    const next = mergeTaskChange([existing], { type: "upsert", task: incoming }, new Set());
    expect(next[0]?.title).toBe("Renamed elsewhere");
  });

  it("keeps the local row when the event is older", () => {
    const rows = [existing];
    const incoming = task({ id: "task-1", title: "Stale", updated_at: "2026-11-20T09:00:00.000Z" });
    expect(mergeTaskChange(rows, { type: "upsert", task: incoming }, new Set())).toBe(rows);
  });

  it("keeps the local row while its write is in flight", () => {
    const rows = [existing];
    const incoming = task({
      id: "task-1",
      title: "From the feed",
      updated_at: "2026-11-20T11:00:00.000Z",
    });
    expect(mergeTaskChange(rows, { type: "upsert", task: incoming }, new Set(["task-1"]))).toBe(
      rows,
    );
  });

  it("removes a deleted task", () => {
    const next = mergeTaskChange([existing], { type: "remove", taskId: "task-1" }, new Set());
    expect(next).toEqual([]);
  });

  it("keeps a task whose delete arrived while the local write is in flight", () => {
    const rows = [existing];
    expect(mergeTaskChange(rows, { type: "remove", taskId: "task-1" }, new Set(["task-1"]))).toBe(
      rows,
    );
  });

  it("returns the same array when there is nothing to do", () => {
    const rows = [existing];
    expect(mergeTaskChange(rows, { type: "remove", taskId: "other" }, new Set())).toBe(rows);
  });
});

describe("parseRealtimeChange", () => {
  const row = task({ id: "task-9" });

  it("reads a task insert", () => {
    const parsed = parseRealtimeChange({ table: "ws_tasks", type: "INSERT", record: row });
    expect(parsed).toEqual({
      table: "ws_tasks",
      change: { type: "upsert", task: row },
    });
  });

  it("reads the wrapped broadcast message the subscription receives", () => {
    const parsed = parseRealtimeChange({
      type: "broadcast",
      event: "UPDATE",
      payload: { table: "ws_tasks", type: "UPDATE", record: row },
    });
    expect(parsed).toEqual({
      table: "ws_tasks",
      change: { type: "upsert", task: row },
    });
  });

  it("reads a task delete from the old row", () => {
    const parsed = parseRealtimeChange({
      table: "ws_tasks",
      type: "DELETE",
      record: null,
      old_record: { id: "task-9" },
    });
    expect(parsed).toEqual({ table: "ws_tasks", change: { type: "remove", taskId: "task-9" } });
  });

  it("reads a comment change as the task it belongs to", () => {
    expect(
      parseRealtimeChange({
        table: "ws_task_comments",
        type: "INSERT",
        record: { id: "comment-1", task_id: "task-9" },
      }),
    ).toEqual({ table: "ws_task_comments", taskId: "task-9" });
    expect(
      parseRealtimeChange({
        table: "ws_task_comments",
        type: "DELETE",
        record: null,
        old_record: { id: "comment-1", task_id: "task-9" },
      }),
    ).toEqual({ table: "ws_task_comments", taskId: "task-9" });
  });

  it("ignores anything it cannot read", () => {
    expect(parseRealtimeChange(null)).toBeNull();
    expect(parseRealtimeChange("hello")).toBeNull();
    expect(parseRealtimeChange({ table: "ws_docs", type: "INSERT", record: row })).toBeNull();
    expect(
      parseRealtimeChange({ table: "ws_tasks", type: "INSERT", record: { id: 1 } }),
    ).toBeNull();
    expect(parseRealtimeChange({ table: "ws_tasks", type: "TRUNCATE", record: row })).toBeNull();
    expect(
      parseRealtimeChange({ table: "ws_task_comments", type: "INSERT", record: { id: "c" } }),
    ).toBeNull();
  });
});

describe("TaskChange", () => {
  it("is the shape mergeTaskChange takes", () => {
    const change: TaskChange = { type: "remove", taskId: "task-1" };
    expect(mergeTaskChange([task()], change, new Set())).toEqual([]);
  });
});
