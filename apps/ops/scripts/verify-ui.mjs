/**
 * Browser checks for the workspace app.
 *
 * `pnpm --filter @teeline/ops test` renders components in jsdom, which cannot say whether a page
 * reaches a browser in a usable state. This script loads every route in Chromium at a desktop width
 * and a phone width, in both themes, and fails on a response that is not 200, a page with no visible
 * `h1`, a page that scrolls sideways, a console error or a failed same-origin request. Then it drives
 * the demo flows the portal exists for: a new document, a pipeline move, a new task and a new member,
 * and the last-owner rule.
 *
 * Usage:
 *   pnpm --filter @teeline/ops check:ui
 *
 * The script starts its own `next dev` on a free port with OPS_ENABLED=1 and OPS_DEMO=1, waits for it,
 * runs the checks and stops it again, on failure too. `UI_PORT=3300` forces a port. `UI_ROUTE=/board`
 * checks one route while you are working on it.
 *
 * Everything runs on the in-memory demo data, so no database is involved and nothing the checks write
 * survives the run. Demo mode also needs a build that is not production and no Supabase URL in the
 * environment; that is confirmed before the first page is loaded, so a run can never quietly test
 * something else.
 *
 * The flag-off check at the end starts a second, short-lived server with OPS_ENABLED=0. It is a real
 * server rather than the gate's pure function, so the answer covers the route as a browser sees it.
 *
 * The server's own output goes to `.tmp/ops-ui-dev-server-main.log` and
 * `.tmp/ops-ui-dev-server-flag-off.log` at the repository root.
 */
import { spawn, spawnSync } from "node:child_process";
import { createWriteStream, existsSync, mkdirSync } from "node:fs";
import { createServer } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const APP_ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const LOG_DIR = path.resolve(APP_ROOT, "..", "..", ".tmp");
const NEXT_BIN = path.join(APP_ROOT, "node_modules", "next", "dist", "bin", "next");

/** The theme control stores its choice here; the boot script reads it before the first paint. */
const THEME_KEY = "teeline-ops-theme";
/** A seeded demo document, from apps/ops/src/lib/docs/repo.ts. */
const DEMO_DOC_ID = "11111111-1111-4111-8111-111111111111";

const ROUTES = [
  "/",
  "/docs",
  `/docs/${DEMO_DOC_ID}`,
  "/board",
  "/tasks",
  "/settings",
  "/settings/members",
];

const VIEWPORTS = [
  { name: "desktop", width: 1280, height: 800 },
  { name: "phone", width: 390, height: 844 },
];

const THEMES = ["light", "dark"];

const READY_SECONDS = 240;
const VISIBLE_HEADING_MS = 20000;
const ROUTE_PAD = Math.max(...ROUTES.map((route) => route.length)) + 2;

/** One route only, for working on a single page: UI_ROUTE=/board. */
const singleRoute = process.env.UI_ROUTE?.trim() ? process.env.UI_ROUTE.trim() : null;

let pass = 0;
let fail = 0;
const failures = [];
/** The origin the browser is talking to; set again for each short-lived server. */
let origin = "";
/** Servers that must be stopped however this run ends. */
const servers = [];

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function check(where, what, ok, detail = "") {
  if (ok) {
    pass += 1;
    return true;
  }
  fail += 1;
  const line = `${where}  ${what}${detail ? `  [${trim(detail)}]` : ""}`;
  failures.push(line);
  console.log(`FAIL  ${line}`);
  return false;
}

/** Console and error text can be a whole React diff; a few hundred characters is enough to act on. */
function trim(text, limit = 320) {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length <= limit ? flat : `${flat.slice(0, limit)}...`;
}

function note(where, text) {
  pass += 1;
  console.log(`PASS  ${where}  ${text}`);
}

async function freePort() {
  return await new Promise((resolve, reject) => {
    const probe = createServer();
    probe.unref();
    probe.on("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      const port = typeof address === "object" && address !== null ? address.port : 0;
      probe.close(() => (port > 0 ? resolve(port) : reject(new Error("No free port."))));
    });
  });
}

