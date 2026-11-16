import { mkdir } from "node:fs/promises";
import { chromium } from "@playwright/test";

const BASE = "http://localhost:3012";
const OUT = "docs/screenshots/luna-ui";

const routes = [
  ["staff-today", "/staff"],
  ["staff-schedule", "/staff/schedule"],
  ["staff-score", "/staff/score"],
  ["staff-players", "/staff/players"],
  ["staff-pairings", "/staff/pairings"],
  ["staff-print", "/staff/print"],
  ["player-home", "/my"],
  ["player-profile", "/my/profile"],
  ["player-card", "/my/card"],
  ["player-board", "/my/board"],
];

const measure = () => {
  const doc = document.documentElement;
  const offenders = [];
  const consider = (el, height) => {
    if (height >= 44) return;
    offenders.push({
      tag: el.tagName.toLowerCase(),
      text: (el.getAttribute("aria-label") || el.textContent || el.tagName).trim().slice(0, 40),
      h: Math.round(height),
    });
  };
  for (const el of document.querySelectorAll('a,button,select,textarea,[role="combobox"]')) {
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) continue;
    consider(el, rect.height);
  }
  // A radio or checkbox is tapped through its label, so the label is the target that counts.
  for (const el of document.querySelectorAll('input[type="checkbox"],input[type="radio"]')) {
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) continue;
    const label = el.closest("label");
    consider(el, label ? label.getBoundingClientRect().height : rect.height);
  }
  return { overflow: doc.scrollWidth - doc.clientWidth, interactionsUnder44: offenders };
};

const settle = async (page) => {
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(700);
  await page.keyboard.press("Escape").catch(() => {});
  await page.waitForTimeout(250);
  await page.addStyleTag({ content: "nextjs-portal{display:none !important}" });
  const skip = page.getByRole("button", { name: "Skip" });
  if (await skip.isVisible().catch(() => false)) await skip.click().catch(() => {});
  await page.keyboard.press("Escape").catch(() => {});
  await page.waitForTimeout(250);
};

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
const report = {};

for (const theme of ["light", "dark"]) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
  });
  await context.addInitScript((value) => {
    try {
      localStorage.setItem("starter-theme", value);
    } catch {}
  }, theme);
  const page = await context.newPage();
  page.on("pageerror", (error) => console.log(`[${theme}] page error`, error.message));

  for (const [name, path] of routes) {
    await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded" });
    await settle(page);
    report[`${theme}:${name}`] = await page.evaluate(measure);
    await page.screenshot({ path: `${OUT}/${name}-${theme}-390.png` });
  }

  for (const [name, path] of [
    ["staff-today", "/staff"],
    ["player-home", "/my"],
  ]) {
    await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded" });
    await settle(page);
    const combo = page.getByRole("combobox").first();
    if (!(await combo.isVisible().catch(() => false))) {
      report[`${theme}:${name}:open`] = { combobox: false };
      continue;
    }
    await combo.scrollIntoViewIfNeeded();
    await combo.click();
    let open = await page.getByRole("listbox").isVisible().catch(() => false);
    if (!open) {
      await page.waitForTimeout(400);
      await combo.click();
      open = await page.getByRole("listbox").isVisible().catch(() => false);
    }
    await page.waitForTimeout(250);
    await page.screenshot({ path: `${OUT}/${name}-${theme}-open-390.png` });
    const expansion = await combo.getAttribute("aria-expanded");
    await page.keyboard.press("ArrowDown");
    const active = await combo.getAttribute("aria-activedescendant");
    await page.keyboard.press("Escape");
    const closed = await combo.getAttribute("aria-expanded");
    const focusReturned = await combo.evaluate((el) => document.activeElement === el);
    report[`${theme}:${name}:open`] = { open, expansion, active, closed, focusReturned };
  }

  await context.close();
}

await browser.close();
console.log(JSON.stringify(report, null, 2));
