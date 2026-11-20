import { POSITION_STEP, TASK_PRIORITIES } from "@/lib/db/constants";
import type { TaskPriority, WsTaskCommentRow, WsTaskRow } from "@/lib/db/types";
import seed from "../../../seed/nov17-next-steps.json";
import { addDays, isoToday } from "./logic";
import { cleanBody, cleanText, cleanTitle } from "./text";
import type { TaskCardOption, TaskDraft, TaskMember, TaskPatch, TasksRepo } from "./types";

/**
 * The demo repository: in-memory data for checking the screens without a database.
 *
 * The store lives at module level so a create, an edit or a comment survives the round trip from
 * the page to a server action and back. It is only reachable when demo mode is on, which a
 * production build cannot do (see `lib/flags.ts`).
 *
 * The eleven tasks from the 17 Nov meeting are the real seed and stay unassigned: the owner
 * assigns them. The extra tasks are demo only, and they are assigned so every tab has content.
 */

const DEMO_OWNER = "demo-user";

const DEMO_MEMBERS: ReadonlyArray<TaskMember> = [
  { id: DEMO_OWNER, displayName: "Demo user" },
  { id: "demo-mia", displayName: "Mia Santos" },
  { id: "demo-noel", displayName: "Noel Reyes" },
];

const DEMO_CARDS: ReadonlyArray<TaskCardOption> = [
  { id: "demo-card-december", title: "December Invitational" },
  { id: "demo-card-championship", title: "Club Championship" },
];

type DemoState = {
  tasks: WsTaskRow[];
  comments: WsTaskCommentRow[];
  nextTaskId: number;
  nextCommentId: number;
};

function seedPriority(value: string): TaskPriority {
  const found = TASK_PRIORITIES.find((entry) => entry.id === value);
  if (!found) throw new Error(`The demo seed has an unknown priority: ${value}`);
  return found.id;
}

function seedState(): DemoState {
  const now = new Date().toISOString();
  const today = isoToday();
  const tasks: WsTaskRow[] = [];
  let nextTaskId = 1;

  for (const [index, item] of seed.tasks.entries()) {
    tasks.push({
      id: `demo-task-${nextTaskId++}`,
      title: item.title,
      description: item.description,
      assignee_id: null,
      due_date: null,
      priority: seedPriority(item.priority),
      status: "todo",
      position: (index + 1) * POSITION_STEP,
      pipeline_card_id: null,
      tournament_id: null,
      completed_at: null,
      created_by: DEMO_OWNER,
      created_at: now,
      updated_at: now,
    });
  }

  const extras: ReadonlyArray<{
    title: string;
    description: string;
    assignee: string | null;
    due: string | null;
    priority: TaskPriority;
    status: WsTaskRow["status"];
    card: string | null;
  }> = [
    {
      title: "Confirm the December tee sheet",
      description: "Check the start list against the entries before it goes to the club.",
      assignee: DEMO_OWNER,
      due: today,
      priority: "high",
      status: "in_progress",
      card: "demo-card-december",
    },
    {
      title: "Send the sponsor deck",
      description: "The deck is written; it needs a final read and the price table.",
      assignee: "demo-mia",
      due: addDays(today, -3),
      priority: "urgent",
      status: "todo",
      card: "demo-card-december",
    },
    {
      title: "Update the venue contract",
      description: "The club changed the deposit date, so the contract needs a new copy.",
      assignee: "demo-noel",
      due: addDays(today, -10),
      priority: "normal",
      status: "in_progress",
      card: null,
    },
    {
      title: "Archive October scorecards",
      description: "Move the finished event's scorecards out of the active list.",
      assignee: DEMO_OWNER,
      due: addDays(today, 2),
      priority: "low",
      status: "todo",
      card: null,
    },
    {
      title: "Book the scoring tablets",
      description: "Waiting on the supplier's stock count.",
      assignee: "demo-noel",
      due: addDays(today, 10),
      priority: "normal",
      status: "blocked",
      card: "demo-card-championship",
    },
    {
      title: "Write the wrap-up note",
      description: "One page on what worked and what to change next time.",
      assignee: "demo-mia",
      due: addDays(today, -5),
      priority: "normal",
      status: "done",
      card: "demo-card-championship",
    },
  ];

  for (const [index, item] of extras.entries()) {
    const position = (seed.tasks.length + index + 1) * POSITION_STEP;
    tasks.push({
      id: `demo-task-${nextTaskId++}`,
      title: item.title,
      description: item.description,
      assignee_id: item.assignee,
      due_date: item.due,
      priority: item.priority,
      status: item.status,
      position,
      pipeline_card_id: item.card,
      tournament_id: null,
      completed_at: item.status === "done" ? now : null,
      created_by: DEMO_OWNER,
      created_at: now,
      updated_at: now,
    });
  }

  const firstAssigned = tasks.find((task) => task.title === "Confirm the December tee sheet");
  const comments: WsTaskCommentRow[] = firstAssigned
    ? [
        {
          id: "demo-comment-1",
          task_id: firstAssigned.id,
          body: "The entries close on Friday, so this can wait until then.",
          author_id: "demo-mia",
          created_at: now,
          edited_at: null,
        },
        {
          id: "demo-comment-2",
          task_id: firstAssigned.id,
          body: "Noted. I will check it Friday morning and flag any gaps.",
          author_id: DEMO_OWNER,
          created_at: now,
          edited_at: now,
        },
      ]
    : [];

  return { tasks, comments, nextTaskId, nextCommentId: comments.length + 1 };
}