function stopServer(entry) {
  if (entry === null) return;
  const { child } = entry;
  if (child.pid === undefined || child.exitCode !== null) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
  } else {
    try {
      process.kill(-child.pid, "SIGTERM");
    } catch {
      // Already gone.
    }
  }
}

function stopAllServers() {
  for (const entry of servers) stopServer(entry);
}

/**
 * Start `next dev` for this app. `enabled` picks the feature flag: false is the 404 check. The demo
 * flags and a development build are what `demoMode()` needs, and any inherited Supabase setting is
 * removed so an operator's shell cannot switch the run onto a real project.
 */
async function startDevServer(enabled, label, { fixedPort = false } = {}) {
  const requested = fixedPort ? Number(process.env.UI_PORT ?? 0) : 0;
  const port = requested > 0 ? requested : await freePort();
  mkdirSync(LOG_DIR, { recursive: true });
  const logPath = path.join(LOG_DIR, `ops-ui-dev-server-${label}.log`);
  const log = createWriteStream(logPath, { flags: "w" });

  const env = {
    ...process.env,
    NODE_ENV: "development",
    OPS_ENABLED: enabled ? "1" : "0",
    OPS_DEMO: "1",
  };
  delete env.NEXT_PUBLIC_SUPABASE_URL;
  delete env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  delete env.PORT;

  if (!existsSync(NEXT_BIN)) {
    throw new Error(
      `Cannot find Next at ${NEXT_BIN}. Run pnpm install before check:ui, or run it through ` +
        "pnpm --filter @teeline/ops check:ui so the package scripts resolve it.",
    );
  }

  const child = spawn(process.execPath, [NEXT_BIN, "dev", "--port", String(port)], {
    cwd: APP_ROOT,
    env,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
    detached: process.platform !== "win32",
  });
  child.stdout.pipe(log);
  child.stderr.pipe(log);

  const entry = { child, logPath, base: `http://localhost:${port}` };
  servers.push(entry);

  console.log(`check:ui: starting next dev on ${entry.base} (OPS_ENABLED=${enabled ? 1 : 0})`);
  const ready = await waitForServer(entry.base, READY_SECONDS);
  if (!ready) {
    stopServer(entry);
    throw new Error(`The dev server never answered on ${entry.base}. Its log is ${logPath}.`);
  }
  return entry;
}

/** True once the port answers at all. Any status counts: the flag-off server answers 404. */
async function waitForServer(base, seconds) {
  const deadline = Date.now() + seconds * 1000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(base, { signal: AbortSignal.timeout(5000), redirect: "manual" });
      if (response.status > 0) return true;
    } catch {
      // Not listening yet.
    }
    await delay(2000);
  }
  return false;
}

/** Demo mode is on only when this banner renders. Anything else would test a sign-in page. */
async function confirmDemoMode(base) {
  const response = await fetch(`${base}/settings`, { signal: AbortSignal.timeout(120000) });
  const html = await response.text();
  return html.includes("Demo data. Nothing is saved to a database.");
}

function sameOrigin(url) {
  try {
    return new URL(url).origin === origin;
  } catch {
    return false;
  }
}

function watch(page, consoleErrors, failedRequests) {
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(`pageerror: ${error.message}`));
  page.on("requestfailed", (request) => {
    if (!sameOrigin(request.url())) return;
    const reason = request.failure()?.errorText ?? "failed";
    // A request the browser cancelled itself (a navigation the router superseded, or a prefetch it
    // dropped) says nothing about the page. A request the server refused is caught by the response
    // listener below, whatever its status.
    if (reason.includes("ERR_ABORTED")) return;
    failedRequests.push(`${request.method()} ${request.url()} (${reason})`);
  });
  page.on("response", (response) => {
    if (!sameOrigin(response.url())) return;
    if (response.status() >= 400) failedRequests.push(`${response.status()} ${response.url()}`);
  });
}

/** A page in a known viewport and theme, with everything it complains about collected. */
async function trackedPage(browser, viewport, theme) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
  });
  await context.addInitScript(
    ([key, choice]) => {
      try {
        window.localStorage.setItem(key, choice);
      } catch {
        // Storage refused: the page follows the system theme, and the theme check says so.
      }
    },
    [THEME_KEY, theme],
  );
  const page = await context.newPage();
  const consoleErrors = [];
  const failedRequests = [];
  watch(page, consoleErrors, failedRequests);
  return { context, page, consoleErrors, failedRequests };
}

