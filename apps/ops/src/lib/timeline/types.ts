import type { PipelineStage, TaskStatus } from "@/lib/db/types";

/**
 * The Timeline page's own vocabulary.
 *
 * Nothing in here reads a clock, the database or the browser. An item is a day range with a kind, a
 * title and, when there is one, somewhere to click. The page builds them on the server from the
 * repositories the rest of the workspace already uses.
 */

export const TIMELINE_KINDS = ["tournament", "card", "task", "milestone", "release"] as const;

export type TimelineKind = (typeof TIMELINE_KINDS)[number];

export const TIMELINE_KIND_LABEL: Record<TimelineKind, string> = {
  tournament: "Tournament",
  card: "Pipeline card",
  task: "Task",
  milestone: "Milestone",
  release: "Release",
};

/** The plural, for the filter chips and the Gantt group headings. */
export const TIMELINE_KIND_PLURAL: Record<TimelineKind, string> = {
  tournament: "Tournaments",
  card: "Pipeline",
  task: "Tasks",
  milestone: "Milestones",
  release: "Releases",
};

/**
 * How the bar's dates were chosen. A card has no stored stage history, so its bar can only show its
 * own dates or the day it was created and the day it was last touched; the page says which.
 */
export type TimelineBasis = "dates" | "created-and-updated" | "due-date" | "due-on" | "published";

export type TimelineItem = {
  /** Unique across every source, prefixed by kind so two sources cannot collide. */
  id: string;
  kind: TimelineKind;
  title: string;
  /** A second line: the club, the stage, the tag. Null when there is nothing useful to add. */
  detail: string | null;
  /** First day the item covers, inclusive. */
  start: string;
  /** Last day the item covers, inclusive. Equals `start` for a point in time. */
  end: string;
  /**
   * A tournament's preparation window, before the first playing day. Drawn as a lighter segment
   * ahead of the bar. Null for every other kind.
   */
  prepStart: string | null;
  /** A point in time, drawn as a diamond rather than a bar. */
  milestone: boolean;
  /** Where a click goes, or null when the item has no page of its own. */
  href: string | null;
  /** Member ids for the person filter: the card owner, the task assignee. */
  people: string[];
  basis: TimelineBasis | null;
};

export type TournamentSource = {
  id: string;
  name: string;
  /** Every playing day, ascending as the database returns them. May be empty. */
  dates: string[];
  finished: boolean;
};

export type CardSource = {
  id: string;
  title: string;
  club_name: string;
  stage: PipelineStage;
  start_date: string | null;
  end_date: string | null;
  owner_id: string | null;
  created_at: string;
  updated_at: string;
};

export type TaskSource = {
  id: string;
  title: string;
  due_date: string | null;
  status: TaskStatus;
  assignee_id: string | null;
};

export type MilestoneSource = {
  number: number;
  title: string;
  /** `YYYY-MM-DD`, already cut from the GitHub timestamp. */
  dueOn: string;
  state: "open" | "closed";
  url: string;
};

export type ReleaseSource = {
  tag: string;
  name: string;
  /** `YYYY-MM-DD`. */
  publishedOn: string;
  url: string;
  prerelease: boolean;
};
