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
const ffmpeg =
  process.env.FFMPEG ?? (existsSync(resolve(shim, "ffmpeg.exe")) ? resolve(shim, "ffmpeg.exe") : "ffmpeg");

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

/**
 * Finds the start marker in a recording. The video clock slows down whenever the page paints
 * nothing, so wall-clock offsets cannot say where the scene content begins; the bright frame the
 * overlay flashes before the clock starts can. Returns seconds into the file, or null.
 */
const flashAt = (file) => {
  try {
    const bytes = execFileSync(
      ffmpeg,
      ["-v", "error", "-i", file, "-vf", "fps=25,scale=1:1", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
      { maxBuffer: 64 * 1024 * 1024 },
    );
    let last = -1;
    for (let i = 0; i * 3 + 2 < bytes.length; i += 1) {
      const r = bytes[i * 3];
      const g = bytes[i * 3 + 1];
      const b = bytes[i * 3 + 2];
      if (r > 170 && b > 170 && g < 90) last = i;
    }
    // The last flash frame is the reliable edge: a slow capture can miss the start of the flash but
    // cannot miss its end, and the clock starts fractionally after the flash finishes.
    return last >= 0 ? last / 25 : null;
  } catch {
    return null;
  }
};
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
        box-shadow: 0 12px 40px rgba(0,0,0,.4); transition: opacity .12s ease, top .18s ease, bottom .18s ease; }
      #avp-caption.top { top: 150px; bottom: auto; }
      #avp-spot { position: fixed; border-radius: 16px; box-shadow: 0 0 0 9999px rgba(6, 16, 11, .43);
        outline: 4px solid #e6ba4c; outline-offset: 3px;
        transition: opacity .12s ease; opacity: 0; }
      #avp-spot.on { opacity: 1; }
      #avp-cursor { position: fixed; left: 0; top: 0; width: 68px; height: 68px; opacity: 0;
        transition: transform .45s cubic-bezier(.22,.61,.36,1), opacity .18s ease; }
      #avp-cursor.on { opacity: 1; }
      #avp-cursor .ring { position: absolute; inset: 12px; border-radius: 50%;
        border: 4px solid #e0bc65; box-shadow: 0 0 0 7px rgba(224, 188, 101, .22), 0 2px 12px rgba(0,0,0,.35);
        animation: avp-pulse 1.8s ease-in-out infinite; }
      #avp-cursor .dot { position: absolute; left: 31px; top: 31px; width: 8px; height: 8px;
        border-radius: 50%; background: #e0bc65; box-shadow: 0 0 0 3px rgba(224, 188, 101, .3); }
      #avp-cursor .arrow { position: absolute; left: 8px; top: 8px; width: 34px; height: 34px;
        filter: drop-shadow(0 2px 4px rgba(0,0,0,.5)); }
      @keyframes avp-pulse { 0%,100% { transform: scale(1); opacity: 1; } 50% { transform: scale(1.12); opacity: .8; } }
      /* A pixel nobody can see, animated every frame: it keeps the compositor producing frames so the
         recorded video's clock tracks wall time instead of compressing idle stretches. */
      #avp-beat { position: fixed; right: 0; bottom: 0; width: 2px; height: 2px; background: #0c1a13;
        animation: avp-beat .3s linear infinite alternate; }
      @keyframes avp-beat { from { opacity: .88; } to { opacity: 1; } }
      /* Bright marker for the first frame of the scene; the recorder finds it with ffmpeg and trims
         to it, so the picture and the voice cannot start apart. */
      #avp-flash { position: fixed; inset: 0; background: #ff00ff; display: none; }
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
      <div id="avp-beat"></div>
      <div id="avp-flash"></div>
    `;
    document.body.appendChild(root);

    const rootEl = document.getElementById("avp-root");
    const captionEl = document.getElementById("avp-caption");
    const spotEl = document.getElementById("avp-spot");
    const cursorEl = document.getElementById("avp-cursor");
    const rippleEl = document.getElementById("avp-ripple");
    const contentEl = () => document.querySelector("main") ?? document.body.firstElementChild;
    // The content element carries one absolute transform: translate(X, Y) scale(S) with origin 0 0.
    // Tracking it lets every target rect be converted to layout coordinates, so the ring geometry can
    // be predicted exactly instead of measured late and snapped.
    let curS = 1;
    let curX = 0;
    let curY = 0;
    const SPOT_SPREAD = 8;
    const spotTransition = "transform .5s cubic-bezier(.22,.61,.36,1), opacity .12s ease";

    const setSpotGeometry = (rect) => {
      spotEl.style.transition = "none";
      spotEl.style.transform = "none";
      spotEl.style.transformOrigin = "center";
      spotEl.style.left = `${rect.x - SPOT_SPREAD}px`;
      spotEl.style.top = `${rect.y - SPOT_SPREAD}px`;
      spotEl.style.width = `${rect.width + SPOT_SPREAD * 2}px`;
      spotEl.style.height = `${rect.height + SPOT_SPREAD * 2}px`;
      void spotEl.offsetWidth;
      spotEl.style.transition = spotTransition;
    };

    window.__avp = {
      setCaption(text) {
        if (captionEl.textContent === text) return;
        captionEl.style.opacity = "0";
        setTimeout(() => {
          captionEl.textContent = text;
          captionEl.style.opacity = "1";
        }, 110);
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
        setSpotGeometry(rect);
        spotEl.classList.add("on");
      },
      flash(ms) {
        const el = document.getElementById("avp-flash");
        if (!el) return;
        el.style.display = "block";
        setTimeout(() => {
          el.style.display = "none";
        }, ms);
      },
      /**
       * Reveal the ring at `to`, travelling from `from` with the same curve the zoom uses, so the
       * ring and the control stay locked together for the whole move instead of the ring waiting for
       * the zoom to finish.
       */
      spotlightTo(from, to) {
        if (!to) {
          spotEl.classList.remove("on");
          return;
        }
        setSpotGeometry(to);
        spotEl.classList.add("on");
        const moved =
          from &&
          (Math.abs(from.x - to.x) > 0.5 ||
            Math.abs(from.y - to.y) > 0.5 ||
            Math.abs(from.width - to.width) > 0.5 ||
            Math.abs(from.height - to.height) > 0.5);
        if (!moved) return;
        const dx = from.x + from.width / 2 - (to.x + to.width / 2);
        const dy = from.y + from.height / 2 - (to.y + to.height / 2);
        const sx = (from.width + SPOT_SPREAD * 2) / (to.width + SPOT_SPREAD * 2);
        const sy = (from.height + SPOT_SPREAD * 2) / (to.height + SPOT_SPREAD * 2);
        spotEl.style.transition = "none";
        spotEl.style.transform = `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`;
        void spotEl.offsetWidth;
        spotEl.style.transition = spotTransition;
        spotEl.style.transform = "none";
      },
      /**
       * Scale the content so the target is magnified in place, or centred when it is too large to
       * fit the frame. Returns the target's exact rect after the move.
       */
      zoomTo(scale, rect) {
        const el = contentEl();
        if (!el || !rect) return rect;
        const box = el.getBoundingClientRect();
        const layoutX = box.left - curX;
        const layoutY = box.top - curY;
        const lw = rect.width / curS;
        const lh = rect.height / curS;
        // box.left/top already carry the current translate, so the local rect is just the visual
        // offset divided by the current scale.
        const lx = (rect.x - box.left) / curS;
        const ly = (rect.y - box.top) / curS;
        // Never scale past what reads well on screen: oversized panels stay at 1:1.
        const fit = Math.max(1, Math.min((window.innerWidth * 0.92) / lw, (window.innerHeight * 0.86) / lh));
        const s = Math.min(scale, fit);
        const oversized = lw > window.innerWidth * 0.92 || lh > window.innerHeight * 0.86;
        const centreX = oversized ? window.innerWidth / 2 : rect.x + rect.width / 2;
        const centreY = oversized ? window.innerHeight / 2 : rect.y + rect.height / 2;
        let X = centreX - layoutX - s * (lx + lw / 2);
        const Y = centreY - layoutY - s * (ly + lh / 2);
        // A target on the left half must not drag the page's left edge in under the rail; nudge the
        // frame right instead. Right-half targets may pan past it, which reads as a camera move.
        if (rect.x + rect.width / 2 < window.innerWidth * 0.5) {
          X = Math.max(X, 96 - layoutX);
        }
        el.style.transformOrigin = "0 0";
        el.style.willChange = "transform";
        el.style.backfaceVisibility = "hidden";
        el.style.transition = "transform .5s cubic-bezier(.22,.61,.36,1)";
        el.style.transform = `translate(${X}px, ${Y}px) scale(${s})`;
        curS = s;
        curX = X;
        curY = Y;
        return { x: layoutX + X + s * lx, y: layoutY + Y + s * ly, width: lw * s, height: lh * s };
      },
      zoom(scale, rect) {
        const el = contentEl();
        if (!el) return;
        if (!scale || scale === 1 || !rect) {
          el.style.transition = "transform .5s cubic-bezier(.22,.61,.36,1)";
          el.style.transform = "none";
          curS = 1;
          curX = 0;
          curY = 0;
          return;
        }
        return window.__avp.zoomTo(scale, rect);
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
    // The delivered cut is 1080p, so raster at 0.75x: the layout stays 2560 wide, the screencast has
    // 44 per cent less to rasterise, and the recorder keeps up during the moves instead of dropping
    // to a handful of frames a second.
    deviceScaleFactor: 0.75,
    recordVideo: { dir: rawDir, size: { width: 1920, height: 1080 } },
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

  // Flash a marker frame, then start the clock. The recorder finds the flash in the recording and
  // trims to it, so the voice and the picture always begin together.
  await page.evaluate(() => window.__avp?.flash(300));
  await sleep(320);
  const started = Date.now();
  // Every screen change gets a full-page beat before any focus move, and the voice has a pause in the
  // audio for page loads; the clock offset keeps the visuals aligned even when a load runs long.
  let clockOffsetMs = 1200;
  // Text selectors cost a few hundred milliseconds to resolve, so an event that starts on the line
  // would show its ring late. Starting a touch early puts the ring up exactly with the words.
  const eventLeadMs = 350;
  const trace = (label, at) => {
    if (process.env.AVP_TRACE) {
      console.log(`      ${label} at ${(((at ?? Date.now()) - started) / 1000).toFixed(2)}`);
    }
  };
  const firstEvent = schedule.find((s) => s.type === "event" && s.target);
  const cache = new Map();
  /**
   * Resolving a text selector and scrolling a control into view costs a few hundred milliseconds.
   * Doing it while the page is idle, just before the line it belongs to, means the ring can go up the
   * moment its line starts instead of after the query has finished.
   */
  const prefetch = async (item) => {
    if (!item?.target || cache.has(item)) return;
    const locator = page.locator(item.target).first();
    try {
      if ((await locator.count()) === 0) {
        cache.set(item, { locator: null, rect: null });
        return;
      }
      if (item.scroll) {
        await locator
          .evaluate((el) => el.scrollIntoView({ block: "center", inline: "center" }))
          .catch(() => {});
        await sleep(120);
      }
      const rect = await locator.evaluate(rectOf).catch(() => null);
      cache.set(item, { locator, rect });
    } catch {
      cache.set(item, { locator: null, rect: null });
    }
  };
  if (firstEvent) await prefetch(firstEvent);
  for (const item of schedule) {
    const due = item.type === "caption" ? item.at * 1000 : item.at * 1000 + clockOffsetMs - eventLeadMs;
    const wait = due - (Date.now() - started);
    if (wait > 0) await sleep(wait);
    if (process.env.AVP_TRACE && item.type === "event") {
      console.log(
        `    trace ${scene.id} line ${item.line} ${item.target ?? item.route ?? ""} due ${(due / 1000).toFixed(2)} start ${((Date.now() - started) / 1000).toFixed(2)}`,
      );
    }
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
        // The page changed, so every cached rect is stale.
        cache.clear();
        const idx = schedule.indexOf(item);
        const next = schedule.slice(idx + 1).find((s) => s.type === "event" && s.target);
        if (next) await prefetch(next);
        continue;
      }
      let locator = null;
      let rect = null;
      if (item.target) {
        if (!cache.has(item)) await prefetch(item);
        const hit = cache.get(item);
        locator = hit?.locator ?? null;
        rect = hit?.rect ?? null;
        if (!locator) {
          if (!item.optional) console.warn(`  ! ${scene.id}: target not found "${item.target}"`);
          continue;
        }
      }
      let finalRect = rect;
      if (rect && item.zoom && item.zoom !== 1) {
        finalRect =
          (await page.evaluate(({ scale, r }) => window.__avp?.zoomTo(scale, r) ?? r, {
            scale: item.zoom,
            r: rect,
          })) ?? rect;
      } else if (item.zoom === 1) {
        await page.evaluate(() => window.__avp?.zoom(1, null));
      }
      const wantSpot =
        Boolean(rect) && item.spotlight !== false && Boolean(item.spotlight || item.click || item.zoom);
      const framed = finalRect ?? rect;
      trace(`measured line ${item.line}`);
      // Keep the caption off the control it would otherwise cover: try the bottom, fall back to the
      // top only when the target does not reach the top strip.
      if (framed) {
        const captionTopY = 1440 - 48 - 130;
        const overlapsBottom = framed.y + framed.height > captionTopY && framed.y < 1440 - 48;
        const overlapsTop = framed.y < 280 && framed.y + framed.height > 150;
        await page.evaluate((on) => window.__avp?.captionTop(on), overlapsBottom && !overlapsTop);
      }
      // Ring and zoom start together, and the ring travels on the same curve, so it is already on the
      // control when the zoom lands. Nothing waits, nothing has to catch up.
      if (wantSpot) {
        await page.evaluate(({ from, to }) => window.__avp?.spotlightTo(from, to), {
          from: rect,
          to: finalRect ?? rect,
        });
      }
      if (framed && item.cursor !== false) {
        await page.evaluate((r) => window.__avp?.cursorTo(r.x + r.width / 2, r.y + r.height / 2), framed);
      }
      const moving = Boolean(rect && item.zoom && item.zoom !== 1);
      await sleep(moving ? 520 : rect ? 100 : 0);
      trace("settled");
      if (rect && item.click) {
        await sleep(100);
        await page.evaluate((r) => window.__avp?.ripple(r.x + r.width / 2, r.y + r.height / 2), framed ?? rect);
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
    const idx = schedule.indexOf(item);
    const next = schedule.slice(idx + 1).find((s) => s.type === "event" && s.target);
    if (next) await prefetch(next);
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
    const marked = flashAt(out);
    if (marked === null) console.warn(`  ! ${scene.id}: start marker not found in the recording`);
    timing[scene.id] = {
      raw: out,
      audio: resolve(VIDEO, sceneTimeline.audio),
      trimStart: marked !== null ? marked + 0.08 : Math.max(0, rawDuration - contentWall - 0.25),
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
