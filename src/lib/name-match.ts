/**
 * Name search, in one place.
 *
 * The desk writes a name the way a scorecard does: family name first, in capitals, a comma between
 * the halves ("MATILING, CHARLES"). A player on a phone types their own name the way they say it
 * ("charles matiling"), maybe without accents, maybe with the comma, often only the first few
 * letters. Comparing the whole query against the whole stored line therefore fails for the most
 * natural query there is, so this compares words instead: every word of the query must appear
 * somewhere in the name, in any order.
 *
 * Pure, no I/O. The stored name is never rewritten for display; only the comparison is normalised.
 */

/** Lower case, no accents, no punctuation, single spaces: the words of a name and nothing else. */
function nameWords(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * True when every whitespace-separated token of `query` appears somewhere in `haystack`.
 *
 * Case, accents and punctuation are ignored, the words may be in any order, and a partial word
 * matches because a phone search is typed as you go. An empty or blank query matches everything.
 */
export function matchesName(haystack: string, query: string): boolean {
  const tokens = nameWords(query).split(" ").filter(Boolean);
  if (tokens.length === 0) return true;
  const words = nameWords(haystack);
  return tokens.every((token) => words.includes(token));
}

/**
 * True when two names use exactly the same words, in any order.
 *
 * Use this where a near match is not good enough, such as attaching a tee time to a profile:
 * a prefix match would let "JUAN CRUZ" take "JUAN CRUZ JR"'s start. Case, accents, punctuation
 * and word order are still ignored.
 */
export function sameName(left: string, right: string): boolean {
  const leftWords = nameWords(left).split(" ").filter(Boolean).sort();
  const rightWords = nameWords(right).split(" ").filter(Boolean).sort();
  if (leftWords.length === 0 || leftWords.length !== rightWords.length) return false;
  return leftWords.every((word, index) => word === rightWords[index]);
}