/** Two frames and the fonts, so a layout that is still settling is not measured mid-change. */
async function settle(page) {
  await page.evaluate(
    () =>
      new Promise((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  await page.waitForTimeout(200);
}

async function firstVisibleHeading(page) {
  const headings = page.locator("h1");
  const count = await headings.count();
  for (let index = 0; index < count; index += 1) {
    const heading = headings.nth(index);
    if (await heading.isVisible()) return ((await heading.textContent()) ?? "").trim();
  }
  return null;
}

async function waitForVisible(locator, timeout = VISIBLE_HEADING_MS) {
  try {
    await locator.first().waitFor({ state: "visible", timeout });
    return true;
  } catch {
    return false;
  }
}

async function waitForCount(locator, expected, timeout = VISIBLE_HEADING_MS) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if ((await locator.count()) === expected) return true;
    await delay(250);
  }
  return (await locator.count()) === expected;
}

/**
 * Open a dialog from a trigger, retrying the click. The first click of a run can land before React
 * has hydrated, where it is swallowed rather than queued; a second click after hydration works. Every
 * attempt is safe because a dialog that is already open is left alone.
 */
async function openDialog(trigger, dialog) {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    if (await dialog.isVisible().catch(() => false)) return true;
    await trigger
      .first()
      .click({ timeout: 5000 })
      .catch(() => {});
    const deadline = Date.now() + 3000;
    while (Date.now() < deadline) {
      if (await dialog.isVisible().catch(() => false)) return true;
      await delay(200);
    }
  }
  return await dialog.isVisible().catch(() => false);
}

/** Pick a role and wait for what the choice should reveal, retrying until it does. */
async function selectRole(select, role, ready) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    if (await ready.isVisible().catch(() => false)) return true;
    await select.selectOption(role).catch(() => {});
    const deadline = Date.now() + 3000;
    while (Date.now() < deadline) {
      if (await ready.isVisible().catch(() => false)) return true;
      await delay(200);
    }
  }
  return await ready.isVisible().catch(() => false);
}

/** Click a tab and wait for it to be the selected one, retrying past a pre-hydration click. */
async function selectTab(page, name) {
  const tab = page.getByRole("tab", { name, exact: true });
  for (let attempt = 0; attempt < 5; attempt += 1) {
    if ((await tab.getAttribute("aria-selected").catch(() => null)) === "true") return true;
    await tab.click({ timeout: 5000 }).catch(() => {});
    const deadline = Date.now() + 3000;
    while (Date.now() < deadline) {
      if ((await tab.getAttribute("aria-selected").catch(() => null)) === "true") return true;
      await delay(200);
    }
  }
  return (await tab.getAttribute("aria-selected").catch(() => null)) === "true";
}

async function documentWidth(page) {
  return await page.evaluate(() => {
    const root = document.scrollingElement ?? document.documentElement;
    return { scroll: root.scrollWidth, client: root.clientWidth };
  });
}

function where(route, viewport, theme) {
  return `${route.padEnd(ROUTE_PAD)}${viewport.name.padEnd(9)}${theme.padEnd(6)}`;
}

/* ------------------------------------------------------------------------------------------- */
/* Every route, every viewport, both themes                                                     */
/* ------------------------------------------------------------------------------------------- */

