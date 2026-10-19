import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Windows checkouts (core.autocrlf) give CRLF line endings; the block search below expects LF.
const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8").replace(
  /\r\n/g,
  "\n",
);

/**
 * The public entry form renders several inputs without a `type` attribute. Tailwind's reset removes
 * their border and background, so unless the shared control rule matches untyped inputs they are
 * invisible boxes with only a label next to them (issue #63). This guards the rule.
 */
describe("form control styling", () => {
  it("styles inputs that leave type at the default", () => {
    const start = css.indexOf("input:not([type])");
    expect(start, "the shared input rule must include input:not([type])").toBeGreaterThan(-1);
    const open = css.indexOf("{", start);
    const selector = css.slice(start, open);
    expect(selector).toContain('input[type="text"]');
    expect(selector).toContain('input[type="tel"]');
    const body = css.slice(open, css.indexOf("}", open));
    expect(body).toContain("border: 1px solid var(--line-strong)");
    expect(body).toContain("background: var(--surface-raised)");
  });
});
