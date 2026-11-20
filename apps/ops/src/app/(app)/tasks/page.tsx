import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { TasksView, type TaskTab } from "@/components/tasks/tasks-view";
import { getViewer } from "@/lib/auth/viewer";
import { demoMode } from "@/lib/flags";
import { getRepos } from "@/lib/repos";
import { isoToday } from "@/lib/tasks/logic";
import type { TaskActions, TaskViewer } from "@/lib/tasks/types";
import {
  addComment,
  createTask,
  deleteComment,
  deleteTask,
  editComment,
  listComments,
  moveTask,
  setStatus,
  updateTask,
} from "./actions";

export const metadata: Metadata = { title: "Tasks" };

/**
 * The tasks screen. The gate in the app layout has already allowed this viewer in.
 *
 * `?view=board` opens the board tab, so the board can be linked. Every other value, and no value,
 * opens the first list tab.
 */
export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const initialTab: TaskTab = params.view === "board" ? "board" : "mine";

  const demo = demoMode();
  const repos = await getRepos();

  const [tasks, members, cards] = await Promise.all([
    repos.tasks.listTasks(),
    repos.tasks.listMembers(),
    repos.tasks.listCards(),
  ]);

  let viewer: TaskViewer;
  if (demo) {
    // The same demo viewer the shell shows.
    viewer = { id: "demo-user", role: "owner", displayName: "Demo user" };
  } else {
    const current = await getViewer();
    if (!current?.member) notFound();
    viewer = {
      id: current.user.id,
      role: current.member.role,
      displayName: current.member.display_name,
    };
  }

  const actions: TaskActions = {
    createTask,
    updateTask,
    setStatus,
    moveTask,
    deleteTask,
    listComments,
    addComment,
    editComment,
    deleteComment,
  };

  return (
    <TasksView
      initialTasks={tasks}
      members={members}
      cards={cards}
      viewer={viewer}
      today={isoToday()}
      live={!demo}
      initialTab={initialTab}
      actions={actions}
    />
  );
}
