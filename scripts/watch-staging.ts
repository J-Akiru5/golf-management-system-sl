/**
 * Staging watcher. Listens to `origin/staging`; when a batch lands that would change production it
 * prepares a release, checks it, opens the release pull request to `main`, and asks the owner
 * before anything reaches production.
 *
 *   pnpm watch:staging                 loop forever (default every 120 s)
 *   pnpm watch:staging -- once         one pass, then exit
 *   pnpm watch:staging -- status       print what the watcher is doing
 *   pnpm watch:staging -- ship 287     approve PR 287 from the keyboard (same as the `ship` label)
 *   pnpm watch:staging -- resume       clear a "needs you" stop and try the current staging tip again
 *
 *   flags: --dry-run (stop before any push, writes no state), --skip-checks, --interval=SECONDS,
 *          --no-toast, --staging-ref=REF (dry run only: pretend REF is staging)
 *
 * What it does on a new staging tip:
 *   1. Builds a candidate in its own worktree: a branch from `main` with `staging` merged in.
 *   2. Stops and asks you when: the merge conflicts, the batch carries a database migration, touches
 *      vercel.json or the CI workflows, or CHANGELOG [Unreleased] has no notes to release.
 *      Docs-only batches are skipped (they cannot change the build).
 *   3. Moves the [Unreleased] notes under the next version (minor if there is an "Added" section, else
 *      patch), bumps package.json and VERSION, and runs typecheck, lint, test, build and, when the
 *      batch touches src/ or public/, the browser checks. It never edits code to make them pass.
 *   4. Pushes `release/X.Y.Z`, opens the PR to `main` and tells you.
 *   5. Ships only after you approve: put the `ship` label on the PR (it counts only if you applied
 *      it) or run the `ship` command. It then merges the PR under your identity (Vercel blocks
 *      deploys from anyone who is not on the team), tags the merge commit, merges `main` back into
 *      `develop` and reports whether Vercel deployed it.
 *
 * It never pushes to `main` or `staging`, never forces a push, never deletes a branch and never
 * touches the database.
 */
import { spawn, spawnSync } from "node:child_process";
import { appendFileSync, closeSync, existsSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import net from "node:net";
import { dirname, join } from "node:path";
import { chooseBump, classifyChanges, nextVersion, promoteChangelog, shipApproved } from "../src/lib/release/staging-release";

const argv = process.argv.slice(2);
const flag = (name: string) => argv.includes(`--${name}`);
const option = (name: string, fallback: string) => argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1] ?? fallback;
const command = argv.find((a) => !a.startsWith("--")) ?? "run";
const DRY = flag("dry-run");
/** Only for testing a dry run against another branch. Live runs always watch origin/staging. */
const STAGING_REF = DRY ? option("staging-ref", "origin/staging") : "origin/staging";
const INTERVAL_MS = Math.max(30, Number(option("interval", "120"))) * 1000;

interface Out {
  ok: boolean;
  out: string;
  err: string;
}
function exec(file: string, args: string[], cwd: string, shell = false): Out {
  const r = spawnSync(file, args, { cwd, encoding: "utf8", shell, maxBuffer: 64 * 1024 * 1024 });
  return { ok: r.status === 0, out: (r.stdout ?? "").trim(), err: (r.stderr ?? "").trim() };
}

