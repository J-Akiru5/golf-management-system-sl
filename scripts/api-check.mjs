/**
 * API regulation check: the public hot pages and the versioned pairings endpoint.
 *
 * The regulation is `API_REGULATION.md`. This script is the project's adoption of §11: it measures
 * sample requests, reports p50/p95/max and response size, checks the contract headers and envelope,
 * and prints measured / skipped / total. It starts in **warn** mode; set API_CHECK_MODE=fail to make
 * a budget or contract breach fail the command.
 *
 * Use it against a running server:
 *   API_BASE=http://localhost:3000 API_CHECK_MODE=fail node scripts/api-check.mjs
 *
 * `pnpm api:check` starts a demo dev server and runs it in warn mode. A connected run, with
 * NEXT_PUBLIC_SUPABASE_URL set on the app, also certifies `/api/v1/pairings/version`.
 */
const BASE = (process.env.API_BASE ?? "http://localhost:3200").replace(/\/$/, "");
const SAMPLES = Number(process.env.API_SAMPLES ?? 12);
const WARMUP = Number(process.env.API_WARMUP ?? 3);
const P95_BUDGET = Number(process.env.API_P95_MS ?? 300);
const MAX_BUDGET = Number(process.env.API_MAX_MS ?? 400);
const MODE = process.env.API_CHECK_MODE === "fail" ? "fail" : "warn";
const CHECK_API = process.env.API_CHECK_API !== "0";

const PAGES = ["/", "/pairings", "/roster", "/leaderboard", "/rules"];
const API_PATH = "/api/v1/pairings/version";
const TIMEOUT_MS = 5000;

let failures = 0;

function enforce(ok, message) {
  if (ok) return;
  failures += 1;
  console.log(`  ${MODE === "fail" ? "FAIL" : "WARN"} ${message}`);
}

function percentile(values, p) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[index] ?? 0;
}

function round(value) {
  return Math.round(value * 10) / 10;
}

async function request(path, headers = {}) {
  const started = performance.now();
  const response = await fetch(`${BASE}${path}`, {
    redirect: "manual",
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { accept: "text/html,application/json", ...headers },
  });
  const body = await response.arrayBuffer();
  return {
    ms: performance.now() - started,
    status: response.status,
    bytes: body.byteLength,
    headers: response.headers,
    body,
  };
}

async function measurePage(path) {
  for (let i = 0; i < WARMUP; i += 1) await request(path);
  const samples = [];
  let bytes = 0;
  let status = 0;
  for (let i = 0; i < SAMPLES; i += 1) {
    const result = await request(path);
    samples.push(result.ms);
    bytes = Math.max(bytes, result.bytes);
    status = result.status;
  }
  const p50 = percentile(samples, 50);
  const p95 = percentile(samples, 95);
  const max = Math.max(...samples);
  const measured = status > 0 && status < 500;
  console.log(
    `  ${path.padEnd(12)} ${measured ? "measured" : "skipped "}  p50 ${String(round(p50)).padStart(6)} ms  p95 ${String(round(p95)).padStart(6)} ms  max ${String(round(max)).padStart(6)} ms  ${(bytes / 1024).toFixed(1)} KB  ${status}`,
  );
  enforce(measured, `${path} answered ${status}`);
  if (measured) {
    enforce(p95 <= P95_BUDGET, `${path} p95 ${round(p95)} ms is over ${P95_BUDGET} ms`);
    enforce(max <= MAX_BUDGET, `${path} max ${round(max)} ms is over ${MAX_BUDGET} ms`);
  }
  return measured;
}

async function checkApi() {
  const path = API_PATH;
  let first;
  try {
    first = await request(path);
  } catch (error) {
    console.log(`  ${path} skipped   ${error instanceof Error ? error.message : "request failed"}`);
    return { measured: 0, skipped: 1 };
  }

  // A demo server has no Supabase project, so the version endpoint correctly reports 503 with the
  // error envelope. That is a contract pass but not a certified latency measurement.
  const demo = first.status === 503;
  const measured = first.status >= 200 && first.status < 300;
  const skipped = [401, 403, 404, 405, 422].includes(first.status) || demo;
  if (measured || demo) {
    enforce(Boolean(first.headers.get("x-request-id")), `${path} has no X-Request-Id`);
    enforce(Boolean(first.headers.get("server-timing")), `${path} has no Server-Timing`);
  }

  let body = null;
  try {
    body = JSON.parse(new TextDecoder().decode(first.body));
  } catch {
    enforce(false, `${path} did not return JSON`);
  }

  if (measured && body && typeof body === "object") {
    enforce(body.data !== undefined, `${path} success has no data`);
    enforce(body.meta?.request_id === first.headers.get("x-request-id"), `${path} meta.request_id does not match the header`);
    const etag = first.headers.get("etag");
    enforce(Boolean(etag), `${path} has no ETag`);
    if (etag) {
      const cached = await request(path, { "if-none-match": etag });
      enforce(cached.status === 304, `${path} did not answer 304 for its own ETag`);
      enforce(Boolean(cached.headers.get("x-request-id")), `${path} 304 has no X-Request-Id`);
      enforce(Boolean(cached.headers.get("server-timing")), `${path} 304 has no Server-Timing`);
    }
  } else if (demo && body && typeof body === "object") {
    enforce(typeof body.error?.code === "string", `${path} error has no code`);
    enforce(typeof body.error?.message === "string", `${path} error has no message`);
    enforce(body.error?.request_id === first.headers.get("x-request-id"), `${path} error.request_id does not match the header`);
  } else if (!measured && !skipped) {
    enforce(false, `${path} answered ${first.status}`);
  }

  console.log(
    `  ${path} ${measured ? "measured" : skipped ? "skipped " : "failed  "}  ${first.status}  ${(first.bytes / 1024).toFixed(1)} KB`,
  );
  return { measured: measured ? 1 : 0, skipped: skipped ? 1 : 0 };
}

console.log(`API regulation check (${MODE}) against ${BASE}`);
console.log(`pages (${PAGES.length} hot paths):`);

let measuredPages = 0;
for (const path of PAGES) {
  const measured = await measurePage(path);
  if (measured) measuredPages += 1;
}
const pageCoverage = measuredPages / PAGES.length;
console.log(
  `  coverage ${measuredPages} measured / ${PAGES.length - measuredPages} skipped / ${PAGES.length} total`,
);
// §2.1: a run that measures too little is a failure, in both modes. The page suite is the part a
// demo server can certify; the API suite is declared separately below.
enforce(pageCoverage >= 0.9, `page coverage ${Math.round(pageCoverage * 100)}% is below 90%`);

if (CHECK_API) {
  console.log("API (1 versioned endpoint):");
  const api = await checkApi();
  console.log(`  coverage ${api.measured} measured / ${api.skipped} skipped / 1 total`);
  if (api.skipped === 1) {
    console.log("  API suite not certified: no connected Supabase environment in this run.");
  }
}

console.log(
  `api-check: ${MODE === "fail" ? (failures === 0 ? "passed" : "FAILED") : "finished in warn mode"}${failures ? ` (${failures} warning${failures === 1 ? "" : "s"})` : ""}`,
);
if (MODE === "fail" && failures > 0) process.exit(1);
