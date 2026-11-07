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
const watch = (p) => {
  p.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
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
await expect(panel.getByText("Read", { exact: true }).first()).toBeVisible({ timeout: 10000 });
check("marking one as read leaves a Read mark and keeps the item listed", (await panel.getByRole("link", { name: /Fix/ }).count()) > 0);
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
const switcher = langPage.getByLabel("Wika");
check("the picker is labelled in the chosen language", (await switcher.count()) > 0);
await switcher.selectOption("en");
await langPage.getByText("This build runs on demo data").first().waitFor({ timeout: 20000 });
check(
  "choosing English switches the page back",
  (await langPage.getByText("There is no player area here", { exact: false }).count()) > 0 ||
    (await langPage.getByText("no player area here").count()) > 0,
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
await expect(page.getByRole("button", { name: "Collapse" })).toHaveCount(1, { timeout: 15000 });
check("and the rail says how to put it back", true);

await page.getByRole("button", { name: "Collapse" }).click();
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
// The demo pairings are not published, so there is no search box to ring. The panel has to say
// that instead of doing nothing.
const missingSheet = playerCrossPage.getByRole("dialog", { name: "Help" });
await expect(missingSheet).toBeVisible({ timeout: 15000 });
check(
  "and a control that is not there is explained, not silent",
  (await missingSheet.getByText("That control is not on this screen right now.").count()) > 0,
);
await playerCrossContext.close();

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
await mob.getByRole("button", { name: "Make the draw" }).click();
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
await expect(mobPanel.getByText("Read", { exact: true }).first()).toBeVisible({ timeout: 10000 });
check("mark all as read works on the phone sheet", true);
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

console.log(`\nconsole errors: ${errors.length}`);
for (const e of errors.slice(0, 8)) console.log("  !", e.slice(0, 1200));
console.log(`screenshots in ${SHOTS}`);
console.log(`\n${pass} passed, ${fail} failed`);

await browser.close();
process.exit(fail === 0 && errors.length === 0 ? 0 : 1);
