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

/** Key of a shotgun slot: wave letter and hole, e.g. "A:3". */
export const shotgunKey = (wave: string, hole: number) => `${wave}:${hole}`;
/** Key of a two-tee slot: hole and time, e.g. "10:07:12". */
export const twoTeeKey = (hole: number, time: string) => `${hole}:${time}`;

/**
 * Assigns each flight's groups to shotgun holes. One group per hole per wave.
 * A flight stays whole: if it does not fit in the rest of the wave it starts the next wave.
 * Only a flight with more groups than holes is split, and that is flagged.
 *
 * `occupied` holds slots already taken by locked groups, so a re-run never lands on top of them.
 * `flightGroupCounts` is the number of groups in each flight, in play order.
 */
export function planShotgunFrom(
  flightGroupCounts: { flightName: string; groups: number }[],
  holes: number,
  firstTeeTime: string,
  waveGapMinutes: number,
  occupied: ReadonlySet<string> = new Set(),
): ShotgunPlan {
  const slots: Slot[] = [];
  const warnings: string[] = [];
  let wave = 0;
  let used = 0;

  /** Free holes left in this wave from the cursor onward. */
  const roomNow = () => {
    let n = 0;
    for (let h = used + 1; h <= holes; h++)
      if (!occupied.has(shotgunKey(waveLetter(wave), h))) n += 1;
    return n;
  };

  const place = () => {
    // Step over holes a locked group already holds.
    for (;;) {
      if (used >= holes) {
        wave += 1;
        used = 0;
        continue;
      }
      if (occupied.has(shotgunKey(waveLetter(wave), used + 1))) {
        used += 1;
        continue;
      }
      break;
    }
    slots.push({
      startHole: used + 1,
      wave: waveLetter(wave),
      time: addMinutes(firstTeeTime, wave * waveGapMinutes),
    });
    used += 1;
  };

  for (const { flightName, groups } of flightGroupCounts) {
    if (groups === 0) continue;
    if (groups > holes) {
      warnings.push(
        `Flight ${flightName} has ${groups} groups, more than the ${holes} holes in one wave, so it was split across waves.`,
      );
    } else if (groups > roomNow() && used > 0) {
      wave += 1;
      used = 0;
    }
    for (let i = 0; i < groups; i++) place();
  }
  return { slots, warnings };
}

/** Shotgun planning with no locked groups. */
export function planShotgun(
  flightGroupCounts: { flightName: string; groups: number }[],
  holes: number,
  firstTeeTime: string,
  waveGapMinutes: number,
): ShotgunPlan {
  return planShotgunFrom(flightGroupCounts, holes, firstTeeTime, waveGapMinutes);
}

/**
 * Two-tee start: groups alternate between hole 1 and hole 10, and a new pair goes off each interval.
 * `occupied` holds hole+time pairs already taken by locked groups.
 */
export function planTwoTeeFrom(
  groupCount: number,
  firstTeeTime: string,
  intervalMinutes: number,
  occupied: ReadonlySet<string> = new Set(),
): Slot[] {
  const slots: Slot[] = [];
  let n = 0;
  while (slots.length < groupCount) {
    const slot: Slot = {
      startHole: n % 2 === 0 ? 1 : 10,
      wave: null,
      time: addMinutes(firstTeeTime, Math.floor(n / 2) * intervalMinutes),
    };
    n += 1;
    if (occupied.has(twoTeeKey(slot.startHole, slot.time))) continue;
    slots.push(slot);
  }
  return slots;
}

/** Two-tee planning with no locked groups. */
export function planTwoTee(
  groupCount: number,
  firstTeeTime: string,
  intervalMinutes: number,
): Slot[] {
  return planTwoTeeFrom(groupCount, firstTeeTime, intervalMinutes);
}
