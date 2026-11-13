import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Windows checkouts (core.autocrlf) give CRLF line endings; the block search below expects LF.
const read = (path: URL) => readFileSync(path, "utf8").replace(/\r\n/g, "\n");
const css = read(new URL("../app/globals.css", import.meta.url));
const view = read(new URL("../components/PairingsView.tsx", import.meta.url));

/** The body of the first rule that starts with `selector {`. */
function block(selector: string): string {
  const start = css.indexOf(`\n${selector} {`);
  if (start < 0) throw new Error(`No rule for ${selector}`);
  const open = css.indexOf("{", start);
  return css.slice(open + 1, css.indexOf("}", open));
}

/** Reads a size from `font-size: 24px` or the `font: 700 24px / 30px` shorthand. */
function fontSize(body: string): number {
  const direct = /font-size:\s*(\d+(?:\.\d+)?)px/.exec(body)?.[1];
  const shorthand = direct ?? /font:\s*[^;]*?(\d+(?:\.\d+)?)px/.exec(body)?.[1];
  if (!shorthand) throw new Error(`No font size in: ${body}`);
  return Number(shorthand);
}

/** The print block that styles the pairings cards, not the rules page's own print block. */
function pairingsPrintBlock(): string {
  for (let i = css.indexOf("@media print"); i !== -1; i = css.indexOf("@media print", i + 1)) {
    const next = css.indexOf("@media print", i + 1);
    const chunk = css.slice(i, next < 0 ? undefined : next);
    if (chunk.includes(".p-card {")) return chunk;
  }
  throw new Error("No print block styles the pairings cards");
}

/**
 * Issue #244: a player looks for the starting hole first, so the hole leads the card and carries
 * the display type; the tee time follows as a smaller pill in both densities and in print.
 */
describe("pairing card hierarchy", () => {
  it("puts the starting hole before the tee time in the header", () => {
    const start = view.indexOf('<div className="p-card-top">');
    const header = view.slice(start, view.indexOf("</div>", start));
    const hole = header.indexOf('className="p-hole"');
    const time = header.indexOf('className="p-time"');
    expect(hole, "the header renders the hole").toBeGreaterThan(-1);
    expect(time, "the header renders the tee time").toBeGreaterThan(-1);
    expect(hole).toBeLessThan(time);
  });

  it("makes the hole larger than the time in comfortable view", () => {
    expect(fontSize(block(".p-hole"))).toBeGreaterThan(fontSize(block(".p-time")));
  });

  it("keeps the hole larger than the time in compact view", () => {
    expect(fontSize(block(".is-compact .p-hole"))).toBeGreaterThan(
      fontSize(block(".is-compact .p-time")),
    );
  });

  it("keeps both readable on the printed sheet", () => {
    const print = pairingsPrintBlock();
    expect(print).toContain(".p-hole {");
    expect(print).toContain(".p-time {");
    expect(print).toContain("color: #000");
  });
});
