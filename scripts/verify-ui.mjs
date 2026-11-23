/**
 * Browser checks for the desk's long lists and the alerts bell, the player languages, the help centre
 * and the shell.
 *
 * These cover what the unit suite cannot: that the right rows, and the right colours, actually reach
 * the screen. They found two real bugs that typecheck, lint and 382 passing unit tests all missed:
 *
 *   1. Clearing a search that returned to a filter you had already used landed you on the page you
 *      had last left that filter on, not page 1. The stored page number was masked, not reset.
 *   2. The bell's panel paints a page surface but sits inside the dark header chrome, which
 *      re-points `--ink` at the ivory-on-forest pair. In the light theme the panel's text therefore
 *      resolved to ivory on ivory: the heading was invisible and the body was barely legible.
 *
 * Usage:
 *   pnpm dev --port 3100     # in one terminal
 *   pnpm verify:ui           # in another
 *
 * Override the origin with UI_BASE. Screenshots land in `.tmp/ui-shots`. Exits non-zero if a check
 * fails, or if any page logs a console error along the way.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium, expect } from "@playwright/test";

const BASE = process.env.UI_BASE ?? "http://localhost:3100";
const SHOTS = ".tmp/ui-shots";
mkdirSync(SHOTS, { recursive: true });

let pass = 0;
let fail = 0;
const check = (name, ok, extra = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? `  ${extra}` : ""}`);
  if (ok) pass += 1;
  else fail += 1;
};
const section = (title) => console.log(`\n== ${title} ==`);

/** A 114-row NGAP export: 110 rows settle themselves, 4 name two players and cannot. */
function writeImportFixture(path) {
  const lines = ["Name,NGAP ID,Index,Date"];
  for (let i = 1; i <= 110; i += 1) {
    const name = `Test Golfer ${String(i).padStart(3, "0")}`;
    lines.push(`${name},${5000 + i},${(9 + (i % 25) + 0.3).toFixed(1)},11/01/2026`);
  }
  for (let i = 0; i < 4; i += 1) lines.push('"DELA CRUZ, Juan",7009,18.2,11/01/2026');
  writeFileSync(path, `${lines.join("\r\n")}\r\n`);
}

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 950 } });
// The desk's first-run welcome is by design: it sits over the screen until it is dismissed. This
// browser has already seen it, so the checks below are not fighting a modal. The welcome itself is
// checked in its own context near the end, which starts fresh.
await context.addInitScript(() => {
  try {
    window.localStorage.setItem(
      "teeline-help-seen",
      JSON.stringify(["welcome.desk", "welcome.player"]),
    );
  } catch {
    // Storage off: the welcome will show, and the checks that need a modal-free page say so.
  }
});
const page = await context.newPage();

const errors = [];
/**
 * The two navigations below deliberately ask for an event that does not exist, and the browser logs
 * the 404 as a console error. It is the expected answer, not a page fault, so it is not counted; the
 * checks still assert the 404 itself.
 */
const EXPECTED_404 = ["/events/00000000-0000-4000-8000-000000000000", "/events/not-a-uuid"];
/**
 * React 19 logs this advisory when it reconciles the two inline boot scripts in the root layout
 * (`THEME_INIT_SCRIPT` and `RAIL_INIT_SCRIPT`) during a client render. They are deliberate and run
 * before paint; the advisory is not a page fault. Tracked as a follow-up to move them to
 * `next/script` so the warning stops at the source.
 */
const IGNORED_CONSOLE = [/Encountered a script tag while rendering React component/];
const watch = (p) => {
  p.on("console", (m) => {
    if (m.type() !== "error") return;
    const source = m.location()?.url ?? "";
    if (EXPECTED_404.some((path) => source.endsWith(path))) return;
    if (IGNORED_CONSOLE.some((pattern) => pattern.test(m.text()))) return;
    errors.push(`${source || "(no location)"} :: ${m.text()}`);
  });
  p.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
};
watch(page);

const pager = page.locator('nav[aria-label="Paging"]');
const range = page.locator('nav[aria-label="Paging"] [role=status]').first();
const pagerBtn = (name) => pager.getByRole("button", { name, exact: true });
const bell = page.locator('button[aria-label^="Alerts"]');
const panel = page.getByRole("dialog", { name: "Alerts" });
const go = async (path) => {
  await page.goto(`${BASE}${path}`, { waitUntil: "networkidle", timeout: 120000 });
};

// The demo scoring repository is in memory. Move between the three scoring tabs with a client
// navigation so the cards entered in this browser survive the route change.
const scoresTab = async (name, readySelector) => {
  await page
    .locator('nav[aria-label="Scoring sections"]')
    .getByRole("link", { name, exact: true })
    .click();
  await expect(page.locator(readySelector)).toBeVisible({ timeout: 30000 });
};

// --------------------------------------------------------------- long lists
section("/players paging");
await go("/players");
await expect(range).toHaveText("1–50 of 91", { timeout: 30000 });
const playerRows = page.locator("table tbody tr");
check("page 1 holds 50 of 91", (await playerRows.count()) === 50, `(${await playerRows.count()})`);
check("Previous is disabled on page 1", await pagerBtn("Previous").isDisabled());

await pagerBtn("Next").click();
await expect(range).toHaveText("51–91 of 91", { timeout: 15000 });
check("the last page holds the remainder", (await playerRows.count()) === 41, `(${await playerRows.count()})`);
check("Next is disabled on the last page", await pagerBtn("Next").isDisabled());

// Reset rule, including the case the browser check found: coming back to a filter already used.
const search = page.locator('input[aria-label="Search players"]');
await search.fill("a");
await expect(range).toHaveText("1–50 of 84", { timeout: 15000 });
check("a search typed on page 2 resets to page 1", true, "(1–50 of 84)");

await search.fill("Alcantara");
await expect(pager).toHaveCount(0, { timeout: 15000 });
check("a search that fits one page hides the pager", true, `(${await playerRows.count()} rows)`);

await search.fill("");
await expect(range).toHaveText("1–50 of 91", { timeout: 15000 });
check("clearing the search returns to page 1, not the page you left", true);

// A pager must never reach paper.
await page.emulateMedia({ media: "print" });
check("the pager is hidden in print media", !(await pager.isVisible()));
await page.emulateMedia({ media: "screen" });

section("/register paging");
await go("/register");
await expect(range).toHaveText("1–50 of 90", { timeout: 30000 });
// One card per team; the selector follows the current RegistrationTeam markup.
const regRows = page.locator("article");
check("page 1 holds 50 of 90", (await regRows.count()) === 50, `(${await regRows.count()})`);
// networkidle does not mean hydrated, and a click that lands too early is swallowed rather than
// queued. The register page is the heaviest list in the shell, so it is the one that shows it:
// click, and if the page number has not moved, wait and click again. On page 2 Next is disabled,
// so a retry can never overshoot to a page that does not exist.
for (let attempt = 0; attempt < 3; attempt += 1) {
  if (!(await pagerBtn("Next").isDisabled())) await pagerBtn("Next").click();
  await page.waitForTimeout(700);
  if ((await range.textContent())?.includes("51–90")) break;
}
await expect(range).toHaveText("51–90 of 90", { timeout: 15000 });
check("the last page holds the remainder", (await regRows.count()) === 40, `(${await regRows.count()})`);

// ------------------------------------------------------------ import review
section("/import review tabs");
const fixture = ".tmp/ui-import.csv";
writeImportFixture(fixture);
await go("/import");
await page.locator('input[type="file"]').setInputFiles(fixture);
const tabs = page.locator('div.seg[aria-label="Review tabs"] button');
await expect(tabs).toHaveCount(3, { timeout: 30000 });
const counts = (await tabs.allTextContents()).map((t) => Number.parseInt((t.match(/\((\d+)\)/) ?? [])[1], 10));
check("three tabs with counts", counts.length === 3, `(${JSON.stringify(counts)})`);
check("the four ambiguous rows need a decision", counts[0] === 4, `(${counts[0]})`);
check("the 110 settled rows are already decided", counts[1] === 110, `(${counts[1]})`);

const progress = page.locator('span[role="status"]', { hasText: /decided/ }).first();
check("progress counts the whole file", (await progress.textContent()).trim() === "110 of 114 decided");
const bar = page.locator('[role="progressbar"][aria-label="Rows decided"]');
check("the bar agrees with the text", (await bar.getAttribute("aria-valuenow")) === "110");

await tabs.nth(1).click();
await expect(range).toHaveText("1–50 of 110", { timeout: 15000 });
check("each tab pages at 50", true, "(1–50 of 110)");
await pagerBtn("Next").click();
await expect(range).toHaveText("51–100 of 110", { timeout: 15000 });
await tabs.nth(0).click();
await expect(pager).toHaveCount(0, { timeout: 15000 });
await tabs.nth(1).click();
await expect(range).toHaveText("1–50 of 110", { timeout: 15000 });
check("switching tab restarts at page 1", true);

// --------------------------------------------------------------- tee times
section("/tee-times");
await go("/tee-times");
await expect(page.getByRole("heading", { name: "Tee times", exact: true }).first()).toBeVisible({
  timeout: 30000,
});
const teeDayTabs = page.locator('div.seg[aria-label="Playing day"] button');
check("one tab per playing day", (await teeDayTabs.count()) === 4, `(${await teeDayTabs.count()})`);
const teeRows = page.locator("tbody tr");
check("the first day has players", (await teeRows.count()) > 0, `(${await teeRows.count()})`);
check(
  "a row has a tee-time input",
  (await page.locator('input[type="time"]').count()) > 0,
);

// --------------------------------------------------------------- scores player links
// Issue #170: a player's name on /scores opens their profile. The demo round always has four
// players, so the pickers and the handicap summary can be checked first; then two cards are
// entered and approved (in the demo only) so the Cards table, both boards and the conflict list
// gain rows to check.
section("/scores player links");
await go("/scores");
const scoresEntry = page.locator('section[aria-labelledby="score-entry"]');
const scoresCards = page.locator('section[aria-labelledby="score-cards"]');
const scoresConflicts = page.locator('section[aria-labelledby="score-conflicts"]');
const entryProfileLinks = scoresEntry.locator('a[href^="/players/"]');
await expect(entryProfileLinks.first()).toBeVisible({ timeout: 30000 });
const entryHrefs = await entryProfileLinks.evaluateAll((links) =>
  links.map((link) => link.getAttribute("href")),
);
check(
  "Enter a card: the selected player and marker are linked",
  entryHrefs.length >= 2,
  `(${entryHrefs.length})`,
);
check(
  "Enter a card: each name link points at /players/<id>",
  entryHrefs.every((href) => /^\/players\/[^/]+$/.test(href ?? "")),
  entryHrefs.join(", "),
);
check(
  "Enter a card: the handicap summary name is a link",
  (await scoresEntry.locator("section.handicap-summary a[href^='/players/']").count()) === 1,
);
check(
  "Scan a card: the selected player is linked",
  (await page.locator('section[aria-labelledby="score-scan"] a[href^="/players/"]').count()) === 1,
);

// Two cards for the same player, different markers, one hole apart: the desk flow that fills the
// Cards table, both boards and the conflict list. Nothing here is new behaviour. A manual card now
// starts empty, so the form is filled with par first; the score that matters is hole 1.
await scoresEntry.getByRole("button", { name: "Fill with par" }).click();
await scoresEntry.locator("#hole-1").fill("5");
await scoresEntry.getByRole("button", { name: "Submit card" }).click();
await scoresEntry.getByRole("combobox").nth(1).click();
await page.getByRole("option", { name: /SAMPLE PLAYER C/ }).click();
await scoresEntry.locator("#hole-1").fill("4");
await scoresEntry.getByRole("button", { name: "Submit card" }).click();
await scoresTab("Review", 'section[aria-labelledby="score-cards"]');
await expect(scoresCards.locator("tbody tr")).toHaveCount(2, { timeout: 20000 });
for (let approved = 1; approved <= 2; approved += 1) {
  await scoresCards.getByRole("button", { name: "Approve" }).first().click();
  await expect(scoresCards.locator("tbody tr .pill.ok")).toHaveCount(approved, { timeout: 20000 });
}
const reviewLinkSites = [
  [
    "Cards table: player name",
    scoresCards.locator('tbody tr td:nth-child(1) a[href^="/players/"]'),
  ],
  [
    "Cards table: marked-by name",
    scoresCards.locator('tbody tr td:nth-child(2) a[href^="/players/"]'),
  ],
  ["Conflicts: player name", scoresConflicts.locator('a[href^="/players/"]')],
];
for (const [label, locator] of reviewLinkSites) {
  const count = await locator.count();
  const href = count > 0 ? await locator.first().getAttribute("href") : null;
  check(
    label,
    count > 0 && /^\/players\/[^/]+$/.test(href ?? ""),
    `(${count}) ${href ?? "no link"}`,
  );
}

await scoresTab("Results", 'section[aria-labelledby="score-gross"]');
const resultsLinkSites = [
  [
    "Gross Stableford: player name",
    page.locator(
      'section[aria-labelledby="score-gross"] tbody tr td:nth-child(2) a[href^="/players/"]',
    ),
  ],
  [
    "Net Stableford: player name",
    page.locator(
      'section[aria-labelledby="score-net"] tbody tr td:nth-child(2) a[href^="/players/"]',
    ),
  ],
];
for (const [label, locator] of resultsLinkSites) {
  const count = await locator.count();
  const href = count > 0 ? await locator.first().getAttribute("href") : null;
  check(
    label,
    count > 0 && /^\/players\/[^/]+$/.test(href ?? ""),
    `(${count}) ${href ?? "no link"}`,
  );
}

// The Review page hands the card back to the editor, and the editor writes a new revision.
await scoresTab("Review", 'section[aria-labelledby="score-cards"]');
await scoresCards.getByRole("button", { name: "Edit" }).first().click();
await expect(page.locator('section[aria-labelledby="score-entry"]')).toBeVisible({
  timeout: 30000,
});
await expect(page.getByText(/Correcting revision/)).toBeVisible({ timeout: 15000 });
check("Review Edit opens the card as a correction", true);
await page.getByLabel("Correction reason").fill("Corrected the second hole after checking the card.");
await page.locator("#hole-2").fill("6");
await page.getByRole("button", { name: "Submit correction" }).click();
await expect(page.getByText(/Card saved for/)).toBeVisible({ timeout: 20000 });
await scoresTab("Review", 'section[aria-labelledby="score-cards"]');
await expect(scoresCards.locator("tbody tr")).toHaveCount(3, { timeout: 20000 });
check(
  "a correction is saved as a new revision",
  (await scoresCards.locator("tbody tr").count()) === 3,
  `(${await scoresCards.locator("tbody tr").count()})`,
);

await scoresTab("Enter card", 'section[aria-labelledby="score-entry"]');
await scoresEntry.getByRole("combobox").nth(0).click();
await page.getByRole("option", { name: /SAMPLE PLAYER A/ }).click();
check(
  "the player picker loads the player's current card for correction",
  (await page.getByText(/Correcting revision/).count()) > 0,
);

// ---------------------------------------------------------- the same card twice
// The desk must never record one card twice. A triple click on Submit is one request, and pressing
// Submit again on a card that is already in is recognised in plain words, not as an error.
section("/scores duplicate submit");
await page.setViewportSize({ width: 1366, height: 768 });
await go("/scores");
const dupEntry = page.locator('section[aria-labelledby="score-entry"]');
const dupCards = page.locator('section[aria-labelledby="score-cards"]');
const deskWidth = await page.evaluate(() => {
  const root = document.scrollingElement ?? document.documentElement;
  return { scroll: root.scrollWidth, client: root.clientWidth };
});
check(
  "/scores does not scroll sideways at 1366 x 768",
  deskWidth.scroll <= deskWidth.client + 1,
  `(scrollWidth ${deskWidth.scroll}, client ${deskWidth.client})`,
);

// A new player with a complete card, submitted three times on the same tick.
await expect(dupEntry.getByRole("button", { name: "Fill with par" })).toBeVisible({
  timeout: 30000,
});
await dupEntry.getByRole("combobox").nth(0).click();
await page.getByRole("option", { name: /SAMPLE PLAYER B/ }).click();
await dupEntry.getByRole("button", { name: "Fill with par" }).click();
await dupEntry.getByRole("button", { name: /^Submit card$/ }).evaluate((element) => {
  element.click();
  element.click();
  element.click();
});
await page.waitForTimeout(600);

// The same card again, with the form untouched: recognised, not written, not an error.
await dupEntry.getByRole("button", { name: /^Submit card$/ }).click();
await expect(dupEntry.getByText(/already in for/i)).toBeVisible({ timeout: 15000 });
await page.waitForTimeout(400);
check(
  "the repeat is a plain notice, not an error",
  (await dupEntry.locator(".notice.bad").count()) === 0,
);
await page.screenshot({ path: `${SHOTS}/scores-duplicate-submit.png` });

await scoresTab("Review", 'section[aria-labelledby="score-cards"]');
await expect(dupCards.locator("tbody tr")).toHaveCount(1, { timeout: 20000 });
check(
  "a triple click on Submit writes one card, not three",
  (await dupCards.locator("tbody tr").count()) === 1,
  `(${await dupCards.locator("tbody tr").count()})`,
);
check(
  "submitting the identical card again adds no second revision",
  (await dupCards.locator("tbody tr").count()) === 1,
  `(${await dupCards.locator("tbody tr").count()})`,
);

// ------------------------------------------------------------- scan review (desk)
// The demo reader returns a whole card with weak cells and one cell it could not read. The desk must
// see the photo and all 18 cells, change any cell, and only then submit.
section("/scores scan review");
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);
async function uploadCard(sectionLocator) {
  await sectionLocator
    .locator('input[type="file"]')
    .setInputFiles({ name: "card.png", mimeType: "image/png", buffer: PNG });
  await sectionLocator.getByRole("button", { name: "Upload and read" }).click();
  await expect(sectionLocator.getByRole("button", { name: "Use with card" })).toBeVisible({
    timeout: 30000,
  });
}

