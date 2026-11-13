import type { DrawGroup } from "@/lib/draw/validate";
import { fmtTime } from "@/lib/format";
import type { Action, DeskState } from "./state";

/**
 * What to tell the organizer after an action lands. Pure, so the wording is testable without a
 * store or a DOM.
 *
 * The case worth naming is a re-run that changes nothing: the engine is deterministic, so the same
 * board in produces the same board out, and the screen used to sit still with no explanation. It
 * now says so in words instead of looking broken.
 */
export interface ActionNotice {
  tone: "ok" | "info" | "bad";
  title: string;
  detail?: string;
}

const boardOf = (s: DeskState) =>
  s.activeTournamentId ? s.boards[s.activeTournamentId] : undefined;

const groupOf = (draw: DrawGroup[] | null | undefined, playerId: string) =>
  draw?.find((g) => g.playerIds.includes(playerId)) ?? null;

const place = (g: DrawGroup) =>
  `Group ${g.number} · hole ${g.startHole}${g.wave ?? ""} · ${fmtTime(g.time)}`;

/** How many players end up in a different group from the one they started in. */
export function movedPlayers(before: DrawGroup[], after: DrawGroup[]): number {
  const was = new Map<string, number>();
  for (const g of before) for (const id of g.playerIds) was.set(id, g.number);
  let moved = 0;
  for (const g of after) for (const id of g.playerIds) if (was.get(id) !== g.number) moved += 1;
  return moved;
}

export function actionNotice(
  action: Action,
  before: DeskState,
  after: DeskState,
): ActionNotice | null {
  const was = boardOf(before);
  const board = boardOf(after);
  if (!board) return null;

  switch (action.type) {
    case "generateAllDays": {
      const days = Object.keys(board.dayBoards ?? {}).length;
      const shown = board.draw?.length ?? 0;
      return {
        tone: "ok",
        title: "Draw made",
        detail: `${days} playing day${days === 1 ? "" : "s"} drawn, AM and PM kept apart · ${shown} group${shown === 1 ? "" : "s"} on the day shown`,
      };
    }

    case "generate": {
      const now = board.draw ?? [];
      const then = was?.draw ?? null;
      const placed = now.reduce((n, g) => n + g.playerIds.length, 0);
      if (!then) {
        return {
          tone: "ok",
          title: "Draw made",
          detail: `${now.length} group${now.length === 1 ? "" : "s"} from ${placed} ready player${placed === 1 ? "" : "s"}`,
        };
      }
      const locks = then.filter((g) => g.locked).length;
      const kept = locks ? ` · ${locks} locked group${locks === 1 ? "" : "s"} kept` : "";
      const moved = movedPlayers(then, now);
      if (moved === 0 && now.length === then.length) {
        return {
          tone: "info",
          title: "Re-ran the proposal: nothing moved",
          detail: `The engine proposes the same ${now.length} groups for the players who are ready${kept}. Fix what the checks name, then re-run.`,
        };
      }
      return {
        tone: "ok",
        title: "Re-ran the proposal",
        detail: `${moved} player${moved === 1 ? "" : "s"} changed group · ${now.length} groups${kept}`,
      };
    }

    case "move": {
      // The reducer returns the same state when the group cannot take the player.
      if (after === before) {
        return {
          tone: "bad",
          title: "Move refused",
          detail: "That group cannot take this player.",
        };
      }
      const name = before.players.find((p) => p.id === action.playerId)?.name ?? "Player";
      const g = groupOf(board.draw, action.playerId);
      return {
        tone: "ok",
        title: `${name} moved`,
        detail: g ? `${place(g)} · ${action.reason}` : action.reason,
      };
    }

    case "swapPlayers":
    case "swapSets": {
      if (after === before) {
        return {
          tone: "bad",
          title: "Swap refused",
          detail: "Those players cannot swap groups.",
        };
      }
      const moved = movedPlayers(was?.draw ?? [], board.draw ?? []);
      return {
        tone: "ok",
        title: action.type === "swapSets" ? "Sets swapped" : "Players swapped",
        detail: `${moved} player${moved === 1 ? "" : "s"} changed group · ${action.reason}`,
      };
    }

    case "moveSet": {
      if (after === before) {
        return {
          tone: "bad",
          title: "Move refused",
          detail: "That group cannot take these players.",
        };
      }
      const moved = movedPlayers(was?.draw ?? [], board.draw ?? []);
      return {
        tone: "ok",
        title: "Players moved",
        detail: `${moved} player${moved === 1 ? "" : "s"} changed group · ${action.reason}`,
      };
    }

    case "setGroupLocked": {
      if (after === before) return null;
      const g = board.draw?.find((x) => x.number === action.group);
      return {
        tone: "ok",
        title: `Group ${action.group} ${action.locked ? "locked" : "unlocked"}`,
        detail: g ? `${place(g)} · ${action.reason}` : action.reason,
      };
    }

    case "swapGroupSlots":
    case "moveGroupToHole":
    case "reorderHoleQueue": {
      // The reducer returns the same state when the slot edit is refused.
      if (after === before) {
        return {
          tone: "bad",
          title: "Change refused",
          detail: "That change could not be made.",
        };
      }
      const title =
        action.type === "swapGroupSlots"
          ? "Groups swapped"
          : action.type === "moveGroupToHole"
            ? "Group moved"
            : "Queue reordered";
      return { tone: "ok", title, detail: action.reason };
    }

    default:
      return null;
  }
}
