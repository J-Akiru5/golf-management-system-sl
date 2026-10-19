import { beforeEach, describe, expect, it } from "vitest";
import {
  claimHelpTarget,
  clearHelpTarget,
  HELP_PENDING_TTL_MS,
  peekHelpTarget,
  requestHelpTarget,
  revealHelpTarget,
} from "./reveal";

function frameQueue() {
  let next = 1;
  const queue = new Map<number, () => void>();
  return {
    requestFrame(callback: () => void) {
      const id = next++;
      queue.set(id, callback);
      return id;
    },
    cancelFrame(id: number) {
      queue.delete(id);
    },
    runFrame() {
      const first = queue.entries().next();
      if (first.done) return;
      const [id, callback] = first.value;
      queue.delete(id);
      callback();
    },
    waiting() {
      return queue.size;
    },
  };
}

function targetAt(top: number) {
  return {
    getClientRects: () => [{}],
    getBoundingClientRect: () =>
      ({
        top,
        left: 10,
        width: 120,
        height: 40,
        x: 10,
        y: top,
        right: 130,
        bottom: top + 40,
        toJSON: () => ({}),
      }) as DOMRect,
  };
}

function docWith(getTarget: () => ReturnType<typeof targetAt> | null): Document {
  return {
    querySelectorAll: () => {
      const target = getTarget();
      return target ? [target] : [];
    },
  } as unknown as Document;
}

describe("pending help targets", () => {
  beforeEach(() => clearHelpTarget());

  it("is only taken by the route it was requested for, and only once", () => {
    clearHelpTarget();
    const request = requestHelpTarget("draw-run", "/draw", 1000);
    expect(peekHelpTarget("/players", 1000)).toBeNull();
    expect(peekHelpTarget("/draw", 1000)).toBe(request);
    expect(claimHelpTarget(request)).toBe(true);
    expect(claimHelpTarget(request)).toBe(false);
    expect(peekHelpTarget("/draw", 1000)).toBeNull();
  });

  it("expires a request so a slow navigation cannot ring much later", () => {
    clearHelpTarget();
    requestHelpTarget("draw-run", "/draw", 1000);
    expect(peekHelpTarget("/draw", 1000 + HELP_PENDING_TTL_MS)).not.toBeNull();
    expect(peekHelpTarget("/draw", 1000 + HELP_PENDING_TTL_MS + 1)).toBeNull();
  });

  it("can be dropped without ringing anything", () => {
    clearHelpTarget();
    requestHelpTarget("draw-run", "/draw", 1000);
    clearHelpTarget();
    expect(peekHelpTarget("/draw", 1000)).toBeNull();
  });
});

describe("revealHelpTarget", () => {
  it("waits for the control to exist, then for its box to settle, then rings once", () => {
    let visible = false;
    let rings = 0;
    const frames = frameQueue();
    const doc = docWith(() => (visible ? targetAt(10) : null));
    revealHelpTarget("draw-run", {
      doc,
      requestFrame: frames.requestFrame,
      cancelFrame: frames.cancelFrame,
      now: () => 0,
      highlight: () => {
        rings += 1;
        return true;
      },
    });

    frames.runFrame();
    expect(rings).toBe(0);

    visible = true;
    frames.runFrame();
    frames.runFrame();
    expect(rings).toBe(0);
    frames.runFrame();
    expect(rings).toBe(1);
    expect(frames.waiting()).toBe(0);
  });

  it("waits again when a late panel moves the control", () => {
    let top = 10;
    let rings = 0;
    const frames = frameQueue();
    const doc = docWith(() => targetAt(top));
    revealHelpTarget("draw-run", {
      doc,
      requestFrame: frames.requestFrame,
      cancelFrame: frames.cancelFrame,
      now: () => 0,
      highlight: () => {
        rings += 1;
        return true;
      },
    });

    frames.runFrame(); // first box at 10
    top = 80; // a panel above it finishes loading
    frames.runFrame(); // new box, settle count resets
    frames.runFrame(); // same
    frames.runFrame(); // same again
    expect(rings).toBe(1);
  });

  it("says so when the control never appears", () => {
    let time = 0;
    let missing = 0;
    const frames = frameQueue();
    revealHelpTarget("draw-run", {
      doc: docWith(() => null),
      requestFrame: frames.requestFrame,
      cancelFrame: frames.cancelFrame,
      now: () => time,
      timeoutMs: 100,
      highlight: () => true,
      onMissing: () => {
        missing += 1;
      },
    });

    frames.runFrame();
    time = 150;
    frames.runFrame();
    expect(missing).toBe(1);
    expect(frames.waiting()).toBe(0);
  });

  it("stops when the caller unmounts", () => {
    let rings = 0;
    const frames = frameQueue();
    const stop = revealHelpTarget("draw-run", {
      doc: docWith(() => targetAt(10)),
      requestFrame: frames.requestFrame,
      cancelFrame: frames.cancelFrame,
      now: () => 0,
      highlight: () => {
        rings += 1;
        return true;
      },
    });

    stop();
    frames.runFrame();
    expect(rings).toBe(0);
    expect(frames.waiting()).toBe(0);
  });
});
