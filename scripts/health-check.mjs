#!/usr/bin/env node
/**
 * Live health check for the club site, its public read and the scorecard reader.
 *
 * Run it by hand before an event, and let GitHub Actions run it every 15 minutes during event week:
 *
 *   node scripts/health-check.mjs
 *   node scripts/health-check.mjs --json
 *
 * It only reads: GETs plus read-only RPCs. There are no dependencies beyond Node 22's global
 * fetch, so CI installs nothing. A hard check prints FAIL and makes the process exit 1. The reader
 * is a warning instead, because the scan service is allowed to sleep.
 *
 * The Supabase check is skipped unless HEALTH_SUPABASE_URL and HEALTH_SUPABASE_ANON_KEY are set.
 * SUPABASE_URL and SUPABASE_ANON_KEY are accepted as fallbacks for a local run. HEALTH_SITE_URL
 * overrides the live host, so the same file can check staging without an edit.
 *
 * The event check follows the site: it reads the featured event, or failing that the first event
 * open for entry, and proves that `/events` carries it. It names no club, no event and no date
 * window, so a check that passes this week does not fail the next event by design.
 */

const SITE = (process.env.HEALTH_SITE_URL || "https://golf.syntaxure.dev").replace(/\/+$/, "");
const READER = "https://reader.syntaxure.dev/health";
const TIMEOUT_MS = 20_000;
const TIME_ZONE = "Asia/Manila";

/** The public portfolio page the featured or open event must also appear on. */
const EVENT_PAGE = "/events";

/** [name, path, markers]. A marker is text the HTML must carry, so a 200 error page cannot pass. */
const CHECKS = [
  ["pairings", "/pairings", null],
  ["roster", "/roster", ["Player roster"]],
  ["leaderboard", "/leaderboard", ["Leaderboard"]],
  ["results", "/results", ["Awarding results"]],
  ["results_all", "/results/all", ["All scores"]],
  ["events", "/events", null],
  ["feedback", "/feedback", ["Send feedback"]],
  ["tv", "/tv", ["Clubhouse board"]],
  ["manifest", "/manifest.webmanifest", null],
  ["icon-192", "/icons/icon-192.png", null],
  ["icon-512", "/icons/icon-512.png", null],
  ["offline", "/offline", null],
];

const results = [];
const jsonOnly = process.argv.includes("--json");
const startedAt = new Date();
const started = Date.now();

const record = (name, status, detail) => results.push({ name, status, detail });

const excerpt = (text) => text.replace(/\s+/g, " ").trim().slice(0, 160);

const describeError = (error) => {
  if (error instanceof Error) {
    if (error.name === "TimeoutError") return `no response within ${TIMEOUT_MS / 1000}s`;
    const cause = error.cause;
    const code =
      cause && typeof cause === "object" && "code" in cause ? ` (${String(cause.code)})` : "";
    return `${error.message}${code}`;
  }
  return String(error);
};

