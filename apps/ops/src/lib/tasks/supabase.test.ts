import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import type { Database, WsTaskCommentRow, WsTaskRow } from "@/lib/db/types";
import { createSupabaseTasksRepo } from "./repo";

/**
 * A small in-memory stand-in for the PostgREST builder. It applies the filters, order and limit
 * the repository asks for, and fills the column defaults the database would fill. It is enough to
 * prove how the repository maps the app's names to the table's columns; it is not a database.
 */

type FakeRow = Record<string, unknown>;

type FakeDb = {
  tables: Record<string, FakeRow[]>;
  user: { id: string } | null;
  failOn: string | null;
  log: Array<{ table: string; op: string; payload: FakeRow | null }>;
  nextId: number;
};

function withDefaults(table: string, row: FakeRow, db: FakeDb): FakeRow {
  const now = new Date().toISOString();
  const filled: FakeRow = {
    id: `${table}-${db.nextId++}`,
    created_at: now,
    updated_at: now,
    ...row,
  };

  if (table === "ws_tasks") {
    filled.status ??= "todo";
    filled.priority ??= "normal";
    filled.position ??= 0;
    filled.description ??= null;
    filled.assignee_id ??= null;
    filled.due_date ??= null;
    filled.pipeline_card_id ??= null;
    filled.tournament_id ??= null;
    filled.completed_at ??= null;
  }
  if (table === "ws_task_comments") filled.edited_at ??= null;

  return filled;
}

class FakeQuery {
  private op: "select" | "insert" | "update" | "delete" = "select";
  private payload: FakeRow | null = null;
  private filters: Array<{ column: string; value: unknown }> = [];
  private orders: Array<{ column: string; ascending: boolean }> = [];
  private limitCount: number | null = null;
  private mode: "many" | "maybe" | "single" = "many";

  constructor(
    private readonly db: FakeDb,
    private readonly table: string,
  ) {}

  select(): this {
    return this;
  }

  insert(row: FakeRow): this {
    this.op = "insert";
    this.payload = row;
    return this;
  }

  update(row: FakeRow): this {
    this.op = "update";
    this.payload = row;
    return this;
  }

  delete(): this {
    this.op = "delete";
    return this;
  }

  eq(column: string, value: unknown): this {
    this.filters.push({ column, value });
    return this;
  }

  order(column: string, options?: { ascending?: boolean }): this {
    this.orders.push({ column, ascending: options?.ascending ?? true });
    return this;
  }

  limit(count: number): this {
    this.limitCount = count;
    return this;
  }

  maybeSingle(): this {
    this.mode = "maybe";
    return this;
  }

  single(): this {
    this.mode = "single";
    return this;
  }

  then<TResult>(
    onFulfilled?: ((value: unknown) => TResult | PromiseLike<TResult>) | null,
    onRejected?: ((reason: unknown) => TResult | PromiseLike<TResult>) | null,
  ): Promise<TResult> {
    return Promise.resolve(this.run()).then(onFulfilled, onRejected);
  }

  private matches(row: FakeRow): boolean {
    return this.filters.every((filter) => row[filter.column] === filter.value);
  }

  private shape(rows: FakeRow[]): { data: unknown; error: { message: string } | null } {
    if (this.mode === "many") return { data: rows, error: null };
    if (this.mode === "maybe") {
      if (rows.length > 1) return { data: null, error: { message: "more than one row" } };
      return { data: rows[0] ?? null, error: null };
    }
    if (rows.length !== 1) {
      return { data: null, error: { message: `expected one row, got ${rows.length}` } };
    }
    return { data: rows[0], error: null };
  }

  private run(): { data: unknown; error: { message: string } | null } {
    if (this.db.failOn === this.table) {
      return { data: null, error: { message: `boom on ${this.table}` } };
    }

    const rows = this.db.tables[this.table] ?? (this.db.tables[this.table] = []);
    this.db.log.push({ table: this.table, op: this.op, payload: this.payload });

    if (this.op === "insert") {
      const row = withDefaults(this.table, this.payload ?? {}, this.db);
      rows.push(row);
      return this.shape([{ ...row }]);
    }

    if (this.op === "update") {
      const updated: FakeRow[] = [];
      for (const row of rows) {
        if (!this.matches(row)) continue;
        Object.assign(row, this.payload ?? {}, { updated_at: new Date().toISOString() });
        updated.push({ ...row });
      }
      return this.shape(updated);
    }

    if (this.op === "delete") {
      const removed = rows.filter((candidate) => this.matches(candidate));
      for (const row of removed) rows.splice(rows.indexOf(row), 1);
      return { data: removed.map((row) => ({ id: row.id })), error: null };
    }

    let selected = rows.filter((row) => this.matches(row));
    for (const order of [...this.orders].reverse()) {
      selected = [...selected].sort((a, b) => {
        const left = a[order.column];
        const right = b[order.column];
        if (left === right) return 0;
        const result = (left as number | string) < (right as number | string) ? -1 : 1;
        return order.ascending ? result : -result;
      });
    }
    if (this.limitCount !== null) selected = selected.slice(0, this.limitCount);
    return this.shape(selected.map((row) => ({ ...row })));
  }
}

