import type { Metadata } from "next";
import { DocumentsCard } from "@/components/overview/documents-card";
import { MyTasksCard } from "@/components/overview/my-tasks-card";
import { PipelineCard } from "@/components/overview/pipeline-card";
import { SectionMessage } from "@/components/overview/section-message";
import { getViewer } from "@/lib/auth/viewer";
import type { DocSummary } from "@/lib/docs/repo";
import { demoMode } from "@/lib/flags";
import {
  formatToday,
  type PipelineSummary,
  pipelineSummary,
  recentDocs,
  type TaskSummary,
  taskSummary,
} from "@/lib/overview/summary";
import { getRepos, type Repos } from "@/lib/repos";
import { isoToday } from "@/lib/tasks/logic";

export const metadata: Metadata = { title: "Overview" };

/** The same viewer the shell shows in demo mode. */
const DEMO_VIEWER_ID = "demo-user";
const DEMO_DISPLAY_NAME = "Demo user";

const RECENT_DOC_LIMIT = 5;

/** One section's read. A failure stays inside its own card, so the other two still render. */
type Section<T> = { ok: true; value: T } | { ok: false };

const FAILED = { ok: false } as const;

function compute<T>(work: () => T): Section<T> {
  try {
    return { ok: true, value: work() };
  } catch {
    return FAILED;
  }
}

const FAILED_MESSAGE = "This section could not load. Reload the page to try again.";

/**
 * The first screen a member sees: their work, the pipeline and the documents that changed. Each
 * section is read and summarised on its own, so one refused read does not empty the page.
 */
export default async function OverviewPage() {
  const demo = demoMode();

  let viewerId: string;
  let displayName: string;
  if (demo) {
    viewerId = DEMO_VIEWER_ID;
    displayName = DEMO_DISPLAY_NAME;
  } else {
    const current = await getViewer();
    // The layout gate answers first. This keeps the page honest if it is ever reached another way.
    if (!current?.member) {
      return <p className="hint">You do not have access to the workspace.</p>;
    }
    viewerId = current.user.id;
    displayName = current.member.display_name;
  }

  const today = isoToday();

  let repos: Repos | null = null;
  try {
    repos = await getRepos();
  } catch {
    // No data source at all: every card says so rather than showing empty data that looks real.
    repos = null;
  }

  let tasks: Section<TaskSummary>;
  let pipeline: Section<PipelineSummary>;
  let documents: Section<DocSummary[]>;

  if (repos === null) {
    tasks = FAILED;
    pipeline = FAILED;
    documents = FAILED;
  } else {
    const [taskRows, cards, docs] = await Promise.allSettled([
      repos.tasks.listTasks(),
      repos.board.listCards(),
      repos.docs.listDocs({ archived: false }),
    ]);

    tasks =
      taskRows.status === "fulfilled"
        ? compute(() => taskSummary(taskRows.value, viewerId, today))
        : FAILED;
    pipeline = cards.status === "fulfilled" ? compute(() => pipelineSummary(cards.value)) : FAILED;
    documents =
      docs.status === "fulfilled"
        ? compute(() => recentDocs(docs.value, RECENT_DOC_LIMIT))
        : FAILED;
  }

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-1">
        <p className="overline">Overview</p>
        <h1 className="text-2xl">Hello, {displayName}</h1>
        <p className="hint tnum">{formatToday(today)}</p>
      </header>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {tasks.ok ? (
          <MyTasksCard summary={tasks.value} today={today} />
        ) : (
          <SectionMessage title="My tasks">{FAILED_MESSAGE}</SectionMessage>
        )}

        {pipeline.ok ? (
          <PipelineCard summary={pipeline.value} />
        ) : (
          <SectionMessage title="Pipeline">{FAILED_MESSAGE}</SectionMessage>
        )}

        {documents.ok ? (
          <DocumentsCard docs={documents.value} />
        ) : (
          <SectionMessage title="Documents">{FAILED_MESSAGE}</SectionMessage>
        )}
      </div>
    </div>
  );
}
