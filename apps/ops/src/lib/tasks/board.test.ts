import { describe, expect, it } from "vitest";
import { POSITION_MIN_GAP, POSITION_STEP } from "@/lib/db/constants";
import type { WsTaskRow } from "@/lib/db/types";
import {
  endOfColumn,
  filterBoardTasks,
  groupTasksByStatus,
  isTaskStatus,
  planTaskMove,
  TASK_BOARD_COLUMNS,
  toBoardItems,
} from "./board";

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

describe("TASK_BOARD_COLUMNS", () => {
  it("is the four task statuses, in database order", () => {
    expect(TASK_BOARD_COLUMNS).toEqual([
      { id: "todo", label: "To do" },
      { id: "in_progress", label: "In progress" },
      { id: "blocked", label: "Blocked" },
      { id: "done", label: "Done" },
    ]);
  });
});

describe("isTaskStatus", () => {
  it("accepts the four statuses and nothing else", () => {
    expect(isTaskStatus("todo")).toBe(true);
    expect(isTaskStatus("done")).toBe(true);
    expect(isTaskStatus("in_progress")).toBe(true);
    expect(isTaskStatus("blocked")).toBe(true);
    expect(isTaskStatus("archived")).toBe(false);
    expect(isTaskStatus(null)).toBe(false);
    expect(isTaskStatus(1)).toBe(false);
  });
});

describe("toBoardItems", () => {
  it("gives each task the column the kanban needs, leaving the row alone", () => {
    const items = toBoardItems([
      task({ id: "a", status: "blocked" }),
      task({ id: "b", status: "done" }),
    ]);

    expect(items.map((item) => [item.id, item.columnId])).toEqual([
      ["a", "blocked"],
      ["b", "done"],
    ]);
    expect(items[0]?.status).toBe("blocked");
  });
});

describe("groupTasksByStatus", () => {
  it("has every column, even when it is empty", () => {
    const groups = groupTasksByStatus([]);

    expect([...groups.keys()]).toEqual(["todo", "in_progress", "blocked", "done"]);
    for (const rows of groups.values()) expect(rows).toEqual([]);
  });

  it("puts a task in its own column and orders the column by position", () => {
    const groups = groupTasksByStatus([
      task({ id: "third", position: 3000 }),
      task({ id: "second", position: 2000 }),
      task({ id: "first", position: 1000 }),
      task({ id: "blocked", status: "blocked", position: 1000 }),
    ]);

    expect(groups.get("todo")?.map((row) => row.id)).toEqual(["first", "second", "third"]);
    expect(groups.get("blocked")?.map((row) => row.id)).toEqual(["blocked"]);
    expect(groups.get("in_progress")).toEqual([]);
    expect(groups.get("done")).toEqual([]);
  });

  it("falls back to the id when two positions tie", () => {
    const groups = groupTasksByStatus([
      task({ id: "b", position: 1000 }),
      task({ id: "a", position: 1000 }),
    ]);

    expect(groups.get("todo")?.map((row) => row.id)).toEqual(["a", "b"]);
  });

  it("does not change the list it is given", () => {
    const rows = [task({ id: "b", position: 2000 }), task({ id: "a", position: 1000 })];
    groupTasksByStatus(rows);
    expect(rows.map((row) => row.id)).toEqual(["b", "a"]);
  });
});

describe("filterBoardTasks", () => {
  const mine = task({ id: "mine", assignee_id: "user-1" });
  const theirs = task({ id: "theirs", assignee_id: "user-2" });
  const late = task({ id: "late", assignee_id: "user-2", due_date: "2026-11-10" });
  const finished = task({ id: "finished", assignee_id: "user-1", status: "done" });
  const tasks = [mine, theirs, late, finished];

  it("shows the viewer's tasks, including the done ones", () => {
    expect(filterBoardTasks(tasks, "mine", "user-1").map((row) => row.id)).toEqual([
      "mine",
      "finished",
    ]);
  });

  it("shows every task", () => {
    expect(filterBoardTasks(tasks, "all", "user-1")).toHaveLength(4);
  });

  it("shows one member's tasks", () => {
    expect(filterBoardTasks(tasks, "assignee", "user-1", "user-2").map((row) => row.id)).toEqual([
      "theirs",
      "late",
    ]);
  });

  it("shows only open tasks past their date, against the day it is given", () => {
    expect(
      filterBoardTasks(tasks, "overdue", "user-1", undefined, "2026-11-20").map((row) => row.id),
    ).toEqual(["late"]);
  });

  it("refuses to compute overdue without the day", () => {
    expect(() => filterBoardTasks(tasks, "overdue", "user-1")).toThrow(/needs the current day/);
  });
});

