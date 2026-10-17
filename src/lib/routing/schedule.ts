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

/**
 * Assigns each flight's groups to shotgun holes. One group per hole per wave.
 * A flight stays whole: if it does not fit in the rest of the wave it starts the next wave.
 * Only a flight with more groups than holes is split, and that is flagged.
 *
 * `flightGroupCounts` is the number of groups in each flight, in play order.
 */
export function planShotgun(
  flightGroupCounts: { flightName: string; groups: number }[],
  holes: number,
  firstTeeTime: string,
  waveGapMinutes: number,
): ShotgunPlan {
  const slots: Slot[] = [];
  const warnings: string[] = [];
  let wave = 0;
  let used = 0;

  const place = () => {
    slots.push({
      startHole: used + 1,
      wave: waveLetter(wave),
      time: addMinutes(firstTeeTime, wave * waveGapMinutes),
    });
    used += 1;
    if (used === holes) {
      wave += 1;
      used = 0;
    }
  };

  for (const { flightName, groups } of flightGroupCounts) {
    if (groups === 0) continue;
    const room = holes - used;
    if (groups > holes) {
      warnings.push(
        `Flight ${flightName} has ${groups} groups, more than the ${holes} holes in one wave, so it was split across waves.`,
      );
    } else if (groups > room && used > 0) {
      wave += 1;
      used = 0;
    }
    for (let i = 0; i < groups; i++) place();
  }
  return { slots, warnings };
}

/**
 * Two-tee start: groups alternate between hole 1 and hole 10, and a new pair goes off each interval.
 */
export function planTwoTee(
  groupCount: number,
  firstTeeTime: string,
  intervalMinutes: number,
): Slot[] {
  return Array.from({ length: groupCount }, (_, n) => ({
    startHole: n % 2 === 0 ? 1 : 10,
    wave: null,
    time: addMinutes(firstTeeTime, Math.floor(n / 2) * intervalMinutes),
  }));
}
