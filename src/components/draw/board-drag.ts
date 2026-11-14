import type { DropTarget } from "@/lib/draw/drop-intent";

/**
 * The small amount of glue a drag needs in the browser. Nothing here decides what a drop means;
 * `src/lib/draw/drop-intent.ts` owns that. This only finds the place under the pointer and compares
 * two places, so a touch drag and a mouse drag can share one highlight.
 */

/** How far a finger must move before it is a drag rather than a tap. */
export const TOUCH_DRAG_THRESHOLD = 8;

/** The place a drag is over, read from the board's own `data-drop-group` / `data-drop-player`. */
export function dropTargetAt(x: number, y: number): DropTarget | null {
  if (typeof document === "undefined") return null;
  const element = document.elementFromPoint(x, y);
  if (!element) return null;
  const player = element.closest("[data-drop-player]");
  const playerId = player?.getAttribute("data-drop-player");
  if (playerId) return { kind: "player", playerId };
  const group = element.closest("[data-drop-group]");
  const number = Number(group?.getAttribute("data-drop-group"));
  if (Number.isFinite(number) && number > 0) return { kind: "group", group: number };
  return null;
}

/** True when two places are the same, so a pointer that has not moved does not re-render the board. */
export function sameTarget(a: DropTarget | null, b: DropTarget | null): boolean {
  if (a === null || b === null) return a === b;
  if (a.kind === "group" && b.kind === "group") return a.group === b.group;
  if (a.kind === "player" && b.kind === "player") return a.playerId === b.playerId;
  return false;
}
