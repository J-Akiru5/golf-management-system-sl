/**
 * Checks a scorecard transcription file against the import contract without writing anything.
 *
 *   pnpm exec tsx scripts/validate-scorecard-import.ts path/to/scorecards.json
 *
 * The Scores screen runs the same parser and then matches the cards against the open round. This
 * script only answers whether the file is structurally valid, so it can be used before the desk is
 * ready to import.
 */
import { readFileSync } from "node:fs";
import { parseScorecardImport } from "../src/lib/scoring/import";

const path = process.argv[2];
if (!path) {
  console.error("Usage: pnpm exec tsx scripts/validate-scorecard-import.ts <file.json>");
  process.exit(2);
}

let value: unknown;
try {
  value = JSON.parse(readFileSync(path, "utf8"));
} catch (error) {
  console.error(
    `Not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exit(1);
}

const parsed = parseScorecardImport(value);
if (parsed.problems.length > 0) {
  console.error(`${parsed.problems.length} problem(s):`);
  for (const problem of parsed.problems) {
    console.error(`  ${problem.path || "(file)"}: ${problem.message}`);
  }
  process.exit(1);
}

if (!parsed.file) {
  console.error("The file did not produce a scorecard import.");
  process.exit(1);
}

console.log(
  `OK: ${parsed.file.cards.length} card(s) for round ${parsed.file.roundId}, day ${parsed.file.dayNumber}, extracted by ${parsed.file.extractedBy}.`,
);
if (parsed.file.skipped.length > 0) {
  console.log(`${parsed.file.skipped.length} card(s) skipped and left for manual entry.`);
}