async function checkRoute(browser, route, viewport, theme) {
  const label = where(route, viewport, theme);
  const failedBefore = fail;
  const { context, page, consoleErrors, failedRequests } = await trackedPage(
    browser,
    viewport,
    theme,
  );

  try {
    const response = await page.goto(`${origin}${route}`, {
      waitUntil: "domcontentloaded",
      timeout: 120000,
    });
    const status = response?.status() ?? 0;

    // Wait for a heading rather than for a fixed timeout: a page with none fails quickly, and a page
    // that is still compiling has time to arrive.
    let heading = null;
    const headingDeadline = Date.now() + VISIBLE_HEADING_MS;
    while (Date.now() < headingDeadline) {
      heading = await firstVisibleHeading(page);
      if (heading !== null) break;
      await delay(250);
    }
    await settle(page);

    check(label, `${route} answered 200`, status === 200, `status ${status}`);
    check(label, "stayed on the route", new URL(page.url()).pathname === route, page.url());
    check(
      label,
      "has a visible h1",
      heading !== null,
      heading === null ? `no visible h1 after ${VISIBLE_HEADING_MS / 1000}s` : `h1 "${heading}"`,
    );

    const width = await documentWidth(page);
    check(
      label,
      "does not scroll sideways",
      width.scroll <= width.client + 1,
      `scrollWidth ${width.scroll}, clientWidth ${width.client}`,
    );

    const applied = await page.evaluate(() => document.documentElement.dataset.theme ?? "auto");
    check(label, `runs in the ${theme} theme`, applied === theme, `theme is ${applied}`);
    check(
      label,
      "logs no console error",
      consoleErrors.length === 0,
      consoleErrors.slice(0, 3).join(" | "),
    );
    check(
      label,
      "makes no failed same-origin request",
      failedRequests.length === 0,
      failedRequests.slice(0, 3).join(" | "),
    );

    if (fail === failedBefore) {
      note(label, `${route} · ${status} · h1 "${heading}" · no sideways scroll · no console error`);
    }
  } catch (error) {
    check(label, `${route} loaded`, false, error instanceof Error ? error.message : String(error));
  } finally {
    await context.close();
  }
}

async function checkAllRoutes(browser) {
  console.log("\n== every route, desktop and phone, light and dark ==");
  for (const viewport of VIEWPORTS) {
    for (const theme of THEMES) {
      for (const route of ROUTES) {
        if (singleRoute !== null && route !== singleRoute) continue;
        await checkRoute(browser, route, viewport, theme);
      }
    }
  }
}

/* ------------------------------------------------------------------------------------------- */
/* Demo flows                                                                                  */
/* ------------------------------------------------------------------------------------------- */

/** A name that is the same on every run, so the check reads clearly in a failure. */
const DOC_TITLE = "Browser check document";
const TASK_TITLE = "Browser check task";
const NEW_MEMBER_NAME = "Rosa Diaz";
/** An account that exists in the demo data and is not a member yet. */
const NEW_MEMBER_EMAIL = "rosa.diaz@teeline.test";
/** The only active owner in the demo data, so the last-owner rule applies to this row. */
const LAST_OWNER = "Ana Reyes";

const DESKTOP = VIEWPORTS[0];

async function checkDocumentFlow(browser) {
  const label = where("/docs", DESKTOP, "light");
  const failedBefore = fail;
  const { context, page, consoleErrors, failedRequests } = await trackedPage(
    browser,
    DESKTOP,
    "light",
  );

  try {
    await page.goto(`${origin}/docs`, { waitUntil: "domcontentloaded", timeout: 120000 });
    const newButton = page.getByRole("button", { name: "New document" });
    const dialog = page.getByRole("dialog", { name: "New document" });
    if (!(await waitForVisible(newButton))) {
      check(label, "the document list offers New document", false);
      return;
    }
    if (!(await openDialog(newButton, dialog))) {
      check(label, "New document opens the dialog", false);
      return;
    }
    await dialog.locator("#new-doc-title").fill(DOC_TITLE);
    await dialog.getByRole("button", { name: "Create and open" }).click();

    const opened = await page
      .waitForURL(/\/docs\/[0-9a-f-]{36}$/, { timeout: 60000 })
      .then(() => true)
      .catch(() => false);
    check(label, "creating a document opens it", opened, page.url());

    await page.goto(`${origin}/docs`, { waitUntil: "domcontentloaded", timeout: 120000 });
    const row = page.getByRole("link", { name: DOC_TITLE, exact: true });
    check(label, "the new document is listed on /docs", await waitForVisible(row));

    check(
      label,
      "the document flow logs no console error",
      consoleErrors.length === 0,
      consoleErrors.slice(0, 3).join(" | "),
    );
    check(
      label,
      "the document flow makes no failed same-origin request",
      failedRequests.length === 0,
      failedRequests.slice(0, 3).join(" | "),
    );
    if (fail === failedBefore) note(label, `created "${DOC_TITLE}" and found it on /docs`);
  } catch (error) {
    check(
      label,
      "the document flow ran",
      false,
      error instanceof Error ? error.message : String(error),
    );
  } finally {
    await context.close();
  }
}

