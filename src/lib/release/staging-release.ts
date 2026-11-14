/**
 * Pure decisions behind `scripts/watch-staging.ts`: what a staging batch needs before it can go to
 * `main`. No I/O here, so every rule is covered by a test.
 */

export type Bump = "minor" | "patch";

/** Files that always need the owner before a release (database, deploy config, CI). */
const OWNER_PATHS: Array<{ test: (file: string) => boolean; why: string }> = [
  {
    test: (f) => f.startsWith("supabase/migrations/"),
    why: "adds or changes a database migration",
  },
  { test: (f) => f === "vercel.json", why: "changes the Vercel deploy settings" },
  { test: (f) => f.startsWith(".github/"), why: "changes the CI workflows" },
];

export interface ChangeClass {
  /** Nothing in the batch can change the production build (docs and markdown only). */
  docsOnly: boolean;
  /** Reasons the owner must decide, one per matching file group. */
  needsOwner: string[];
  /** The batch touches code a user can see, so the browser checks should run. */
  touchesUi: boolean;
}

export function classifyChanges(files: string[]): ChangeClass {
  const needsOwner: string[] = [];
  for (const rule of OWNER_PATHS) {
    const hits = files.filter(rule.test);
    if (hits.length > 0)
      needsOwner.push(`${hits.length} file(s) ${rule.why} (${hits.slice(0, 3).join(", ")})`);
  }
  const docsOnly =
    files.length > 0 && files.every((f) => f.startsWith("docs/") || /\.md$/i.test(f));
  const touchesUi = files.some((f) => f.startsWith("src/") || f.startsWith("public/"));
  return { docsOnly, needsOwner, touchesUi };
}

const UNRELEASED = /^##\s+\[Unreleased\]\s*$/i;
const NEXT_SECTION = /^##\s+\[/;

export interface PromotedChangelog {
  text: string;
  /** The notes that moved under the new version, without surrounding blank lines. */
  notes: string;
}

/**
 * Moves the notes under `## [Unreleased]` into a dated `## [version]` section and leaves an empty
 * Unreleased behind. Returns null when Unreleased has no notes: the script then asks the owner
 * instead of inventing release notes. Keeps the file's BOM and line endings.
 */
export function promoteChangelog(
  text: string,
  version: string,
  date: string,
): PromotedChangelog | null {
  const nl = text.includes("\r\n") ? "\r\n" : "\n";
  const lines = text.split(nl);
  const start = lines.findIndex((l) => UNRELEASED.test(l.replace(/^﻿/, "")));
  if (start < 0) return null;
  let end = lines.findIndex((l, i) => i > start && NEXT_SECTION.test(l));
  if (end < 0) end = lines.length;
  const body = lines.slice(start + 1, end);
  const notes = body.join(nl).trim();
  if (notes.length === 0) return null;
  const next = [
    ...lines.slice(0, start + 1),
    "",
    `## [${version}] - ${date}`,
    ...body,
    ...lines.slice(end),
  ];
  return { text: next.join(nl), notes };
}

/** A batch with new features is a MINOR release; fixes and wording are a PATCH (docs/VERSIONING.md). */
export function chooseBump(notes: string): Bump {
  return /^###\s+Added\b/im.test(notes) ? "minor" : "patch";
}

export function nextVersion(current: string, bump: Bump): string {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(current.trim());
  if (!m) throw new Error(`Version "${current}" is not X.Y.Z.`);
  const [major, minor, patch] = [Number(m[1]), Number(m[2]), Number(m[3])];
  return bump === "minor" ? `${major}.${minor + 1}.0` : `${major}.${minor}.${patch + 1}`;
}

export interface LabelEvent {
  event: string;
  label?: { name?: string } | null;
  actor?: { login?: string } | null;
}

/** The release is approved when the owner's most recent `ship` label event is "labeled". */
export function shipApproved(events: LabelEvent[], owner: string, label = "ship"): boolean {
  const last = events
    .filter((e) => (e.event === "labeled" || e.event === "unlabeled") && e.label?.name === label)
    .pop();
  return last?.event === "labeled" && last.actor?.login?.toLowerCase() === owner.toLowerCase();
}
