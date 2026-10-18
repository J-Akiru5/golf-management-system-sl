/**
 * Records every scene of the AVP demo with a cursor, a spotlight and selective zoom.
 *
 * Usage:
 *   pnpm avp:capture                      # all scenes
 *   AVP_SCENES=03-setup,06-draw pnpm avp:capture   # a subset (style proof)
 *
 * Needs `pnpm dev --port 3019` with NEXT_PUBLIC_AVP_DEMO=1 and the audio already generated.
 * Output: demo-video/capture/raw/<id>.webm, demo-video/out/stills/<id>.png, capture/timing.json.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "@playwright/test";

const ROOT = resolve(import.meta.dirname, "..", "..");
const VIDEO = resolve(ROOT, "demo-video");
const BASE = process.env.AVP_BASE ?? "http://localhost:3019";
const local = process.env.LOCALAPPDATA ?? "";
const shim = resolve(local, "Microsoft/WinGet/Links");
const ffprobe =
  process.env.FFPROBE ??
  (existsSync(resolve(shim, "ffprobe.exe")) ? resolve(shim, "ffprobe.exe") : "ffprobe");

const durationOf = (file) =>
  Number(
    execFileSync(ffprobe, [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=nw=1:nk=1",
      file,
    ], { encoding: "utf8" }).trim(),
  );
const only = (process.env.AVP_SCENES ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const steps = JSON.parse(readFileSync(resolve(VIDEO, "steps.json"), "utf8"));
const timeline = JSON.parse(readFileSync(resolve(VIDEO, "audio/timeline.json"), "utf8"));

const rawDir = resolve(VIDEO, "capture/raw");
const stillDir = resolve(VIDEO, "out/stills");
mkdirSync(rawDir, { recursive: true });
mkdirSync(stillDir, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const overlaySource = ({ step, total, title, caption }) => {
  try {
    localStorage.setItem(
      "teeline-help-seen",
      JSON.stringify(["welcome.desk", "welcome.player"]),
    );
  } catch {
    // Storage disabled; the welcome may show and is dismissed from the recorder.
  }
  const paint = () => {
    if (document.getElementById("avp-root")) return;
    const style = document.createElement("style");
    style.textContent = `
      #avp-root { position: fixed; inset: 0; pointer-events: none; z-index: 2147483000;
        font-family: Geist, "Segoe UI", system-ui, sans-serif; }
      #avp-step { position: fixed; top: 128px; left: 32px; display: flex; align-items: center;
        gap: 12px; padding: 12px 20px; border-radius: 999px; background: rgba(16, 37, 27, .94);
        color: #eef0ea; font-size: 20px; font-weight: 600; letter-spacing: .02em;
        box-shadow: 0 8px 30px rgba(0,0,0,.3); }
      #avp-step b { color: #e0bc65; font-weight: 800; }
      #avp-demo { position: fixed; top: 128px; right: 36px; padding: 10px 18px; border-radius: 999px;
        border: 1px solid #e0bc65; color: #f1d88e; background: rgba(16, 37, 27, .92);
        font-size: 16px; font-weight: 700; letter-spacing: .14em; text-transform: uppercase; }
      #avp-caption { position: fixed; left: 50%; bottom: 48px; transform: translateX(-50%);
        max-width: 2000px; padding: 18px 30px; border-radius: 18px; background: rgba(12, 26, 19, .94);
        color: #eef0ea; font-size: 34px; line-height: 1.3; text-align: center;
        box-shadow: 0 12px 40px rgba(0,0,0,.4); transition: opacity .16s ease, top .22s ease, bottom .22s ease; }
      #avp-caption.top { top: 150px; bottom: auto; }
      #avp-spot { position: fixed; border-radius: 16px; box-shadow: 0 0 0 9999px rgba(6, 16, 11, .43);
        outline: 4px solid #e6ba4c; outline-offset: 3px;
        transition: all .16s ease; opacity: 0; }
      #avp-spot.on { opacity: 1; }
      #avp-cursor { position: fixed; left: 0; top: 0; width: 68px; height: 68px; opacity: 0;
        transition: transform .52s cubic-bezier(.22,.61,.36,1), opacity .2s ease; }
      #avp-cursor.on { opacity: 1; }
      #avp-cursor .ring { position: absolute; inset: 12px; border-radius: 50%;
        border: 4px solid #e0bc65; box-shadow: 0 0 0 7px rgba(224, 188, 101, .22), 0 2px 12px rgba(0,0,0,.35);
        animation: avp-pulse 1.8s ease-in-out infinite; }
      #avp-cursor .dot { position: absolute; left: 31px; top: 31px; width: 8px; height: 8px;
        border-radius: 50%; background: #e0bc65; box-shadow: 0 0 0 3px rgba(224, 188, 101, .3); }
      #avp-cursor .arrow { position: absolute; left: 8px; top: 8px; width: 34px; height: 34px;
        filter: drop-shadow(0 2px 4px rgba(0,0,0,.5)); }
      @keyframes avp-pulse { 0%,100% { transform: scale(1); opacity: 1; } 50% { transform: scale(1.12); opacity: .8; } }
      #avp-ripple { position: fixed; width: 20px; height: 20px; margin: -10px 0 0 -10px;
        border-radius: 50%; border: 4px solid #e0bc65; opacity: 0; }
      #avp-ripple.go { animation: avp-ripple .7s ease-out; }
      @keyframes avp-ripple { from { transform: scale(.4); opacity: .95; } to { transform: scale(3.2); opacity: 0; } }
    `;
    document.head.appendChild(style);

    const root = document.createElement("div");
    root.id = "avp-root";
    root.innerHTML = `
      <div id="avp-step"><b>${step}</b><span>of ${total}</span><span>·</span><span>${title}</span></div>
      <div id="avp-demo">Demo data</div>
      <div id="avp-caption">${caption}</div>
      <div id="avp-spot"></div>
      <div id="avp-cursor">
        <span class="ring"></span>
        <span class="dot"></span>
        <svg class="arrow" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M3 2.5 20.5 10 12 12.5 9.5 21 3 2.5Z" fill="#eef0ea" stroke="#10251b" stroke-width="1.6" stroke-linejoin="round"/>
        </svg>
      </div>
      <div id="avp-ripple"></div>
    `;
    document.body.appendChild(root);

    const rootEl = document.getElementById("avp-root");
    const captionEl = document.getElementById("avp-caption");
    const spotEl = document.getElementById("avp-spot");
    const cursorEl = document.getElementById("avp-cursor");
    const rippleEl = document.getElementById("avp-ripple");
    const contentEl = () => document.querySelector("main") ?? document.body.firstElementChild;

    window.__avp = {
      setCaption(text) {
        if (captionEl.textContent === text) return;
        captionEl.style.opacity = "0";
        setTimeout(() => {
          captionEl.textContent = text;
          captionEl.style.opacity = "1";
        }, 170);
      },
      captionTop(on) {
        captionEl.classList.toggle("top", Boolean(on));
      },
      cursorTo(x, y) {
        cursorEl.classList.add("on");
        cursorEl.style.transform = `translate(${x - 34}px, ${y - 34}px)`;
      },
      cursorOff() {
        cursorEl.classList.remove("on");
      },
      ripple(x, y) {
        rippleEl.style.left = `${x}px`;
        rippleEl.style.top = `${y}px`;
        rippleEl.classList.remove("go");
        void rippleEl.offsetWidth;
        rippleEl.classList.add("go");
      },
      spotlight(rect) {
        if (!rect) {
          spotEl.classList.remove("on");
          return;
        }
        spotEl.style.left = `${rect.x - 8}px`;
        spotEl.style.top = `${rect.y - 8}px`;
        spotEl.style.width = `${rect.width + 16}px`;
        spotEl.style.height = `${rect.height + 16}px`;
        spotEl.classList.add("on");
      },
      zoom(scale, rect) {
        const el = contentEl();
        if (!el) return;
        if (!scale || scale === 1 || !rect) {
          el.style.transition = "transform .62s cubic-bezier(.22,.61,.36,1)";
          el.style.transform = "scale(1)";
          return;
        }
        const box = el.getBoundingClientRect();
        const originX = rect.x + rect.width / 2 - box.left;
        const originY = rect.y + rect.height / 2 - box.top;
        el.style.transformOrigin = `${originX}px ${originY}px`;
        el.style.transition = "transform .62s cubic-bezier(.22,.61,.36,1)";
        el.style.transform = `scale(${scale})`;
      },
      ready: true,
    };
  };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", paint);
  } else {
    paint();
  }
};

async function dismissWelcome(page) {
  const gotIt = page.getByText("Got it", { exact: true }).first();
  if (await gotIt.count()) {
    await gotIt.click({ timeout: 2500 }).catch(() => {});
  }
}

function rectOf(element) {
  const box = element.getBoundingClientRect();
  return { x: box.x, y: box.y, width: box.width, height: box.height };
}

const browser = await chromium.launch();
const timing = {};

// Warm the route once without recording, so the page has compiled and the recorded load is short.
async function warm(route) {
  const context = await browser.newContext({ viewport: { width: 2560, height: 1440 } });
  const page = await context.newPage();
  await page.goto(`${BASE}${route}`, { waitUntil: "networkidle" }).catch(() => {});
  await page.waitForTimeout(600);
  await context.close();
}

for (const [index, scene] of steps.scenes.entries()) {
  if (only.length > 0 && !only.includes(scene.id)) continue;
  const sceneTimeline = timeline.scenes[scene.id];
  if (!sceneTimeline) throw new Error(`no timeline for ${scene.id}; run the audio step first`);

  if (scene.route) await warm(scene.route).catch(() => {});

  const context = await browser.newContext({
    viewport: { width: 2560, height: 1440 },
    recordVideo: { dir: rawDir, size: { width: 2560, height: 1440 } },
  });
  const contextStart = Date.now();
  await context.addInitScript(overlaySource, {
    step: index + 1,
    total: steps.scenes.length,
    title: scene.title,
    caption: scene.lines[0],
  });

  const page = await context.newPage();
  page.on("pageerror", (error) => console.warn(`  ! ${scene.id} page error: ${error.message}`));

  const target = scene.card
    ? `file:///${resolve(VIDEO, "cards", scene.card).replaceAll("\\", "/")}`
    : `${BASE}${scene.route}`;
  await page.goto(target, { waitUntil: "networkidle" });
  await dismissWelcome(page);
  await sleep(700);
  await page.waitForFunction(() => window.__avp?.ready === true);
  await page.evaluate(() => window.__avp?.captionTop(false));

  const events = [...(scene.events ?? [])].map((event) => {
    const line = sceneTimeline.lines[event.line];
    if (!line) throw new Error(`${scene.id}: event points at line ${event.line} that does not exist`);
    return { ...event, at: (event.when === "end" ? line.end : line.start) + (event.offset ?? 0) };
  });
  const captionAt = sceneTimeline.lines.map((line) => ({ at: line.start, text: line.text }));
  const schedule = [...captionAt.map((c) => ({ ...c, type: "caption" })), ...events.map((e) => ({ ...e, type: "event" }))]
    .sort((a, b) => a.at - b.at);

  const started = Date.now();
  // Every screen change gets a full-page beat before any focus move, and the voice has a pause in the
  // audio for page loads; the clock offset keeps the visuals aligned even when a load runs long.
  let clockOffsetMs = 1500;
  for (const item of schedule) {
    const due = item.type === "caption" ? item.at * 1000 : item.at * 1000 + clockOffsetMs;
    const wait = due - (Date.now() - started);
    if (wait > 0) await sleep(wait);
    try {
      if (item.type === "caption") {
        await page.evaluate((text) => window.__avp?.setCaption(text), item.text);
        continue;
      }
      if (item.route) {
        const line = sceneTimeline.lines[item.line];
        const pauseMs = Math.max(400, (line?.pauseAfter ?? 0.22) * 1000);
        const before = Date.now();
        await page.goto(`${BASE}${item.route}`, { waitUntil: "networkidle" });
        await dismissWelcome(page);
        await page.waitForFunction(() => window.__avp?.ready === true);
        await page.evaluate(() => {
          window.__avp?.spotlight(null);
          window.__avp?.zoom(1, null);
          window.__avp?.cursorOff();
          window.__avp?.captionTop(false);
        });
        await sleep(500);
        const over = Date.now() - before - pauseMs;
        if (over > 0) clockOffsetMs += over;
        continue;
      }
      let locator = null;
      if (item.target) {
        locator = page.locator(item.target).first();
        if ((await locator.count()) === 0) {
          if (!item.optional) console.warn(`  ! ${scene.id}: target not found "${item.target}"`);
          continue;
        }
        if (item.scroll) {
          await locator.scrollIntoViewIfNeeded({ timeout: 3000 }).catch(() => {});
          // Belt and braces: some controls sit in a transformed subtree where the Playwright scroll
          // silently does nothing, so scroll again through the DOM and confirm it landed.
          await locator
            .evaluate((el) => el.scrollIntoView({ block: "center", inline: "center" }))
            .catch(() => {});
          await sleep(320);
          const box = await locator.evaluate(rectOf).catch(() => null);
          if (box && (box.height === 0 || box.y + box.height < 0 || box.y > 1440)) {
            console.warn(`  ! ${scene.id}: "${item.target}" still off-screen after scroll`);
          }
        }
        await sleep(250);
      }
      const rect = locator ? await locator.evaluate(rectOf) : null;
      // Keep the caption off the control it would otherwise cover: try the bottom, fall back to the
      // top only when the target does not reach the top strip.
      if (rect) {
        const captionTopY = 1440 - 48 - 130;
        const overlapsBottom = rect.y + rect.height > captionTopY && rect.y < 1440 - 48;
        const overlapsTop = rect.y < 280 && rect.y + rect.height > 150;
        await page.evaluate((on) => window.__avp?.captionTop(on), overlapsBottom && !overlapsTop);
      }
      const actions = [];
      if (rect && item.cursor !== false) {
        actions.push(page.evaluate((r) => window.__avp?.cursorTo(r.x + r.width / 2, r.y + r.height / 2), rect));
      }
      if (rect && item.zoom) {
        actions.push(page.evaluate(({ scale, r }) => window.__avp?.zoom(scale, r), { scale: item.zoom, r: rect }));
      }
      await Promise.all(actions);
      // Let the move and the zoom settle, then measure again so the highlight lands exactly on the
      // control as it now sits on screen.
      await sleep(rect && item.zoom ? 660 : 140);
      const settled = locator ? await locator.evaluate(rectOf).catch(() => rect) : rect;
      if (settled && item.spotlight !== false && (item.spotlight || item.click || item.zoom)) {
        await page.evaluate((r) => window.__avp?.spotlight(r), settled);
        await sleep(160);
      }
      if (settled && item.click) {
        await sleep(120);
        await page.evaluate((r) => window.__avp?.ripple(r.x + r.width / 2, r.y + r.height / 2), settled);
        await locator.click({ timeout: 4000 }).catch((error) => {
          if (!item.optional) console.warn(`  ! ${scene.id}: click failed on "${item.target}": ${error.message}`);
        });
      }
      if (item.spotlight === false) {
        await page.evaluate(() => window.__avp?.spotlight(null));
      }
    } catch (error) {
      if (!item.optional) console.warn(`  ! ${scene.id}: ${error.message}`);
    }
  }

  const contentSeconds = (Date.now() - started) / 1000;
  const sceneSeconds = Math.max(sceneTimeline.duration + 0.6, contentSeconds + 0.2);
  await page.evaluate(() => {
    window.__avp?.spotlight(null);
    window.__avp?.zoom(1, null);
    window.__avp?.cursorOff();
    window.__avp?.captionTop(false);
  });
  await page.screenshot({ path: resolve(stillDir, `${scene.id}.png`) });
  // Wall time from the first settled frame to the last, used to find the content start inside the
  // recorded video, which drops idle frames and cannot be located from wall-clock timestamps alone.
  const contentWall = (Date.now() - started) / 1000;

  const video = page.video();
  await page.close();
  await context.close();
  if (video) {
    const out = resolve(rawDir, `${scene.id}.webm`);
    await video.saveAs(out);
    const rawDuration = durationOf(out);
    timing[scene.id] = {
      raw: out,
      audio: resolve(VIDEO, sceneTimeline.audio),
      trimStart: Math.max(0, rawDuration - contentWall - 0.25),
      seconds: sceneSeconds,
    };
  }
  console.log(`recorded ${scene.id} (${sceneSeconds.toFixed(1)}s)`);
}

const timingPath = resolve(VIDEO, "capture/timing.json");
let previous = {};
if (only.length > 0) {
  try {
    previous = JSON.parse(readFileSync(timingPath, "utf8"));
  } catch {
    previous = {};
  }
}
writeFileSync(timingPath, `${JSON.stringify({ ...previous, ...timing }, null, 2)}\n`);
await browser.close();
console.log("done");