/** Stage labels and their card counts, in screen order. */
async function boardCounts(page) {
  return await page.locator("main section[aria-label]").evaluateAll((sections) =>
    sections.map((section) => {
      const badge = section.querySelector("h2 + [data-slot='badge']");
      return {
        name: section.getAttribute("aria-label") ?? "",
        count: Number((badge?.textContent ?? "").trim()),
      };
    }),
  );
}

async function checkBoardFlow(browser) {
  const label = where("/board", DESKTOP, "light");
  const failedBefore = fail;
  const { context, page, consoleErrors, failedRequests } = await trackedPage(
    browser,
    DESKTOP,
    "light",
  );

  try {
    await page.goto(`${origin}/board`, { waitUntil: "domcontentloaded", timeout: 120000 });
    const moveButton = page.getByRole("button", { name: /^Move .+ to another stage$/ }).first();
    if (!(await waitForVisible(moveButton))) {
      check(label, "the board offers a Move control on a card", false);
      return;
    }
    const moveLabel = (await moveButton.getAttribute("aria-label")) ?? "";
    const cardTitle = moveLabel.replace(/^Move /, "").replace(/ to another stage$/, "");
    const sourceSection = page
      .locator("main section[aria-label]")
      .filter({ has: page.getByRole("button", { name: moveLabel, exact: true }) })
      .first();
    const sourceName = (await sourceSection.getAttribute("aria-label")) ?? "";

    const before = await boardCounts(page);
    const sourceIndex = before.findIndex((stage) => stage.name === sourceName);
    if (sourceIndex === -1) {
      check(label, "the card sits in a named column", false, `"${sourceName}"`);
      return;
    }
    const target = before[(sourceIndex + 1) % before.length];
    if (target === undefined) {
      check(label, "there is another column to move to", false);
      return;
    }

    const dialog = page.getByRole("dialog", { name: "Move card" });
    if (!(await openDialog(moveButton, dialog))) {
      check(label, "the Move control opens the stage list", false);
      return;
    }
    await dialog.getByRole("button", { name: target.name, exact: true }).click();

    const targetSection = page.locator(`main section[aria-label="${target.name}"]`);
    const arrived = await waitForVisible(
      targetSection.getByRole("button", { name: `Open ${cardTitle}`, exact: true }),
    );
    check(label, `the card moves to ${target.name}`, arrived, cardTitle);

    const after = await boardCounts(page);
    const sourceAfter = after.find((stage) => stage.name === sourceName)?.count;
    const targetAfter = after.find((stage) => stage.name === target.name)?.count;
    check(
      label,
      `${sourceName} loses one card`,
      sourceAfter === before[sourceIndex].count - 1,
      `was ${before[sourceIndex].count}, now ${sourceAfter}`,
    );
    check(
      label,
      `${target.name} gains one card`,
      targetAfter === target.count + 1,
      `was ${target.count}, now ${targetAfter}`,
    );

    check(
      label,
      "the board flow logs no console error",
      consoleErrors.length === 0,
      consoleErrors.slice(0, 3).join(" | "),
    );
    check(
      label,
      "the board flow makes no failed same-origin request",
      failedRequests.length === 0,
      failedRequests.slice(0, 3).join(" | "),
    );
    if (fail === failedBefore)
      note(label, `moved "${cardTitle}" from ${sourceName} to ${target.name}`);
  } catch (error) {
    check(
      label,
      "the board flow ran",
      false,
      error instanceof Error ? error.message : String(error),
    );
  } finally {
    await context.close();
  }
}

