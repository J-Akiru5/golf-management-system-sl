import { chromium } from "@playwright/test";

const BASE = "http://localhost:3012";
const OUT = "docs/screenshots/luna-ui";
const report = {};

const browser = await chromium.launch();
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

  for (const [name, path] of [
    ["staff-today", "/staff"],
    ["player-home", "/my"],
  ]) {
    await page.goto(`${BASE}${path}`, { waitUntil: "load" });
    await page.waitForSelector('button[role="combobox"]', { state: "visible", timeout: 20000 });
    await page.addStyleTag({ content: "nextjs-portal{display:none !important}" });
    const skip = page.getByRole("button", { name: "Skip" });
    if (await skip.isVisible().catch(() => false)) await skip.click().catch(() => {});
    await page.evaluate(() => {
      document.querySelectorAll("[data-onboarding-overlay]").forEach((el) => el.remove());
      document.querySelectorAll("[data-state=\"open\"]").forEach((el) => {
        if (!el.querySelector("[role=combobox]")) el.remove();
      });
    });
    await page.waitForTimeout(500);

    const combo = page.locator('button[role="combobox"]').first();
    await combo.scrollIntoViewIfNeeded();
    await combo.focus();
    await page.keyboard.press("Enter");
    const listbox = page.locator('[role="listbox"]');
    await listbox.waitFor({ state: "visible", timeout: 5000 }).catch(() => {});
    const open = await listbox.isVisible();
    await page.waitForTimeout(300);
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
