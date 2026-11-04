/**
 * Filtering and ranking for the searchable player pickers.
 *
 * A club can carry more than a hundred names in one event, so a plain `<select>` is unusable on a
 * tablet. This keeps the matching rules out of the component: a prefix match on the name comes
 * first, then any other name match, then a match on the secondary line (an NGAP id, a home course).
 * Accents are folded so "pena" finds "Peña".
 */
export interface FilterableOption {
  id: string;
  label: string;
  hint?: string;
}

export interface FilteredOptions<T> {
  /** The rows to draw, at most `limit` of them. */
  results: T[];
  /** How many rows matched before the limit, so the screen can say "showing 50 of 104". */
  total: number;
}

const fold = (value: string): string =>
  value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

export const DEFAULT_RESULT_LIMIT = 50;

export function filterOptions<T extends FilterableOption>(
  options: readonly T[],
  query: string,
  limit: number = DEFAULT_RESULT_LIMIT,
): FilteredOptions<T> {
  const cap = Math.max(1, Math.floor(limit));
  const needle = fold(query.trim());
  if (!needle) return { results: options.slice(0, cap), total: options.length };

  const startsWith: T[] = [];
  const inName: T[] = [];
  const inHint: T[] = [];
  for (const option of options) {
    const label = fold(option.label);
    if (label.startsWith(needle)) startsWith.push(option);
    else if (label.includes(needle)) inName.push(option);
    else if (option.hint && fold(option.hint).includes(needle)) inHint.push(option);
  }
  const all = [...startsWith, ...inName, ...inHint];
  return { results: all.slice(0, cap), total: all.length };
}