function createFakeClient(options: Partial<FakeDb> = {}) {
  const db: FakeDb = {
    tables: options.tables ?? {},
    user: options.user === undefined ? { id: "user-1" } : options.user,
    failOn: options.failOn ?? null,
    log: options.log ?? [],
    nextId: options.nextId ?? 1,
  };

  const client = {
    auth: { getUser: async () => ({ data: { user: db.user }, error: null }) },
    from: (table: string) => new FakeQuery(db, table),
  };

  return { client: client as unknown as SupabaseClient<Database>, db };
}

function taskRow(overrides: Partial<WsTaskRow> = {}): WsTaskRow {
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

function commentRow(overrides: Partial<WsTaskCommentRow> = {}): WsTaskCommentRow {
  return {
    id: "comment-1",
    task_id: "task-1",
    body: "A comment",
    author_id: "user-1",
    created_at: "2026-11-17T09:00:00.000Z",
    edited_at: null,
    ...overrides,
  };
}

describe("supabase tasks repo", () => {
  it("reads the tasks and one task", async () => {
    const { client } = createFakeClient({
      tables: { ws_tasks: [taskRow(), taskRow({ id: "task-2", title: "Second" })] },
    });
    const repo = createSupabaseTasksRepo(client);

    expect((await repo.listTasks()).map((task) => task.id)).toEqual(["task-1", "task-2"]);
    expect((await repo.getTask("task-2"))?.title).toBe("Second");
    expect(await repo.getTask("missing")).toBeNull();
  });

  it("creates a task with the signed-in user and the next position", async () => {
    const { client, db } = createFakeClient({
      tables: {
        ws_tasks: [taskRow({ position: 1000 }), taskRow({ id: "task-2", position: 2500 })],
      },
    });
    const repo = createSupabaseTasksRepo(client);

    const created = await repo.createTask({
      title: "  New task  ",
      description: "   ",
      assigneeId: "user-2",
      dueDate: "2026-11-25",
      priority: "high",
      pipelineCardId: "card-1",
    });

    expect(created.title).toBe("New task");
    expect(created.description).toBeNull();
    expect(created.assignee_id).toBe("user-2");
    expect(created.due_date).toBe("2026-11-25");
    expect(created.priority).toBe("high");
    expect(created.status).toBe("todo");
    expect(created.created_by).toBe("user-1");
    expect(created.pipeline_card_id).toBe("card-1");
    expect(created.position).toBe(3500);
    expect(db.tables.ws_tasks).toHaveLength(3);
  });

  it("refuses to create without a session", async () => {
    const { client } = createFakeClient({ user: null });
    const repo = createSupabaseTasksRepo(client);
    await expect(repo.createTask({ title: "New task" })).rejects.toThrow(/signed in/);
  });

  it("sends only the fields an edit changes", async () => {
    const { client, db } = createFakeClient({ tables: { ws_tasks: [taskRow()] } });
    const repo = createSupabaseTasksRepo(client);

    const saved = await repo.updateTask("task-1", { priority: "urgent", assigneeId: null });

    expect(saved.priority).toBe("urgent");
    expect(saved.assignee_id).toBeNull();
    expect(db.log.at(-1)).toEqual({
      table: "ws_tasks",
      op: "update",
      payload: { priority: "urgent", assignee_id: null },
    });
  });

  it("changes the status without sending completed_at", async () => {
    const { client, db } = createFakeClient({ tables: { ws_tasks: [taskRow()] } });
    const repo = createSupabaseTasksRepo(client);

    const done = await repo.setStatus("task-1", "done");

    expect(done.status).toBe("done");
    expect(db.log.at(-1)?.payload).toEqual({ status: "done" });
  });

  it("reads a task back when an edit changes nothing", async () => {
    const { client, db } = createFakeClient({ tables: { ws_tasks: [taskRow()] } });
    const repo = createSupabaseTasksRepo(client);

    const same = await repo.updateTask("task-1", {});
    expect(same.id).toBe("task-1");
    expect(db.log.filter((entry) => entry.op === "update")).toHaveLength(0);
  });

  it("deletes a task", async () => {
    const { client, db } = createFakeClient({
      tables: { ws_tasks: [taskRow(), taskRow({ id: "task-2" })] },
    });
    const repo = createSupabaseTasksRepo(client);

    await repo.deleteTask("task-1");

    expect(db.tables.ws_tasks?.map((row) => row.id)).toEqual(["task-2"]);
  });

  it("fails a delete that removed nothing, as row level security does for a member", async () => {
    const { client } = createFakeClient({ tables: { ws_tasks: [taskRow()] } });
    const repo = createSupabaseTasksRepo(client);

    await expect(repo.deleteTask("task-404")).rejects.toThrow("nothing was deleted");
  });

  it("reads comments oldest first", async () => {
    const { client } = createFakeClient({
      tables: {
        ws_task_comments: [
          commentRow({ id: "later", created_at: "2026-11-17T11:00:00.000Z" }),
          commentRow({ id: "earlier", created_at: "2026-11-17T09:00:00.000Z" }),
          commentRow({ id: "other-task", task_id: "task-2" }),
        ],
      },
    });
    const repo = createSupabaseTasksRepo(client);

    expect((await repo.listComments("task-1")).map((comment) => comment.id)).toEqual([
      "earlier",
      "later",
    ]);
  });

  it("adds a comment as the signed-in user", async () => {
    const { client } = createFakeClient({ tables: { ws_tasks: [taskRow()] } });
    const repo = createSupabaseTasksRepo(client);

    const comment = await repo.addComment("task-1", "  Looks right  ");

    expect(comment.body).toBe("Looks right");
    expect(comment.author_id).toBe("user-1");
    expect(comment.task_id).toBe("task-1");
    expect(comment.edited_at).toBeNull();
  });

  it("edits a comment and stamps edited_at", async () => {
    const { client, db } = createFakeClient({
      tables: { ws_task_comments: [commentRow()] },
    });
    const repo = createSupabaseTasksRepo(client);

    const edited = await repo.editComment("comment-1", "Changed");

    expect(edited.body).toBe("Changed");
    expect(edited.edited_at).not.toBeNull();
    expect(db.log.at(-1)?.payload).toMatchObject({ body: "Changed" });
  });

  it("deletes a comment", async () => {
    const { client, db } = createFakeClient({
      tables: { ws_task_comments: [commentRow()] },
    });
    const repo = createSupabaseTasksRepo(client);

    await repo.deleteComment("comment-1");

    expect(db.tables.ws_task_comments).toEqual([]);
  });

  it("fails a comment delete that removed nothing", async () => {
    const { client } = createFakeClient({ tables: { ws_task_comments: [commentRow()] } });
    const repo = createSupabaseTasksRepo(client);

    await expect(repo.deleteComment("comment-404")).rejects.toThrow("nothing was deleted");
  });

  it("refuses an empty title and an empty comment", async () => {
    const { client } = createFakeClient();
    const repo = createSupabaseTasksRepo(client);

    await expect(repo.createTask({ title: "  " })).rejects.toThrow(/needs a title/);
    await expect(repo.addComment("task-1", "  ")).rejects.toThrow(/needs some words/);
  });

  it("maps the member list and the card list to what the screen shows", async () => {
    const { client } = createFakeClient({
      tables: {
        workspace_members: [
          { user_id: "user-1", display_name: "Mia Santos", role: "owner" },
          { user_id: "user-2", display_name: "Noel Reyes", role: "member" },
        ],
        ws_pipeline_cards: [{ id: "card-1", title: "December Invitational", stage: "prep" }],
      },
    });
    const repo = createSupabaseTasksRepo(client);

    expect(await repo.listMembers()).toEqual([
      { id: "user-1", displayName: "Mia Santos" },
      { id: "user-2", displayName: "Noel Reyes" },
    ]);
    expect(await repo.listCards()).toEqual([{ id: "card-1", title: "December Invitational" }]);
  });

  it("reports a read failure instead of showing an empty list", async () => {
    const { client } = createFakeClient({ failOn: "ws_tasks" });
    const repo = createSupabaseTasksRepo(client);

    await expect(repo.listTasks()).rejects.toThrow(/Could not read the tasks: boom on ws_tasks/);
  });
});
