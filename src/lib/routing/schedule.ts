/** Adds minutes to an "HH:MM" time and wraps at 24 hours. */
export function addMinutes(time: string, minutes: number): string {
  const [h, m] = time.split(":").map(Number);
  if (h === undefined || m === undefined || Number.isNaN(h) || Number.isNaN(m)) {
    throw new Error(`Invalid time: ${time}`);
  }
  const total = (((h * 60 + m + minutes) % 1440) + 1440) % 1440;
  const hh = String(Math.floor(total / 60)).padStart(2, "0");
  const mm = String(total % 60).padStart(2, "0");
  return `${hh}:${mm}`;
}

export function waveLetter(index: number): string {
  return String.fromCharCode(65 + index);
}

export interface Slot {
  startHole: number;
  wave: string | null;
  time: string;
}

export interface ShotgunPlan {
  slots: Slot[];
  warnings: string[];
}

/** A slot already taken by a locked group: `wave:hole` for shotgun, `hole:time` for two-tee. */
export const shotgunSlotKey = (wave: string, startHole: number) => `${wave}:${startHole}`;
export const twoTeeSlotKey = (startHole: number, time: string) => `${startHole}:${time}`;

/**
 * Assigns each flight's groups to shotgun holes. One group per hole per wave.
 * A flight stays whole: if it does not fit in the rest of the wave it starts the next wave.
 * Only a flight with more groups than holes is split, and that is flagged.
 *
 * `occupied` holds slots already taken by locked groups, so a re-run works around them.
 * `flightGroupCounts` is the number of groups in each flight, in play order.
 */
export function planShotgun(
  flightGroupCounts: { flightName: string; groups: number }[],
  holes: number,
  firstTeeTime: string,
  waveGapMinutes: number,
  occupied: ReadonlySet<string> = new Set(),
): ShotgunPlan {
  const slots: Slot[] = [];
  const warnings: string[] = [];

  // Waves open lazily and remember which of their holes are still free.
  const waves: { index: number; holes: number[]; at: number }[] = [];
  const waveAt = (index: number) => {
    while (waves.length <= index) {
      const wave = waves.length;
      const free: number[] = [];
      for (let hole = 1; hole <= holes; hole++) {
        if (!occupied.has(shotgunSlotKey(waveLetter(wave), hole))) free.push(hole);
      }
      waves.push({ index: wave, holes: free, at: 0 });
    }
    return waves[index] as { index: number; holes: number[]; at: number };
  };
  const roomAt = (index: number) => {
    const wave = waveAt(index);
    return wave.holes.length - wave.at;
  };

  let wave = 0;
  for (const { flightName, groups } of flightGroupCounts) {
    if (groups === 0) continue;
    if (groups > holes) {
      warnings.push(
        `Flight ${flightName} has ${groups} groups, more than the ${holes} holes in one wave, so it was split across waves.`,
      );
    } else {
      // A flight stays whole: move it on until a wave has room for all of its groups.
      while (roomAt(wave) < groups) wave += 1;
    }
    for (let i = 0; i < groups; i++) {
      while (roomAt(wave) === 0) wave += 1;
      const current = waveAt(wave);
      const startHole = current.holes[current.at] as number;
      current.at += 1;
      slots.push({
        startHole,
        wave: waveLetter(current.index),
        time: addMinutes(firstTeeTime, current.index * waveGapMinutes),
      });
    }
  }
  return { slots, warnings };
}

/**
 * Two-tee start: groups alternate between hole 1 and hole 10, and a new pair goes off each interval.
 * Occupied slots are skipped, so a re-run works around locked groups.
 */
export function planTwoTee(
  groupCount: number,
  firstTeeTime: string,
  intervalMinutes: number,
  occupied: ReadonlySet<string> = new Set(),
): Slot[] {
  const slots: Slot[] = [];
  const limit = groupCount + occupied.size + 1;
  for (let n = 0; n < limit && slots.length < groupCount; n++) {
    const startHole = n % 2 === 0 ? 1 : 10;
    const time = addMinutes(firstTeeTime, Math.floor(n / 2) * intervalMinutes);
    if (occupied.has(twoTeeSlotKey(startHole, time))) continue;
    slots.push({ startHole, wave: null, time });
  }
  return slots;
}
