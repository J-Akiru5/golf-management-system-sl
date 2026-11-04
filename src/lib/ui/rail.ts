/**
 * The shell rail: compact by default, or expanded with labels.
 *
 * The choice lives in localStorage and, like the theme, is applied to `<html>` by a script that runs
 * before the first paint. That matters: expanding the rail moves the whole page, and applying it
 * after paint would shift the content under the reader's eyes on every load.
 *
 * CSS reads `:root[data-rail="expanded"]` and sets `--rail-width` and `--rail-pad`; this module only
 * writes the attribute and knows the same two numbers, so a test can keep the two in step.
 */

export const RAIL_KEY = "teeline-rail";

export type RailChoice = "compact" | "expanded";

/** Runs before first paint (see the root layout) so a saved rail never flashes compact. */
export const RAIL_INIT_SCRIPT = `try{var r=localStorage.getItem("${RAIL_KEY}");if(r==="expanded")document.documentElement.dataset.rail="expanded"}catch(e){}`;

/** Anything but an explicit "expanded" is compact: a fresh browser gets the narrow rail. */
export function parseRail(value: string | null | undefined): RailChoice {
  return value === "expanded" ? "expanded" : "compact";
}

const RAIL_EVENT = "teeline:rail";

/**
 * The rail the stylesheet is showing right now. The `<html>` attribute is the truth, not storage:
 * the CSS reads the attribute, and a hydration pass can drop it while the saved choice survives.
 */
export function railSnapshot(): RailChoice {
  if (typeof document === "undefined") return "compact";
  return parseRail(document.documentElement.dataset.rail ?? null);
}

/** Keeps every rail control in step, including one in another tab. */
export function subscribeRail(listener: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(RAIL_EVENT, listener);
  window.addEventListener("storage", listener);
  return () => {
    window.removeEventListener(RAIL_EVENT, listener);
    window.removeEventListener("storage", listener);
  };
}

/**
 * The rail's width, and the left padding the page needs beside it, in pixels. The padding is the
 * rail's left offset (24), its width, and the gap before the content (28): see globals.css.
 */
export const RAIL_METRICS: Record<RailChoice, { width: number; pad: number }> = {
  compact: { width: 60, pad: 112 },
  expanded: { width: 212, pad: 264 },
};

/** Records the choice where the stylesheet and the next page load read it. */
export function applyRail(choice: RailChoice, doc: Document = document): void {
  if (choice === "expanded") doc.documentElement.dataset.rail = "expanded";
  else delete doc.documentElement.dataset.rail;
  try {
    if (choice === "expanded") window.localStorage.setItem(RAIL_KEY, "expanded");
    else window.localStorage.removeItem(RAIL_KEY);
  } catch {
    // Storage refused (a private window): the rail still moves for this visit.
  }
  if (typeof window !== "undefined") window.dispatchEvent(new Event(RAIL_EVENT));
}