const common = exec("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], process.cwd());
if (!common.ok) throw new Error("Run this from inside the golf-management-system-sl repository.");
const ROOT = dirname(common.out);
const DIR = join(ROOT, ".watch-staging");
const WORK = join(DIR, "work");
const STATE_FILE = join(DIR, "state.json");
const LOG_FILE = join(DIR, "watch.log");
const LOCK_FILE = join(DIR, "lock");
mkdirSync(DIR, { recursive: true });

function git(args: string[], opts: { cwd?: string; allowFail?: boolean } = {}): Out {
  const r = exec("git", args, opts.cwd ?? ROOT);
  if (!r.ok && !opts.allowFail) throw new Error(`git ${args.join(" ")}: ${r.err || r.out}`);
  return r;
}
function gh(args: string[], opts: { allowFail?: boolean } = {}): Out {
  const r = exec("gh", args, ROOT);
  if (!r.ok && !opts.allowFail) throw new Error(`gh ${args.join(" ")}: ${r.err || r.out}`);
  return r;
}
const w = (args: string[], allowFail = false) => git(args, { cwd: WORK, allowFail });

interface State {
  handledTip: string | null;
  needsYou: { tip: string; reason: string; at: string; notifiedAt: string } | null;
  pending: { number: number; version: string; branch: string; headSha: string; tip: string; merged: boolean; finished: boolean; waitingNote?: string } | null;
}
function readState(): State {
  try {
    return { handledTip: null, needsYou: null, pending: null, ...JSON.parse(readFileSync(STATE_FILE, "utf8")) };
  } catch {
    return { handledTip: null, needsYou: null, pending: null };
  }
}
let state = readState();
const save = () => {
  if (!DRY) writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
};

function log(message: string): void {
  const line = `${new Date().toISOString()} ${message}`;
  console.log(line);
  appendFileSync(LOG_FILE, `${line}\n`);
}
function toast(title: string, text: string): void {
  log(`NOTIFY ${title}: ${text}`);
  if (process.platform !== "win32" || flag("no-toast")) return;
  const script =
    "Add-Type -AssemblyName System.Windows.Forms,System.Drawing; $n=New-Object System.Windows.Forms.NotifyIcon; " +
    "$n.Icon=[System.Drawing.SystemIcons]::Information; $n.Visible=$true; $n.ShowBalloonTip(15000,$env:WT,$env:WX,'Info'); Start-Sleep 16; $n.Dispose()";
  try {
    spawn("powershell", ["-NoProfile", "-WindowStyle", "Hidden", "-Command", script], {
      env: { ...process.env, WT: title, WX: text.slice(0, 250) },
      detached: true,
      stdio: "ignore",
    }).unref();
  } catch {
    // The log line above is enough when a toast cannot be shown.
  }
}

function needsYou(tip: string, reason: string): void {
  const now = new Date().toISOString();
  state.needsYou = { tip, reason, at: now, notifiedAt: now };
  save();
  toast("Staging watcher needs you", `${reason} Fix it, then run: pnpm watch:staging -- resume`);
}

const short = (sha: string) => sha.slice(0, 7);
function ensureWork(): void {
  if (existsSync(join(WORK, ".git"))) return;
  git(["worktree", "prune"]);
  git(["worktree", "add", "--detach", WORK, "origin/main"]);
}

function runLogged(label: string, shellCommand: string, logPath: string): boolean {
  log(`running: ${label}`);
  const fd = openSync(logPath, "a");
  appendFileSync(logPath, `\n===== ${label} =====\n`);
  const r = spawnSync(shellCommand, { cwd: WORK, shell: true, stdio: ["ignore", fd, fd] });
  closeSync(fd);
  return r.status === 0;
}
const tail = (path: string, n = 15) => readFileSync(path, "utf8").trimEnd().split(/\r?\n/).slice(-n).join("\n");
const portBusy = (port: number) =>
  new Promise<boolean>((done) => {
    const socket = net.connect({ port, host: "127.0.0.1" });
    socket.once("connect", () => (socket.destroy(), done(true)));
    socket.once("error", () => done(false));
  });

async function prepareRelease(tip: string): Promise<void> {
  ensureWork();
  w(["reset", "--hard", "-q"]);
  w(["clean", "-fdq"]);
  w(["checkout", "-q", "--detach", "origin/main"]);
  const merge = w(["merge", "--no-ff", "-m", `Merge staging ${short(tip)} into the release candidate`, tip], true);
  if (!merge.ok) {
    w(["merge", "--abort"], true);
    return needsYou(tip, `Merging staging ${short(tip)} into main conflicts, so a person has to resolve it.`);
  }
  const files = w(["diff", "--name-only", "origin/main", "HEAD"]).out.split("\n").filter(Boolean);
  if (files.length === 0) {
    log(`staging ${short(tip)} changes nothing on main; nothing to release.`);
    state.handledTip = tip;
    return save();
  }
  const change = classifyChanges(files);
  if (change.docsOnly) {
    log(`staging ${short(tip)} is docs only (${files.length} file(s)); not cutting a release.`);
    state.handledTip = tip;
    return save();
  }
  if (change.needsOwner.length > 0) {
    return needsYou(tip, `Staging ${short(tip)} ${change.needsOwner.join("; and ")}. That is your call.`);
  }

  const current = w(["show", "origin/main:VERSION"]).out.trim();
  const date = new Date().toLocaleDateString("sv-SE");
  const changelogPath = join(WORK, "CHANGELOG.md");
  const probe = promoteChangelog(readFileSync(changelogPath, "utf8"), "0.0.0", date);
  if (!probe) {
    return needsYou(tip, `Staging ${short(tip)} changes ${files.length} file(s) but CHANGELOG [Unreleased] has no notes. Add them on staging or develop.`);
  }
  const bump = chooseBump(probe.notes);
  const version = nextVersion(current, bump);
  const promoted = promoteChangelog(readFileSync(changelogPath, "utf8"), version, date);
  if (!promoted) throw new Error("Changelog promotion failed after the probe worked.");
  writeFileSync(changelogPath, promoted.text);
  for (const file of ["VERSION", "package.json"]) {
    const path = join(WORK, file);
    const text = readFileSync(path, "utf8");
    const next = file === "VERSION" ? text.replace(current, version) : text.replace(`"version": "${current}"`, `"version": "${version}"`);
    if (next === text) throw new Error(`${file} did not contain version ${current}.`);
    writeFileSync(path, next);
  }
  log(`candidate ${version} (${bump}) from staging ${short(tip)}: ${files.length} file(s) change.`);

  if (!flag("skip-checks")) {
    const logPath = join(DIR, `checks-${short(tip)}.log`);
    rmSync(logPath, { force: true });
    const steps: Array<[string, string]> = [
      ["pnpm install", "pnpm install --frozen-lockfile"],
      ["pnpm check", "pnpm check"],
    ];
    if (change.touchesUi) {
      if (await portBusy(3100)) return needsYou(tip, "Port 3100 is busy (a dev server is running), so the browser checks cannot start. Stop it and resume.");
      steps.push(["pnpm check:ui", "pnpm check:ui"]);
    }
    for (const [label, cmd] of steps) {
      if (!runLogged(label, cmd, logPath)) {
        return needsYou(tip, `${label} failed on the release candidate ${version}. Log: ${logPath}\n${tail(logPath, 8)}`);
      }
    }
  }

  w(["add", "VERSION", "package.json", "CHANGELOG.md"]);
  const msgFile = join(DIR, "commit-msg.txt");
  writeFileSync(msgFile, `Release ${version}: promote staging ${short(tip)} to production\n`);
  w(["commit", "-q", "-F", msgFile]);
  const releaseCheck = exec("node", ["scripts/release-check.mjs", "--tag", `v${version}`], WORK);
  if (!releaseCheck.ok) return needsYou(tip, `release:check failed for v${version}: ${releaseCheck.err || releaseCheck.out}`);

  let branch = `release/${version}`;
  if (git(["ls-remote", "--heads", "origin", branch]).out) branch = `${branch}-${short(tip)}`;
  w(["checkout", "-q", "-b", branch]);
  const headSha = w(["rev-parse", "HEAD"]).out;
  const stat = w(["diff", "--stat", "origin/main", "HEAD"]).out.split("\n").slice(-1)[0] ?? "";
  if (DRY) {
    log(`DRY RUN: would push ${branch} (${short(headSha)}) and open a PR to main. ${stat}`);
    return;
  }
  w(["push", "-q", "-u", "origin", branch]);
  gh(["label", "create", "ship", "--color", "0e8a16", "--description", "The owner approves this release PR for production"], { allowFail: true });
  const bodyFile = join(DIR, "pr-body.md");
  writeFileSync(
    bodyFile,
    [
      `Promotes staging \`${short(tip)}\` to production as **${version}** (${bump}: ${bump === "minor" ? "the notes have an Added section" : "fixes and changes only"}).`,
      "",
      `Net change on \`main\`: ${stat.trim()}`,
      `Checks run on the candidate before this PR: ${flag("skip-checks") ? "skipped" : `typecheck, lint, test, build${change.touchesUi ? ", browser checks" : ""}`}. The required CI checks run again on this PR.`,
      "",
      "Release notes:",
      "",
      promoted.notes,
      "",
      "**To approve:** add the `ship` label (only your label counts) or run `pnpm watch:staging -- ship <number>`. Until then nothing is merged.",
      "",
      "Opened by `scripts/watch-staging.ts`.",
    ].join("\n"),
  );
  const prUrl = gh(["pr", "create", "--base", "main", "--head", branch, "--title", `Release ${version}: promote staging to production`, "--body-file", bodyFile]).out.split("\n").pop() ?? "";
  const number = Number(prUrl.split("/").pop());
  state.pending = { number, version, branch, headSha, tip, merged: false, finished: false };
  state.handledTip = tip;
  state.needsYou = null;
  save();
  toast("Release ready for your OK", `${version} is up as PR #${number}. Add the "ship" label to deploy it.`);
}

interface PrView {
  state: string;
  headRefOid: string;
  mergeStateStatus: string;
  mergeCommit: { oid: string } | null;
}
function viewPr(number: number): PrView {
  return JSON.parse(gh(["pr", "view", String(number), "--json", "state,headRefOid,mergeStateStatus,mergeCommit"]).out) as PrView;
}

async function finishRelease(): Promise<void> {
  const p = state.pending;
  if (!p) return;
  git(["fetch", "origin", "--quiet", "--tags"]);
  const pr = viewPr(p.number);
  const mergeCommit = pr.mergeCommit?.oid;
  if (!mergeCommit) throw new Error(`PR #${p.number} is merged but GitHub gave no merge commit.`);
  ensureWork();
  w(["reset", "--hard", "-q"]);
  w(["clean", "-fdq"]);

  const author = git(["log", "-1", "--format=%ae", mergeCommit]).out;
  const me = git(["config", "user.email"]).out;
  if (author.toLowerCase() !== me.toLowerCase()) log(`warning: merge commit author ${author} is not ${me}; Vercel may block the deploy.`);

  if (!git(["ls-remote", "--tags", "origin", `v${p.version}`]).out) {
    w(["checkout", "-q", "--detach", mergeCommit]);
    const check = exec("node", ["scripts/release-check.mjs", "--tag", `v${p.version}`], WORK);
    if (!check.ok) return needsYou(p.tip, `PR #${p.number} merged, but release:check failed for v${p.version}: ${check.err || check.out}. Not tagged.`);
    w(["tag", "-a", `v${p.version}`, "-m", `v${p.version}`, mergeCommit]);
    w(["push", "-q", "origin", `v${p.version}`]);
    log(`tagged v${p.version} on ${short(mergeCommit)}`);
  }

  w(["checkout", "-q", "--detach", "origin/develop"]);
  const back = w(["merge", "--no-ff", "-m", `Merge main back into develop after the ${p.version} release`, "origin/main"], true);
  if (!back.ok) {
    w(["merge", "--abort"], true);
    toast("Staging watcher needs you", `v${p.version} is live, but merging main back into develop conflicts. Resolve it by hand.`);
  } else if (w(["rev-parse", "HEAD"]).out !== w(["rev-parse", "origin/develop"]).out) {
    w(["push", "-q", "origin", "HEAD:develop"]);
    log("merged main back into develop");
  }

  let verdict = "Vercel has not reported yet; check the dashboard.";
  for (let i = 0; i < 10; i++) {
    const statuses = JSON.parse(gh(["api", `repos/{owner}/{repo}/commits/${mergeCommit}/status`]).out) as { statuses: Array<{ context: string; state: string; description: string }> };
    const vercel = statuses.statuses.find((s) => s.context === "Vercel");
    if (vercel && vercel.state !== "pending") {
      verdict = vercel.state === "success" ? "Vercel deployed it." : `Vercel did NOT deploy it: ${vercel.description}.`;
      break;
    }
    await new Promise((r) => setTimeout(r, 30_000));
  }
  toast(`Release ${p.version} shipped`, `Tagged v${p.version}. ${verdict}`);
  state.pending = null;
  state.handledTip = p.tip;
  save();
}

async function ship(number: number, source: string): Promise<void> {
  const p = state.pending;
  if (!p || p.number !== number) throw new Error(`PR #${number} is not the release this watcher is waiting on.`);
  const pr = viewPr(number);
  if (pr.state === "MERGED") {
    p.merged = true;
    save();
    return finishRelease();
  }
  if (pr.state !== "OPEN") return;
  if (pr.headRefOid !== p.headSha) return needsYou(p.tip, `PR #${number} changed after the checks ran (${short(p.headSha)} is now ${short(pr.headRefOid)}). Review it and ship by hand.`);
  if (pr.mergeStateStatus !== "CLEAN") {
    const note = `approved (${source}) but PR #${number} is ${pr.mergeStateStatus}`;
    if (p.waitingNote !== note) {
      p.waitingNote = note;
      save();
      log(`${note}; waiting for the required checks.`);
    }
    return;
  }
  gh(["pr", "merge", String(number), "--merge"]);
  log(`merged PR #${number} (approved by ${source})`);
  p.merged = true;
  save();
  await finishRelease();
}

async function tick(): Promise<void> {
  git(["fetch", "origin", "--quiet", "--tags"]);
  const tip = git(["rev-parse", STAGING_REF]).out;

  if (state.pending) {
    const p = state.pending;
    const pr = viewPr(p.number);
    if (pr.state === "MERGED") {
      p.merged = true;
      save();
      return finishRelease();
    }
    if (pr.state === "CLOSED") {
      toast("Release PR closed", `PR #${p.number} was closed without merging. Run "resume" to build it again.`);
      state.pending = null;
      return save();
    }
    const owner = gh(["api", "user", "--jq", ".login"]).out;
    const events = JSON.parse(gh(["api", `repos/{owner}/{repo}/issues/${p.number}/events?per_page=100`]).out);
    if (shipApproved(events, owner)) return ship(p.number, `${owner}'s ship label`);
    if (tip !== p.tip) log(`staging moved to ${short(tip)} while PR #${p.number} waits; it will be handled after that PR ships or closes.`);
    return;
  }

  if (state.needsYou && state.needsYou.tip === tip) {
    const hours = (Date.now() - Date.parse(state.needsYou.notifiedAt)) / 3_600_000;
    if (hours >= 3) {
      state.needsYou.notifiedAt = new Date().toISOString();
      save();
      toast("Still waiting on you", state.needsYou.reason);
    }
    return;
  }
  if (state.handledTip === tip) return;
  state.needsYou = null;
  log(`new staging tip ${short(tip)}`);
  await prepareRelease(tip);
}

function lock(): void {
  if (existsSync(LOCK_FILE)) {
    const pid = Number(readFileSync(LOCK_FILE, "utf8"));
    try {
      process.kill(pid, 0);
      throw new Error(`Another watcher is running (pid ${pid}). Stop it first.`);
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("Another")) throw error;
    }
  }
  writeFileSync(LOCK_FILE, String(process.pid));
  const unlock = () => rmSync(LOCK_FILE, { force: true });
  process.on("exit", unlock);
  process.on("SIGINT", () => process.exit(0));
}

async function main(): Promise<void> {
  if (command === "status") {
    console.log(JSON.stringify(state, null, 2));
    return;
  }
  if (command === "resume") {
    state.needsYou = null;
    state.handledTip = null;
    save();
    log("cleared; the next pass tries the current staging tip again.");
    return;
  }
  lock();
  if (command === "ship") {
    const number = Number(argv.find((a) => /^\d+$/.test(a)));
    if (!number) throw new Error("Usage: pnpm watch:staging -- ship <PR number>");
    return ship(number, "you at the keyboard");
  }
  if (command === "once") return tick();
  log(`watching origin/staging every ${INTERVAL_MS / 1000}s (${DRY ? "dry run" : "live"}). Ctrl+C to stop.`);
  for (;;) {
    try {
      await tick();
    } catch (error) {
      log(`pass failed: ${error instanceof Error ? error.message : String(error)}`);
    }
    await new Promise((r) => setTimeout(r, INTERVAL_MS));
  }
}

await main();
