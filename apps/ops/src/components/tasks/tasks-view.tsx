"use client";

import type { RealtimeChannel } from "@supabase/supabase-js";
import { Plus } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label, Select } from "@/components/ui/field";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { channels } from "@/lib/db/constants";
import type { TaskStatus, WsTaskRow } from "@/lib/db/types";
import { getBrowserSupabase } from "@/lib/supabase/browser";
import { planTaskMove } from "@/lib/tasks/board";
import {
  filterTasks,
  mergeTaskChange,
  parseRealtimeChange,
  sortTasks,
  type TaskView,
} from "@/lib/tasks/logic";
import { messageOf, unwrap } from "@/lib/tasks/result";
import type {
  TaskActions,
  TaskCardOption,
  TaskDraft,
  TaskMember,
  TaskPatch,
  TaskViewer,
} from "@/lib/tasks/types";
import { LiveIndicator, type LiveState } from "./live-indicator";
import { NewTaskDialog } from "./new-task-dialog";
import { TaskBoard, type TaskBoardMove } from "./task-board";
import { TaskDetailSheet } from "./task-detail-sheet";
import { TaskList } from "./task-list";

/** The tabs on this screen: the four list filters, plus the board. */
export type TaskTab = TaskView | "board";

/**
 * Keeps the board linkable: the board is `?view=board` and every list tab is plain `/tasks`.
 * A shallow replace is enough here; there is nothing for the server to re-render, and the page
 * reads the same parameter on a full load.
 */
function rememberTab(tab: TaskTab): void {
  if (typeof window === "undefined") return;
  const url = tab === "board" ? "/tasks?view=board" : "/tasks";
  if (`${window.location.pathname}${window.location.search}` === url) return;
  window.history.replaceState(null, "", url);
}

/**
 * The task screen: the list with its four filters, and the board.
 *
 * The server renders the first data. From there this component owns the list: it applies a local
 * write as soon as the server confirms it, and folds in live changes by id and `updated_at`. A
 * change for a task whose own write is still in flight is dropped, so a local edit is never undone
 * by an event that left the database before the write landed. The board reads the same list, so a
 * remote move appears there without a reload.
 */