await go("/scores");
const deskScan = page.locator('section[aria-labelledby="score-scan"]');
await uploadCard(deskScan);
// Row 4 of the demo card is the row with a cell the reader could not read.
await deskScan.locator("select").nth(1).selectOption("3");
await deskScan.getByRole("button", { name: "Use with card" }).click();
check(
  "the desk shows the scanned photo beside the cells",
  await dupEntry.locator('img[alt="The scanned scorecard"]').isVisible({ timeout: 15000 }),
);
check(
  "all 18 cells are editable on one screen",
  (await dupEntry.locator("input[id^='hole-']").count()) === 18,
  `(${await dupEntry.locator("input[id^='hole-']").count()})`,
);
check(
  "the reader's empty cell stays empty",
  (await dupEntry.locator("#hole-16").inputValue()) === "",
  `(hole 16 = ${JSON.stringify(await dupEntry.locator("#hole-16").inputValue())})`,
);
check(
  "Gross, net Stableford and OUT/IN are shown",
  /Gross/.test((await dupEntry.textContent()) ?? "") &&
    /Net Stableford/.test((await dupEntry.textContent()) ?? "") &&
    /OUT \/ IN/.test((await dupEntry.textContent()) ?? "") &&
    /Holes with a score/.test((await dupEntry.textContent()) ?? ""),
);
check(
  "Submit is disabled while a cell the reader left empty is still empty",
  await dupEntry.getByRole("button", { name: /^Submit card$/ }).isDisabled(),
);
await dupEntry.locator("#hole-1").fill("9");
check(
  "a cell the person replaced is marked changed",
  /changed/i.test((await dupEntry.locator("div:has(> input#hole-1)").textContent()) ?? ""),
);
// Enter moves to the next hole, so a whole card can be typed without the mouse.
await dupEntry.locator("#hole-1").focus();
await page.keyboard.press("Enter");
check(
  "Enter moves the desk to the next hole in order",
  await dupEntry.locator("#hole-2").evaluate((element) => element === document.activeElement),
);
await dupEntry.locator("#hole-16").fill("4");
check(
  "the acknowledgement tick is what unlocks Submit",
  await dupEntry.getByRole("button", { name: /^Submit card$/ }).isDisabled(),
);
await dupEntry.getByRole("checkbox").check();
check(
  "Submit unlocks once every cell has a score and the card is confirmed",
  await dupEntry.getByRole("button", { name: /^Submit card$/ }).isEnabled(),
);
await page.screenshot({ path: `${SHOTS}/scores-scan-review.png` });
await dupEntry.getByRole("button", { name: /^Submit card$/ }).click();
await scoresTab("Review", 'section[aria-labelledby="score-cards"]');
await expect(dupCards.locator("tbody tr")).toHaveCount(1, { timeout: 20000 });
check("the reviewed card is submitted once", (await dupCards.locator("tbody tr").count()) === 1);
await page.setViewportSize({ width: 1440, height: 950 });

// ----------------------------------------------- fast manual entry (issue #259)
// A card has to be found, typed and saved without the mouse. This walks the whole path on the demo
// round: a name search, the first match, 18 scores with Tab between them, Save and next, and the
// next card's first cell already focused. The demo has no day, session or class data, so those
// filters are checked for being there; the counts and the card-state filter carry the assertions.
section("/scores fast entry");
await go("/scores");
const queuePanel = page.locator('section[aria-labelledby="card-queue"]');
await expect(queuePanel).toBeVisible({ timeout: 30000 });
const queueRows = queuePanel.locator("button[data-card-row]");
await expect(queueRows).toHaveCount(4, { timeout: 15000 });
check(
  "the card queue lists the round's players",
  (await queueRows.count()) === 4,
  `(${await queueRows.count()})`,
);

const queueTiles = queuePanel.locator(".tiles .tile b");
const tileNumber = async (index) =>
  Number.parseInt((await queueTiles.nth(index).textContent()) ?? "", 10);
check(
  "the queue counts entered, verified and still missing",
  (await tileNumber(0)) === 0 && (await tileNumber(1)) === 0 && (await tileNumber(2)) === 4,
  `(${await tileNumber(0)} entered, ${await tileNumber(1)} verified, ${await tileNumber(2)} missing)`,
);
const hasQueueFilter = async (name) =>
  (await queuePanel.getByRole("combobox", { name, exact: true }).count()) === 1;
check(
  "the day, session and class filters are offered",
  (await hasQueueFilter("Day")) &&
    (await hasQueueFilter("Session")) &&
    (await hasQueueFilter("Class")),
);

const queueSearch = queuePanel.getByLabel("Player search");
await queueSearch.fill("player c");
await expect(queueRows).toHaveCount(1, { timeout: 15000 });
check("the name search finds one card", (await queueRows.count()) === 1);
await queueSearch.press("Enter");
await expect(dupEntry.getByRole("combobox").first()).toHaveValue("SAMPLE PLAYER C", {
  timeout: 15000,
});
check("Enter in the search selects that player", true, "(SAMPLE PLAYER C)");
await expect(dupEntry.locator("#hole-1")).toBeFocused({ timeout: 15000 });
check("the keyboard lands on the first hole", true);

// The whole card from the keyboard: 18 fours, Tab between them, then Save and next.
await page.keyboard.type("4");
for (let hole = 2; hole <= 18; hole += 1) {
  await page.keyboard.press("Tab");
  await page.keyboard.type("4");
}
await expect(dupEntry.locator("#hole-18")).toBeFocused({ timeout: 15000 });
await expect(dupEntry.locator("#score-submit-next")).toBeEnabled({ timeout: 15000 });
await page.keyboard.press("Tab");
await expect(dupEntry.locator("#score-submit-next")).toBeFocused({ timeout: 15000 });
check("Tab on the last hole hands the desk to Save and next", true);
await page.keyboard.press("Enter");
await expect(page.getByText(/Card saved for/)).toBeVisible({ timeout: 20000 });
check("the card is saved from the keyboard", true);
await expect(dupEntry.getByRole("combobox").first()).toHaveValue("SAMPLE PLAYER D", {
  timeout: 20000,
});
await expect(dupEntry.locator("#hole-1")).toBeFocused({ timeout: 15000 });
check("Save and next opens the next card on the first hole", true);
check(
  "the saved card is counted and the list moves on",
  (await tileNumber(0)) === 1 && (await tileNumber(2)) === 3,
  `(${await tileNumber(0)} entered, ${await tileNumber(2)} missing)`,
);

await queueSearch.fill("");
await expect(queueRows).toHaveCount(4, { timeout: 15000 });
const stateFilter = queuePanel.getByLabel("Card state");
await stateFilter.selectOption("none");
await expect(queueRows).toHaveCount(3, { timeout: 15000 });
check("the card-state filter keeps the cards still to type", (await queueRows.count()) === 3);
await stateFilter.selectOption("entered");
await expect(queueRows).toHaveCount(1, { timeout: 15000 });
check("the card-state filter finds the entered card", (await queueRows.count()) === 1);
await stateFilter.selectOption("all");
await expect(queueRows).toHaveCount(4, { timeout: 15000 });

await scoresTab("Review", 'section[aria-labelledby="score-cards"]');
const fastCards = page.locator('section[aria-labelledby="score-cards"]');
await expect(fastCards.locator("tbody tr")).toHaveCount(1, { timeout: 20000 });
const publishMode = fastCards.getByLabel("Publishing");
await expect(publishMode).toHaveValue("every", { timeout: 15000 });
const publishModeLabels = (await publishMode.locator("option").allTextContents()).map((label) =>
  label.trim(),
);
check(
  "a saved card is set to publish automatically",
  publishModeLabels.join(" | ") ===
    "Publish every saved card | Publish checked cards only | Manual",
  `(${publishModeLabels.join(" | ")})`,
);
await fastCards.getByRole("button", { name: "Approve" }).first().click();
await expect(fastCards.locator("tbody tr .pill.ok")).toHaveCount(1, { timeout: 20000 });
// The default mode publishes the approved card after its short pause, in one batch.
await expect(fastCards.getByText(/Last publish v\d+/)).toBeVisible({ timeout: 20000 });
check("an approved card is published without a second click", true);
await scoresTab("Enter card", 'section[aria-labelledby="card-queue"]');
await expect(queueTiles.nth(1)).toHaveText("1", { timeout: 20000 });
check("an approved card counts as verified in the queue", true);

await page.setViewportSize({ width: 1024, height: 768 });
await expect(queuePanel).toBeVisible({ timeout: 15000 });
const entryCell = await dupEntry.locator("#hole-1").boundingBox();
check(
  "a score cell is a 44px target on a tablet",
  (entryCell?.height ?? 0) >= 44,
  `(${entryCell?.height}px)`,
);
await page.setViewportSize({ width: 1440, height: 950 });

