/**
 * Browser checks for the screens added in 0.24.0. Demo mode only: no database and no staff account.
 *
 * Usage:
 *   pnpm dev --port 3100
 *   node scripts/verify-caddie-photos-ui.mjs
 */
import { chromium } from "@playwright/test";

const BASE = process.env.UI_BASE ?? "http://localhost:3100";
const errors = [];
let pass = 0;
let fail = 0;

const check = (name, ok, extra = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? `  ${extra}` : ""}`);
  if (ok) pass += 1;
  else fail += 1;
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text());
});
page.on("pageerror", (error) => errors.push(error.message));

const go = async (path) => {
  await page.goto(`${BASE}${path}`, { waitUntil: "networkidle", timeout: 120000 });
};

try {
  await go("/caddies");
  check("caddies page renders", await page.getByRole("heading", { name: "Caddies" }).isVisible());
  await page.getByRole("button", { name: "Add caddie" }).click();
  await page.getByLabel("Full name (required)").fill("Playwright Caddie");
  await page.getByLabel("Phone").fill("0917 000 0000");
  await page.getByRole("button", { name: "Save caddie" }).click();
  check(
    "a caddie can be added in the demo",
    await page.getByText("Playwright Caddie").first().isVisible(),
  );

  await go("/players");
  const profileLink = page.getByRole("link", { name: /Profile/ }).first();
  await Promise.all([page.waitForURL(/\/players\/[^/]+$/, { timeout: 15000 }), profileLink.click()]);
  await page.waitForLoadState("networkidle");
  check(
    "the player profile exposes the details editor",
    await page.getByRole("heading", { name: "Player details" }).isVisible(),
  );
  check("the photo panel is present", await page.getByRole("heading", { name: "Photo" }).isVisible());

  await go("/tee-times");
  check("tee times has a caddie column", await page.getByRole("columnheader", { name: "Caddie" }).isVisible());
  const caddieSelects = page.locator('select[aria-label^="Caddie for"]');
  check("each visible player row has a caddie selector", (await caddieSelects.count()) > 0);
  const firstCaddie = caddieSelects.first();
  await firstCaddie.selectOption({ index: 1 });
  await page.waitForTimeout(150);
  check("a caddie assignment can be made in the demo", (await firstCaddie.inputValue()) !== "");

  await go("/audit");
  check("audit page renders", await page.getByRole("heading", { name: "Audit log" }).isVisible());
  check(
    "audit explains demo mode",
    (await page.getByText(/Demo mode has no audit database/).count()) > 0,
  );

  await go("/leaderboard");
  check(
    "leaderboard page renders",
    await page.getByRole("heading", { name: "Leaderboard" }).first().isVisible(),
  );
  check(
    "leaderboard explains demo mode",
    (await page.getByText(/public leaderboard is available/).count()) > 0,
  );

  await go("/pairings");
  check(
    "pairings page still renders",
    (await page.getByText(/Club tournament pairings/).count()) > 0,
  );
} finally {
  await browser.close();
}

check("no console or page errors", errors.length === 0, errors.slice(0, 3).join(" | "));
console.log(`\n${pass} passed, ${fail} failed`);
process.exitCode = fail === 0 ? 0 : 1;
