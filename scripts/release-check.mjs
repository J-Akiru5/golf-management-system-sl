/**
 * Release check: the version in `package.json`, the `VERSION` file, the tag and the changelog must
 * agree before a release is tagged. Adapted from the script of the same name in agentops-rules.
 *
 * Usage:
 *   node scripts/release-check.mjs               # checks the files against each other
 *   node scripts/release-check.mjs --tag v0.33.0 # also checks the tag you are about to create
 *
 * Exits non-zero and lists every mismatch. It reads files only; it never tags or pushes.
 */
import { readFileSync } from "node:fs";

const args = process.argv.slice(2);
const tagIndex = args.indexOf("--tag");
const tagArg = tagIndex >= 0 ? args[tagIndex + 1] : undefined;
if (tagIndex >= 0 && !tagArg) {
  console.error("FAIL --tag needs a value, for example --tag v0.33.0");
  process.exit(1);
}

const errors = [];
const escape = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const version = readFileSync("VERSION", "utf8").trim();
const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const changelog = readFileSync("CHANGELOG.md", "utf8");

if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
  errors.push(`VERSION must look like X.Y.Z (got "${version}")`);
}
if (pkg.version !== version) {
  errors.push(`package.json version ${pkg.version} does not match VERSION ${version}`);
}

const tag = tagArg ?? `v${version}`;
if (tag !== `v${version}`) {
  errors.push(`tag ${tag} does not match version v${version}`);
}

// Keep a Changelog headings: "## [0.33.0] - 2026-11-11".
if (!new RegExp(`^##\\s+\\[${escape(version)}\\]\\s+-\\s+\\d{4}-\\d{2}-\\d{2}`, "m").test(changelog)) {
  errors.push(`CHANGELOG.md has no dated "## [${version}] - YYYY-MM-DD" section`);
}

if (errors.length > 0) {
  for (const error of errors) console.error(`FAIL ${error}`);
  console.error(`\nrelease check failed: ${errors.length} error(s)`);
  process.exit(1);
}
console.log(
  `release check passed for v${version}: package.json, VERSION, CHANGELOG.md${tagArg ? ` and tag ${tag}` : ""} agree`,
);
