/**
 * The row labels the club writes on its pairing sheet: one row per group, "HOLE 3" for the first
 * group on a hole and "HOLE 3B", "HOLE 3C" for the second and third when a start sends more than one
 * group to the same hole. Pure: it only reads the start holes it is given, in the order it is given.
 */
export function groupRowLabels(
  groups: readonly { startHole: number }[],
  noun: "HOLE" | "TEE" = "HOLE",
): string[] {
  const seen = new Map<number, number>();
  return groups.map((group) => {
    const occurrence = seen.get(group.startHole) ?? 0;
    seen.set(group.startHole, occurrence + 1);
    if (occurrence === 0) return `${noun} ${group.startHole}`;
    // A, B, C... after the plain row. Past Z, the count is written instead of inventing letters.
    const suffix = occurrence <= 25 ? String.fromCharCode(65 + occurrence) : `#${occurrence + 1}`;
    return `${noun} ${group.startHole}${suffix}`;
  });
}

/** How many name columns the sheet needs: the widest group, never fewer than two. */
export function pairingsColumns(playersPerGroup: readonly number[], most = 4): number {
  const widest = playersPerGroup.length > 0 ? Math.max(...playersPerGroup) : 0;
  return Math.max(2, Math.min(most, widest));
}
