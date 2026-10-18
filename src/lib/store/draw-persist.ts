import type { ManualOverride } from "@/lib/data/types";
import type { DrawGroup } from "@/lib/draw/validate";
import type { Action, DeskState, Published } from "./state";

/**
 * What must be written to the database after a draw action. Pure: it compares the state before and
 * after the reducer ran and says which jobs to queue, in order. Keeping it separate from the store
 * makes the rules testable without a database.
 */
export type DrawJob =
  | { kind: "save"; tournamentId: string; draw: DrawGroup[]; overrides: ManualOverride[] }
  | { kind: "publish"; tournamentId: string; published: Published }
  | { kind: "unpublish"; tournamentId: string };

export function planDrawJobs(action: Action, before: DeskState, after: DeskState): DrawJob[] {
  const tournamentId = after.activeTournamentId;
  if (!tournamentId) return [];
  const was = before.boards[tournamentId];
  const now = after.boards[tournamentId];
  if (!now) return [];

  const save = (): DrawJob[] =>
    now.draw && now.draw !== was?.draw
      ? [{ kind: "save", tournamentId, draw: now.draw, overrides: now.overrides }]
      : [];

  switch (action.type) {
    case "generate": {
      // A fresh proposal that drops the published copy also takes the public page down.
      const jobs = save();
      if (was?.published && !now.published) jobs.push({ kind: "unpublish", tournamentId });
      return jobs;
    }
    case "move":
    case "setGroupLocked":
      return save();
    case "publish":
      return now.published && now.published !== was?.published
        ? [{ kind: "publish", tournamentId, published: now.published }]
        : [];
    case "unpublish":
      return was?.published ? [{ kind: "unpublish", tournamentId }] : [];
    default:
      return [];
  }
}