let state: DemoState | null = null;

function store(): DemoState {
  state ??= seedState();
  return state;
}

/** Puts the demo data back to its first state. Used by the tests. */
export function resetDemoTasksStore(): void {
  state = seedState();
}

function findTask(id: string): WsTaskRow {
  const row = store().tasks.find((task) => task.id === id);
  if (!row) throw new Error("Task not found.");
  return row;
}

function applyPatch(row: WsTaskRow, patch: TaskPatch): void {
  const wasDone = row.status === "done";
  const now = new Date().toISOString();

  if (patch.title !== undefined) row.title = cleanTitle(patch.title);
  if (patch.description !== undefined) row.description = cleanText(patch.description);
  if (patch.assigneeId !== undefined) row.assignee_id = patch.assigneeId;
  if (patch.dueDate !== undefined) row.due_date = patch.dueDate;
  if (patch.priority !== undefined) row.priority = patch.priority;
  if (patch.status !== undefined) row.status = patch.status;
  if (patch.pipelineCardId !== undefined) row.pipeline_card_id = patch.pipelineCardId;
  if (patch.tournamentId !== undefined) row.tournament_id = patch.tournamentId;

  // The same rule the database trigger applies.
  row.updated_at = now;
  if (row.status === "done") {
    if (!wasDone) row.completed_at = now;
  } else {
    row.completed_at = null;
  }
}

export function createDemoTasksRepo(): TasksRepo {
  return {
    async listTasks() {
      return store().tasks.map((task) => ({ ...task }));
    },

    async getTask(id) {
      const row = store().tasks.find((task) => task.id === id);
      return row ? { ...row } : null;
    },

    async createTask(input: TaskDraft) {
      const now = new Date().toISOString();
      const current = store();
      const top = current.tasks.reduce((highest, task) => Math.max(highest, task.position), 0);
      const row: WsTaskRow = {
        id: `demo-task-${current.nextTaskId++}`,
        title: cleanTitle(input.title),
        description: cleanText(input.description),
        assignee_id: input.assigneeId ?? null,
        due_date: input.dueDate ?? null,
        priority: input.priority ?? "normal",
        status: "todo",
        position: top + POSITION_STEP,
        pipeline_card_id: input.pipelineCardId ?? null,
        tournament_id: input.tournamentId ?? null,
        completed_at: null,
        created_by: DEMO_OWNER,
        created_at: now,
        updated_at: now,
      };
      current.tasks.push(row);
      return { ...row };
    },

    async updateTask(id, patch) {
      const row = findTask(id);
      applyPatch(row, patch);
      return { ...row };
    },

    async setStatus(id, status) {
      const row = findTask(id);
      applyPatch(row, { status });
      return { ...row };
    },

    async deleteTask(id) {
      const current = store();
      const index = current.tasks.findIndex((task) => task.id === id);
      if (index === -1) throw new Error("Task not found.");
      current.tasks.splice(index, 1);
      current.comments = current.comments.filter((comment) => comment.task_id !== id);
    },

    async listComments(taskId) {
      return store()
        .comments.filter((comment) => comment.task_id === taskId)
        .sort((a, b) => a.created_at.localeCompare(b.created_at))
        .map((comment) => ({ ...comment }));
    },

    async addComment(taskId, body) {
      findTask(taskId);
      const current = store();
      const row: WsTaskCommentRow = {
        id: `demo-comment-${current.nextCommentId++}`,
        task_id: taskId,
        body: cleanBody(body),
        author_id: DEMO_OWNER,
        created_at: new Date().toISOString(),
        edited_at: null,
      };
      current.comments.push(row);
      return { ...row };
    },

    async editComment(id, body) {
      const row = store().comments.find((comment) => comment.id === id);
      if (!row) throw new Error("Comment not found.");
      row.body = cleanBody(body);
      row.edited_at = new Date().toISOString();
      return { ...row };
    },

    async deleteComment(id) {
      const current = store();
      const index = current.comments.findIndex((comment) => comment.id === id);
      if (index === -1) throw new Error("Comment not found.");
      current.comments.splice(index, 1);
    },

    async listMembers() {
      return DEMO_MEMBERS.map((member) => ({ ...member }));
    },

    async listCards() {
      return DEMO_CARDS.map((card) => ({ ...card }));
    },
  };
}