async function checkTaskFlow(browser) {
  const label = where("/tasks", DESKTOP, "light");
  const failedBefore = fail;
  const { context, page, consoleErrors, failedRequests } = await trackedPage(
    browser,
    DESKTOP,
    "light",
  );

  try {
    await page.goto(`${origin}/tasks`, { waitUntil: "domcontentloaded", timeout: 120000 });
    const newTask = page.getByRole("button", { name: "New task" }).first();
    if (!(await waitForVisible(newTask))) {
      check(label, "the task list offers New task", false);
      return;
    }

    // Create from the All tab, then look for it under My tasks: that is the filter, not a lucky list.
    check(label, "the All tab can be selected", await selectTab(page, "All"));
    const dialog = page.getByRole("dialog", { name: "New task" });
    if (!(await openDialog(newTask, dialog))) {
      check(label, "New task opens the dialog", false);
      return;
    }
    await dialog.locator("#new-task-title").fill(TASK_TITLE);
    await dialog.locator("#new-task-assignee").selectOption({ label: "Demo user" });
    await dialog.getByRole("button", { name: "Create task" }).click();
    check(label, "the new task is created", await waitForCount(dialog, 0), "dialog still open");

    const taskRow = page.getByRole("button", { name: TASK_TITLE, exact: true });
    check(label, "the new task is listed under All", await waitForVisible(taskRow));

    check(label, "My tasks can be selected", await selectTab(page, "My tasks"));
    check(
      label,
      "the task it is assigned to shows it under My tasks",
      await waitForVisible(taskRow),
    );

    check(label, "By assignee can be selected", await selectTab(page, "By assignee"));
    const assigneeFilter = page.locator("#task-assignee-filter");
    await waitForVisible(assigneeFilter);
    await assigneeFilter.selectOption({ label: "Mia Santos" });
    await waitForCount(taskRow, 0);
    check(label, "another member's list does not show it", (await taskRow.count()) === 0);

    check(label, "My tasks can be selected again", await selectTab(page, "My tasks"));
    check(label, "returning to My tasks shows it again", await waitForVisible(taskRow));

    check(
      label,
      "the task flow logs no console error",
      consoleErrors.length === 0,
      consoleErrors.slice(0, 3).join(" | "),
    );
    check(
      label,
      "the task flow makes no failed same-origin request",
      failedRequests.length === 0,
      failedRequests.slice(0, 3).join(" | "),
    );
    if (fail === failedBefore) note(label, `created "${TASK_TITLE}" and found it under My tasks`);
  } catch (error) {
    check(
      label,
      "the task flow ran",
      false,
      error instanceof Error ? error.message : String(error),
    );
  } finally {
    await context.close();
  }
}

async function checkMembersFlow(browser) {
  const label = where("/settings/members", DESKTOP, "light");
  const failedBefore = fail;
  const { context, page, consoleErrors, failedRequests } = await trackedPage(
    browser,
    DESKTOP,
    "light",
  );

  try {
    await page.goto(`${origin}/settings/members`, {
      waitUntil: "domcontentloaded",
      timeout: 120000,
    });
    const addButton = page.getByRole("button", { name: "Add member" });
    if (!(await waitForVisible(addButton))) {
      check(label, "the demo owner is offered Add member", false);
      return;
    }

    await page.locator("#new-member-email").fill(NEW_MEMBER_EMAIL);
    await page.locator("#new-member-name").fill(NEW_MEMBER_NAME);
    await page.locator("#new-member-role").selectOption("member");
    await addButton.click();

    const added = page.getByRole("status").filter({ hasText: `Added ${NEW_MEMBER_EMAIL}` });
    check(label, "adding a member reports it", await waitForVisible(added));

    const newRow = page.locator("table tbody tr").filter({ hasText: NEW_MEMBER_NAME });
    check(label, `${NEW_MEMBER_NAME} appears in the member table`, await waitForVisible(newRow));

    // The last-owner rule: the one active owner cannot be demoted, suspended or removed.
    const ownerRole = page.getByRole("combobox", { name: `Role for ${LAST_OWNER}`, exact: true });
    if (!(await waitForVisible(ownerRole))) {
      check(label, `${LAST_OWNER} has a role control`, false);
      return;
    }
    const saveRole = page.getByRole("button", {
      name: `Save role for ${LAST_OWNER}`,
      exact: true,
    });
    const saveVisible = await selectRole(ownerRole, "member", saveRole);
    check(label, "demoting the last owner offers a save control", saveVisible);
    check(label, "the demote control is disabled", saveVisible && (await saveRole.isDisabled()));

    const reason = page.getByText("The workspace needs at least one active owner.", {
      exact: true,
    });
    check(label, "the page says why", await waitForVisible(reason));
    check(
      label,
      "the last owner cannot be suspended",
      await page.getByRole("button", { name: `Suspend ${LAST_OWNER}`, exact: true }).isDisabled(),
    );
    check(
      label,
      "the last owner cannot be removed",
      await page.getByRole("button", { name: `Remove ${LAST_OWNER}`, exact: true }).isDisabled(),
    );

    // Put the control back, and prove nothing was saved.
    await ownerRole.selectOption("owner");
    check(label, "putting the role back leaves nothing to save", await waitForCount(saveRole, 0));

    check(
      label,
      "the member flow logs no console error",
      consoleErrors.length === 0,
      consoleErrors.slice(0, 3).join(" | "),
    );
    check(
      label,
      "the member flow makes no failed same-origin request",
      failedRequests.length === 0,
      failedRequests.slice(0, 3).join(" | "),
    );
    if (fail === failedBefore) {
      note(
        label,
        `added ${NEW_MEMBER_NAME}, and the last-owner rule blocked demoting ${LAST_OWNER}`,
      );
    }
  } catch (error) {
    check(
      label,
      "the member flow ran",
      false,
      error instanceof Error ? error.message : String(error),
    );
  } finally {
    await context.close();
  }
}

