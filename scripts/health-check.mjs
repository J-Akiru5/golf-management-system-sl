#!/usr/bin/env node
/**
 * Live health check for the club site, its public read and the scorecard reader.
 *
 * Run it by hand before an event, and let GitHub Actions run it every 15 minutes during event week:
 *
 *   node scripts/health-check.mjs
 *   node scripts/health-check.mjs --json
 *
 * It only reads: GETs plus one read-only RPC. There are no dependencies beyond Node 22's global
 * fetch, so CI installs nothing. A hard check prints FAIL and makes the process exit 1. The reader
 * is a warning instead, because the scan service is allowed to sleep.
 *
 * The Supabase check is skipped unless HEALTH_SUPABASE_URL and HEALTH_SUPABASE_ANON_KEY are set.
 * SUPABASE_URL and SUPABASE_ANON_KEY are accepted as fallbacks for a local run.
 */

const SITE = "https://golf.syntaxure.dev";
const READER = "https://reader.syntaxure.dev/health";
const TIMEOUT_MS = 20_000;
const TIME_ZONE = "Asia/Manila";

/** The event the public payload must carry while it is being played. */
const EVENT_WINDOW = {
  name: "Bamboo Tee",
  from: "2026-11-10",
  to: "2026-11-20",
};

const CHECKS = [
  ["pairings", "/pairings"],
  ["leaderboard", "/leaderboard"],
  ["manifest", "/manifest.webmanifest"],
  ["icon-192", "/icons/icon-192.png"],
  ["icon-512", "/icons/icon-512.png"],
  ["offline", "/offline"],
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

async function checkPath(name, path) {
  try {
    const { response, ms } = await get(`${SITE}${path}`);
    const bytes = (await response.arrayBuffer()).byteLength;
    if (response.status !== 200) {
      record(name, "fail", `${path} returned ${response.status}, expected 200`);
      return;
    }
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
    const { response, ms } = await get(`${url}/rest/v1/rpc/public_events`, {
      method: "POST",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: "{}",
    });
    const body = await response.text();
    if (response.status !== 200) {
      record(name, "fail", `returned ${response.status} in ${ms}ms: ${excerpt(body)}`);
      return;
    }

    let events;
    try {
      events = JSON.parse(body);
    } catch {
      record(name, "fail", `200 but the body is not JSON: ${excerpt(body)}`);
      return;
    }
    if (!Array.isArray(events)) {
      record(name, "fail", `200 but the body is not an array: ${excerpt(body)}`);
      return;
    }

    const names = events
      .map((event) => (event && typeof event.name === "string" ? event.name : ""))
      .filter(Boolean);
    const today = manilaToday();
    const inWindow = today >= EVENT_WINDOW.from && today <= EVENT_WINDOW.to;
    const wanted = EVENT_WINDOW.name.toLowerCase();

    if (inWindow && !names.some((eventName) => eventName.toLowerCase().includes(wanted))) {
      record(
        name,
        "fail",
        `200 in ${ms}ms, ${names.length} event(s), but no ${EVENT_WINDOW.name} during the event window: ${excerpt(names.join(", "))}`,
      );
      return;
    }

    const suffix = inWindow
      ? `, ${EVENT_WINDOW.name} present`
      : `, ${EVENT_WINDOW.name} not required today (${today})`;
    record(name, "pass", `200 in ${ms}ms, ${names.length} event(s)${suffix}`);
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
for (const [name, path] of CHECKS) {
  await checkPath(name, path);
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
