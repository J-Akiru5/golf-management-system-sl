import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The tabulation page is static HTML in `public`, so nothing else checks its shape. These tests pin
 * the parts the owner asked for: a branded header, today's work above the fold, one search bar that
 * stays on screen, add tools in one rail, review and send in the other zone, and one phone action
 * bar. They also keep the functional contracts: "Card says" is a note only, both ways to add a card
 * remain, the save state is words, and the tabulator still cannot approve or publish. The browser
 * checks walk the same page; this keeps a rewrite from quietly dropping one of them.
 */
const html = readFileSync(join(process.cwd(), "public/scorecard/index.html"), "utf8");

const styles = html.split("<style>")[1]?.split("</style>")[0] ?? "";
const toolbar = html.split('<div class="posbar" id="toolbar"')[1]?.split('<div id="msg"')[0] ?? "";
const today = html.split('<section class="today"')[1]?.split('<div id="savebanner"')[0] ?? "";
const rail = html.split('<aside class="rail" id="add-rail"')[1]?.split("</aside>")[0] ?? "";
const panelTemplate = html.split("panel.innerHTML = `")[1]?.split("`;")[0] ?? "";

describe("tabulation page shape", () => {
  it("found the search bar, today strip, rail and review panel", () => {
    expect(toolbar.length).toBeGreaterThan(200);
    expect(today.length).toBeGreaterThan(200);
    expect(rail.length).toBeGreaterThan(200);
    expect(panelTemplate.length).toBeGreaterThan(400);
    expect(styles).toContain("position: sticky");
  });

  it("names TeeLine, the event, the day and the signed-in account in the header", () => {
    expect(html).toContain('src="/brand/teeline-horizontal-reverse.svg"');
    for (const id of ["title", "eventname", "who"]) expect(html, id).toContain(`id="${id}"`);
    expect(html).toContain('action="/api/auth/signout"');
    expect(html).toContain("Tabulation · live sheet");
  });

  it("shows today's work as done, issues, missing and the save state", () => {
    for (const id of ["today-done", "today-issues", "today-missing", "saved", "sync"]) {
      expect(today, id).toContain(`id="${id}"`);
    }
    expect(html).toContain("no scores yet");
    expect(html).toContain('id="savebanner"');
    expect(html).toContain('id="retry-save"');
  });

  it("keeps the search, day, session, group and batch controls in the bar that stays on screen", () => {
    for (const id of [
      "q",
      "dayFilter",
      "sessionFilter",
      "groupFilter",
      "batch-select",
      "shown",
      "stat",
    ]) {
      expect(toolbar, id).toContain(`id="${id}"`);
    }
    expect(toolbar).toContain('id="tabCards"');
    expect(toolbar).toContain('id="tabSheet"');
    expect(styles).toMatch(/\.posbar \{[^}]*position: sticky/);
  });

  it("puts add, scan, import and print in the left rail, not above the cards", () => {
    for (const id of [
      "add-player",
      "panel-field",
      "scan-pick",
      "scan-camera-open",
      "imp",
      "add",
      "print",
      "pdf",
      "exp",
      "restore",
      "reset",
    ]) {
      expect(rail, id).toContain(`id="${id}"`);
    }
    expect(rail).not.toContain('id="undo" hidden aria');
    // Undo must be reachable once a reset or replace has happened, so it sits outside the closed
    // reset disclosure.
    expect(html).toMatch(/<\/details>\s*<button type="button" id="undo"/);
  });

  it("puts review and the one send action in the right zone, with the approval boundary stated", () => {
    expect(html).toContain('id="review-zone"');
    expect(panelTemplate).toContain('id="batch-send"');
    expect(panelTemplate).toContain('id="batch-summary"');
    expect(panelTemplate).toContain('id="send-state"');
    expect(panelTemplate).toContain(
      "The admin imports, approves and publishes. This page cannot approve or publish.",
    );
  });

  it("gives the phone one action bar, whose primary action changes with the state", () => {
    expect(html).toContain('class="actionbar"');
    for (const id of ["action-primary", "action-add", "action-review"])
      expect(html, id).toContain(`id="${id}"`);
    expect(html).toContain("actionPrimary.textContent = `Send ${waitingToSend} to admin`");
    expect(html).toContain('actionPrimary.textContent = "Retry save"');
  });

  it("gives every control a 44 px touch target and every input a 16 px text size", () => {
    expect(styles).toMatch(/button, \.btn \{[^}]*min-height: 44px/);
    expect(styles).toMatch(/#q \{[^}]*min-height: 44px/);
    expect(styles).toMatch(/td\.in input \{[^}]*min-height: 44px/);
    expect(styles).toMatch(/input, select \{[^}]*font-size: 16px/);
    expect(styles).toMatch(
      /#action-primary \{[^}]*48px|\.actionbar button \{[^}]*min-height: 48px/,
    );
  });

  it("keeps a wide score table inside its own scroller, so the page never overflows sideways", () => {
    expect(html).toContain('class="tablewrap"');
    expect(styles).toMatch(/\.tablewrap \{[^}]*overflow-x: auto/);
    expect(styles).toMatch(/\.board \{[^}]*grid-template-columns/);
  });

  it("labels the card's HDCP box as what the card says, and never as the figure it scores with", () => {
    expect(html).toContain('<label class="mini">Card says <input type="text" data-f="hdcp"');
    expect(html).not.toContain("HDCP on card");
    expect(html).toContain(
      "The <b>Card says</b> box is kept for the record and never used to score",
    );
    expect(html).toContain("the system's index converted on the tee written on the card");
  });

  it("offers both ways to add a card: search the event, or mark a name not in the system", () => {
    expect(html).toContain('id="add-player"');
    expect(html).toContain('placeholder="Search any player in this event"');
    expect(html).toContain("Player not in the system");
    expect(html).toContain("Not in the system: tell the admin");
  });

  it("shows the save state in words, not a colour alone", () => {
    expect(today).toContain('id="saved"');
    expect(today).toMatch(/id="saved"[^>]*role="status"/);
    expect(html).toContain('"Unsaved, saving shortly"');
    expect(html).toContain("Not saved: ");
    expect(html).toContain("Sent to admin");
  });

  it("respects reduced motion and keeps a visible focus ring", () => {
    expect(styles).toContain("prefers-reduced-motion: reduce");
    expect(styles).toMatch(/:focus-visible \{ outline: 3px solid var\(--focus\)/);
  });
});
