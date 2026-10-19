/**
 * The "show me" ring: finds the control a help step is about and draws a ring over it.
 *
 * The ring is a **separate element**, positioned over the control, not a class on the control
 * itself. Two reasons, both found by running it: a class on a React-rendered element is a mutation
 * React may report as a mismatch (it caught the search box on the players page), and a ring drawn
 * from the outside leaves nothing behind on the element when it fades. It never takes a click
 * either, so the control stays usable while it is lit.
 *
 * The anchor is validated before it reaches a selector, so a bad guide cannot inject one.
 */

/** The class the ring element carries. Styled in globals.css, and checked by the browser script. */
export const HELP_RING_CLASS = "help-ring";

/** How long the ring stays. Long enough to find after the panel closes. */
export const HELP_RING_MS = 2600;

const ANCHOR_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

/** Elements worth moving the keyboard focus to. A ring around a div should not steal focus. */
const FOCUSABLE = "input, select, textarea, button, a[href], [tabindex]:not([tabindex='-1'])";

/**
 * A control is rendered when it has a box. The same anchor can appear twice for responsive
 * layouts and drawers (the rail and the mobile sheet, a table and its card list); the copy that
 * is hidden on this screen must not win the lookup.
 */
function isRendered(element: HTMLElement): boolean {
  // A fake root in a unit test has no layout engine, so treat it as rendered.
  return typeof element.getClientRects !== "function" || element.getClientRects().length > 0;
}

/** The element a step points at, or null when the screen has no such control. */
export function findHelpTarget(root: ParentNode, anchor: string): HTMLElement | null {
  if (!ANCHOR_PATTERN.test(anchor)) return null;
  const selector = `[data-help="${anchor}"]`;
  if (typeof root.querySelectorAll === "function") {
    const matches = Array.from(root.querySelectorAll<HTMLElement>(selector));
    return matches.find(isRendered) ?? null;
  }
  const single = root.querySelector<HTMLElement>(selector);
  return single && isRendered(single) ? single : null;
}

/** Draws the ring element over the control's box. Exported so a test can drive it with a fake. */
export function drawHelpRing(
  doc: Document,
  target: HTMLElement,
  ringMs: number,
  schedule: (fn: () => void, ms: number) => void,
): HTMLElement {
  const box = target.getBoundingClientRect();
  const ring = doc.createElement("div");
  ring.className = HELP_RING_CLASS;
  // Decorative: the step text already said what this is.
  ring.setAttribute("aria-hidden", "true");
  ring.style.top = `${Math.round(box.top)}px`;
  ring.style.left = `${Math.round(box.left)}px`;
  ring.style.width = `${Math.round(box.width)}px`;
  ring.style.height = `${Math.round(box.height)}px`;
  doc.body.appendChild(ring);
  schedule(() => ring.remove(), ringMs);
  return ring;
}

/**
 * Scrolls the control into view, focuses it when it takes focus, and rings it. Returns false when
 * the control is not on this screen, so the caller can say so instead of doing nothing.
 *
 * The scroll is instant on purpose: a smooth scroll would still be moving when the ring is placed,
 * and the ring would sit where the control used to be.
 */
export function highlightHelpTarget(
  anchor: string,
  doc: Document = document,
  ringMs: number = HELP_RING_MS,
): boolean {
  const target = findHelpTarget(doc, anchor);
  if (!target) return false;

  target.scrollIntoView({ block: "center", behavior: "auto" });
  if (target.matches(FOCUSABLE)) target.focus({ preventScroll: true });
  drawHelpRing(doc, target, ringMs, (fn, ms) => {
    window.setTimeout(fn, ms);
  });
  return true;
}