/** Every request follows redirects and is cut off after 20 seconds. */
async function get(url, init = {}) {
  const requestStarted = Date.now();
  const response = await fetch(url, {
    redirect: "follow",
    ...init,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  return { response, ms: Date.now() - requestStarted };
}

async function checkHome() {
  const name = "home";
  try {
    const { response, ms } = await get(`${SITE}/`);
    const body = await response.text();
    if (response.status !== 200) {
      record(name, "fail", `returned ${response.status}, expected 200`);
      return;
    }
    const marker = ["Iloilo Golf", "TeeLine"].find((text) => body.includes(text));
    if (!marker) {
      record(name, "fail", `200 in ${ms}ms but the body has neither "Iloilo Golf" nor "TeeLine"`);
      return;
    }
    record(name, "pass", `200 in ${ms}ms, found "${marker}"`);
  } catch (error) {
    record(name, "fail", describeError(error));
  }
}

async function checkPath(name, path, markers = null) {
  try {
    const { response, ms } = await get(`${SITE}${path}`);
    if (response.status !== 200) {
      await response.arrayBuffer();
      record(name, "fail", `${path} returned ${response.status}, expected 200`);
      return;
    }
    if (markers) {
      const body = await response.text();
      const found = markers.find((text) => body.includes(text));
      if (!found) {
        record(
          name,
          "fail",
          `${path} 200 in ${ms}ms but the body has none of: ${markers.join(", ")}`,
        );
        return;
      }
      record(name, "pass", `${path} 200 in ${ms}ms, found "${found}"`);
      return;
    }
    const bytes = (await response.arrayBuffer()).byteLength;
    record(name, "pass", `${path} 200 in ${ms}ms, ${bytes} bytes`);
  } catch (error) {
    record(name, "fail", `${path} ${describeError(error)}`);
  }
}

async function checkMy() {
  const name = "my";
  try {
    const { response, ms } = await get(`${SITE}/my`);
    const finalUrl = response.url;
    await response.arrayBuffer();
    if (response.status !== 200) {
      record(name, "fail", `${finalUrl} returned ${response.status}, expected 200 after redirects`);
      return;
    }
    if (!finalUrl.includes("/login")) {
      record(name, "fail", `200 in ${ms}ms but ended at ${finalUrl}, expected a /login URL`);
      return;
    }
    record(name, "pass", `200 in ${ms}ms, ended at ${finalUrl}`);
  } catch (error) {
    record(name, "fail", describeError(error));
  }
}

/** The Manila date, as YYYY-MM-DD, because the event is played on Philippine time. */
function manilaToday() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const value = (type) => parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

function supabaseSettings() {
  const url = (process.env.HEALTH_SUPABASE_URL || process.env.SUPABASE_URL || "").trim();
  const key = (process.env.HEALTH_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || "").trim();
  return { url: url.replace(/\/+$/, ""), key };
}

/** A YYYY-MM-DD date, or "" when the value is not one. */
function isoDate(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : "";
}

/**
 * The events a visitor may see, normalised. `null` means a row cannot be shown at all, which is a
 * broken payload rather than an empty list. `chosen` is the featured event, else the first one open
 * for entry: the same rule the landing page and `/events` give a visitor.
 */
function readEventList(events) {
  const rows = [];
  for (const event of events) {
    if (typeof event !== "object" || event === null) return null;
    const row = event;
    const name = typeof row.name === "string" ? row.name.trim() : "";
    const rawDates = Array.isArray(row.dates) ? row.dates : [];
    const dates = rawDates.map(isoDate);
    if (!name || dates.length === 0 || dates.some((date) => date === "")) return null;
    rows.push({
      name,
      dates,
      featured: row.featured === true,
      entriesOpen: row.entriesOpen === true,
    });
  }
  const chosen = rows.find((row) => row.featured) ?? rows.find((row) => row.entriesOpen) ?? null;
  return { rows, chosen };
}

/** The featured/open read, from the showcase function with the older function as its fallback. */
async function readPublicEventRows(url, key) {
  const { response, ms } = await get(`${url}/rest/v1/rpc/public_showcase_events`, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: "{}",
  });
  const body = await response.text();
  if (response.status === 200) {
    try {
      const parsed = JSON.parse(body);
      if (Array.isArray(parsed)) return { rows: parsed, ms, source: "public_showcase_events" };
    } catch {
      // The older function may still answer; fall through to it.
    }
  }

  // Rollout fallback: a project without the showcase migration answers with a missing function.
  // The app falls back the same way.
  const legacy = await get(`${url}/rest/v1/rpc/public_events`, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: "{}",
  });
  const legacyBody = await legacy.response.text();
  if (legacy.response.status !== 200) {
    return {
      error: `public_showcase_events ${response.status}, public_events ${legacy.response.status}: ${excerpt(legacyBody)}`,
    };
  }
  try {
    const parsed = JSON.parse(legacyBody);
    if (Array.isArray(parsed)) {
      return { rows: parsed, ms: legacy.ms, source: "public_events" };
    }
  } catch {
    // Reported below with the body.
  }
  return { error: `200 but the body is not an array: ${excerpt(legacyBody)}` };
}

/** The event names are HTML-escaped on the page, so the comparison decodes the page once. */
function decodeHtml(value) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&#x27;/gi, "'");
}

