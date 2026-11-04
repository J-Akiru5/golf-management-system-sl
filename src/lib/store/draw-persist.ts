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

/**
 * Everything the database stores for a group. A re-run on unchanged input proposes exactly what is
 * already saved, and bumping the revision for that is noise in the history and a pointless write.
 */
const boardSignature = (draw: DrawGroup[]) =>
  draw
    .map(
      (g) =>
        `${g.number}:${g.startHole}:${g.wave ?? ""}:${g.time}:${g.locked ? 1 : 0}:${g.playerIds.join(",")}`,
    )
    .join("|");

const overrideKey = (overrides: ManualOverride[]) => overrides.map((o) => o.id).join(",");

/**
 * The published copy a screen may show while the planned writes are still in flight. A takedown
 * that is queued but not written yet must not make the desk claim players can no longer see a list
 * that is still up: the old snapshot goes only when the write lands.
 */
export function publishedWhileWritesPending(
  jobs: readonly DrawJob[],
  was: Published | null,
  now: Published | null,
): Published | null {
  return jobs.some((job) => job.kind === "unpublish") ? was : now;
}

export function planDrawJobs(action: Action, before: DeskState, after: DeskState): DrawJob[] {
  const tournamentId = after.activeTournamentId;
  if (!tournamentId) return [];
  const was = before.boards[tournamentId];
  const now = after.boards[tournamentId];
  if (!now) return [];

  const save = (): DrawJob[] => {
    if (!now.draw) return [];
    if (
      was?.draw &&
      boardSignature(now.draw) === boardSignature(was.draw) &&
      overrideKey(now.overrides) === overrideKey(was.overrides)
    ) {
      return [];
    }
    return [{ kind: "save", tournamentId, draw: now.draw, overrides: now.overrides }];
  };

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
