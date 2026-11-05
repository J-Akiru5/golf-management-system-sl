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

/**
 * Packs units of players into groups without ever splitting a unit across two groups. A unit is a
 * team of two, or one player. A unit larger than maxSize still gets a group of its own, because
 * splitting it would break the pairing the desk asked for.
 */
export function packUnits<T>(units: readonly (readonly T[])[], maxSize: number): T[][] {
  const out: T[][] = [];
  let current: T[] = [];
  for (const unit of units) {
    if (unit.length === 0) continue;
    if (current.length > 0 && current.length + unit.length > maxSize) {
      out.push(current);
      current = [];
    }
    current.push(...unit);
    if (current.length >= maxSize) {
      out.push(current);
      current = [];
    }
  }
  if (current.length > 0) out.push(current);
  return out;
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