async function checkPublicEvents() {
  const name = "public_events";
  const { url, key } = supabaseSettings();
  if (!url && !key) {
    record(name, "skip", "HEALTH_SUPABASE_URL and HEALTH_SUPABASE_ANON_KEY are not set");
    return;
  }
  if (!url || !key) {
    record(name, "fail", "only one of HEALTH_SUPABASE_URL and HEALTH_SUPABASE_ANON_KEY is set");
    return;
  }

  try {
    const read = await readPublicEventRows(url, key);
    if (read.error) {
      record(name, "fail", read.error);
      return;
    }

    const list = readEventList(read.rows);
    if (!list) {
      record(name, "fail", `200 in ${read.ms}ms but a row has no name or no usable dates`);
      return;
    }
    if (list.rows.length === 0) {
      record(name, "pass", `200 in ${read.ms}ms, no events announced; nothing to carry`);
      return;
    }
    if (list.rows.filter((row) => row.featured).length > 1) {
      record(name, "fail", `${list.rows.length} event(s) but more than one is featured`);
      return;
    }
    if (!list.chosen) {
      record(
        name,
        "pass",
        `200 in ${read.ms}ms, ${list.rows.length} event(s), none featured or open for entry right now`,
      );
      return;
    }

    const chosen = list.chosen;
    const from = [...chosen.dates].sort()[0];
    const to = [...chosen.dates].sort().at(-1);
    const today = manilaToday();
    const playing = today >= from && today <= to;
    const page = await get(`${SITE}${EVENT_PAGE}`);
    const html = decodeHtml(await page.response.text());
    if (page.response.status !== 200) {
      record(
        name,
        "fail",
        `${read.source} carries "${chosen.name}" but ${EVENT_PAGE} returned ${page.response.status}`,
      );
      return;
    }
    if (!html.includes(chosen.name)) {
      record(
        name,
        "fail",
        `${read.source} carries "${chosen.name}" but ${EVENT_PAGE} does not list it`,
      );
      return;
    }

    const when = playing ? "playing today" : `not playing today (${today})`;
    record(
      name,
      "pass",
      `200 in ${read.ms}ms, ${list.rows.length} event(s) from ${read.source}, ${chosen.featured ? "featured" : "open"} "${chosen.name}" ${from} to ${to}, ${when}, listed on ${EVENT_PAGE}`,
    );
  } catch (error) {
    record(name, "fail", describeError(error));
  }
}

async function checkReader() {
  const name = "reader";
  try {
    const { response, ms } = await get(READER);
    if (response.status === 200) {
      await response.arrayBuffer();
      record(name, "pass", `200 in ${ms}ms`);
      return;
    }
    record(name, "warn", `${response.status} in ${ms}ms, the reader may be asleep (not a failure)`);
  } catch (error) {
    record(name, "warn", `${describeError(error)}, the reader may be asleep (not a failure)`);
  }
}

await checkHome();
for (const [name, path, markers] of CHECKS) {
  await checkPath(name, path, markers);
}
await checkMy();
await checkPublicEvents();
await checkReader();

const summary = {
  passed: results.filter((check) => check.status === "pass").length,
  failed: results.filter((check) => check.status === "fail").length,
  warned: results.filter((check) => check.status === "warn").length,
  skipped: results.filter((check) => check.status === "skip").length,
};
const ok = summary.failed === 0;
const durationMs = Date.now() - started;
const labels = { pass: "PASS", fail: "FAIL", warn: "WARN", skip: "SKIP" };

if (jsonOnly) {
  console.log(
    JSON.stringify(
      {
        ok,
        site: SITE,
        startedAt: startedAt.toISOString(),
        durationMs,
        summary,
        checks: results,
      },
      null,
      2,
    ),
  );
} else {
  for (const check of results) {
    console.log(
      `${labels[check.status].padEnd(4)} ${check.name.padEnd(16)} ${check.detail}`,
    );
  }
  console.log("");
  console.log(
    `${summary.passed} passed, ${summary.failed} failed, ${summary.warned} warning(s), ${summary.skipped} skipped in ${(durationMs / 1000).toFixed(1)}s`,
  );
  console.log(ok ? "health check passed" : "health check failed");
}

process.exitCode = ok ? 0 : 1;
