/**
 * Allocates strokes to holes in input order. Positive values are strokes received; negative values
 * are strokes given back by a plus-handicap player. Stroke-index ties use stable input order.
 */
export function handicapDots(
  playingHandicap: number | null,
  strokeIndexes: readonly (number | null)[],
): number[] {
  const result = strokeIndexes.map(() => 0);
  if (playingHandicap === null || !Number.isFinite(playingHandicap)) return result;

  const handicap = Math.trunc(playingHandicap);
  if (handicap === 0) return result;

  const direction = handicap > 0 ? 1 : -1;
  const magnitude = Math.abs(handicap);
  const fullRounds = Math.floor(magnitude / 18);
  const remainder = magnitude % 18;
  const rankedHoles = strokeIndexes
    .map((strokeIndex, index) => ({ strokeIndex, index }))
    .filter(
      (hole): hole is { strokeIndex: number; index: number } =>
        typeof hole.strokeIndex === "number" &&
        Number.isInteger(hole.strokeIndex) &&
        hole.strokeIndex >= 1 &&
        hole.strokeIndex <= 18,
    );

  const baseDots = fullRounds === 0 ? 0 : direction * fullRounds;
  for (const hole of rankedHoles) result[hole.index] = baseDots;

  rankedHoles.sort((a, b) => {
    const byStrokeIndex =
      direction > 0 ? a.strokeIndex - b.strokeIndex : b.strokeIndex - a.strokeIndex;
    return byStrokeIndex || a.index - b.index;
  });

  for (const hole of rankedHoles.slice(0, remainder)) {
    result[hole.index] = (result[hole.index] ?? 0) + direction;
  }

  return result;
}
