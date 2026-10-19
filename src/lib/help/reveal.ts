/**
 * Navigating to a control a help step points at, then ringing it.
 *
 * A step can be about a control on another screen. The panel closes, remembers which anchor to
 * ring, and pushes the route. The page that arrives asks for that request by its own path, and
 * only then starts looking for the control: the order is navigate first, ring later.
 *
 * Timing is the whole point. A new page renders before its data and fonts have settled, so the
 * ring waits for the control to exist, then for its box to stay in the same place for a few
 * frames. Ringing the first frame the element appears is what put the ring where a control used
 * to be.
 */

import { findHelpTarget, highlightHelpTarget } from "./highlight";

/** How long to keep looking for a control after a route change. */
export const HELP_REVEAL_TIMEOUT_MS = 6000;

/** Frames the control's box must stay put before the ring is drawn. */
const HELP_SETTLE_FRAMES = 2;

/** A request older than this was abandoned (slow page, or the reader navigated away). */
export const HELP_PENDING_TTL_MS = 15000;

export interface PendingHelpTarget {
  id: number;
  anchor: string;
  route: string;
  requestedAt: number;
}

let nextRequestId = 1;
let pending: PendingHelpTarget | null = null;

/** Remembers the control to ring once the route with that control is on screen. */
export function requestHelpTarget(
  anchor: string,
  route: string,
  now: number = Date.now(),
): PendingHelpTarget {
  pending = { id: nextRequestId++, anchor, route, requestedAt: now };
  return pending;
}

/**
 * The request waiting for this path, if any. Not consumed: the component that reached the page
 * may be unmounted by the navigation that brought the reader here, so a replacement must be able
 * to find the same request. `claimHelpTarget` decides which one rings it.
 */
export function peekHelpTarget(path: string, now: number = Date.now()): PendingHelpTarget | null {
  if (!pending) return null;
  if (now - pending.requestedAt > HELP_PENDING_TTL_MS) {
    pending = null;
    return null;
  }
  return pending.route === path ? pending : null;
}

/** Takes the request exactly once, so two mounted shells cannot draw two rings. */
export function claimHelpTarget(request: PendingHelpTarget): boolean {
  if (pending?.id !== request.id) return false;
  pending = null;
  return true;
}

/** Drops a request without ringing anything. */
export function clearHelpTarget(): void {
  pending = null;
}

export interface RevealOptions {
  doc?: Document;
  timeoutMs?: number;
  /** Returns false when the control vanished between the lookup and the draw. */
  highlight?: (anchor: string, doc: Document) => boolean;
  onMissing?: () => void;
  now?: () => number;
  requestFrame?: (callback: () => void) => number;
  cancelFrame?: (handle: number) => void;
}

function sameBox(a: DOMRect | null, b: DOMRect): boolean {
  if (!a) return false;
  return (
    Math.abs(a.top - b.top) < 1 &&
    Math.abs(a.left - b.left) < 1 &&
    Math.abs(a.width - b.width) < 1 &&
    Math.abs(a.height - b.height) < 1
  );
}

/**
 * Waits for the control to exist, waits for its box to settle, then highlights it. Returns a
 * cancel function for the caller's effect cleanup.
 */
export function revealHelpTarget(anchor: string, options: RevealOptions = {}): () => void {
  const doc = options.doc ?? document;
  const now = options.now ?? (() => Date.now());
  const requestFrame =
    options.requestFrame ?? ((callback) => window.requestAnimationFrame(callback));
  const cancelFrame = options.cancelFrame ?? ((handle) => window.cancelAnimationFrame(handle));
  const highlight = options.highlight ?? ((name, root) => highlightHelpTarget(name, root));
  const timeoutMs = options.timeoutMs ?? HELP_REVEAL_TIMEOUT_MS;
  const started = now();

  let cancelled = false;
  let frame: number | null = null;
  let lastBox: DOMRect | null = null;
  let steadyFrames = 0;

  const stop = () => {
    cancelled = true;
    if (frame !== null) cancelFrame(frame);
    frame = null;
  };

  const tick = () => {
    frame = null;
    if (cancelled) return;

    if (now() - started > timeoutMs) {
      stop();
      options.onMissing?.();
      return;
    }

    const target = findHelpTarget(doc, anchor);
    if (!target) {
      lastBox = null;
      steadyFrames = 0;
      frame = requestFrame(tick);
      return;
    }

    const box = target.getBoundingClientRect();
    if (sameBox(lastBox, box)) {
      steadyFrames += 1;
    } else {
      lastBox = box;
      steadyFrames = 0;
    }

    if (steadyFrames >= HELP_SETTLE_FRAMES) {
      stop();
      if (!highlight(anchor, doc)) options.onMissing?.();
      return;
    }

    frame = requestFrame(tick);
  };

  frame = requestFrame(tick);
  return stop;
}
