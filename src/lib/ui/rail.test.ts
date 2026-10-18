import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseRail, RAIL_INIT_SCRIPT, RAIL_KEY, RAIL_METRICS } from "./rail";

describe("the rail choice", () => {
  it("is compact unless it was explicitly expanded", () => {
    expect(parseRail("expanded")).toBe("expanded");
    expect(parseRail("compact")).toBe("compact");
    for (const junk of [null, undefined, "", "yes", "EXPANDED", "true"]) {
      expect(parseRail(junk), String(junk)).toBe("compact");
    }
  });

  it("is remembered under a namespaced key that the pre-paint script reads", () => {
    expect(RAIL_KEY).toBe("teeline-rail");
    expect(RAIL_INIT_SCRIPT).toContain(RAIL_KEY);
    expect(RAIL_INIT_SCRIPT).toContain("dataset.rail");
  });

  it("keeps the padding and the width in step with the stylesheet", () => {
    const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");
    const { compact, expanded } = RAIL_METRICS;

    // The rail sits at left 24px with a 28px gap to the content, in both states.
    expect(compact.pad).toBe(24 + compact.width + 28);
    expect(expanded.pad).toBe(24 + expanded.width + 28);

    expect(css).toContain(`--rail-width: ${compact.width}px;`);
    expect(css).toContain(`--rail-pad: ${compact.pad}px;`);
    expect(css).toContain('[data-rail="expanded"]');
    expect(css).toContain(`--rail-width: ${expanded.width}px;`);
    expect(css).toContain(`--rail-pad: ${expanded.pad}px;`);
  });
});