describe("planTaskMove", () => {
  const a = task({ id: "a", position: 1000 });
  const b = task({ id: "b", position: 3000 });
  const c = task({ id: "c", position: 5000 });

  it("moves a task into the midpoint of its new neighbours", () => {
    const waiting = [
      task({ id: "w1", status: "in_progress", position: 1000 }),
      task({ id: "w2", status: "in_progress", position: 3000 }),
    ];
    const plan = planTaskMove([...waiting, c], {
      id: "c",
      toStatus: "in_progress",
      beforeId: "w1",
      afterId: "w2",
    });

    expect(plan.position).toBe(2000);
    expect(plan.updates).toEqual([{ id: "c", position: 2000 }]);
    const moved = plan.tasks.find((row) => row.id === "c");
    expect(moved?.status).toBe("in_progress");
    expect(moved?.position).toBe(2000);
  });

  it("appends after the last task when nothing follows", () => {
    const plan = planTaskMove([a, { ...b, status: "blocked" }], {
      id: "a",
      toStatus: "blocked",
      beforeId: "b",
      afterId: null,
    });

    expect(plan.position).toBe(4000);
    expect(plan.tasks.find((row) => row.id === "a")?.status).toBe("blocked");
  });

  it("starts an empty column at POSITION_STEP", () => {
    const plan = planTaskMove([a], {
      id: "a",
      toStatus: "done",
      beforeId: null,
      afterId: null,
    });

    expect(plan.position).toBe(POSITION_STEP);
    expect(plan.tasks.find((row) => row.id === "a")?.status).toBe("done");
  });

  it("puts a task first when it is dropped above the first card", () => {
    const plan = planTaskMove([a, b], {
      id: "b",
      toStatus: "todo",
      beforeId: null,
      afterId: "a",
    });

    expect(plan.position).toBe(a.position - POSITION_STEP);
    expect(plan.position).toBeLessThan(a.position);
    expect(plan.updates).toEqual([{ id: "b", position: plan.position }]);
  });

  it("reorders inside one column", () => {
    const plan = planTaskMove([a, b, c], {
      id: "c",
      toStatus: "todo",
      beforeId: null,
      afterId: "a",
    });

    const order = [...plan.tasks]
      .filter((row) => row.status === "todo")
      .sort((left, right) => left.position - right.position)
      .map((row) => row.id);
    expect(order).toEqual(["c", "a", "b"]);
  });

  it("renumbers the column when two neighbours are too close for a midpoint", () => {
    const tightA = task({ id: "a", position: 1000 });
    const tightB = task({ id: "b", position: 1000 + POSITION_MIN_GAP / 2 });
    const loose = task({ id: "loose", position: 9000 });

    const plan = planTaskMove([tightA, tightB, loose], {
      id: "loose",
      toStatus: "todo",
      beforeId: "a",
      afterId: "b",
    });

    expect(plan.updates.length).toBe(3);
    const saved = plan.updates.map((update) => update.position).sort((left, right) => left - right);
    expect(saved).toEqual([POSITION_STEP, 2 * POSITION_STEP, 3 * POSITION_STEP]);

    const order = [...plan.tasks]
      .sort((left, right) => left.position - right.position)
      .map((row) => row.id);
    expect(order).toEqual(["a", "loose", "b"]);
  });

  it("changes nothing when the task is dropped on itself", () => {
    const plan = planTaskMove([a, b], {
      id: "b",
      toStatus: "todo",
      beforeId: "b",
      afterId: null,
    });

    expect(plan.updates).toEqual([]);
    expect(plan.tasks.map((row) => row.position)).toEqual([1000, 3000]);
  });

  it("throws for a task that is not in the list", () => {
    expect(() =>
      planTaskMove([a], { id: "missing", toStatus: "done", beforeId: null, afterId: null }),
    ).toThrow(/not on the board/);
  });
});

describe("endOfColumn", () => {
  it("picks the last task of the column, by position", () => {
    const tasks = [
      task({ id: "first", status: "blocked", position: 1000 }),
      task({ id: "last", status: "blocked", position: 3000 }),
      task({ id: "middle", status: "blocked", position: 2000 }),
    ];

    expect(endOfColumn(tasks, "blocked", "task-x")).toEqual({ beforeId: "last", afterId: null });
  });

  it("ignores the task being moved", () => {
    const tasks = [
      task({ id: "a", status: "done", position: 1000 }),
      task({ id: "b", status: "done", position: 2000 }),
    ];

    expect(endOfColumn(tasks, "done", "b")).toEqual({ beforeId: "a", afterId: null });
  });

  it("gives no neighbour for an empty column", () => {
    expect(endOfColumn([task()], "done", "task-1")).toEqual({ beforeId: null, afterId: null });
  });
});
