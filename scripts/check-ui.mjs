/**
 * One command for the browser checks: start the dev server, wait for it, run `scripts/verify-ui.mjs`,
 * stop the server. CI runs this same file, so a local pass and a CI pass mean the same thing.
 *
 * Usage:
 *   pnpm check:ui
 *
 * If something already answers on the port, that server is used and left running. Set UI_PORT to
 * move off 3100. The server's output goes to `.tmp/dev-server.log`. The exit code is the browser
 * checks' exit code; a server that never comes up is a failure, never a skip.
 */
import { spawn, spawnSync } from "node:child_process";
import { createWriteStream, mkdirSync } from "node:fs";

const PORT = process.env.UI_PORT ?? "3100";
const BASE = `http://localhost:${PORT}`;
const READY_PATH = "/players";
const LOG = ".tmp/dev-server.log";
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

let server = null;
if (await answers()) {
  console.log(`check:ui: using the server already running at ${BASE}`);
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
      console.log(`check:ui: dev server ready after ${waited}s`);
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  if (!ready) {
    stop(server);
    console.error(`check:ui: the dev server never answered at ${BASE}${READY_PATH}; see ${LOG}`);
    process.exit(1);
  }
}

const run = spawnSync(process.execPath, ["scripts/verify-ui.mjs"], {
  stdio: "inherit",
  env: { ...process.env, UI_BASE: BASE },
});
stop(server);

const code = run.status ?? 1;
console.log(`check:ui: browser checks ${code === 0 ? "passed" : "FAILED"} against ${BASE}`);
process.exit(code);
