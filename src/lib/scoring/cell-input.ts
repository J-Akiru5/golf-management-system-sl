/**
 * Cleans one score cell while a person types it.
 *
 * The desk types a whole score or an X for a pick-up. The rule is:
 *
 * - Trim the input. An empty cell stays empty, never a zero and never a par.
 * - A single `x` or `X` becomes `"X"`.
 * - Otherwise keep at most the first two leading digits. Anything after them is dropped, so
 *   `"4x"` becomes `"4"` and `"123"` becomes `"12"`.
 * - A cell that starts with an X keeps a single X, so `"x4"` and `"XX"` both become `"X"`.
 * - Anything else has no valid prefix and becomes empty.
 *
 * `"0"` is kept exactly as typed. The engine rejects it as a score, and turning it into a blank
 * or a par here would hide a value the person actually entered.
 */
export function normalizeCellInput(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed === "") return "";
  if (trimmed.toUpperCase() === "X") return "X";

  let digits = "";
  for (const character of trimmed) {
    if (character < "0" || character > "9") break;
    digits += character;
    if (digits.length === 2) break;
  }
  if (digits.length > 0) return digits;

  // A leading x is the longest valid prefix of "x4" and "XX".
  if (trimmed.toUpperCase().startsWith("X")) return "X";
  return "";
}
