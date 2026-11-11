/**
 * One command for the API regulation check: start a demo dev server, run `scripts/api-check.mjs`
 * against it, stop the server. CI runs this same file.
 *
 * Usage:
 *   pnpm api:check
 *   API_CHECK_MODE=fail pnpm api:check
 *   API_BASE=https://staging.example pnpm api:check     # measure a server already running
 *
 * The dev server is on 3200 by default; set API_PORT to move it. A connected run is the only one
 * that can certify the version endpoint, because the demo build has no Supabase project. The page
 * suite is always measured; the endpoint suite reports itself as skipped in demo mode.
 */
import { spawn, spawnSync } from "node:child_process";
import { createWriteStream, mkdirSync } from "node:fs";

const PORT = process.env.API_PORT ?? "3200";
const BASE = `http://localhost:${PORT}`;
const READY_PATH = "/";
const LOG = ".tmp/api-dev-server.log";
const WAIT_SECONDS = 180;

async function answers() {
  try {
    const res = await fetch(`${BASE}${READY_PATH}`, { signal: AbortSignal.timeout(5000) });
    return res.ok;
  } catch {
    return false;
  }
}

function stop(child) {
  if (!child?.pid) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
  } else {
    try {
      process.kill(-child.pid, "SIGTERM");
    } catch {
      // already gone
    }
  }
}

function runCheck(base) {
  return spawnSync(process.execPath, ["scripts/api-check.mjs"], {
    stdio: "inherit",
    env: { ...process.env, API_BASE: base },
  });
}

if (process.env.API_BASE) {
  const run = runCheck(process.env.API_BASE);
  process.exit(run.status ?? 1);
}

let server = null;
if (await answers()) {
  console.log(`api:check: using the server already running at ${BASE}`);
} else {
  mkdirSync(".tmp", { recursive: true });
  const log = createWriteStream(LOG);
  server = spawn("pnpm", ["dev", "--port", PORT], {
    shell: true,
    detached: process.platform !== "win32",
    stdio: ["ignore", "pipe", "pipe"],
  });
  server.stdout.pipe(log);
  server.stderr.pipe(log);
  let exited = false;
  server.on("exit", () => {
    exited = true;
  });
  process.on("SIGINT", () => {
    stop(server);
    process.exit(130);
  });

  let ready = false;
  for (let waited = 0; waited < WAIT_SECONDS; waited += 2) {
    if (exited) break;
    if (await answers()) {
      ready = true;
      console.log(`api:check: dev server ready after ${waited}s`);
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  if (!ready) {
    stop(server);
    console.error(`api:check: the dev server never answered at ${BASE}${READY_PATH}; see ${LOG}`);
    process.exit(1);
  }
}

const run = runCheck(BASE);
stop(server);

const code = run.status ?? 1;
console.log(`api:check: ${code === 0 ? "passed" : "FAILED"} against ${BASE}`);
process.exit(code);
