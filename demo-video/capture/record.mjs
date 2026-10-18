/**
 * Records every scene of the AVP demo from the running app.
 *
 * Usage: pnpm avp:capture
 * Needs `pnpm dev --port 3019` in another terminal and the audio already generated.
 * Output: demo-video/capture/raw/<id>.webm, demo-video/out/stills/<id>.png and timing.json.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "@playwright/test";

const ROOT = resolve(import.meta.dirname, "..", "..");
const VIDEO = resolve(ROOT, "demo-video");
const BASE = process.env.AVP_BASE ?? "http://localhost:3019";
const steps = JSON.parse(readFileSync(resolve(VIDEO, "steps.json"), "utf8"));
const durations = JSON.parse(readFileSync(resolve(VIDEO, "audio/durations.json"), "utf8"));

const rawDir = resolve(VIDEO, "capture/raw");
const stillDir = resolve(VIDEO, "out/stills");
mkdirSync(rawDir, { recursive: true });
mkdirSync(stillDir, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function clickByText(page, text) {
  const locator = page.getByText(text, { exact: false }).first();
  if (await locator.count()) {
    await locator.click({ timeout: 4000 });
    return true;
  }
  return false;
}

async function clickByLabel(page, label) {
  const locator = page.getByLabel(label, { exact: true }).first();
  if (await locator.count()) {
    await locator.click({ timeout: 4000 });
    return true;
  }
  return false;
}

const browser = await chromium.launch();
const timing = {};

for (const [index, scene] of steps.scenes.entries()) {
  const audio = durations[scene.id];
  if (!audio) throw new Error(`no audio for ${scene.id}; run the audio step first`);

  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    recordVideo: { dir: rawDir, size: { width: 1920, height: 1080 } },
  });
  const contextStart = Date.now();
  await context.addInitScript(
    ({ step, total, title, caption }) => {
      // The help centre's first-run welcome would otherwise cover every fresh recording context.
      try {
        localStorage.setItem(
          "teeline-help-seen",
          JSON.stringify(["welcome.desk", "welcome.player"]),
        );
      } catch {
        // Storage disabled: the welcome will show; it is dismissed by the recorder below.
      }
      const paint = () => {
        if (document.getElementById("avp-overlay")) return;        const style = document.createElement("style");
        style.textContent = `
          #avp-overlay { position: fixed; inset: 0; pointer-events: none; z-index: 2147483000;
            font-family: Geist, "Segoe UI", system-ui, sans-serif; }
          #avp-step { position: absolute; top: 96px; left: 24px; display: flex; align-items: center;
            gap: 10px; padding: 10px 16px; border-radius: 999px; background: rgba(16, 37, 27, .92);
            color: #eef0ea; font-size: 15px; font-weight: 600; letter-spacing: .02em;
            box-shadow: 0 6px 24px rgba(0,0,0,.25); }
          #avp-step b { color: #e0bc65; font-weight: 800; }
          #avp-demo { position: absolute; top: 28px; right: 28px; padding: 6px 12px;
            border-radius: 999px; border: 1px solid #e0bc65; color: #f1d88e;
            background: rgba(16, 37, 27, .9); font-size: 12px; font-weight: 700;
            letter-spacing: .12em; text-transform: uppercase; }
          #avp-caption { position: absolute; left: 50%; bottom: 36px; transform: translateX(-50%);
            max-width: 1500px; padding: 14px 22px; border-radius: 14px;
            background: rgba(12, 26, 19, .92); color: #eef0ea; font-size: 26px; line-height: 1.35;
            text-align: center; box-shadow: 0 10px 30px rgba(0,0,0,.35); }
        `;
        document.head.appendChild(style);
        const overlay = document.createElement("div");
        overlay.id = "avp-overlay";
        overlay.innerHTML = `
          <div id="avp-step"><b>${step}</b><span>of ${total}</span><span>·</span><span>${title}</span></div>
          <div id="avp-demo">Demo data</div>
          <div id="avp-caption">${caption}</div>
        `;
        document.body.appendChild(overlay);
      };
      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", paint);
      } else {
        paint();
      }
    },
    { step: index + 1, total: steps.scenes.length, title: scene.title, caption: scene.caption },
  );

  const page = await context.newPage();
  const target = scene.card
    ? `file:///${resolve(VIDEO, "cards", scene.card).replaceAll("\\", "/")}`
    : `${BASE}${scene.route}`;
  await page.goto(target, { waitUntil: "networkidle" });
  await sleep(900);

  const startedAt = Date.now();

  // Later routes and simple actions, in order.
  const events = [
    ...(scene.routes ?? []).map((r) => ({ after: r.after, kind: "route", value: r.path })),
    ...(scene.actions ?? []).map((a) => ({ ...a, kind: "action" })),
  ].sort((a, b) => a.after - b.after);

  const started = Date.now();
  let elapsed = 0;
  for (const event of events) {
    const wait = event.after * 1000 - elapsed;
    if (wait > 0) await sleep(wait);
    elapsed = Date.now() - started;
    try {
      if (event.kind === "route") {
        await page.goto(`${BASE}${event.value}`, { waitUntil: "networkidle" });
      } else if (event.scrollText) {
        const target = page.getByText(event.scrollText, { exact: false }).first();
        if (await target.count()) await target.scrollIntoViewIfNeeded();
        else if (!event.optional) console.warn(`  ! ${scene.id}: could not scroll to "${event.scrollText}"`);
      } else if (event.scrollY !== undefined) {
        await page.evaluate((y) => window.scrollTo({ top: y, behavior: "smooth" }), event.scrollY);
      } else if (event.clickText) {
        const ok = await clickByText(page, event.clickText);
        if (!ok && !event.optional) console.warn(`  ! ${scene.id}: could not click "${event.clickText}"`);
      } else if (event.clickTextRegex) {
        const re = new RegExp(event.clickTextRegex);
        const locator = page.getByRole("button", { name: re }).first();
        if (await locator.count()) await locator.click({ timeout: 4000 });
        else if (!event.optional) console.warn(`  ! ${scene.id}: no button matching ${event.clickTextRegex}`);
      } else if (event.clickLabel) {
        const ok = await clickByLabel(page, event.clickLabel);
        if (!ok && !event.optional) console.warn(`  ! ${scene.id}: could not find "${event.clickLabel}"`);
      }
    } catch (error) {
      if (!event.optional) console.warn(`  ! ${scene.id}: ${error.message}`);
    }
  }

  const remaining = (audio + 1.1) * 1000 - (Date.now() - started);
  if (remaining > 0) await sleep(remaining);

  await page.screenshot({ path: resolve(stillDir, `${scene.id}.png`) });
  const video = page.video();
  await page.close();
  await context.close();
  if (video) {
    const out = resolve(rawDir, `${scene.id}.webm`);
    await video.saveAs(out);
    timing[scene.id] = {
      raw: out,
      audio: resolve(VIDEO, "audio", `${scene.id}.wav`),
      // Trim to where the page had settled after navigation.
      trimStart: Math.max(0, (startedAt - contextStart) / 1000),
      seconds: audio + 0.6,
    };
  }
  console.log(`recorded ${scene.id} (${audio.toFixed(1)}s audio + hold)`);
}

writeFileSync(resolve(VIDEO, "capture/timing.json"), `${JSON.stringify(timing, null, 2)}\n`);
await browser.close();
console.log("done");
