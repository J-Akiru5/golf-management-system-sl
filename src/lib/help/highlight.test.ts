import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { drawHelpRing, findHelpTarget, HELP_RING_CLASS } from "./highlight";

/** The smallest thing that behaves like the DOM for this purpose. */
function fakeRoot(anchors: string[]): ParentNode {
  return {
    querySelector: (selector: string) => {
      const match = /^\[data-help="([a-z0-9-]+)"\]$/.exec(selector);
      return match?.[1] && anchors.includes(match[1]) ? { selector } : null;
    },
  } as unknown as ParentNode;
}

describe("findHelpTarget", () => {
  it("finds the control by its data-help attribute", () => {
    const root = fakeRoot(["players-search"]);
    expect(findHelpTarget(root, "players-search")).not.toBeNull();
    expect(findHelpTarget(root, "players-filters")).toBeNull();
  });

  it("refuses anything that is not an anchor, so a guide cannot inject a selector", () => {
    const root = fakeRoot(["players-search"]);
    for (const bad of [
      "",
      "Players",
      "players search",
      'players"][data-help="draw-run',
      "players-search]",
      "-starts-with-a-dash",
    ]) {
      expect(findHelpTarget(root, bad), bad).toBeNull();
    }
  });

  it("accepts the anchor shape the guides actually use", () => {
    const anchor = "my-pairings-2";
    expect(findHelpTarget(fakeRoot([anchor]), anchor)).not.toBeNull();
  });

  it("skips a hidden copy and finds the one rendered on this screen", () => {
    const hidden = { getClientRects: () => [] };
    const shown = { getClientRects: () => [{}] };
    const root = {
      querySelectorAll: () => [hidden, shown],
    } as unknown as ParentNode;
    expect(findHelpTarget(root, "players-open")).toBe(shown as unknown as HTMLElement);
  });

  it("returns null when every copy of the anchor is hidden", () => {
    const root = {
      querySelectorAll: () => [{ getClientRects: () => [] }],
    } as unknown as ParentNode;
    expect(findHelpTarget(root, "players-open")).toBeNull();
  });
});

describe("the ring", () => {
  /** Enough of a DOM element for drawHelpRing: it only sets style, an attribute, and removes itself. */
  class FakeRing {
    className = "";
    style: Record<string, string> = {};
    attrs: Record<string, string> = {};
    removed = false;
    setAttribute(name: string, value: string) {
      this.attrs[name] = value;
    }
    remove() {
      this.removed = true;
    }
  }

  const box = { top: 10, left: 20, width: 200, height: 40 };

  it("is sized to the control's box, lives outside React's tree, and takes itself away", () => {
    const ring = new FakeRing();
    const doc = {
      createElement: () => ring,
      body: { appendChild: () => undefined },
    } as unknown as Document;
    const target = { getBoundingClientRect: () => box } as unknown as HTMLElement;

    const calls: (() => void)[] = [];
    const returned = drawHelpRing(doc, target, 1500, (fn) => {
      calls.push(fn);
    });

    expect(returned).toBe(ring as unknown as HTMLElement);
    expect(ring.className).toBe(HELP_RING_CLASS);
    expect(ring.attrs["aria-hidden"]).toBe("true");
    expect(ring.style).toEqual({ top: "10px", left: "20px", width: "200px", height: "40px" });

    expect(calls).toHaveLength(1);
    calls[0]?.();
    expect(ring.removed).toBe(true);
  });

  it("is a class the stylesheet knows", () => {
    // Renaming the class without renaming the CSS is the failure this guards.
    const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");
    expect(css).toContain(`.${HELP_RING_CLASS} {`);
    expect(css).toContain("pointer-events: none");
  });
});