export function TasksView({
  initialTasks,
  members,
  cards,
  viewer,
  today,
  live,
  initialTab,
  canEdit,
  actions,
}: {
  initialTasks: WsTaskRow[];
  members: TaskMember[];
  cards: TaskCardOption[];
  viewer: TaskViewer;
  today: string;
  live: boolean;
  initialTab: TaskTab;
  /** False at view level: no new task, no status change, no edit, no delete, no comment. */
  canEdit: boolean;
  actions: TaskActions;
}) {
  const [tasks, setTasks] = useState<WsTaskRow[]>(initialTasks);
  const [tab, setTab] = useState<TaskTab>(initialTab);
  const [assigneeId, setAssigneeId] = useState<string>(() => {
    if (members.some((member) => member.id === viewer.id)) return viewer.id;
    return members[0]?.id ?? "";
  });
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [liveState, setLiveState] = useState<LiveState>(live ? "connecting" : "off");
  const [commentsRefresh, setCommentsRefresh] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const pending = useRef<Set<string>>(new Set());
  const openTaskIdRef = useRef<string | null>(null);
  const tasksRef = useRef<WsTaskRow[]>(initialTasks);

  useEffect(() => {
    tasksRef.current = tasks;
  }, [tasks]);

  useEffect(() => {
    openTaskIdRef.current = openTaskId;
  }, [openTaskId]);

  const memberNames = useMemo(
    () => new Map(members.map((member) => [member.id, member.displayName])),
    [members],
  );
  const cardTitles = useMemo(() => new Map(cards.map((card) => [card.id, card.title])), [cards]);

  const mine = useMemo(() => sortTasks(filterTasks(tasks, "mine", viewer.id)), [tasks, viewer.id]);
  const all = useMemo(() => sortTasks(filterTasks(tasks, "all", viewer.id)), [tasks, viewer.id]);
  const byAssignee = useMemo(
    () => sortTasks(filterTasks(tasks, "assignee", viewer.id, assigneeId)),
    [tasks, viewer.id, assigneeId],
  );
  const overdue = useMemo(
    () => sortTasks(filterTasks(tasks, "overdue", viewer.id, undefined, today)),
    [tasks, viewer.id, today],
  );

  const openTask =
    openTaskId === null ? null : (tasks.find((task) => task.id === openTaskId) ?? null);

  const handleCreate = useCallback(
    async (draft: TaskDraft) => {
      const row = await unwrap(actions.createTask(draft));
      setTasks((current) => [...current, row]);
      setError(null);
    },
    [actions],
  );

  const handleStatus = useCallback(
    async (id: string, status: TaskStatus) => {
      pending.current.add(id);
      try {
        const row = await unwrap(actions.setStatus(id, status));
        setTasks((current) => current.map((task) => (task.id === id ? row : task)));
        setError(null);
      } catch (cause) {
        setError(messageOf(cause));
      } finally {
        pending.current.delete(id);
      }
    },
    [actions],
  );

  const handleMove = useCallback(
    async (move: TaskBoardMove) => {
      const snapshot = tasksRef.current;
      let plan: ReturnType<typeof planTaskMove>;
      try {
        plan = planTaskMove(snapshot, move);
      } catch {
        // The task left the list between the drag and the drop. Nothing to save.
        return;
      }
      if (plan.updates.length === 0) return;

      // Only the rows this move touched are restored if it fails, so an unrelated live change that
      // arrived meanwhile is kept.
      const affected = new Map(
        snapshot
          .filter((task) => plan.updates.some((update) => update.id === task.id))
          .map((task) => [task.id, task]),
      );
      for (const update of plan.updates) pending.current.add(update.id);
      setTasks(plan.tasks);
      setError(null);

      try {
        const others = plan.updates.filter((update) => update.id !== move.id);
        const rows = await unwrap(actions.moveTask(move.id, move.toStatus, plan.position, others));
        const saved = new Map(rows.map((row) => [row.id, row]));
        setTasks((current) => current.map((task) => saved.get(task.id) ?? task));
      } catch (cause) {
        setTasks((current) => current.map((task) => affected.get(task.id) ?? task));
        setError(messageOf(cause));
      } finally {
        for (const update of plan.updates) pending.current.delete(update.id);
      }
    },
    [actions],
  );

  const handleSave = useCallback(
    async (id: string, patch: TaskPatch) => {
      pending.current.add(id);
      try {
        const row = await unwrap(actions.updateTask(id, patch));
        setTasks((current) => current.map((task) => (task.id === id ? row : task)));
        setError(null);
        return row;
      } finally {
        pending.current.delete(id);
      }
    },
    [actions],
  );

  const handleDelete = useCallback(
    async (id: string) => {
      pending.current.add(id);
      try {
        await unwrap(actions.deleteTask(id));
        setTasks((current) => current.filter((task) => task.id !== id));
        setOpenTaskId(null);
        setError(null);
      } finally {
        pending.current.delete(id);
      }
    },
    [actions],
  );

  const commentActions = useMemo(
    () => ({
      listComments: actions.listComments,
      addComment: actions.addComment,
      editComment: actions.editComment,
      deleteComment: actions.deleteComment,
    }),
    [actions],
  );

  useEffect(() => {
    if (!live) return;

    let cancelled = false;
    let channel: RealtimeChannel | null = null;
    let client: ReturnType<typeof getBrowserSupabase> | null = null;

    async function connect() {
      try {
        client = getBrowserSupabase();
        await client.realtime.setAuth();
        if (cancelled || !client) return;

        const active = client;
        channel = active.channel(channels.tasks, { config: { private: true } });

        const onEvent = (message: unknown) => {
          const parsed = parseRealtimeChange(message);
          if (!parsed) return;

          if (parsed.table === "ws_tasks") {
            setTasks((current) => mergeTaskChange(current, parsed.change, pending.current));
            if (parsed.change.type === "remove" && parsed.change.taskId === openTaskIdRef.current) {
              setOpenTaskId(null);
            }
            return;
          }

          if (parsed.taskId === openTaskIdRef.current) {
            setCommentsRefresh((count) => count + 1);
          }
        };

        channel
          .on("broadcast", { event: "INSERT" }, onEvent)
          .on("broadcast", { event: "UPDATE" }, onEvent)
          .on("broadcast", { event: "DELETE" }, onEvent)
          .subscribe((status) => {
            if (cancelled) return;
            if (status === "SUBSCRIBED") setLiveState("live");
            else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
              setLiveState("reconnecting");
            } else {
              setLiveState("connecting");
            }
          });
      } catch {
        if (!cancelled) setLiveState("reconnecting");
      }
    }

    void connect();

    return () => {
      cancelled = true;
      if (channel && client) client.removeChannel(channel);
    };
  }, [live]);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="overline">Tasks</p>
          <h1 className="mt-1 text-2xl">Team tasks</h1>
          <p className="hint mt-1">Assign work, set a due date and talk it through here.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <LiveIndicator state={liveState} />
          {canEdit ? (
            <Button variant="primary" onClick={() => setNewOpen(true)}>
              <Plus aria-hidden="true" />
              New task
            </Button>
          ) : null}
        </div>
      </div>

      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}

      <Tabs
        value={tab}
        onValueChange={(value) => {
          const next = value as TaskTab;
          setTab(next);
          rememberTab(next);
        }}
      >
        <TabsList className="flex w-full flex-wrap justify-start sm:w-auto">
          <TabsTrigger value="mine">My tasks</TabsTrigger>
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="assignee">By assignee</TabsTrigger>
          <TabsTrigger value="overdue">Overdue</TabsTrigger>
          <TabsTrigger value="board">Board</TabsTrigger>
        </TabsList>

        <TabsContent value="mine">
          <TaskList
            tasks={mine}
            memberNames={memberNames}
            cardTitles={cardTitles}
            today={today}
            onOpen={setOpenTaskId}
            onStatus={handleStatus}
            canEdit={canEdit}
            empty={{
              title: "No tasks assigned to you",
              body: "Work that is assigned to you appears here.",
            }}
          />
        </TabsContent>

        <TabsContent value="all">
          <TaskList
            tasks={all}
            memberNames={memberNames}
            cardTitles={cardTitles}
            today={today}
            onOpen={setOpenTaskId}
            onStatus={handleStatus}
            canEdit={canEdit}
            empty={{
              title: "No tasks yet",
              body: canEdit
                ? "Create the first task to get started."
                : "Tasks other people create appear here.",
              action: canEdit ? (
                <Button variant="secondary" onClick={() => setNewOpen(true)}>
                  New task
                </Button>
              ) : undefined,
            }}
          />
        </TabsContent>

        <TabsContent value="assignee">
          <div className="mb-3 flex flex-col gap-1.5 sm:max-w-xs">
            <Label htmlFor="task-assignee-filter">Assignee</Label>
            <Select
              id="task-assignee-filter"
              value={assigneeId}
              onChange={(event) => setAssigneeId(event.target.value)}
            >
              {members.length === 0 ? <option value="">No members</option> : null}
              {members.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.displayName}
                </option>
              ))}
            </Select>
          </div>
          <TaskList
            tasks={byAssignee}
            memberNames={memberNames}
            cardTitles={cardTitles}
            today={today}
            onOpen={setOpenTaskId}
            onStatus={handleStatus}
            canEdit={canEdit}
            empty={{
              title: "No tasks for this member",
              body: "Pick another member, or assign this one some work.",
            }}
          />
        </TabsContent>

        <TabsContent value="overdue">
          <TaskList
            tasks={overdue}
            memberNames={memberNames}
            cardTitles={cardTitles}
            today={today}
            onOpen={setOpenTaskId}
            onStatus={handleStatus}
            canEdit={canEdit}
            empty={{
              title: "Nothing overdue",
              body: "Open tasks past their due date appear here.",
            }}
          />
        </TabsContent>

        <TabsContent value="board">
          <TaskBoard
            tasks={tasks}
            members={members}
            viewerId={viewer.id}
            today={today}
            onOpen={setOpenTaskId}
            onMove={handleMove}
            canEdit={canEdit}
          />
        </TabsContent>
      </Tabs>

      {canEdit ? (
        <NewTaskDialog
          open={newOpen}
          onOpenChange={setNewOpen}
          members={members}
          cards={cards}
          onCreate={handleCreate}
        />
      ) : null}

      <TaskDetailSheet
        task={openTask}
        members={members}
        cards={cards}
        viewer={viewer}
        commentActions={commentActions}
        commentsRefresh={commentsRefresh}
        canEdit={canEdit}
        onClose={() => setOpenTaskId(null)}
        onSave={handleSave}
        onDelete={handleDelete}
      />
    </div>
  );
}
