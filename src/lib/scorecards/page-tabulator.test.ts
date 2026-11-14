import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The tabulation page is static HTML in `public`, so nothing else checks its shape. These tests pin
 * the parts the owner asked for on 15 Nov 2026: TeeLine's controls at a 44 px touch size, the find
 * and filter controls in the bar that stays on screen, the HDCP box labelled as what the card says,
 * and both ways to add a card. The browser checks walk the same page; this keeps a rewrite from
 * quietly dropping one of them when the browser suite is not run.
 */
const html = readFileSync(join(process.cwd(), "public/scorecard/index.html"), "utf8");

/** The pinned bar: from its opening tag to the end of the block, which is just above `<main>`. */
const toolbar = html.split('<div class="toolbar" id="toolbar"')[1]?.split("\n<main>")[0] ?? "";
const styles = html.split("<style>")[1]?.split("</style>")[0] ?? "";

describe("tabulation page shape", () => {
  it("found the pinned bar and the stylesheet", () => {
    expect(toolbar.length).toBeGreaterThan(200);
    expect(styles).toContain("position: sticky");
  });

  it("keeps search, day, session, batch and the counts in the bar that stays on screen", () => {
    for (const id of ["q", "dayFilter", "sessionFilter", "batch-select", "shown", "stat"]) {
      expect(toolbar, id).toContain(`id="${id}"`);
    }
    expect(toolbar).toContain('id="add-player"');
    // The bar is the pinned element, and the masthead above it scrolls away instead.
    expect(styles).toMatch(/\.toolbar \{[^}]*position: sticky/);
  });

  it("gives the controls a 44 px touch target", () => {
    expect(styles).toMatch(/button, \.btn \{[^}]*min-height: 44px/);
    expect(styles).toMatch(/#q, #panel-q, \.search \{[^}]*min-height: 44px/);
    expect(styles).toMatch(/\.field select \{[^}]*min-height: 44px/);
  });

  it("labels the card's HDCP box as what the card says, and never as the figure it scores with", () => {
    expect(html).toContain('<label>Card says <input type="text" data-f="hdcp"');
    expect(html).not.toContain("HDCP on card");
    // The card's own box carries the record of the paper, not the playing handicap.
    expect(html).toContain("The HDCP box is kept as <b>Card says</b> and is never used to score");
  });

  it("offers both ways to add a card: search the event, or mark a name not in the system", () => {
    expect(toolbar).toContain('id="add-player"');
    expect(html).toContain('placeholder="Search any player in this event"');
    expect(html).toContain("Player not in the system");
    expect(html).toContain("Not in the system: tell the admin");
  });

  it("shows the save state in the bar as words, not a colour alone", () => {
    expect(toolbar).toContain('id="saved"');
    expect(toolbar).toMatch(/id="saved"[^>]*role="status"/);
    expect(html).toContain('"Unsaved, saving shortly"');
    expect(html).toContain("Not saved: ");
  });
});
