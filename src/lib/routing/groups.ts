/**
 * Splits n players into groups that are as even as possible, none above maxSize.
 * 14 players with max 4 gives 4,4,3,3 (not 4,4,4,2).
 */
export function groupSizes(n: number, maxSize: number): number[] {
  if (n <= 0) return [];
  const count = Math.ceil(n / maxSize);
  const base = Math.floor(n / count);
  const extra = n % count;
  return Array.from({ length: count }, (_, i) => (i < extra ? base + 1 : base));
}

/** Cuts an ordered list into consecutive chunks of the given sizes. */
export function chunk<T>(items: T[], sizes: number[]): T[][] {
  const out: T[][] = [];
  let at = 0;
  for (const size of sizes) {
    out.push(items.slice(at, at + size));
    at += size;
  }
  return out;
}
