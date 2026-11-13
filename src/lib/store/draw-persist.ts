import type { ManualOverride } from "@/lib/data/types";
import type { DrawGroup } from "@/lib/draw/validate";
import type { Action, DeskState, Published } from "./state";

/**
 * What must be written to the database after a draw action. Pure: it compares the state before and
 * after the reducer ran and says which jobs to queue, in order. Keeping it separate from the store
 * makes the rules testable without a database.
 */
export type DrawJob =
  | {
      kind: "save";
      tournamentId: string;
      draw: DrawGroup[];
      overrides: ManualOverride[];
      /**
       * The playing day's round the board was planned for. Captured when the job is queued, so a
       * day switch before the queue drains cannot write this board into another day.
       */
      roundId: string | null;
    }
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
 * Drops players who chose other playing days from a board before it is saved. A missing day is
 * "plays every day", so only a player who named other days is removed. Groups left with nobody go
 * too, so an empty group is never written for a day.
 */
export function drawForDay(draw: DrawGroup[], dayExcluded: ReadonlySet<string>): DrawGroup[] {
  if (dayExcluded.size === 0) return draw;
  return draw
    .map((group) => ({
      ...group,
      playerIds: group.playerIds.filter((id) => !dayExcluded.has(id)),
    }))
    .filter((group) => group.playerIds.length > 0);
}

export interface PlanOptions {
  /** The round id the board belongs to, captured when the action was planned. */
  roundId?: string | null;
  /** Players who chose another playing day, so they must not be written onto this one. */
  dayExcluded?: ReadonlySet<string>;
}

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

export function planDrawJobs(
  action: Action,
  before: DeskState,
  after: DeskState,
  options: PlanOptions = {},
): DrawJob[] {
  const tournamentId = after.activeTournamentId;
  if (!tournamentId) return [];
  const was = before.boards[tournamentId];
  const now = after.boards[tournamentId];
  if (!now) return [];

  const save = (): DrawJob[] => {
    if (!now.draw) return [];
    const draw = options.dayExcluded ? drawForDay(now.draw, options.dayExcluded) : now.draw;
    // Compared with the stored board as it is: if it still holds a player who chose another day,
    // the filtered board differs and must be written.
    if (
      was?.draw &&
      boardSignature(draw) === boardSignature(was.draw) &&
      overrideKey(now.overrides) === overrideKey(was.overrides)
    ) {
      return [];
    }
    return [
      {
        kind: "save",
        tournamentId,
        draw,
        overrides: now.overrides,
        roundId: options.roundId ?? null,
      },
    ];
  };

  switch (action.type) {
    case "generate": {
      // The reducer keeps the published copy while another day is still on it. It clears every
      // day only when no other day was published, and that is the only case that goes down.
      const jobs = save();
      if (was?.published && !now.published) jobs.push({ kind: "unpublish", tournamentId });
      return jobs;
    }
    case "replaceDraw":
    case "undoBoard":
    case "move":
    case "withdrawFromDraw":
    case "restoreToDraw":
    case "placeOnDraw":
    case "setGroupLocked":
    case "swapGroupSlots":
    case "moveGroupToHole":
    case "reorderHoleQueue":
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