async function checkFlows(browser) {
  console.log("\n== demo flows ==");
  await checkDocumentFlow(browser);
  await checkBoardFlow(browser);
  await checkTaskFlow(browser);
  await checkMembersFlow(browser);
}

/* ------------------------------------------------------------------------------------------- */
/* The feature flag off                                                                        */
/* ------------------------------------------------------------------------------------------- */

async function checkFlagOff() {
  console.log("\n== feature flag off ==");
  const entry = await startDevServer(false, "flag-off");
  origin = entry.base;
  const failedBefore = fail;

  try {
    const routes = [...ROUTES, "/login"];
    for (const route of routes) {
      if (singleRoute !== null && route !== singleRoute) continue;
      const response = await fetch(`${origin}${route}`, {
        redirect: "manual",
        signal: AbortSignal.timeout(120000),
      });
      check(
        where(route, { name: "server" }, "none"),
        "returns 404 with the flag off",
        response.status === 404,
        `status ${response.status}`,
      );
    }
    if (fail === failedBefore)
      note(where("every route", { name: "server" }, "none"), "404 as expected");
  } finally {
    stopServer(entry);
    const index = servers.indexOf(entry);
    if (index !== -1) servers.splice(index, 1);
    await delay(1000);
  }
}

/* ------------------------------------------------------------------------------------------- */
/* Run                                                                                         */
/* ------------------------------------------------------------------------------------------- */

async function main() {
  const mainServer = await startDevServer(true, "main", { fixedPort: true });
  origin = mainServer.base;

  if (!(await confirmDemoMode(origin))) {
    throw new Error(
      "The app is not running on demo data. check:ui needs OPS_ENABLED=1, OPS_DEMO=1, a " +
        "development build and no NEXT_PUBLIC_SUPABASE_URL. A Supabase URL is probably set in this " +
        "shell or in an env file next to apps/ops.",
    );
  }
  console.log(`check:ui: demo data confirmed on ${origin}`);

  const browser = await chromium.launch();
  try {
    await checkAllRoutes(browser);
    await checkFlows(browser);
  } finally {
    await browser.close();
  }

  stopServer(mainServer);
  servers.splice(servers.indexOf(mainServer), 1);
  await delay(1500);

  await checkFlagOff();
}

process.on("SIGINT", () => {
  stopAllServers();
  process.exit(130);
});
process.on("SIGTERM", () => {
  stopAllServers();
  process.exit(143);
});

try {
  await main();
} catch (error) {
  console.error(`check:ui: ${error instanceof Error ? error.message : String(error)}`);
  fail += 1;
  failures.push(`run: ${error instanceof Error ? error.message : String(error)}`);
} finally {
  stopAllServers();
}

console.log(
  `\ncheck:ui: ${pass} passed, ${fail} failed${fail === 0 ? "" : `\n${failures.join("\n")}`}`,
);
process.exit(fail === 0 ? 0 : 1);