section("/scores handicap correction");
await queuePanel.getByRole("button", { name: /SAMPLE PLAYER A/ }).first().click();
await expect(dupEntry.getByRole("combobox").first()).toHaveValue("SAMPLE PLAYER A", {
  timeout: 15000,
});
const correctHandicapButton = page.getByRole("button", { name: "Correct handicap" }).first();
await expect(correctHandicapButton).toBeVisible({ timeout: 15000 });
await correctHandicapButton.click();
const correctDialog = page.getByRole("dialog");
await expect(correctDialog).toBeVisible({ timeout: 15000 });
await correctDialog.getByLabel("Corrected handicap index").fill("10.1");
await correctDialog.getByLabel("Corrected index effective date").fill("2026-11-01");
await correctDialog.getByLabel("Reason for the correction").fill("Browser check correction");
await correctDialog.getByRole("button", { name: "Correct handicap" }).click();
await expect(
  page.getByText(/Handicap corrected and the player's result recalculated/),
).toBeVisible({ timeout: 20000 });
const correctedSummary = page.locator('section[aria-label="Handicap for SAMPLE PLAYER A"]');
await expect(correctedSummary.getByText("10", { exact: true }).first()).toBeVisible({
  timeout: 15000,
});
check("the played round's handicap snapshot can be corrected with a reason", true);

// ------------------------------------------------------------- staff sheet, 360px
// The volunteer's phone: no sideways scroll, 44px targets, numeric entry, and the same scan review
// with the photo, every cell and the OUT/IN/TOTAL the desk reads.
section("staff score sheet on a 360px phone");
const staffContext = await browser.newContext({ viewport: { width: 360, height: 800 } });
await staffContext.addInitScript(() => {
  try {
    window.localStorage.setItem(
      "teeline-help-seen",
      JSON.stringify(["welcome.desk", "welcome.player"]),
    );
    const seen = { seen: true, step: 0, updatedAt: new Date().toISOString() };
    window.localStorage.setItem(
      "teeline-onboarding-v1",
      JSON.stringify({ player: seen, staff: seen }),
    );
  } catch {
    // Storage off: the welcome may cover the sheet, and the checks below will say so.
  }
});
const staffPage = await staffContext.newPage();
watch(staffPage);
await staffPage.goto(`${BASE}/staff/score`, { waitUntil: "networkidle", timeout: 120000 });
const staffNoSideways = async (name) => {
  const width = await staffPage.evaluate(() => {
    const root = document.scrollingElement ?? document.documentElement;
    return { scroll: root.scrollWidth, client: root.clientWidth };
  });
  check(
    `${name} does not scroll sideways at 360px`,
    width.scroll <= width.client + 1,
    `(scrollWidth ${width.scroll}, client ${width.client})`,
  );
};
const staffTargets = async (locator, name) => {
  const heights = await locator.evaluateAll((nodes) =>
    nodes.map((node) => Math.round(node.getBoundingClientRect().height)),
  );
  check(
    name,
    heights.length > 0 && heights.every((height) => height >= 44),
    `(${heights.join(", ")}px)`,
  );
};
await expect(staffPage.getByRole("heading", { name: "Score", exact: true })).toBeVisible({
  timeout: 30000,
});
await staffNoSideways("the staff score picker");
check(
  "a day with no draw says so, in plain words",
  await staffPage
    .getByText("No groups are drawn for this day yet", { exact: true })
    .isVisible({ timeout: 15000 }),
);
await staffTargets(
  staffPage.locator('main button[aria-pressed]'),
  "the playing day chips are 44px tap targets",
);
await staffTargets(
  staffPage.locator('nav[aria-label="Staff app"] a[data-testid^="staff-bar-"]'),
  "the staff bar items are 44px tap targets",
);
await staffPage.screenshot({ path: `${SHOTS}/staff-score-360.png`, fullPage: true });
await staffContext.close();

// --------------------------------------------------------------- control room cards
// Issue #96: the hole card forced a dark background but kept the light theme's text tokens, so the
// heading and "Open slot" rows were dark-on-dark. The card must follow the theme like every other
// card, and every text sample inside it must clear 4.5:1 against the card surface.
section("control room hole card contrast");
const themeContext = await browser.newContext({ viewport: { width: 1440, height: 950 } });
await themeContext.addInitScript(() => {
  try {
    window.localStorage.setItem(
      "teeline-help-seen",
      JSON.stringify(["welcome.desk", "welcome.player"]),
    );
  } catch {
    // Storage off: the welcome may cover the card, and the check will say so.
  }
});
const themePage = await themeContext.newPage();
watch(themePage);
const rgb = (value) => (value.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
const luminance = ([r, g, b]) => {
  const channel = (v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
};
const contrast = (a, b) => {
  const [hi, lo] = [luminance(rgb(a)), luminance(rgb(b))].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
for (const theme of ["light", "dark"]) {
  await themePage.addInitScript((choice) => {
    window.localStorage.setItem("starter-theme", choice);
  }, theme);
  await themePage.goto(`${BASE}/admin`, { waitUntil: "networkidle", timeout: 120000 });
  await themePage.evaluate((choice) => {
    document.documentElement.dataset.theme = choice;
  }, theme);
  const pin = themePage.locator('button[aria-label^="Hole"]').first();
  await pin.click();
  const cardText = themePage.locator(
    "[data-radix-popper-content-wrapper] h4, [data-radix-popper-content-wrapper] p, [data-radix-popper-content-wrapper] li",
  );
  await expect(cardText.first()).toBeVisible({ timeout: 15000 });
  const surface = await themePage
    .locator("[data-radix-popper-content-wrapper] h4")
    .first()
    .evaluate((node) => {
      const card = node.closest(".glass");
      return card ? getComputedStyle(card).backgroundColor : "";
    });
  let worst = Infinity;
  for (const text of await cardText.allTextContents()) {
    if (!text.trim()) continue;
    const el = cardText.filter({ hasText: text }).first();
    const color = await el.evaluate((node) => getComputedStyle(node).color);
    worst = Math.min(worst, contrast(color, surface));
  }
  check(`${theme} hole card text clears 4.5:1`, worst >= 4.5, `(${worst.toFixed(2)}:1)`);
  await themePage.keyboard.press("Escape");
}
await themeContext.close();

// --------------------------------------------------------------- alerts bell
section("alerts bell");
await go("/players");
check("the shell has a bell", (await bell.count()) === 1);
check("it starts all clear with no draw", (await bell.getAttribute("aria-label")) === "Alerts, all clear");

await bell.click();
await expect(panel).toBeVisible({ timeout: 15000 });
check("the panel opens", true);
check(
  "the all-clear copy is exact",
  (await panel.getByText("All clear. Nothing is stopping you from publishing.").count()) === 1,
);

// The bug the browser check found: ivory text on an ivory panel in the light theme.
const ink = async () =>
  panel.locator("b").first().evaluate((el) => getComputedStyle(el).color);
const surface = await panel.evaluate((el) => getComputedStyle(el).backgroundColor);
check("the panel is readable, not ivory on ivory", (await ink()) === "rgb(32, 37, 34)", `(${surface} / ${await ink()})`);

await page.keyboard.press("Escape");
await expect(panel).toHaveCount(0, { timeout: 15000 });
check(
  "Escape closes and hands focus back to the bell",
  await bell.evaluate((el) => el === document.activeElement),
);

await bell.click();
await expect(panel).toBeVisible({ timeout: 15000 });
const focusables = panel.locator('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])');
const n = await focusables.count();
await focusables.nth(n - 1).focus();
await page.keyboard.press("Tab");
check("Tab wraps from the last control to the first", await focusables.first().evaluate((el) => el === document.activeElement));
await page.keyboard.press("Shift+Tab");
check("Shift+Tab wraps back", await focusables.nth(n - 1).evaluate((el) => el === document.activeElement));
await page.screenshot({ path: `${SHOTS}/bell-all-clear-light.png` });

await page.evaluate(() => {
  document.documentElement.dataset.theme = "dark";
});
await page.waitForTimeout(400);
check(
  "dark theme repaints the panel",
  (await panel.evaluate((el) => getComputedStyle(el).backgroundColor)) === "rgb(23, 28, 25)",
);
check("dark theme keeps its own ink", (await ink()) === "rgb(238, 241, 236)", `(${await ink()})`);
await page.screenshot({ path: `${SHOTS}/bell-all-clear-dark.png` });
await page.evaluate(() => {
  document.documentElement.dataset.theme = "light";
});
await panel.getByRole("button", { name: "Close alerts" }).click();
await expect(panel).toHaveCount(0, { timeout: 15000 });

section("alerts bell with a real warning");
await go("/draw");
await page.getByRole("button", { name: "Make the draw" }).click();
await page.waitForTimeout(2500);
const label = await bell.getAttribute("aria-label");
const count = Number.parseInt((label?.match(/(\d+)/) ?? [])[1] ?? "0", 10);
check("the bell stops saying all clear", count > 0, `(${label})`);
check("the badge matches the count", (await bell.locator("span[aria-hidden=true]").textContent()).trim() === String(count));

await bell.click();
await expect(panel).toBeVisible({ timeout: 15000 });
const headings = (await panel.locator("h3").allTextContents()).map((t) => t.trim());
check(
  "the panel groups by the same words the Issues panel uses",
  headings.length > 0 && headings.every((h) => ["Blocking", "Warning", "Info"].includes(h)),
  `(${JSON.stringify(headings)})`,
);
const fixes = panel.getByRole("link", { name: /Fix/ });
check("every alert offers a Fix link", (await fixes.count()) === count, `(${await fixes.count()})`);
const hrefs = [];
for (let i = 0; i < (await fixes.count()); i += 1) hrefs.push(await fixes.nth(i).getAttribute("href"));
check(
  "Fix points at a screen that can solve it",
  hrefs.every((h) => /\/(draw|players|setup)/.test(h ?? "")),
  `(${JSON.stringify(hrefs)})`,
);
check("the panel is readable with alerts in it", (await ink()) === "rgb(32, 37, 34)");
await page.screenshot({ path: `${SHOTS}/bell-with-alerts-light.png` });

await fixes.first().click();
await page.waitForTimeout(1200);
check("following Fix closes the panel and navigates", (await panel.count()) === 0 && /\/(draw|players|setup)/.test(page.url()), `(${page.url()})`);
check(
  "following Fix returns focus to the bell rather than the page body",
  await bell.evaluate((el) => el === document.activeElement),
);

section("alerts bell: mark as read and close on navigation");
if (!/\/draw$/.test(new URL(page.url()).pathname)) {
  await page.getByRole("link", { name: "Draw & pairings", exact: true }).first().click();
  await expect(page).toHaveURL(/\/draw$/, { timeout: 15000 });
}
await page.getByRole("button", { name: "Lock", exact: true }).first().click();
await page.waitForTimeout(1200);
await bell.click();
await expect(panel).toBeVisible({ timeout: 15000 });
check(
  "an open panel locks the page behind it",
  (await page.evaluate(() => document.body.style.overflow)) === "hidden",
);
check(
  "a live info item offers Mark as read",
  (await panel.getByRole("button", { name: "Mark as read" }).count()) === 1,
);
check(
  "the panel header offers Mark all as read",
  (await panel.getByRole("button", { name: "Mark all as read" }).count()) === 1,
);
check(
  "live blocking and warning items say why they cannot be marked",
  (await panel.getByText("Stays until the problem is fixed.", { exact: true }).count()) > 0,
);
const readLabelBefore = await bell.getAttribute("aria-label");
await panel.getByRole("button", { name: "Mark as read" }).first().click();
const readSummary = panel.locator('details[data-testid="alerts-read"] summary');
await expect(readSummary).toBeVisible({ timeout: 10000 });
await readSummary.click();
await expect(panel.getByText("Read", { exact: true }).first()).toBeVisible({ timeout: 10000 });
check(
  "marking one as read moves it out of the unread list into Read",
  (await panel.locator('details[data-testid="alerts-read"]').getByText("Read", { exact: true }).count()) > 0,
);
const readLabelAfter = await bell.getAttribute("aria-label");
check(
  "the badge drops only the notice that was read",
  readLabelBefore !== readLabelAfter,
  `(${readLabelBefore} -> ${readLabelAfter})`,
);

await page.locator('a[href="/players"]').first().click();
await expect(panel).toHaveCount(0, { timeout: 15000 });
check("a rail navigation closes the panel", /\/players$/.test(page.url()), `(${page.url()})`);
check(
  "the scroll lock is released after navigation",
  (await page.evaluate(() => document.body.style.overflow)) !== "hidden",
);
const afterNav = await page.evaluate(() => ({
  tag: document.activeElement?.tagName ?? null,
  href: document.activeElement?.getAttribute("href") ?? null,
}));
check("focus stays on the destination link, not the page body", afterNav.tag !== "BODY", `(${JSON.stringify(afterNav)})`);

// -------------------------------------------------------------- player languages
section("player languages");
const langContext = await browser.newContext({ viewport: { width: 1200, height: 950 } });
// The player first-run welcome is a modal. This context has not seen it, so mark it seen before the
// page loads; otherwise the demo notice is in the page but hidden behind the overlay.
await langContext.addInitScript(() => {
  try {
    window.localStorage.setItem(
      "teeline-help-seen",
      JSON.stringify(["welcome.desk", "welcome.player"]),
    );
    const seen = { seen: true, step: 0, updatedAt: new Date().toISOString() };
    window.localStorage.setItem(
      "teeline-onboarding-v1",
      JSON.stringify({ player: seen, staff: seen }),
    );
  } catch {
    // Storage off: the welcome will show, and the visibility check will say so.
  }
});
const langPage = await langContext.newPage();
watch(langPage);
const setLang = async (value) => {
  await langContext.addCookies([{ name: "desk-lang", value, url: BASE }]);
  await langPage.goto(`${BASE}/pairings`, { waitUntil: "networkidle", timeout: 120000 });
};

await langPage.goto(`${BASE}/pairings`, { waitUntil: "networkidle", timeout: 120000 });
check(
  "the pairings page is English when nothing is chosen",
  (await langPage.getByText("Club tournament pairings").count()) > 0,
);

for (const path of ["/pairings", "/roster", "/leaderboard", "/rules"]) {
  await langPage.goto(`${BASE}${path}`, { waitUntil: "networkidle", timeout: 120000 });
  check(
    `${path} has a colour-theme control`,
    (await langPage.getByRole("button", { name: /Colour theme:/ }).count()) > 0,
  );
}

section("public pairings day and hole filters");
await langPage.goto(`${BASE}/pairings`, { waitUntil: "networkidle", timeout: 120000 });
const daySelect = langPage.getByTestId("pairings-day");
const holeSelect = langPage.getByTestId("pairings-hole");
await expect(daySelect).toBeVisible({ timeout: 15000 });
await expect(holeSelect).toBeVisible({ timeout: 15000 });
const dayValues = await daySelect
  .locator("option")
  .evaluateAll((options) => options.map((option) => option.value).filter(Boolean));
check("the day filter lists the playing days", dayValues.length >= 2, `(${JSON.stringify(dayValues)})`);
await daySelect.selectOption(dayValues[1]);
await expect(langPage.locator('[data-testid="pairings-session"]').first()).toContainText(/DAY 2/i, {
  timeout: 15000,
});
check("the day dropdown switches the board", true);
const holeValues = await holeSelect
  .locator("option")
  .evaluateAll((options) => options.map((option) => option.value).filter(Boolean));
check("the hole filter lists the day's holes", holeValues.length > 0, `(${JSON.stringify(holeValues)})`);
const chosenHole = holeValues[0];
await holeSelect.selectOption(chosenHole);
const pairingCards = langPage.locator('[data-testid="pairing-group"]');
const holeBadges = await pairingCards.locator(".p-hole").allTextContents();
const holePattern = new RegExp(`(Hole|Tee) ${chosenHole}$`);
check(
  "the hole dropdown limits every card to that hole",
  holeBadges.length > 0 && holeBadges.every((text) => holePattern.test(text.trim())),
  `(${chosenHole}: ${JSON.stringify(holeBadges)})`,
);
await holeSelect.selectOption("");
await expect(pairingCards.first()).toBeVisible({ timeout: 15000 });
check("all holes restores the full day", (await pairingCards.count()) >= holeBadges.length);

// Issue #244: the starting hole leads the card and owns the display type; the tee time is a
// secondary pill. Compact and print must keep the same hierarchy.
section("pairing card hierarchy: the starting hole leads");
const cardHeader = langPage
  .locator('[data-testid="pairing-group"] .p-card-top')
  .filter({ has: langPage.locator(".p-hole") })
  .first();
const cardSizes = async () =>
  cardHeader.evaluate((row) => {
    const hole = row.querySelector(".p-hole");
    const time = row.querySelector(".p-time");
    const size = (element) =>
      element ? Number.parseFloat(getComputedStyle(element).fontSize) : 0;
    return {
      holeFirst: row.firstElementChild === hole,
      holeSize: size(hole),
      timeSize: size(time),
    };
  });
const comfortableCard = await cardSizes();
check(
  "the starting hole is the card's first, largest element",
  comfortableCard.holeFirst && comfortableCard.holeSize > comfortableCard.timeSize,
  `(hole ${comfortableCard.holeSize}px, time ${comfortableCard.timeSize}px)`,
);
await langPage.locator(".p-density-btn").nth(1).click();
await expect(langPage.locator('[data-testid="pairings-view"]')).toHaveClass(/is-compact/, {
  timeout: 5000,
});
const compactCard = await cardSizes();
check(
  "compact mode keeps the hole ahead of the time",
  compactCard.holeFirst && compactCard.holeSize > compactCard.timeSize,
  `(hole ${compactCard.holeSize}px, time ${compactCard.timeSize}px)`,
);
await langPage.locator(".p-density-btn").nth(0).click();
await expect(langPage.locator('[data-testid="pairings-view"]')).not.toHaveClass(/is-compact/, {
  timeout: 5000,
});
await langPage.emulateMedia({ media: "print" });
const printedCard = await cardSizes();
check(
  "print keeps the hole as the larger element",
  printedCard.holeFirst && printedCard.holeSize > printedCard.timeSize,
  `(hole ${printedCard.holeSize}px, time ${printedCard.timeSize}px)`,
);
await langPage.emulateMedia({ media: "screen" });

await setLang("hil");
check(
  "Hiligaynon is served from the dictionary",
  (await langPage.getByText("Pairing sang tournament sang club").count()) > 0,
);
check("the page is marked lang=hil", (await langPage.locator('[lang="hil"]').count()) > 0);

await setLang("tl");
check(
  "Tagalog is served from the dictionary",
  (await langPage.getByText("Pairings ng tournament ng club").count()) > 0,
);

await langPage.goto(`${BASE}/my`, { waitUntil: "networkidle", timeout: 120000 });
const switcher = langPage.getByLabel("Wika", { exact: true });
check("the picker is labelled in the chosen language", (await switcher.count()) > 0);
await switcher.selectOption("en");
await langPage
  .getByText("Sample data. This build runs without accounts.", { exact: false })
  .first()
  .waitFor({ timeout: 20000 });
check(
  "choosing English switches the page back",
  (await langPage.locator('html[lang="en"]').count()) > 0,
);
await langPage.screenshot({ path: `${SHOTS}/player-languages.png` });
await langContext.close();

// --------------------------------------------------------------- shell: theme, rail, tooltips
section("shell: tooltips, theme and rail");
await go("/players");
// networkidle is not the same as hydrated: prove React is live before a menu opens, or the modal
// layer it adds can land mid-hydration and be reported as a mismatch.
const shellSearch = page.locator('input[aria-label="Search players"]');
await shellSearch.fill("Alcantara");
await expect(pager).toHaveCount(0, { timeout: 15000 });
await shellSearch.fill("");
await expect(range).toHaveText("1–50 of 91", { timeout: 15000 });
const rail = page.locator('nav[aria-label="Main"]');
const main = page.locator("#main");
const railWidth = async () => (await rail.boundingBox()).width;
const padLeft = async () => await main.evaluate((el) => getComputedStyle(el).paddingLeft);

// The compact rail has no room for words, so each icon explains itself on hover or focus.
const railPlayers = rail.locator('a[aria-label="Players"]');
await railPlayers.focus();
// Scoped by name, not `getByRole("tooltip")` on its own. Radix keeps a closed tooltip in the DOM,
// so a bare role lookup matches both the one just closed and the one now opening and fails on
// strict mode. That is a race, and it failed CI once before this line was tightened.
await expect(page.getByRole("tooltip", { name: /^Players/ })).toHaveText(
  /^Players( · needs attention)?$/,
  { timeout: 8000 },
);
check("focusing a rail icon names it, and says what the dot means", true);

const themeButton = rail.locator('button[aria-label^="Colour theme"]');
await themeButton.focus();
await expect(page.getByRole("tooltip", { name: /Colour theme/ }).first()).toContainText(
  "Colour theme",
  { timeout: 8000 },
);
check("the theme control names itself in the compact rail", true);

await themeButton.click();
const themeMenu = page.getByRole("menu");
await expect(themeMenu).toBeVisible({ timeout: 8000 });
const items = (await themeMenu.getByRole("menuitemradio").allTextContents()).map((t) => t.trim());
check(
  "the theme dropdown is System, Light and Dark",
  items.length === 3 &&
    items[0]?.includes("System") === true &&
    items[1]?.includes("Light") === true &&
    items[2]?.includes("Dark") === true,
  `(${JSON.stringify(items)})`,
);
await themeMenu.getByRole("menuitemradio", { name: /Dark/ }).click();
check(
  "picking Dark paints the dark theme and remembers it",
  (await page.evaluate(() => document.documentElement.dataset.theme)) === "dark" &&
    (await page.evaluate(() => localStorage.getItem("starter-theme"))) === "dark",
);
await page.screenshot({ path: `${SHOTS}/shell-theme-dark.png` });
await page.reload({ waitUntil: "networkidle", timeout: 120000 });
check(
  "and it survives a reload",
  (await page.evaluate(() => document.documentElement.dataset.theme)) === "dark",
);

await rail.locator('button[aria-label^="Colour theme"]').click();
await page.getByRole("menu").getByRole("menuitemradio", { name: /System/ }).click();
check(
  "System clears both the attribute and the stored choice",
  (await page.evaluate(() => document.documentElement.dataset.theme ?? null)) === null &&
    (await page.evaluate(() => localStorage.getItem("starter-theme"))) === null,
);

check("the rail starts compact", Math.abs((await railWidth()) - 60) < 2, `(${await railWidth()}px)`);
check("and the content starts 112px in", (await padLeft()) === "112px", `(${await padLeft()})`);

await page.getByRole("button", { name: "Expand the menu" }).click();
await page.waitForTimeout(400);
check(
  "expanding widens the rail and puts the words back",
  Math.abs((await railWidth()) - 212) < 2 && (await rail.getByText("Registration desk").count()) > 0,
  `(${await railWidth()}px)`,
);
check("the content moves over with it", (await padLeft()) === "264px", `(${await padLeft()})`);
await page.screenshot({ path: `${SHOTS}/shell-rail-expanded.png` });

await page.reload({ waitUntil: "networkidle", timeout: 120000 });
check(
  "the rail comes back expanded from the saved choice",
  Math.abs((await railWidth()) - 212) < 2 && (await padLeft()) === "264px",
);
// The reload has painted but React may not have attached the control yet; wait for it rather
// than counting on the first frame after networkidle.
// Exact, because the alerts bell has a "Collapse issues badge" button and Playwright's name
// matching is a substring by default: the rail control is only unambiguous when the whole name
// is compared.
await expect(page.getByRole("button", { name: "Collapse", exact: true })).toHaveCount(1, {
  timeout: 15000,
});
check("and the rail says how to put it back", true);

await page.getByRole("button", { name: "Collapse", exact: true }).click();
await page.waitForTimeout(300);
check(
  "collapsing returns it to compact",
  Math.abs((await railWidth()) - 60) < 2 && (await padLeft()) === "112px",
  `(${await railWidth()}px / ${await padLeft()})`,
);
// -------------------------------------------------------------- help centre
section("help centre (desk)");
await go("/players");
// networkidle does not mean hydrated. Typing proves React is live before the help checks click
// anything: a panel opened while the page is still hydrating is what React reports as a mismatch.
await search.fill("Alcantara");
await expect(range).toHaveCount(0, { timeout: 15000 });
await search.fill("");
await expect(range).toHaveText("1–50 of 91", { timeout: 15000 });
const helpButton = page.getByRole("button", { name: "Help" });
check("the top bar carries a help button", (await helpButton.count()) > 0);
await helpButton.click();
const helpSheet = page.getByRole("dialog", { name: "Help" });
await expect(helpSheet).toBeVisible({ timeout: 15000 });
check(
  "it opens on this screen's own guide",
  (await helpSheet.getByText("Players", { exact: true }).count()) > 0 &&
    (await helpSheet.getByText("Finding one player, and reading their entry.").count()) > 0,
);
const showMe = helpSheet.getByRole("button", { name: "Show me" });
check("a step that names a control offers Show me", (await showMe.count()) > 0);
await showMe.first().click();
const ring = page.locator(".help-ring");
await expect(ring).toHaveCount(1, { timeout: 5000 });
const ringBox = await ring.boundingBox();
const inputBox = await search.boundingBox();
check(
  "Show me draws a ring over the control it means",
  Math.abs(ringBox.x - inputBox.x) < 3 &&
    Math.abs(ringBox.y - inputBox.y) < 3 &&
    Math.abs(ringBox.width - inputBox.width) < 3,
  `(ring ${Math.round(ringBox.width)}x${Math.round(ringBox.height)} over input ${Math.round(inputBox.width)}x${Math.round(inputBox.height)})`,
);
await expect(ring).toHaveCount(0, { timeout: 8000 });
check("and the ring clears itself", true);
await page.screenshot({ path: `${SHOTS}/help-ring.png` });

// A step about a control on another screen must navigate there before it rings. This is the bug
// the section exists to keep fixed: the Draw & pairings guide is in the panel on /players.
await helpButton.click();
const crossSheet = page.getByRole("dialog", { name: "Help" });
await expect(crossSheet).toBeVisible({ timeout: 15000 });
const drawSummary = crossSheet
  .locator("summary")
  .filter({ hasText: /^Draw & pairings$/ });
await drawSummary.click();
const drawGuide = drawSummary.locator("xpath=..");
// The guide's first step is the day filter now, and that control only exists for an event with
// playing days. This check is about the draw button, so it names that step rather than the first.
const runStep = drawGuide
  .locator("li")
  .filter({ hasText: "Make the draw when the entries are in." });
await runStep.getByRole("button", { name: "Show me" }).first().click();
await expect(page).toHaveURL(/\/draw$/, { timeout: 15000 });
check("Show me on another screen's step navigates there", true);
const crossRing = page.locator(".help-ring");
await expect(crossRing).toHaveCount(1, { timeout: 15000 });
const runTarget = page.locator('[data-help="draw-run"]').first();
const runBox = await runTarget.boundingBox();
const crossBox = await crossRing.boundingBox();
check(
  "and rings the control only after that page renders",
  runBox &&
    crossBox &&
    Math.abs(crossBox.x - runBox.x) < 3 &&
    Math.abs(crossBox.y - runBox.y) < 3 &&
    Math.abs(crossBox.width - runBox.width) < 3,
  runBox && crossBox
    ? `(ring ${Math.round(crossBox.width)}x${Math.round(crossBox.height)} over control ${Math.round(runBox.width)}x${Math.round(runBox.height)})`
    : "(no box)",
);
await page.screenshot({ path: `${SHOTS}/help-navigate-ring.png` });
await expect(crossRing).toHaveCount(0, { timeout: 8000 });

section("cheat sheet (print center)");
await go("/print");
await page.getByRole("tab", { name: "How to" }).click();
check(
  "the sheet lists the desk screens",
  (await page.getByText("The desk, screen by screen").count()) > 0,
);
check(
  "and the player screens",
  (await page.getByText("Players, screen by screen", { exact: false }).count()) > 0,
);
const sheetLanguage = page.getByLabel("Language of the player sheet");
await sheetLanguage.selectOption("hil");
check(
  "the player half prints in Hiligaynon",
  (await page.getByText("Pangitaa ang imo grupo").count()) > 0,
);
await page.emulateMedia({ media: "print" });
check("the language picker stays off paper", !(await sheetLanguage.isVisible()));
await page.emulateMedia({ media: "screen" });
await page.screenshot({ path: `${SHOTS}/help-cheat-sheet.png` });

section("help centre (player, Hiligaynon)");
const helpContext = await browser.newContext({ viewport: { width: 1200, height: 900 } });
const helpPage = await helpContext.newPage();
watch(helpPage);
await helpContext.addCookies([{ name: "desk-lang", value: "hil", url: BASE }]);
await helpPage.goto(`${BASE}/pairings`, { waitUntil: "networkidle", timeout: 120000 });
const playerHelp = helpPage.getByRole("button", { name: "Bulig" });
check("the player head carries a help button, in Hiligaynon", (await playerHelp.count()) > 0);
await playerHelp.click();
const playerSheet = helpPage.getByRole("dialog", { name: "Bulig" });
await expect(playerSheet).toBeVisible({ timeout: 15000 });
check(
  "the player sheet is Hiligaynon, key by key",
  (await playerSheet.getByText("Pangitaa ang imo grupo").count()) > 0 &&
    (await playerSheet.getByText("Ipakita").count()) > 0,
);
await playerSheet.screenshot({ path: `${SHOTS}/help-player-hiligaynon.png` });
await helpContext.close();

section("help centre (player, cross-screen)");
// This navigation crosses layouts (player to public), so the help component that asked for the
// ring is unmounted before the page with the control is mounted. The request has to survive that.
const playerCrossContext = await browser.newContext({ viewport: { width: 1200, height: 900 } });
await playerCrossContext.addInitScript(() => {
  try {
    window.localStorage.setItem(
      "teeline-help-seen",
      JSON.stringify(["welcome.desk", "welcome.player"]),
    );
    const seen = { seen: true, step: 0, updatedAt: new Date().toISOString() };
    window.localStorage.setItem(
      "teeline-onboarding-v1",
      JSON.stringify({ player: seen, staff: seen }),
    );
  } catch {
    // Storage off: the welcome will show; this section only needs the help panel.
  }
});
const playerCrossPage = await playerCrossContext.newPage();
watch(playerCrossPage);
await playerCrossPage.goto(`${BASE}/my`, { waitUntil: "networkidle", timeout: 120000 });
const myHelp = playerCrossPage.getByRole("button", { name: "Help" });
check("the player area carries a help button", (await myHelp.count()) > 0);
await myHelp.click();
const mySheet = playerCrossPage.getByRole("dialog", { name: "Help" });
await expect(mySheet).toBeVisible({ timeout: 15000 });
const pairingsSummary = mySheet.locator("summary").filter({ hasText: /^Find your group$/ });
await pairingsSummary.click();
await pairingsSummary
  .locator("xpath=..")
  .getByRole("button", { name: "Show me" })
  .first()
  .click();
await expect(playerCrossPage).toHaveURL(/\/pairings$/, { timeout: 15000 });
check("a player step on another screen navigates there", true);
// The demo pairings are published, so the step points at the search box. The panel closes and
// the ring lands on that box after the player-to-public layout change.
const playerRing = playerCrossPage.locator(".help-ring");
await expect(playerRing).toHaveCount(1, { timeout: 15000 });
const pairingsSearch = playerCrossPage.getByRole("searchbox", { name: "Find your name" });
const searchBox = await pairingsSearch.boundingBox();
const playerRingBox = await playerRing.boundingBox();
check(
  "and rings the pairings search after the layout change",
  searchBox !== null &&
    playerRingBox !== null &&
    Math.abs(playerRingBox.x - searchBox.x) < 3 &&
    Math.abs(playerRingBox.y - searchBox.y) < 3 &&
    Math.abs(playerRingBox.width - searchBox.width) < 3,
  searchBox && playerRingBox
    ? `(ring ${Math.round(playerRingBox.width)}x${Math.round(playerRingBox.height)} over search ${Math.round(searchBox.width)}x${Math.round(searchBox.height)})`
    : "(no box)",
);
await playerCrossContext.close();

// ------------------------------------------------------- public pages on a 360px phone
// Phone-first checks for the public surfaces. The reference width is 360px, the narrowest Android
// the club's players use, and no page may scroll sideways there. Every footer link is a thumb
// target, not a line of text.
section("public pages on a 360px phone");
const phoneContext = await browser.newContext({ viewport: { width: 360, height: 800 } });
await phoneContext.addInitScript(() => {
  try {
    window.localStorage.setItem(
      "teeline-help-seen",
      JSON.stringify(["welcome.desk", "welcome.player"]),
    );
    const seen = { seen: true, step: 0, updatedAt: new Date().toISOString() };
    window.localStorage.setItem(
      "teeline-onboarding-v1",
      JSON.stringify({ player: seen, staff: seen }),
    );
  } catch {
    // Storage off: the checks that need a modal-free page will say so.
  }
});
const phonePage = await phoneContext.newPage();
watch(phonePage);
const phoneGo = async (path) => {
  await phonePage.goto(`${BASE}${path}`, { waitUntil: "networkidle", timeout: 120000 });
};
const noSideways = async (name) => {
  const width = await phonePage.evaluate(() => {
    const root = document.scrollingElement ?? document.documentElement;
    return { scroll: root.scrollWidth, client: root.clientWidth };
  });
  check(
    `${name} does not scroll sideways at 360px`,
    width.scroll <= width.client + 1,
    `(scrollWidth ${width.scroll}, client ${width.client})`,
  );
};
const tapTargets = async (locator, name) => {
  const heights = await locator.evaluateAll((nodes) =>
    nodes.map((node) => Math.round(node.getBoundingClientRect().height)),
  );
  check(
    name,
    heights.length > 0 && heights.every((height) => height >= 44),
    `(${heights.join(", ")}px)`,
  );
};

await phoneGo("/pairings");
await noSideways("/pairings");
check(
  "the pairings title is printed once, not twice",
  (await phonePage.getByText("Club tournament pairings", { exact: true }).count()) === 1,
  `(${await phonePage.getByText("Club tournament pairings", { exact: true }).count()})`,
);
await tapTargets(
  phonePage.locator('footer nav[aria-label="Site links"] a'),
  "the public footer links are 44px tap targets",
);
// The in-page footer bar under the pairings was removed in 0.62.0 (the owner asked for one shared
// footer); its links live in the shared footer, checked above. The page's own navigation is the
// tournament tabs, so those carry the tap-target rule now.
check(
  "the old in-page footer bar is gone from /pairings",
  (await phonePage.locator("main .pairings-foot-nav").count()) === 0,
);
await tapTargets(
  phonePage.locator('nav[aria-label="On this page"] a:visible, nav[aria-label="On this page"] button:visible'),
  "the pairings page tabs are 44px tap targets",
);
const tournamentTabs = phonePage.locator('nav[aria-label="On this page"]');
const tabWidth = await tournamentTabs.evaluate((element) => ({
  scroll: element.scrollWidth,
  client: element.clientWidth,
  overflow: getComputedStyle(element).overflowX,
}));
check(
  "the tournament tabs wrap instead of hiding a tab off screen",
  tabWidth.scroll <= tabWidth.client + 1,
  `(scrollWidth ${tabWidth.scroll}, client ${tabWidth.client}, overflow ${tabWidth.overflow})`,
);

// The separate tee-time board is gone from /pairings. The published groups are the page, and the
// day dropdown above them is the only day switch.
check(
  "the tee-time board is gone from /pairings",
  (await phonePage.locator("#tee-times").count()) === 0 &&
    (await phonePage.getByRole("heading", { name: "Tee times by day" }).count()) === 0,
);
const phoneDaySelect = phonePage.getByTestId("pairings-day");
const dayOptions = await phoneDaySelect.evaluateAll((nodes) =>
  nodes.flatMap((node) =>
    [...node.querySelectorAll("option")].map((option) => ({
      value: option.value,
      text: (option.textContent ?? "").replace(/\s+/g, " ").trim(),
    })),
  ),
);
check(
  "the day dropdown lists only the published days, each with its date",
  dayOptions.length === 2 &&
    dayOptions[0]?.value === "1" &&
    dayOptions[1]?.value === "2" &&
    dayOptions.every((option) => /[A-Z][a-z]{2}, [A-Z][a-z]{2} \d{1,2}/.test(option.text)),
  `(${dayOptions.map((option) => option.text).join(" | ")})`,
);
const manilaTodayLabel = new Intl.DateTimeFormat("en-PH", {
  timeZone: "Asia/Manila",
  weekday: "short",
  month: "short",
  day: "numeric",
}).format(new Date());
const selectedDayText = (
  await phoneDaySelect.evaluate((node) => node.options[node.selectedIndex]?.textContent ?? "")
).replace(/\s+/g, " ");
check(
  "the day dropdown opens on today in Manila when it is published, else the first day",
  selectedDayText.includes(manilaTodayLabel) || (await phoneDaySelect.inputValue()) === "1",
  `(${selectedDayText}; today ${manilaTodayLabel})`,
);
const groupIds = async () =>
  phonePage.getByTestId("pairing-group").evaluateAll((nodes) => nodes.map((node) => node.id));
const firstDayGroupIds = await groupIds();
const otherDay = (await phoneDaySelect.inputValue()) === "2" ? "1" : "2";
await phoneDaySelect.selectOption(otherDay);
await expect(phoneDaySelect).toHaveValue(otherDay, { timeout: 15000 });
const otherDayGroupIds = await groupIds();
check(
  "switching the day changes the groups shown",
  otherDayGroupIds.length > 0 &&
    otherDayGroupIds.every((id) => id.startsWith(`pairing-group-${otherDay}-`)) &&
    otherDayGroupIds.join("|") !== firstDayGroupIds.join("|"),
  `(${firstDayGroupIds.length} groups, then ${otherDayGroupIds.length})`,
);
const sessionHeadings = await phonePage.getByTestId("pairings-session").allTextContents();
check(
  "the chosen day prints its AM and PM sessions",
  sessionHeadings.length === 2 &&
    sessionHeadings.every((text) => text.includes(`Day ${otherDay}`)) &&
    sessionHeadings.some((text) => text.includes("AM")) &&
    sessionHeadings.some((text) => text.includes("PM")),
  `(${sessionHeadings.join(" | ")})`,
);
const phonePairingsSearch = phonePage.getByRole("searchbox", { name: "Find your name" });
await phonePairingsSearch.fill("Antonio Alcantara");
await expect(
  phonePage.getByTestId("pairing-group").filter({ hasText: "Antonio Alcantara" }),
).toHaveCount(1, { timeout: 15000 });
check(
  "a name search finds the player on any day",
  (await phonePage.getByTestId("pairing-group").filter({ hasText: "Antonio Alcantara" }).count()) === 1,
);
await phonePairingsSearch.fill("");

await phonePairingsSearch.fill("Antonio Alcantara");
const foundGroup = phonePage
  .locator('[data-testid="pairing-group"]')
  .filter({ hasText: "Antonio Alcantara" });
await expect(foundGroup.first()).toBeVisible({ timeout: 15000 });
check(
  "the pairings search finds a name typed First Last",
  (await foundGroup.count()) === 1,
  `(${await foundGroup.count()} card)`,
);

await phoneGo("/roster");
await noSideways("/roster");
await tapTargets(
  phonePage.locator('footer nav[aria-label="Site links"] a'),
  "the roster footer links are 44px tap targets",
);
await tapTargets(
  phonePage.locator("main a.player-card-link"),
  "the roster player cards are 44px tap targets",
);
await phonePage.getByRole("searchbox", { name: "Find a player" }).fill("ordonez");
const profileLink = phonePage
  .locator("main a.player-card-link")
  .filter({ hasText: "ULYSSES ORDO" });
await expect(profileLink.first()).toBeVisible({ timeout: 15000 });
await profileLink.first().click();
await expect(phonePage).toHaveURL(/tab=profile/, { timeout: 15000 });
await expect(phonePage.getByTestId("player-profile")).toBeVisible({ timeout: 15000 });
await noSideways("the player profile");

const cardRegions = phonePage.locator('[data-testid^="player-scorecard-"]');
const cardRegionCount = await cardRegions.count();
check(
  "the player profile shows the paper card",
  cardRegionCount >= 2,
  `(${cardRegionCount} nine-hole tables)`,
);
const cardLabels = await cardRegions
  .first()
  .locator('tbody th[scope="row"]')
  .allTextContents();
check(
  "the paper card prints the seven rows",
  cardLabels.map((label) => label.trim()).join("|") ===
    "Par|SI|Gross|Hcp|Net|Gross pts|Net pts",
  `(${cardLabels.map((label) => label.trim()).join("|")})`,
);
const pinned = await phonePage.evaluate(() => {
  const label = document.querySelector(
    '[data-testid^="player-scorecard-"] tbody th[scope="row"]',
  );
  if (!label) return null;
  const style = getComputedStyle(label);
  return { position: style.position, left: style.left };
});
check(
  "the paper card pins its row labels",
  pinned?.position === "sticky" && pinned.left === "0px",
  `(${JSON.stringify(pinned)})`,
);
const contained = await phonePage.evaluate(() => {
  const region = document.querySelector('[data-testid^="player-scorecard-"]');
  return region ? { scroll: region.scrollWidth, client: region.clientWidth } : null;
});
check(
  "the paper card scrolls inside its own box",
  contained !== null && contained.scroll > contained.client,
  `(${JSON.stringify(contained)})`,
);
check(
  "the sample card never invents a pick-up",
  (await cardRegions.locator("td", { hasText: /^X$/ }).count()) === 0,
);
const profileTimes = phonePage.getByTestId("profile-tee-times");
await expect(profileTimes).toBeVisible({ timeout: 15000 });
const profileTimeText = ((await profileTimes.textContent()) ?? "").replace(/\s+/g, " ").trim();
check(
  "the player profile shows a tee time when one exists",
  /\d{1,2}:\d{2}\s*(AM|PM)/.test(profileTimeText),
  `(${profileTimeText})`,
);
check(
  "the player profile shows the starting hole",
  /Hole\s+\d+/.test(profileTimeText),
  `(${profileTimeText})`,
);

await phoneGo("/leaderboard");
await noSideways("/leaderboard");
await tapTargets(
  phonePage.locator('footer nav[aria-label="Site links"] a'),
  "the leaderboard footer links are 44px tap targets",
);
check(
  "the team board points at All scores",
  (await phonePage.locator('[data-testid="leaderboard-see-all"]').count()) === 1,
);

// ------------------------------------------- All scores: the whole field, by day and session
await phoneGo("/results/all");
await noSideways("/results/all");
const scoreRows = phonePage.locator('[data-testid="scores-list"] .lb-team');
const fieldSize = await scoreRows.count();
check("All scores lists more than a top 10", fieldSize > 10, `(${fieldSize} rows)`);
const scoreRanks = await phonePage.locator('[data-testid="scores-list"] .lb-rank').count();
check("All scores shows no rank numerals", scoreRanks === 0, `(${scoreRanks})`);
const greenLeaders = await phonePage
  .locator('[data-testid="scores-list"] .lb-team[data-leader]')
  .count();
check("no All scores card is dressed as a winner", greenLeaders === 0, `(${greenLeaders})`);
const roundBreakdowns = await phonePage.locator('[data-testid="scores-rounds"]').count();
check(
  "every card shows its rounds with the morning or afternoon",
  roundBreakdowns === fieldSize,
  `(${roundBreakdowns} of ${fieldSize})`,
);
const firstRoundLabels = await phonePage
  .locator('[data-testid="scores-rounds"] .scores-round-label')
  .evaluateAll((nodes) => nodes.map((node) => node.textContent ?? ""));
check(
  "the first cards name a day and a session",
  firstRoundLabels.length > 0 &&
    firstRoundLabels.every((text) => /Day \d/.test(text) && /(Morning|Afternoon)/.test(text)),
  `(${firstRoundLabels.slice(0, 2).join(" / ")})`,
);
await phonePage.locator('[data-testid="scores-day"]').selectOption("1");
await phonePage.locator('[data-testid="scores-session"]').selectOption("PM");
await phonePage.waitForTimeout(250);
const pmRows = await scoreRows.count();
check(
  "the afternoon filter shortens the list",
  pmRows > 0 && pmRows < fieldSize,
  `(${pmRows} of ${fieldSize})`,
);
const pmRoles = await scoreRows
  .locator(".lb-role")
  .evaluateAll((nodes) => nodes.map((node) => node.textContent ?? ""));
check(
  "every row in the afternoon list says Afternoon",
  pmRoles.length > 0 && pmRoles.every((text) => /Afternoon/.test(text)),
  `(${pmRoles.length} rows)`,
);
await phonePage.locator('[data-testid="scores-day"]').selectOption("");
await phonePage.waitForTimeout(200);
// The time of day survives a day change, so it has to be cleared before counting the whole field.
await phonePage.locator('[data-testid="scores-session"]').selectOption("");
await phonePage.waitForTimeout(200);
const classSelect = phonePage.locator('[data-testid="scores-class"]');
if ((await classSelect.count()) > 0) {
  await classSelect.selectOption({ index: 1 });
  const chosenClass = await classSelect.inputValue();
  await phonePage.waitForTimeout(250);
  const classMetas = await scoreRows
    .locator(".lb-meta")
    .evaluateAll((nodes) => nodes.map((node) => node.textContent ?? ""));
  check(
    "the class filter keeps only that class",
    classMetas.length > 0 && classMetas.every((text) => text.includes(chosenClass)),
    `(${chosenClass}, ${classMetas.length} rows)`,
  );
  await classSelect.selectOption("");
  await phonePage.waitForTimeout(200);
}
// The same rows as a plain table, for a member who would rather scan a list.
await phonePage.locator('[data-testid="scores-view-list"]').click();
await phonePage.waitForTimeout(250);
const tableRows = await phonePage.locator('[data-testid="scores-row"]').count();
check("the list view shows every player", tableRows === fieldSize, `(${tableRows} of ${fieldSize})`);
const tableSubs = await phonePage.locator(".scores-table-sub").allTextContents();
check(
  "every list row carries its day and session",
  tableSubs.length > 0 && tableSubs.every((text) => /Day \d/.test(text) && /(Morning|Afternoon)/.test(text)),
  `(${tableSubs[0] ?? "none"})`,
);
await phonePage.locator('[data-testid="scores-session"]').selectOption("AM");
await phonePage.waitForTimeout(250);
const amSubs = await phonePage.locator(".scores-table-sub").allTextContents();
check(
  "the morning filter works without choosing a day",
  amSubs.length > 0 && amSubs.every((text) => /Morning/.test(text)),
  `(${amSubs.length} rows)`,
);
await phonePage.locator('[data-testid="scores-session"]').selectOption("");
await phonePage.locator('[data-testid="scores-view-cards"]').click();
await phonePage.waitForTimeout(250);
// The search is the first control, above the day, session and class dropdowns.
const scoresSearchBox = await phonePage.locator('[data-testid="scores-search"]').boundingBox();
const scoresDayBox = await phonePage.locator('[data-testid="scores-day"]').boundingBox();
check(
  "the name search sits above the filters",
  scoresSearchBox !== null && scoresDayBox !== null && scoresSearchBox.y < scoresDayBox.y,
  `(search ${Math.round(scoresSearchBox?.y ?? -1)}, day ${Math.round(scoresDayBox?.y ?? -1)})`,
);
// A member who does not read small links still has to see that the top ten teams are a tap away.
const scoresTeamsBox = await phonePage.locator('[data-testid="scores-teams-button"]').boundingBox();
check(
  "the top-teams link is a full-size button",
  scoresTeamsBox !== null && scoresTeamsBox.height >= 44,
  `(${Math.round(scoresTeamsBox?.height ?? 0)}px)`,
);
await phonePage.locator('[data-testid="scores-search"]').fill("antonio");
await phonePage.waitForTimeout(250);
const foundRows = await scoreRows.count();
check("the name search narrows the list to one player", foundRows === 1, `(${foundRows})`);

await phoneGo("/my");
await noSideways("the player home");
check(
  "the player home never says a time is to be confirmed",
  (await phonePage.getByText("Time to be confirmed").count()) === 0,
);
await phoneContext.close();

// ------------------------- events, concerns, demo, rules, the TV board and Teeo (issue 355)
// These public surfaces had no browser section. The demo build is the honest limit: with no
// database it has no events, no per-event rules and no inbox, so the populated event page, the
// /rules redirect and a real concern write are recorded in the acceptance checklist as gaps. This
// suite proves the empty and refusal states it really serves, not a pass it cannot reach.
section("public events portfolio");
const publicContext = await browser.newContext({ viewport: { width: 1440, height: 950 } });
await publicContext.addInitScript(() => {
  try {
    window.localStorage.setItem(
      "teeline-help-seen",
      JSON.stringify(["welcome.desk", "welcome.player"]),
    );
    const seen = { seen: true, step: 0, updatedAt: new Date().toISOString() };
    window.localStorage.setItem(
      "teeline-onboarding-v1",
      JSON.stringify({ player: seen, staff: seen }),
    );
  } catch {
    // Storage off: no check below needs a modal-free page.
  }
});
const publicPage = await publicContext.newPage();
watch(publicPage);
const publicGo = async (path) => {
  await publicPage.goto(`${BASE}${path}`, { waitUntil: "networkidle", timeout: 120000 });
};

await publicGo("/events");
await expect(publicPage.getByRole("heading", { name: "Events", exact: true })).toBeVisible({
  timeout: 30000,
});
const eventLinks = publicPage.locator('a[href^="/events/"]');
const eventCount = await eventLinks.count();
const eventHrefs = await eventLinks.evaluateAll((links) =>
  links.map((link) => link.getAttribute("href") ?? ""),
);
const firstEventHref = eventCount > 0 ? (eventHrefs[0] ?? null) : null;
const emptyEvents = await publicPage.getByText("No events are listed yet.").count();
const emptyListHeading = await publicPage.getByRole("heading", { name: "The list" }).count();
const eventListHeading = await publicPage
  .getByRole("heading", { name: `${eventCount} events` })
  .count();
check(
  "the events page lists each event on its own page or says plainly that there are none",
  eventCount > 0
    ? eventHrefs.every((href) => /^\/events\/[0-9a-f-]{36}$/i.test(href)) &&
      eventListHeading === 1 &&
      emptyEvents === 0
    : emptyEvents === 1 && emptyListHeading === 1 && eventCount === 0,
  `(${eventCount} event link(s), empty state ${emptyEvents})`,
);
check(
  "the events page never falls back to a sample event",
  !(await publicPage.getByText("Antonio Alcantara").count()),
);
await publicPage.screenshot({ path: `${SHOTS}/events.png` });

section("/events/[id]");
const missingEvent = await publicPage.goto(
  `${BASE}/events/00000000-0000-4000-8000-000000000000`,
  { waitUntil: "networkidle", timeout: 120000 },
);
check(
  "an event id the archive does not carry is a 404, not an invented event",
  missingEvent?.status() === 404 &&
    (await publicPage.getByRole("heading", { name: "We could not find that page" }).count()) === 1,
  `(status ${missingEvent?.status() ?? "none"})`,
);
const badEventId = await publicPage.goto(`${BASE}/events/not-a-uuid`, {
  waitUntil: "networkidle",
  timeout: 120000,
});
check(
  "an event id that is not a UUID is a 404 before any read",
  badEventId?.status() === 404,
  `(status ${badEventId?.status() ?? "none"})`,
);
// With no database there is no public event here. A connected run opens the first listed one, so
// the populated page is checked whenever an event exists, and is a recorded gap when it does not.
if (firstEventHref) {
  await publicGo(firstEventHref);
  await expect(publicPage.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 30000 });
  const eventTitle = (
    (await publicPage.getByRole("heading", { level: 1 }).textContent()) ?? ""
  ).trim();
  const actionHrefs = await publicPage
    .locator('section[aria-labelledby="actions-title"] a')
    .evaluateAll((links) => links.map((link) => link.getAttribute("href") ?? ""));
  const jumpTargets = await publicPage
    .locator('nav[aria-label="On this page"] a')
    .evaluateAll((links) =>
      links.map((link) => {
        const target = link.getAttribute("href") ?? "";
        return { target, found: target.startsWith("#") && document.querySelector(target) !== null };
      }),
    );
  check(
    "the first listed event opens its own page with its dates, venue and next actions",
    eventTitle.length > 0 &&
      (await publicPage.getByText("Dates", { exact: true }).count()) === 1 &&
      (await publicPage.getByText("Venue", { exact: true }).count()) === 1 &&
      (await publicPage.getByRole("heading", { name: "What to do next" }).count()) === 1 &&
      actionHrefs.length >= 3 &&
      actionHrefs.every((href) => href.startsWith("/")),
    `(${eventTitle}; ${actionHrefs.join(", ")})`,
  );
  check(
    "every jump link on the event page lands on a section that is there",
    jumpTargets.every((entry) => entry.found),
    `(${jumpTargets.map((entry) => entry.target).join(", ") || "no jump links"})`,
  );
  await publicPage.screenshot({ path: `${SHOTS}/event-page.png` });
}

section("/feedback tick-box concerns");
await publicGo("/feedback");
await expect(publicPage.getByRole("heading", { name: "Send feedback", exact: true })).toBeVisible({
  timeout: 30000,
});
const feedbackForm = publicPage.locator("main form").first();
const concernTicks = ["Inquiry", "Name typo", "Schedule", "Handicap", "Score", "Tee off", "Others"];
const tickCounts = [];
for (const label of concernTicks) {
  tickCounts.push(await feedbackForm.getByRole("checkbox", { name: label, exact: true }).count());
}
check(
  "the concern form is the organizer's seven tick boxes, not a dropdown",
  tickCounts.every((count) => count === 1) &&
    (await feedbackForm.locator("select").count()) === 0,
  `(${tickCounts.join(", ")})`,
);
await feedbackForm.getByRole("checkbox", { name: "Score", exact: true }).check();
await expect(feedbackForm.locator("#feedback-hole")).toBeVisible({ timeout: 5000 });
await feedbackForm.getByRole("checkbox", { name: "Tee off", exact: true }).check();
await expect(feedbackForm.getByRole("radio", { name: "White", exact: true })).toBeVisible({
  timeout: 5000,
});
await feedbackForm.getByRole("checkbox", { name: "Others", exact: true }).check();
await expect(feedbackForm.locator("#feedback-other")).toBeVisible({ timeout: 5000 });
check(
  "each tick opens just its own follow-up question",
  (await feedbackForm.locator("#feedback-hole").count()) === 1 &&
    (await feedbackForm.getByRole("radio", { name: "White", exact: true }).count()) === 1 &&
    (await feedbackForm.locator("#feedback-other").count()) === 1 &&
    (await feedbackForm.locator(".tl-reveal-field").count()) === 3,
);
await feedbackForm.getByRole("checkbox", { name: "Score", exact: true }).uncheck();
await expect(feedbackForm.locator("#feedback-hole")).toHaveCount(0, { timeout: 5000 });
check(
  "clearing a tick withdraws its follow-up",
  (await feedbackForm.locator(".tl-reveal-field").count()) === 2,
);
await feedbackForm.getByRole("checkbox", { name: "Tee off", exact: true }).uncheck();
await feedbackForm.getByRole("checkbox", { name: "Others", exact: true }).uncheck();
await feedbackForm.getByRole("button", { name: "Send feedback" }).click();
await expect(feedbackForm.getByRole("alert")).toContainText("Tick at least one concern.", {
  timeout: 5000,
});
check(
  "a note with no concern is refused beside the ticks, and every tick is marked",
  (await feedbackForm.locator('[aria-invalid="true"]').count()) === concernTicks.length,
);
await feedbackForm.getByRole("checkbox", { name: "Score", exact: true }).check();
await feedbackForm.getByRole("button", { name: "Send feedback" }).click();
await expect(feedbackForm.getByRole("alert")).toContainText("Enter the hole number.", {
  timeout: 5000,
});
check(
  "a score concern without a hole is refused before anything is sent",
  (await feedbackForm.getByRole("alert").count()) === 1,
);
await feedbackForm.locator("#feedback-hole").fill("7");
await feedbackForm.getByRole("checkbox", { name: "Tee off", exact: true }).check();
await feedbackForm.getByRole("radio", { name: "White", exact: true }).check();
await feedbackForm.getByRole("checkbox", { name: "Others", exact: true }).check();
await feedbackForm.locator("#feedback-other").fill("The printed card shows the wrong tee.");
await feedbackForm.locator("#feedback-message").fill("The seventh hole score is wrong on the board.");
const feedbackPreview = (await publicPage.getByText(/Preview mode:/).count()) === 1;
if (feedbackPreview) {
  await feedbackForm.getByRole("button", { name: "Send feedback" }).click();
  await expect(publicPage.getByText("Saved in this browser preview", { exact: false })).toBeVisible({
    timeout: 10000,
  });
  check(
    "a complete note is accepted in the preview and the form starts again",
    (await feedbackForm.getByRole("checkbox", { name: "Score", exact: true }).isChecked()) ===
      false && (await feedbackForm.locator("#feedback-hole").count()) === 0,
  );
} else {
  console.log(
    "SKIP  a complete note was not submitted: this run has a database and would write a real note",
  );
}
await publicPage.screenshot({ path: `${SHOTS}/feedback-ticks.png` });

section("/demo request");
await publicGo("/demo");
await expect(
  publicPage.getByRole("heading", { name: "See TeeLine with your club's own event." }),
).toBeVisible({ timeout: 30000 });
const demoForm = publicPage.locator("form.tl-demo-form");
check(
  "the demo page carries the committee copy and one request form",
  (await demoForm.count()) === 1 &&
    (await demoForm.getByLabel(/^Your name/).count()) === 1 &&
    (await demoForm.getByLabel(/^Club/).count()) === 1 &&
    (await demoForm.getByLabel(/^Email/).count()) === 1 &&
    (await demoForm.getByRole("checkbox").count()) === 1,
);
await demoForm.getByRole("button", { name: "Request a demo" }).click();
await expect(demoForm.getByRole("alert")).toContainText("Enter your name.", { timeout: 5000 });
check(
  "an empty demo request is refused with the first missing field",
  (await demoForm.getByRole("alert").count()) === 1,
);
const demoTicks = async () => {
  await demoForm.getByLabel(/^Your name/).fill("Maria Santos");
  await demoForm.getByLabel(/^Club/).fill("Test Golf Club");
  await demoForm.getByLabel(/^Email/).fill("maria@example.com");
  await demoForm.getByRole("checkbox").check();
};
await demoTicks();
const demoPreview = (await publicPage.getByText(/This preview has no database/).count()) === 1;
if (demoPreview) {
  await demoForm.getByRole("button", { name: "Request a demo" }).click();
  await expect(
    demoForm.getByText("Thank you. We will be in touch about a demo.", { exact: false }),
  ).toBeVisible({ timeout: 10000 });
  check(
    "a complete demo request is accepted in the preview and the fields clear",
    (await demoForm.getByLabel(/^Your name/).inputValue()) === "",
  );
} else {
  console.log(
    "SKIP  a complete demo request was not submitted: this run has a database and would write a real note",
  );
}
await publicPage.screenshot({ path: `${SHOTS}/demo.png` });

section("/rules and its redirect");
const rulesResponse = await publicPage.goto(`${BASE}/rules`, {
  waitUntil: "networkidle",
  timeout: 120000,
});
const rulesUrl = new URL(publicPage.url());
const rulesRedirected = rulesUrl.pathname.startsWith("/events/");
check(
  "the rules address either shows the Conditions of Play or forwards to the event that carries them",
  rulesResponse?.status() === 200 &&
    (rulesRedirected
      ? rulesUrl.hash === "#rules" && /^\/events\/[0-9a-f-]{36}$/i.test(rulesUrl.pathname)
      : rulesUrl.pathname === "/rules"),
  `(${rulesUrl.pathname}${rulesUrl.hash}, status ${rulesResponse?.status() ?? "none"})`,
);
if (rulesRedirected) {
  const rulesSection = publicPage.locator("#rules");
  await expect(rulesSection).toBeVisible({ timeout: 10000 });
  check(
    "the redirect lands on the event's rules of play section",
    (await rulesSection.getByRole("heading", { name: "Rules of play" }).count()) === 1,
  );
} else {
  await expect(publicPage.getByTestId("rules-page")).toBeVisible({ timeout: 10000 });
  const download = publicPage.getByTestId("rules-download");
  const pdfHref = await download.getAttribute("href");
  const pdfName = await download.getAttribute("download");
  const pdfResponse = pdfHref
    ? await publicContext.request.get(new URL(pdfHref, BASE).toString())
    : null;
  check(
    "the reading page prints the conditions and every link to the official PDF",
    (await publicPage.getByRole("heading", { name: "Conditions of Play", exact: true }).count()) ===
      1 &&
      (await publicPage.getByTestId("rules-open-pdf").count()) === 1 &&
      pdfName === "24th-bamboo-tee-conditions-of-play.pdf",
    `(${pdfName})`,
  );
  check(
    "the official PDF beside the reading page is really there",
    pdfResponse?.status() === 200 &&
      (pdfResponse.headers()["content-type"] ?? "").includes("pdf"),
    `(${pdfHref}, ${pdfResponse?.status() ?? "none"})`,
  );
}
await publicPage.screenshot({ path: `${SHOTS}/rules.png`, fullPage: false });

section("/tv clubhouse board");
const tvPage = await publicContext.newPage();
watch(tvPage);
await tvPage.emulateMedia({ reducedMotion: "reduce" });
await tvPage.setViewportSize({ width: 1600, height: 900 });
await tvPage.goto(`${BASE}/tv`, { waitUntil: "networkidle", timeout: 120000 });
await expect(tvPage.locator("main")).toBeVisible({ timeout: 30000 });
const tvText = (await tvPage.locator("main").innerText()).replace(/\s+/g, " ").trim();
const tvBoard = await tvPage.getByTestId("tv-board").count();
const tvHeld = tvText.includes("Results will be shown at the awarding.");
const tvIdle =
  tvText.includes("No scores have been published yet.") ||
  tvText.includes("This event has not been published yet.");
check(
  "the TV address shows the board, the held screen or the honest idle line",
  tvBoard === 1 || tvHeld || tvIdle,
  `(board ${tvBoard}, held ${tvHeld}, idle ${tvIdle})`,
);
const tvLower = tvText.toLowerCase();
check(
  "the TV screen carries the club's name",
  // The board sets the club name in caps, and innerText returns it as drawn, so compare in lower
  // case rather than assuming the stored spelling reaches the wall.
  tvLower.includes("iloilo golf & country club"),
  `(${tvText.slice(0, 60)})`,
);
if (tvBoard === 1) {
  await tvPage.getByRole("button", { name: "By player", exact: true }).click();
  await tvPage.waitForTimeout(500);
  const playerRows = await tvPage.getByTestId("tv-player-row").count();
  const tvHeadings = await tvPage.locator("main h2").allTextContents();
  const what = ((await tvPage.getByTestId("tv-what").textContent()) ?? "").trim();
  check(
    "the board prints the field and splits the day into morning and afternoon",
    playerRows > 0 &&
      tvHeadings.some((text) => text.includes("Morning")) &&
      tvHeadings.some((text) => text.includes("Afternoon")),
    `(${playerRows} players, ${tvHeadings.join(" | ")})`,
  );
  check(
    "the board says which list the room is reading",
    /ranked by net points/.test(what),
    `(${what})`,
  );
  const pairButton = tvPage.getByRole("button", { name: "By pair", exact: true });
  if ((await pairButton.count()) === 1) {
    await pairButton.click();
    await tvPage.waitForTimeout(500);
    check(
      "the pair view is one tap away and prints the partners",
      (await tvPage.getByTestId("tv-pair-row").count()) > 0,
      `(${await tvPage.getByTestId("tv-pair-row").count()})`,
    );
  }
}
await tvPage.screenshot({ path: `${SHOTS}/tv.png` });
await tvPage.close();

section("Teeo concern chat");
await publicGo("/feedback");
const teeoLauncher = publicPage.getByRole("button", { name: "Ask Teeo" });
await expect(teeoLauncher).toBeVisible({ timeout: 30000 });
await teeoLauncher.click();
const teeo = publicPage.getByRole("dialog", { name: "Teeo" });
await expect(teeo).toBeVisible({ timeout: 15000 });
check(
  "Teeo opens with his greeting and a language picker",
  (await teeo.getByText("Hello, I am Teeo.", { exact: false }).count()) === 1 &&
    (await teeo.getByRole("combobox", { name: "Language" }).count()) === 1,
);
await teeo.getByRole("button", { name: "A score looks wrong", exact: true }).click();
const teeoFallback = teeo.getByRole("link", { name: "Use the form instead" });
await expect(teeoFallback).toBeVisible({ timeout: 20000 });
await expect(teeo.locator(".tl-chat-typing")).toHaveCount(0, { timeout: 10000 });
const teeoReplies = teeo.locator(
  '.tl-chat-turn[data-role="assistant"] .tl-chat-bubble:not(.tl-chat-typing)',
);
await expect(teeoReplies).toHaveCount(2, { timeout: 10000 });
const teeoReply = ((await teeoReplies.last().textContent()) ?? "").replace(/\s+/g, " ").trim();
check(
  "with no model configured, Teeo answers from the fixed copy and offers the tick-box form",
  /tick-box form at \/feedback/i.test(teeoReply),
  `(${teeoReply.slice(0, 80)})`,
);
check(
  "the fallback link carries the page the player came from",
  (await teeoFallback.getAttribute("href")) === "/feedback?from=%2Ffeedback",
  `(${await teeoFallback.getAttribute("href")})`,
);
await teeo.getByRole("button", { name: "Close the chat" }).click();
await expect(teeo).toHaveCount(0, { timeout: 5000 });
await publicPage.waitForTimeout(200);
check(
  "closing Teeo takes the panel away and puts the focus back on the launcher",
  (await teeoLauncher.isVisible()) &&
    (await publicPage.evaluate(
      () => document.activeElement?.getAttribute("aria-haspopup") === "dialog",
    )),
);
await publicPage.screenshot({ path: `${SHOTS}/teeo.png` });
await publicContext.close();

// ------------------------------------------------------- one public tee time per session
// The owner's display rule: the public pages show the session start, the same for Flight A and
// Flight B, never a flight's wave offset (06:12, 12:42). The stored draw keeps its real times.
section("public tee times: one per session");
const teeTimeContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
const teeTimePage = await teeTimeContext.newPage();
watch(teeTimePage);
const noWaveOffset = (text) => !/\b6:12\b|\b12:42\b/.test(text);
await teeTimePage.goto(`${BASE}/pairings`, { waitUntil: "networkidle", timeout: 120000 });
const firstCardTime = (
  (await teeTimePage.locator('[data-testid="pairing-group"] .p-time').first().textContent()) ?? ""
).trim();
check("a Day 1 pairings card shows 6:30 AM", firstCardTime === "6:30 AM", `(${firstCardTime})`);
const daySections = teeTimePage.locator("section.p-session");
const morningTimes = (await daySections.nth(0).locator(".p-time").allTextContents()).map((time) =>
  time.trim(),
);
check(
  "every Day 1 morning card, both flights, shows 6:30 AM",
  morningTimes.length > 0 && morningTimes.every((time) => time === "6:30 AM"),
  `(${morningTimes.join(", ")})`,
);
const afternoonTimes = (await daySections.nth(1).locator(".p-time").allTextContents()).map(
  (time) => time.trim(),
);
check(
  "every Day 1 afternoon card shows 12:30 PM",
  afternoonTimes.length > 0 && afternoonTimes.every((time) => time === "12:30 PM"),
  `(${afternoonTimes.join(", ")})`,
);
check(
  "the pairings page shows no 6:12 or 12:42",
  noWaveOffset(await teeTimePage.locator("body").innerText()),
);

// The profile rows come from the programme, so they follow the same rule.
await teeTimePage.goto(`${BASE}/roster`, { waitUntil: "networkidle", timeout: 120000 });
await teeTimePage.getByRole("searchbox", { name: "Find a player" }).fill("ordonez");
const teeTimeProfileLink = teeTimePage
  .locator("main a.player-card-link")
  .filter({ hasText: "ULYSSES ORDO" });
await expect(teeTimeProfileLink.first()).toBeVisible({ timeout: 15000 });
await teeTimeProfileLink.first().click();
await expect(teeTimePage.getByTestId("player-profile")).toBeVisible({ timeout: 15000 });
const profileRowText = (
  (await teeTimePage.getByTestId("profile-tee-times").textContent()) ?? ""
)
  .replace(/\s+/g, " ")
  .trim();
check(
  "the profile tee-time row shows a session time",
  /(6:30 AM|6:00 AM|12:30 PM|11:30 PM)/.test(profileRowText),
  `(${profileRowText})`,
);
check("the profile shows no 6:12 or 12:42", noWaveOffset(profileRowText), `(${profileRowText})`);

for (const path of ["/", "/pairings", "/roster", "/leaderboard", "/rules"]) {
  await teeTimePage.goto(`${BASE}${path}`, { waitUntil: "networkidle", timeout: 120000 });
  check(
    `${path} shows no 6:12 or 12:42`,
    noWaveOffset(await teeTimePage.locator("body").innerText()),
  );
}
await teeTimePage.screenshot({ path: `${SHOTS}/public-session-times.png` });
await teeTimeContext.close();

section("first-run welcome");
const freshContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const freshPage = await freshContext.newPage();
watch(freshPage);
await freshPage.goto(`${BASE}/players`, { waitUntil: "networkidle", timeout: 120000 });
const welcome = freshPage.getByRole("dialog", { name: "Welcome to the tournament desk" });
await expect(welcome).toBeVisible({ timeout: 20000 });
check("a desk browser that has never been here is greeted once", true);
await freshPage.screenshot({ path: `${SHOTS}/help-welcome.png` });
await freshPage.getByRole("button", { name: "Got it" }).click();
await expect(welcome).toBeHidden({ timeout: 10000 });
await freshPage.reload({ waitUntil: "networkidle", timeout: 120000 });
check("and never greeted again after that", (await welcome.count()) === 0);
await freshContext.close();

// -------------------------------------------------------------- entry form languages
section("entry form in three languages");
await go("/components-preview");
// The preview forces the first-run welcome open so it can be looked at; dismiss it first.
const previewWelcome = page.getByRole("dialog", { name: "Welcome to the tournament desk" });
if ((await previewWelcome.count()) > 0) {
  await page.getByRole("button", { name: "Got it" }).click();
  await expect(previewWelcome).toBeHidden({ timeout: 8000 });
}
const formLanguage = page.getByLabel("Form language");
await expect(formLanguage).toBeVisible({ timeout: 20000 });
check(
  "the real entry form renders, English first",
  (await page.getByText("Full name", { exact: true }).count()) > 0 &&
    (await page.getByText("Send my entry", { exact: true }).count()) > 0,
);
await formLanguage.selectOption("hil");
check(
  "Hiligaynon labels reach the form",
  (await page.getByText("Bug-os nga ngalan", { exact: true }).count()) > 0 &&
    (await page.getByText("Ipadala ang akon entry", { exact: true }).count()) > 0,
);
await formLanguage.selectOption("tl");
check(
  "and Tagalog",
  (await page.getByText("Buong pangalan", { exact: true }).count()) > 0 &&
    (await page.getByText("Ipadala ang entry ko", { exact: true }).count()) > 0,
);
await formLanguage.selectOption("en");
check("and back to English", (await page.getByText("Send my entry", { exact: true }).count()) > 0);
await page.screenshot({ path: `${SHOTS}/entry-form.png` });

// -------------------------------------------------------------- mobile sheet
section("mobile sheet");
const mob = await context.newPage();
watch(mob);
await mob.setViewportSize({ width: 390, height: 844 });
await mob.goto(`${BASE}/players`, { waitUntil: "networkidle", timeout: 120000 });
await mob.locator('button[aria-label^="Alerts"]').click();
const mobPanel = mob.getByRole("dialog", { name: "Alerts" });
await expect(mobPanel).toBeVisible({ timeout: 15000 });
const box = await mobPanel.boundingBox();
check("below lg the panel is a full-width sheet", Math.abs(box.width - 390) < 2, `(width ${box.width})`);
check("it starts under the top bar", box.y > 60 && box.y < 120, `(y ${box.y})`);
await mob.screenshot({ path: `${SHOTS}/bell-mobile.png` });

// Mark all as read has to work on the phone sheet too.
await mob.keyboard.press("Escape");
await mob.goto(`${BASE}/draw`, { waitUntil: "networkidle", timeout: 120000 });
await mob.getByRole("button", { name: "Make the draw" }).first().click();
await mob.waitForTimeout(2500);
await mob.getByRole("button", { name: "Lock", exact: true }).first().click();
await mob.waitForTimeout(1200);
await mob.locator('button[aria-label^="Alerts"]').click();
await expect(mobPanel).toBeVisible({ timeout: 15000 });
check(
  "the phone sheet offers Mark all as read",
  (await mobPanel.getByRole("button", { name: "Mark all as read" }).count()) === 1,
);
await mobPanel.getByRole("button", { name: "Mark all as read" }).click();
const mobReadSummary = mobPanel.locator('details[data-testid="alerts-read"] summary');
await expect(mobReadSummary).toHaveText(/Read \(\d+\)/, { timeout: 10000 });
check("mark all as read moves the items into Read on the phone sheet", true);
await mob.keyboard.press("Escape");
check(
  "closing the phone sheet releases the scroll lock",
  (await mob.evaluate(() => document.body.style.overflow)) !== "hidden",
);

// The same theme dropdown has to work inside the mobile menu, not just in the rail.
await mob.keyboard.press("Escape");
await mob.getByRole("button", { name: "Open menu" }).click();
const mobSheet = mob.getByRole("dialog", { name: "Menu" });
await expect(mobSheet).toBeVisible({ timeout: 15000 });
await mobSheet.getByRole("button", { name: /System|Light|Dark/ }).click();
const mobMenu = mob.getByRole("menu");
await expect(mobMenu).toBeVisible({ timeout: 10000 });
const mobBox = await mobMenu.boundingBox();
check(
  "the theme dropdown opens inside the mobile menu, on screen",
  mobBox.x >= 0 && mobBox.x + mobBox.width <= 391 && mobBox.width > 100,
  `(x ${Math.round(mobBox.x)} w ${Math.round(mobBox.width)})`,
);
await mob.keyboard.press("Escape");
await mob.screenshot({ path: `${SHOTS}/shell-theme-mobile.png` });
await mob.close();

// ---------------------------------------------------------------- sign in
section("sign in page");
const auth = await context.newPage();
watch(auth);
await auth.goto(`${BASE}/login`, { waitUntil: "networkidle", timeout: 120000 });
check("the wide sign-in page is split, with the brand panel", await auth.getByTestId("auth-brand").isVisible());
check(
  "it offers a way back to the club home",
  (await auth.getByTestId("back-home").getAttribute("href")) === "/",
);
check("it has a remember-me choice", (await auth.locator('input[name="remember"]').count()) === 1);
const passwordInput = auth.locator('[data-testid="password-input"]');
check("the password starts hidden", (await passwordInput.getAttribute("type")) === "password");
await auth.getByRole("button", { name: "Show password" }).click();
check("Show reveals it", (await passwordInput.getAttribute("type")) === "text");
await auth.getByRole("button", { name: "Hide password" }).click();
check("Hide covers it again", (await passwordInput.getAttribute("type")) === "password");
await auth.screenshot({ path: `${SHOTS}/login-desktop.png` });

await auth.getByRole("link", { name: "Forgot password?" }).click();
await expect(auth).toHaveURL(/\/forgot-password$/, { timeout: 15000 });
check(
  "Forgot password leads to the reset request",
  (await auth.getByRole("button", { name: "Send reset link" }).count()) === 1,
);
await auth.goto(`${BASE}/reset-password`, { waitUntil: "networkidle", timeout: 120000 });
check(
  "without a recovery session the reset page asks for a new link",
  (await auth.getByRole("link", { name: "Request a new link" }).count()) === 1,
);

await auth.setViewportSize({ width: 390, height: 844 });
await auth.goto(`${BASE}/login`, { waitUntil: "networkidle", timeout: 120000 });
check(
  "on a phone the brand panel collapses to the logo and club home",
  !(await auth.getByTestId("auth-brand").isVisible()) &&
    (await auth.getByTestId("club-home").isVisible()),
);
await auth.screenshot({ path: `${SHOTS}/login-mobile.png` });
await auth.close();

// --------------------------------------------------------------- event calendar and branding
section("event calendar and branding");
const calendarContext = await browser.newContext({ viewport: { width: 1440, height: 950 } });
await calendarContext.addInitScript(() => {
  try {
    window.localStorage.setItem(
      "teeline-help-seen",
      JSON.stringify(["welcome.desk", "welcome.player"]),
    );
  } catch {
    // Storage off: the welcome may cover the page, and the check will say so.
  }
});
const calendarPage = await calendarContext.newPage();
watch(calendarPage);
await calendarPage.goto(`${BASE}/calendar`, { waitUntil: "networkidle", timeout: 120000 });
check("the calendar opens", await calendarPage.getByRole("heading", { name: "Calendar" }).isVisible());
await calendarPage.getByRole("button", { name: "New event" }).click();
await calendarPage.getByLabel("Event title").fill("Calendar Test Invitational");
await calendarPage.getByLabel("Host or sponsor").fill("Tesla");
await calendarPage.getByLabel("Start date").fill("2026-12-20");
await calendarPage.getByLabel("End date").fill("2026-12-21");
await calendarPage.getByLabel("Upload logo").setInputFiles("public/brand/igcc-crest.png");
await calendarPage.getByRole("button", { name: "Save event" }).click();
await expect(
  calendarPage.getByRole("heading", { name: /December 2026/ }),
).toBeVisible({ timeout: 15000 });
check(
  "an event with a logo appears on its month",
  (await calendarPage.getByText("Calendar Test Invitational").count()) > 0 &&
    (await calendarPage.locator("section[aria-label='Event month'] img").count()) > 0,
);
await calendarPage.getByRole("button", { name: "New event" }).click();
await calendarPage.getByLabel("Event title").fill("Conflicting Event");
await calendarPage.getByLabel("Start date").fill("2026-12-20");
await calendarPage.getByLabel("End date").fill("2026-12-20");
await calendarPage.getByRole("button", { name: "Save event" }).click();
check(
  "the exact course/time overlap is refused",
  (await calendarPage.getByText(/both start at|already booked|Double booking/).count()) > 0,
);

// --------------------------------------------------------------- calendar sizing and grid line
// Issue #173: the month grid must fill a typical desk viewport without the page scrolling, the day
// dividers must stay visible in both themes, and the month/list switch must still work on a phone.
// The switcher matches on exact names: getByRole matches substrings by default, so "Month" would
// also catch "Previous month" and "Next month". Nothing is created or saved in this block.

// The conflict check above leaves the edit sheet open. Close it before measuring layout, or its
// overlay intercepts the Month button.
await calendarPage.keyboard.press("Escape");
await expect(calendarPage.getByRole("dialog")).toBeHidden({ timeout: 8000 });
const viewButton = (name) => calendarPage.getByRole("button", { name, exact: true });
const setCalendarTheme = async (theme) => {
  await calendarPage.evaluate((choice) => {
    localStorage.setItem("starter-theme", choice);
    document.documentElement.dataset.theme = choice;
  }, theme);
  await calendarPage.waitForTimeout(150);
};

section("calendar fills the viewport");
await viewButton("Month").click();
for (const size of [
  { width: 1366, height: 768 },
  { width: 1536, height: 864 },
  { width: 1729, height: 834 },
  { width: 1920, height: 1080 },
]) {
  for (const theme of ["light", "dark"]) {
    await setCalendarTheme(theme);
    await calendarPage.setViewportSize(size);
    await calendarPage.waitForTimeout(150);
    // A clipped page reports the same scrollHeight as a page that fits, so also check the month
    // section and its last cell are actually on screen and that the six rows share the height.
    const layout = await calendarPage.evaluate(() => {
      const section = document.querySelector("section[aria-label='Event month']");
      const grids = section?.querySelectorAll(".grid.grid-cols-7");
      const cells = [...(grids[grids.length - 1]?.children ?? [])];
      const rowHeights = [0, 7, 14, 21, 28, 35].map(
        (index) => cells[index]?.getBoundingClientRect().height ?? 0,
      );
      return {
        scroll: document.documentElement.scrollHeight,
        inner: window.innerHeight,
        sectionBottom: section?.getBoundingClientRect().bottom ?? -1,
        lastCellBottom: cells.at(-1)?.getBoundingClientRect().bottom ?? -1,
        rowHeights,
      };
    });
    const rowsEqual =
      Math.max(...layout.rowHeights) - Math.min(...layout.rowHeights) <= 1 &&
      layout.rowHeights.every((height) => height > 0);
    const onScreen = (value) => value <= layout.inner + 0.5;
    check(
      `${size.width}x${size.height} ${theme} fits without a page scroll`,
      layout.scroll <= layout.inner &&
        onScreen(layout.sectionBottom) &&
        onScreen(layout.lastCellBottom) &&
        rowsEqual,
      `${layout.scroll}/${layout.inner}, grid ends ${Math.round(layout.sectionBottom)}, rows ${layout.rowHeights.map(Math.round).join("/")}`,
    );
  }
}

section("calendar grid line");
for (const theme of ["light", "dark"]) {
  await setCalendarTheme(theme);
  // `section[aria-label='Event month']` holds two `.grid.grid-cols-7` boxes: the weekday header
  // comes first and the day cells come last, so the sample comes from the last one. Cell 10 of that
  // grid is always inside the month (there are at most six leading blanks), and today's cell is
  // skipped because its gold ring tints the surface behind the divider.
  const sample = await calendarPage.evaluate(() => {
    const grids = document.querySelectorAll("section[aria-label='Event month'] .grid.grid-cols-7");
    const cells = [...(grids[grids.length - 1]?.children ?? [])];
    let cell = cells[10];
    if (cell?.getAttribute("aria-current") === "date") cell = cells[11];
    if (!cell) return null;
    const style = getComputedStyle(cell);
    // The divider is the cell's own right border; the surface behind it is the cell background,
    // walking up the tree only if the cell itself paints nothing.
    let background = style.backgroundColor;
    for (let node = cell.parentElement; node; node = node.parentElement) {
      if (background !== "rgba(0, 0, 0, 0)") break;
      background = getComputedStyle(node).backgroundColor;
    }
    return { border: style.borderRightColor, background, width: style.borderRightWidth };
  });
  const ratio = sample ? contrast(sample.border, sample.background) : 0;
  check(
    `${theme} day cell divider clears 3:1`,
    ratio >= 3,
    `(${ratio.toFixed(2)}:1, ${sample?.width ?? "no cell"}, ${sample?.background ?? "-"})`,
  );
}

section("calendar on a phone");
await calendarPage.setViewportSize({ width: 390, height: 844 });
await viewButton("Month").click();
check(
  "the month grid survives a phone",
  await calendarPage.locator("section[aria-label='Event month']").isVisible(),
);
// A phone may scroll; only the view switch is asserted here. Click and poll because a click that
// lands before hydration is swallowed rather than queued.
await viewButton("List").click();
let visibleArticles = 0;
for (let attempt = 0; attempt < 10; attempt += 1) {
  visibleArticles = await calendarPage.getByRole("article").filter({ visible: true }).count();
  if (visibleArticles > 0) break;
  await calendarPage.waitForTimeout(200);
}
check("the list view shows an event on a phone", visibleArticles >= 1, `(${visibleArticles})`);
await viewButton("Month").click();

// Leave the page where the rest of the run expects it: desktop size, light theme.
await calendarPage.setViewportSize({ width: 1440, height: 950 });
await setCalendarTheme("light");

await calendarContext.close();

// ---------------------------------------------------------------- tabulator assigned list
section("tabulator assigned list and send");
const tabulatorContext = await browser.newContext({ viewport: { width: 1440, height: 950 } });
const tabulatorPage = await tabulatorContext.newPage();
const tabulatorField = {
  ok: true,
  event: "24th Bamboo Tee",
  tournamentId: "tournament-test",
  dayNumber: 1,
  playDate: "2026-11-12",
  maxIndex: 30,
  allowance: 1,
  days: [{ day: 1, date: "2026-11-12" }],
  players: [
    {
      playerId: "player-1",
      registrationId: "registration-1",
      partnerPlayerId: "player-2",
      partnerRegistrationId: "registration-2",
      name: "ALPHA, ONE",
      partner: "BETA, TWO",
      team: 1,
      group: 2,
      dayNumber: 1,
      playDate: "2026-11-12",
      teeTime: "06:30",
      session: "AM",
      startHole: 1,
      wave: "A",
      flight: "A",
      cls: "A",
      formulaClass: "A",
      frozenIndex: 10.2,
      playingHandicap: 12,
      tee: "Blue",
      teeCode: "B",
    },
    {
      playerId: "player-2",
      registrationId: "registration-2",
      partnerPlayerId: "player-1",
      partnerRegistrationId: "registration-1",
      name: "BETA, TWO",
      partner: "ALPHA, ONE",
      team: 1,
      group: 2,
      dayNumber: 1,
      playDate: "2026-11-12",
      teeTime: "06:30",
      session: "AM",
      startHole: 1,
      wave: "A",
      flight: "A",
      cls: "A",
      formulaClass: "A",
      frozenIndex: 14.1,
      playingHandicap: 16,
      tee: "Blue",
      teeCode: "B",
    },
    {
      playerId: "player-3",
      registrationId: "registration-3",
      partnerPlayerId: "player-4",
      partnerRegistrationId: "registration-4",
      name: "GAMMA, THREE",
      partner: "DELTA, FOUR",
      team: 2,
      group: 5,
      dayNumber: 1,
      playDate: "2026-11-12",
      teeTime: "06:40",
      session: "AM",
      startHole: 2,
      wave: "A",
      flight: "A",
      cls: "B",
      formulaClass: "B",
      frozenIndex: 18.4,
      playingHandicap: 20,
      tee: "White",
      teeCode: "W",
    },
    {
      playerId: "player-4",
      registrationId: "registration-4",
      partnerPlayerId: "player-3",
      partnerRegistrationId: "registration-3",
      name: "DELTA, FOUR",
      partner: "GAMMA, THREE",
      team: 2,
      group: 9,
      dayNumber: 1,
      playDate: "2026-11-12",
      teeTime: "12:30",
      session: "PM",
      startHole: 1,
      wave: "P",
      flight: "A",
      cls: "B",
      formulaClass: "B",
      frozenIndex: 20.1,
      playingHandicap: 22,
      tee: "Blue",
      teeCode: "B",
    },
    {
      playerId: "player-5",
      registrationId: "registration-5",
      partnerPlayerId: "",
      partnerRegistrationId: "",
      name: "UNASSIGNED, FIVE",
      partner: "",
      team: null,
      group: null,
      dayNumber: 1,
      playDate: "2026-11-12",
      teeTime: "",
      session: "",
      startHole: null,
      wave: "",
      flight: "",
      cls: "C",
      formulaClass: "C",
      frozenIndex: 24.1,
      playingHandicap: 26,
      tee: "Blue",
      teeCode: "B",
    },
  ],
};
await tabulatorPage.route("**/api/scorecards/field**", (route) =>
  route.fulfill({ json: tabulatorField }),
);
await tabulatorPage.route("**/api/scorecards/session", (route) =>
  route.fulfill({ json: { email: "tabulator@example.com", role: "tabulation" } }),
);
let tabulatorPutBody = null;
await tabulatorPage.route("**/api/scorecards/day1am-r5", (route) => {
  if (route.request().method() === "PUT") {
    tabulatorPutBody = route.request().postDataJSON();
    return route.fulfill({
      json: {
        ok: true,
        updatedAt: new Date().toISOString(),
        updatedBy: "tabulator@example.com",
        payload: tabulatorPutBody?.payload,
      },
    });
  }
  return route.fulfill({
    json: {
      payload: { cards: [], reviewBatches: [], activeReviewBatchId: "all" },
      updatedAt: "2026-11-14T00:00:00.000Z",
      updatedBy: "maria@example.com",
    },
  });
});
let submitBody = null;
await tabulatorPage.route("**/api/scorecards/submit", (route) => {
  submitBody = route.request().postDataJSON();
  return route.fulfill({
    json: {
      ok: true,
      submission: {
        at: new Date().toISOString(),
        by: "tabulator@example.com",
        label: "Day 1 AM",
        slug: "day1am-r5",
        cards: (submitBody?.cards ?? []).map((card) => ({ ...card, hdcp: card.hdcp || "12" })),
        nameOnly: submitBody?.nameOnly ?? [],
        unmatched: [],
      },
    },
  });
});
await tabulatorPage.goto(`${BASE}/scorecard/index.html`, {
  waitUntil: "networkidle",
  timeout: 120000,
});
await expect(tabulatorPage.locator("#cards .card")).toHaveCount(3, { timeout: 15000 });
check("the assigned AM players are listed on their own", true);
const listedNames = await tabulatorPage
  .locator("#cards .card input.name")
  .evaluateAll((inputs) => inputs.map((input) => input.value));
check(
  "the list is in group and start order",
  listedNames.join(",") === "ALPHA, ONE,BETA, TWO,GAMMA, THREE",
  listedNames.join(" / "),
);
check(
  "the playing handicap is the system's index on the tee on the card",
  (await tabulatorPage.locator('#cards .card [data-k="syshcp"]').first().textContent())?.includes(
    "Plays off 11 (index 10.2, Blue)",
  ) === true,
);
const toolbarSticky = await tabulatorPage.evaluate(
  () => getComputedStyle(document.getElementById("toolbar")).position,
);
check("the find and filter bar is pinned", toolbarSticky === "sticky", toolbarSticky);
const barHoldsTools = await tabulatorPage.evaluate(() => {
  const bar = document.getElementById("toolbar");
  return ["q", "dayFilter", "sessionFilter", "batch-select", "add-player", "saved", "stat"].every(
    (id) => bar.contains(document.getElementById(id)),
  );
});
check("search, day, session, batch, save state and counts are in the pinned bar", barHoldsTools);
const firstNameEditable = await tabulatorPage
  .locator("#cards .card input.name")
  .first()
  .isEditable();
check("a listed player's name is read-only", !firstNameEditable);
await tabulatorPage.locator("#cards .card").first().locator('input[data-h="0"]').fill("4");
await tabulatorPage.locator("#cards .card").first().locator('input[data-f="verified"]').check();
tabulatorPage.once("dialog", (dialog) => dialog.accept());
await tabulatorPage.click("#batch-send");
await expect
  .poll(() => submitBody, { timeout: 10000 })
  .not.toBeNull();
check("the send names the system player", submitBody?.cards?.[0]?.playerId === "player-1");
check(
  "the send leaves a blank card HDCP for the API to resolve",
  submitBody?.cards?.[0]?.hdcp === "",
);
await expect(tabulatorPage.locator("#batch-summary")).toContainText("Sent 1 checked card", {
  timeout: 10000,
});

// A player filter narrows the send: BETA and GAMMA are checked, but only BETA is shown and sent.
await tabulatorPage.locator("#cards .card").nth(1).locator('input[data-h="0"]').fill("5");
await tabulatorPage.locator("#cards .card").nth(1).locator('input[data-f="verified"]').check();
await tabulatorPage.locator("#cards .card").nth(2).locator('input[data-f="verified"]').check();
await tabulatorPage.locator("#q").fill("BETA");
await expect(tabulatorPage.locator("#batch-send")).toContainText("(1)", { timeout: 10000 });
tabulatorPage.once("dialog", (dialog) => dialog.accept());
await tabulatorPage.click("#batch-send");
await expect
  .poll(() => submitBody?.cards?.[0]?.name, { timeout: 10000 })
  .toBe("BETA, TWO");
check("the player filter sends only the matching checked card", submitBody?.cards?.length === 1);
await expect(tabulatorPage.locator("#batch-summary")).toContainText("Sent 1 checked card", {
  timeout: 10000,
});
await tabulatorPage.locator("#q").fill("");

// The per-card Send button sends just that card, and the card says it went.
await tabulatorPage.locator("#cards .card").nth(2).locator('input[data-h="0"]').fill("6");
await tabulatorPage.locator("#cards .card").nth(2).locator("[data-send]").click();
await expect
  .poll(() => submitBody?.cards?.[0]?.name, { timeout: 10000 })
  .toBe("GAMMA, THREE");
check("the per-card Send button sends only that card", submitBody?.cards?.length === 1);
await expect(
  tabulatorPage.locator("#cards .card").nth(2).locator('[data-k="savestate"]'),
).toContainText("Sent to admin", { timeout: 10000 });
check("the card says it was sent to the admin", true);

// Remove is on every card, including a system card, and Undo brings it back.
await expect(tabulatorPage.locator("#cards .card").nth(0).locator("[data-del]")).toBeVisible();
tabulatorPage.once("dialog", (dialog) => dialog.accept());
await tabulatorPage.locator("#cards .card").nth(0).locator("[data-del]").click();
await expect(tabulatorPage.locator("#cards .card")).toHaveCount(2, { timeout: 10000 });
await expect(tabulatorPage.locator("#undo")).toBeVisible({ timeout: 10000 });
check("a system card can be removed and Undo is offered", true);
await tabulatorPage.click("#undo");
await expect(tabulatorPage.locator("#cards .card")).toHaveCount(3, { timeout: 10000 });
check("Undo brings the removed system card back", true);

// The bar stays on screen while the cards scroll, so the search is always one keystroke away.
await tabulatorPage.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
const searchPos = await tabulatorPage.locator("#q").boundingBox();
check(
  "the search box is still on screen after scrolling to the last card",
  Boolean(searchPos && searchPos.y >= 0 && searchPos.y < 240),
  searchPos ? `y ${Math.round(searchPos.y)}` : "missing",
);
await tabulatorPage.evaluate(() => window.scrollTo(0, 0));

// A card for a player who is on the event's list but not in this day's draw.
await tabulatorPage.click("#add-player");
await expect(tabulatorPage.locator('#pp-list input[name="pp-pick"]').first()).toBeVisible({
  timeout: 10000,
});
await tabulatorPage.locator("#pp-q").fill("FIVE");
await expect(tabulatorPage.locator('#pp-list input[name="pp-pick"]')).toHaveCount(1, {
  timeout: 10000,
});
const drawerNote = await tabulatorPage.locator("#pp-list").textContent();
check(
  "a player outside the day's draw is found and named as such",
  drawerNote?.includes("UNASSIGNED, FIVE") === true && drawerNote?.includes("not drawn for Day 1") === true,
  drawerNote ?? "",
);
await tabulatorPage.locator('#pp-list input[name="pp-pick"]').first().check();
await tabulatorPage.click("#pp-add");
await expect(tabulatorPage.locator("#cards .card")).toHaveCount(4, { timeout: 10000 });
check("a card is added for the player outside the draw", true);
// The same player again must not become a second card; the existing card is opened instead.
await tabulatorPage.click("#add-player");
await expect(tabulatorPage.locator('#pp-list input[name="pp-pick"]').first()).toBeVisible({
  timeout: 10000,
});
await tabulatorPage.locator("#pp-q").fill("FIVE");
await expect(tabulatorPage.locator('#pp-list input[name="pp-pick"]')).toHaveCount(1, {
  timeout: 10000,
});
const alreadyNote = await tabulatorPage.locator("#pp-list").textContent();
check(
  "a player who already has a card for that day and session is flagged",
  alreadyNote?.includes("already has a card for Day 1 AM") === true,
  alreadyNote ?? "",
);
await tabulatorPage.locator('#pp-list input[name="pp-pick"]').first().check();
await tabulatorPage.click("#pp-add");
await expect(tabulatorPage.locator("#cards .card")).toHaveCount(4, { timeout: 10000 });
check("adding the same player again does not create a second card", true);

// The second way in: a name that is not in the system at all.
await tabulatorPage.click("#add-player");
await expect(tabulatorPage.locator("#pp-other summary")).toBeVisible({ timeout: 10000 });
await tabulatorPage.click("#pp-other summary");
await tabulatorPage.locator("#pp-name").fill("STRANGER, SAM");
await tabulatorPage.click("#pp-addname");
await expect(tabulatorPage.locator("#cards .card")).toHaveCount(5, { timeout: 10000 });
const strangerCard = tabulatorPage
  .locator("#cards .card")
  .filter({ has: tabulatorPage.locator('input.name[value="STRANGER, SAM"]') });
check(
  "a player not in the system is marked so on the card",
  (await strangerCard.locator(".no").first().textContent())?.includes(
    "Not in the system: tell the admin",
  ) === true,
);

// A name-only card can go to the admin on its own; the admin adds the player.
await strangerCard.locator('input[data-h="0"]').fill("4");
await strangerCard.locator('input[data-f="verified"]').check();
await strangerCard.locator("[data-send]").click();
await expect
  .poll(() => submitBody?.nameOnly?.[0]?.name, { timeout: 10000 })
  .toBe("STRANGER, SAM");
check(
  "a name-only card is sent to the admin on its own",
  submitBody?.cards?.length === 0 && submitBody?.nameOnly?.length === 1,
);
await expect(strangerCard.locator('[data-k="savestate"]')).toContainText("Sent to admin", {
  timeout: 10000,
});
check("the name-only card says it was sent", true);

// Send all scored includes an unchecked card that has a score, and leaves a blank card out.
await tabulatorPage.evaluate(() => {
  const state = window.__scorecard.getState();
  const gamma = state.cards.find((card) => card.name === "GAMMA, THREE");
  if (gamma) {
    delete gamma.sentAt;
    gamma.verified = false;
  }
  window.__scorecard.save();
});
await tabulatorPage.locator("#q").fill("");
await expect(tabulatorPage.locator("#batch-send-scored")).toContainText("(1)", {
  timeout: 10000,
});
tabulatorPage.once("dialog", (dialog) => dialog.accept());
await tabulatorPage.click("#batch-send-scored");
await expect
  .poll(
    () => submitBody?.cards?.some((card) => card.name === "GAMMA, THREE") === true,
    { timeout: 10000 },
  )
  .toBe(true);
check(
  "send all scored includes an unchecked card that has a score",
  submitBody?.cards?.some((card) => card.name === "GAMMA, THREE") === true,
);
check(
  "the unchecked card is marked as not checked",
  submitBody?.cards?.find((card) => card.name === "GAMMA, THREE")?.checked === false,
);

// Phase 2: a card that is only in this browser must survive a reload and go out with the merge.
const localCard = {
  id: "local-1",
  name: "LOCAL, ONE",
  group: "1",
  tee: "B",
  hdcp: "",
  written: "",
  verified: false,
  cls: "A",
  note: "",
  source: "",
  holes: Array(18).fill(""),
};
await tabulatorPage.addInitScript((card) => {
  sessionStorage.setItem("bamboo-tab", "reload-check");
  localStorage.setItem(
    "bamboo-scores-day1am-r5-v1-reload-check",
    JSON.stringify({ cards: [card], mode: "written", savedAt: new Date().toISOString() }),
  );
}, localCard);
await tabulatorPage.reload({ waitUntil: "networkidle", timeout: 120000 });
await expect
  .poll(
    () => tabulatorPutBody?.payload?.cards?.some((entry) => entry.id === "local-1") === true,
    { timeout: 15000 },
  )
  .toBe(true);
check("a card only in this browser survives a reload and is merged, not dropped", true);
await expect(tabulatorPage.locator("#sync")).toContainText("kept from this browser", {
  timeout: 15000,
});
check("the page says the browser copy is being kept", true);

// Phase 3: replace-all keeps a snapshot first, and the page can undo it.
let snapshotBody = null;
await tabulatorPage.route("**/api/scorecards/day1am-r5/snapshot", (route) => {
  snapshotBody = route.request().postDataJSON();
  return route.fulfill({
    json: { ok: true, path: "snapshots/day1am-r5/check.json", at: new Date().toISOString() },
  });
});
const replacement = {
  format: "bamboo-scores-edit",
  version: 1,
  slug: "day1am-r5",
  label: "Day 1 AM",
  cards: [{ id: "from-file-1", name: "FROM, FILE", holes: Array(18).fill("") }],
};
tabulatorPage.once("dialog", (dialog) => dialog.accept());
await tabulatorPage.setInputFiles("#file", {
  name: "replace.json",
  mimeType: "application/json",
  buffer: Buffer.from(JSON.stringify(replacement)),
});
await expect
  .poll(() => snapshotBody?.reason, { timeout: 10000 })
  .toContain("before replacing");
check("replace-all keeps a snapshot before it changes the shared copy", true);
await expect(tabulatorPage.locator("#cards .card input.name").first()).toHaveValue("FROM, FILE", {
  timeout: 15000,
});
await expect(tabulatorPage.locator("#undo")).toBeVisible({ timeout: 10000 });
check("replace-all can be undone in the page", true);
await tabulatorPage.click("#undo");
await expect(tabulatorPage.locator("#cards .card input.name").first()).toHaveValue("LOCAL, ONE", {
  timeout: 15000,
});
await expect(tabulatorPage.locator("#undo")).toBeHidden({ timeout: 10000 });
check("undo puts the browser copy back", true);
await tabulatorContext.close();

// ------------------------------------------------------- results blackout and reveal
// The awarding: the desk holds the results and the player list, the public sees a holding screen
// and a countdown, and no score is on the page in the meantime. The demo store is the same switch
// the desk's own demo card writes, and the demo pages are the same components the live pages use.
section("results blackout and reveal");

const blackoutSeed = (revealInMs) => {
  const revealAt = new Date(Date.now() + revealInMs).toISOString();
  return { revealAt };
};

const blackoutText = async (p) => (await p.locator("body").innerText()).replace(/\s+/g, " ").trim();
const carriesNoScore = (text) =>
  !/\bpts\b/.test(text) && !text.includes("Antonio Alcantara") && !text.includes("Stableford");

const blackoutContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
const blackoutPage = await blackoutContext.newPage();
watch(blackoutPage);
const blackoutReveal = blackoutSeed(90_000);
await blackoutContext.addInitScript(({ revealAt }) => {
  try {
    window.localStorage.setItem(
      "teeline.demo.public-release.v1",
      JSON.stringify({
        "bamboo-tee-2026": {
          leaderboard: false,
          roster: false,
          revealAt,
          updatedAt: new Date().toISOString(),
          updatedBy: "Demo organizer",
        },
      }),
    );
  } catch {
    // Storage off: the holding-screen checks below report what they see.
  }
}, blackoutReveal);

const blackoutGo = async (path) =>
  blackoutPage.goto(`${BASE}${path}`, { waitUntil: "networkidle", timeout: 120000 });

await blackoutGo("/leaderboard");
await expect(blackoutPage.getByTestId("results-holding")).toBeVisible({ timeout: 20000 });
const blackoutLeaderboard = await blackoutText(blackoutPage);
check(
  "the leaderboard shows the holding screen while the blackout is on",
  (await blackoutPage.getByTestId("results-holding").count()) === 1,
);
check(
  "the holding screen says the results will be shown at the awarding",
  blackoutLeaderboard.includes("Results will be shown at the awarding"),
);
check(
  "the leaderboard carries no score text while hidden",
  carriesNoScore(blackoutLeaderboard) &&
    (await blackoutPage.getByTestId("leaderboard-cards").count()) === 0,
  `(${blackoutLeaderboard.slice(0, 90)})`,
);
const blackoutCountdown = blackoutPage.locator(
  '[data-testid="reveal-countdown"] .reveal-countdown-value',
);
await expect(blackoutCountdown).toBeVisible({ timeout: 15000 });
await expect
  .poll(async () => (await blackoutCountdown.innerText()).trim(), { timeout: 15000 })
  .toMatch(/^\d+:\d{2}$/);
check(
  "the holding screen counts down to the stored reveal time",
  true,
  `(${(await blackoutCountdown.innerText()).trim()})`,
);
await blackoutPage.screenshot({ path: `${SHOTS}/results-blackout-leaderboard.png` });

await blackoutGo("/results/all");
await expect(blackoutPage.getByTestId("results-holding")).toBeVisible({ timeout: 20000 });
const blackoutScores = await blackoutText(blackoutPage);
check(
  "All scores shows the same holding screen and no scores",
  blackoutScores.includes("Results will be shown at the awarding") &&
    (await blackoutPage.getByTestId("scores-list").count()) === 0 &&
    (await blackoutPage.getByTestId("scores-table").count()) === 0 &&
    carriesNoScore(blackoutScores),
);

await blackoutGo("/roster");
await expect(blackoutPage.getByTestId("results-holding")).toBeVisible({ timeout: 20000 });
const blackoutRoster = await blackoutText(blackoutPage);
check(
  "the roster is held and lists no player",
  blackoutRoster.includes("Results will be shown at the awarding") &&
    (await blackoutPage.locator("a.player-card-link").count()) === 0 &&
    !blackoutRoster.includes("ULYSSES ORDO"),
);

await blackoutGo("/pairings?tab=profile");
await expect(blackoutPage.getByTestId("results-holding")).toBeVisible({ timeout: 20000 });
check(
  "a player profile deep link is held too",
  (await blackoutPage.getByTestId("player-profile").count()) === 0 &&
    (await blackoutPage.getByTestId("profile-tee-times").count()) === 0,
);
await blackoutPage.screenshot({ path: `${SHOTS}/results-blackout-profile.png` });
await blackoutContext.close();

// A reveal time that has already passed, with the surfaces still held: the public stays on the
// holding screen. The database is the gate, so a fast or wrong device clock cannot reveal anything.
const dueContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
const duePage = await dueContext.newPage();
watch(duePage);
const dueReveal = blackoutSeed(-5_000);
await dueContext.addInitScript(({ revealAt }) => {
  window.localStorage.setItem(
    "teeline.demo.public-release.v1",
    JSON.stringify({
      "bamboo-tee-2026": { leaderboard: false, roster: false, revealAt },
    }),
  );
}, dueReveal);
await duePage.goto(`${BASE}/leaderboard`, { waitUntil: "networkidle", timeout: 120000 });
await expect(duePage.getByTestId("results-holding")).toBeVisible({ timeout: 20000 });
const dueText = await blackoutText(duePage);
check(
  "a reveal time that has passed without a release keeps the results hidden",
  /revealing the results/i.test(dueText) &&
    (await duePage.getByTestId("leaderboard-cards").count()) === 0 &&
    carriesNoScore(dueText),
);
await dueContext.close();

// The controls are the desk card. In the demo it writes the same local store the pages read, so the
// whole loop can be exercised without a database: hide, count down, then let it reveal by itself.
const cardContext = await browser.newContext({ viewport: { width: 1280, height: 950 } });
const cardPage = await cardContext.newPage();
watch(cardPage);
await cardPage.addInitScript(() => {
  try {
    window.localStorage.setItem(
      "teeline-help-seen",
      JSON.stringify(["welcome.desk", "welcome.player"]),
    );
  } catch {}
});
await cardPage.goto(`${BASE}/admin`, { waitUntil: "networkidle", timeout: 120000 });
const blackoutCard = cardPage.getByTestId("results-blackout");
await expect(blackoutCard).toBeVisible({ timeout: 30000 });
check("the control room carries the blackout controls", (await blackoutCard.count()) === 1);
await blackoutCard.getByTestId("blackout-seconds").fill("3");
cardPage.once("dialog", (dialog) => dialog.accept());
await blackoutCard.getByTestId("blackout-reveal").click();
await expect(blackoutCard.getByTestId("blackout-countdown")).toBeVisible({ timeout: 20000 });
check("the reveal records a time and shows the countdown in the desk", true);
await expect(
  blackoutCard.getByTestId("blackout-keep-open"),
).toContainText("Keep this page open");
check(
  "the desk says the page has to stay open to finish the reveal",
  (await blackoutCard.getByTestId("blackout-keep-open").count()) === 1,
);
// Three seconds later the demo desk releases both keys by itself, and the card says so.
await expect
  .poll(async () => (await blackoutCard.innerText()).includes("Results and players public"), {
    timeout: 20000,
  })
  .toBeTruthy();
check("the desk finishes the reveal when the countdown reaches zero", true);
await cardPage.goto(`${BASE}/leaderboard`, { waitUntil: "networkidle", timeout: 120000 });
check(
  "the leaderboard is back after the reveal",
  (await cardPage.getByTestId("results-holding").count()) === 0 &&
    (await cardPage.getByTestId("leaderboard-cards").count()) > 0,
);
await cardContext.close();

// ------------------------------------------------------------- awarding podium (issue 302)
// The demo build has no database and no demo flag, so the awarding page opens with every lane
// held: six blank boards and not one name or score to read. The released boards and the cinema
// countdown are checked by the unit tests on the lane model; the browser only proves the blank page.
section("awarding podium");
const podiumContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
const podiumPage = await podiumContext.newPage();
watch(podiumPage);
await podiumPage.goto(`${BASE}/results`, { waitUntil: "networkidle", timeout: 120000 });
await expect(podiumPage.getByTestId("awarding-podium")).toBeVisible({ timeout: 20000 });
const podiumLanes = podiumPage.locator('[data-testid^="awarding-lane-"]');
check("the awarding page shows the six lanes", (await podiumLanes.count()) === 6);
check(
  "every lane is held and prints no row",
  (await podiumPage.locator('[data-testid="awarding-row"]').count()) === 0 &&
    (await podiumPage.locator('[data-phase="hidden"]').count()) === 6,
);
const podiumText = (await podiumPage.locator("body").innerText()).replace(/\s+/g, " ").trim();
check(
  "the held page carries no score or sample name",
  !/\bpts\b/.test(podiumText) &&
    !podiumText.includes("Antonio Alcantara") &&
    podiumText.includes("Results will be shown at the awarding"),
);
await podiumPage.screenshot({ path: `${SHOTS}/awarding-held.png` });
await podiumContext.close();
section("draw board: swapping two players by drag");
await go("/draw");
const makeDrawForDrag = page.getByRole("button", { name: "Make the draw" });
if (await makeDrawForDrag.count()) await makeDrawForDrag.first().click();
await page.waitForTimeout(2500);
// The cards are the default layout, and each row's Move button carries the player's name.
const dragGroups = page.locator(".group");
const confirmNote = page.locator('[data-testid="drop-confirm"]');
const rowOf = (group, i) => group.locator(".slot[data-drop-player]").nth(i);
const nameOfRow = async (row) => {
  // A real button carries "Move <name>"; the grip's label also starts with "Move", so this
  // selector stays on the button.
  const label = await row
    .locator('button[aria-label^="Move "]')
    .first()
    .getAttribute("aria-label");
  return (label ?? "").replace(/^Move /, "");
};
check("the demo board has two groups to drag between", (await dragGroups.count()) >= 2);
const firstGroup = dragGroups.nth(0);
const secondGroup = dragGroups.nth(1);
const sourceRow = rowOf(firstGroup, 0);
const targetRow = rowOf(secondGroup, 0);
const sourceName = await nameOfRow(sourceRow);
const targetName = await nameOfRow(targetRow);
check(
  "the two rows hold different players",
  sourceName.length > 0 && targetName.length > 0 && sourceName !== targetName,
  `(${sourceName} / ${targetName})`,
);
// One drag: the first player of one full group onto the first player of another full group.
await sourceRow.locator(".grip").dragTo(targetRow);
await expect(confirmNote).toBeVisible({ timeout: 15000 });
const dropWords = (await confirmNote.innerText()).replace(/\s+/g, " ").trim();
check(
  "a drag between two full groups swaps the two players and says so",
  dropWords.startsWith("Swapped ") &&
    dropWords.includes(sourceName) &&
    dropWords.includes(targetName),
  `(${dropWords})`,
);
check(
  "the confirmation line offers Undo",
  (await confirmNote.getByRole("button", { name: "Undo" }).count()) === 1,
);
const firstAfter = await firstGroup.innerText();
const secondAfter = await secondGroup.innerText();
check(
  "the two players really changed groups",
  firstAfter.includes(targetName) && secondAfter.includes(sourceName),
);
await confirmNote.getByRole("button", { name: "Undo" }).click();
await page.waitForTimeout(1000);
const firstUndone = await firstGroup.innerText();
const secondUndone = await secondGroup.innerText();
check(
  "Undo puts both players back where they were",
  firstUndone.includes(sourceName) && secondUndone.includes(targetName),
);
await page.screenshot({ path: `${SHOTS}/draw-drag-swap.png` });

section("draw table view: swapping two players by drag");
await page.getByRole("button", { name: "Table", exact: true }).click();
await page.waitForTimeout(600);
const dragTableRows = page.locator("tr[data-drop-group]");
check("the table view lists the groups", (await dragTableRows.count()) >= 4);
const cellName = async (cell) =>
  (await cell.innerText()).replace(/^⋮⋮\s*/, "").split("\n")[0].trim();
if ((await dragTableRows.count()) >= 4) {
  const cellA = dragTableRows.nth(2).locator("td[data-drop-player]").first();
  const cellB = dragTableRows.nth(3).locator("td[data-drop-player]").first();
  const nameInA = await cellName(cellA);
  const nameInB = await cellName(cellB);
  await cellA.locator("button").dragTo(cellB);
  await expect(confirmNote).toBeVisible({ timeout: 15000 });
  const tableWords = (await confirmNote.innerText()).replace(/\s+/g, " ").trim();
  check(
    "a drag in the table swaps the two players and says so",
    tableWords.startsWith("Swapped ") &&
      tableWords.includes(nameInA) &&
      tableWords.includes(nameInB),
    `(${tableWords})`,
  );
  check(
    "the table shows the swapped name in its new row",
    (await cellName(cellB)) === nameInA,
    `(${await cellName(cellB)} / ${nameInA})`,
  );
}
await page.getByRole("button", { name: "Cards", exact: true }).click();
await page.waitForTimeout(400);

section("draw board: a drop the rules forbid says why");
// Nothing is set up: a player dropped back on their own group cannot be moved there, so the board
// has to say why and leave the group alone. The card view is the layout again by now.
if (await confirmNote.count()) await confirmNote.getByRole("button", { name: "Dismiss" }).click();
await expect(confirmNote).toHaveCount(0, { timeout: 5000 });
const refuseGroup = page.locator(".group").nth(0);
const refuseRow = refuseGroup.locator(".slot[data-drop-player]").nth(0);
const rowsBefore = await refuseGroup.locator(".slot[data-drop-player]").count();
await refuseRow.locator(".grip").dragTo(refuseGroup.locator(".group-head").first());
await expect(confirmNote).toBeVisible({ timeout: 15000 });
const refuseWords = (await confirmNote.innerText()).replace(/\s+/g, " ").trim();
check(
  "dropping a player back on their own group is refused with a reason",
  /in group \d+/i.test(refuseWords),
  `(${refuseWords})`,
);
check(
  "the refusal is drawn as a refusal, so it cannot be read as a change",
  ((await confirmNote.getAttribute("class")) ?? "").includes("bad"),
);
check(
  "a refused drop offers no Undo and leaves the group as it was",
  (await confirmNote.getByRole("button", { name: "Undo" }).count()) === 0 &&
    (await refuseGroup.locator(".slot[data-drop-player]").count()) === rowsBefore,
);
await page.screenshot({ path: `${SHOTS}/draw-drag-refused.png` });

console.log(`\nconsole errors: ${errors.length}`);
for (const e of errors.slice(0, 8)) console.log("  !", e.slice(0, 1200));
console.log(`screenshots in ${SHOTS}`);
console.log(`\n${pass} passed, ${fail} failed`);

await browser.close();
process.exit(fail === 0 && errors.length === 0 ? 0 : 1);
