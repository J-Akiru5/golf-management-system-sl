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

/** A small deterministic PRNG (mulberry32), so a seeded draw is reproducible. */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher-Yates, in place. */
function shuffle<T>(items: T[], random: () => number): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    const a = items[i] as T;
    items[i] = items[j] as T;
    items[j] = a;
  }
  return items;
}

/** A stable number from a string, so the same field always draws the same hole order. */
export function seedFrom(text: string): number {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/**
 * Assigns each flight's groups to shotgun holes. One group per hole per wave.
 * A flight stays whole: if it does not fit in the rest of the wave it starts the next wave.
 * Only a flight with more groups than holes is split, and that is flagged.
 *
 * With a `seed`, the holes of each wave are shuffled before they are handed out, so a class is
 * spread around the course instead of running down holes 1..N, and the order differs from wave to
 * wave. The same seed always produces the same board. Without a seed the holes stay in order.
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
  seed?: number,
  /**
   * Put in front of the wave letter, so a board can hold a day and its session: `D3-AM-A`.
   * Locked slots in `occupied` carry the same prefix.
   */
  wavePrefix = "",
  /**
   * Keep filling the wave a class is already in and let the class continue into the next wave when
   * the holes run out, instead of moving the whole class on. The club fills a day this way: wave 1
   * takes groups until the 18 holes are used, and wave 2 takes whoever is left. A class that lands
   * in two waves is named in the warnings.
   */
  fillSequentially = false,
): ShotgunPlan {
  const slots: Slot[] = [];
  const warnings: string[] = [];
  let wave = 0;
  let placedInWave = 0;
  const random = seed === undefined ? null : mulberry32(seed);
  const orders = new Map<number, number[]>();
  const label = (index: number) => `${wavePrefix}${waveLetter(index)}`;

  /** The free holes of a wave, in the order they will be handed out. */
  const orderFor = (index: number) => {
    const cached = orders.get(index);
    if (cached) return cached;
    const list: number[] = [];
    for (let hole = 1; hole <= holes; hole++) {
      if (!occupied.has(shotgunKey(label(index), hole))) list.push(hole);
    }
    if (random) shuffle(list, random);
    orders.set(index, list);
    return list;
  };

  /** Free holes left in this wave. */
  const roomNow = () => orderFor(wave).length;

  const place = () => {
    for (;;) {
      const order = orderFor(wave);
      const startHole = order.shift();
      if (startHole === undefined) {
        wave += 1;
        placedInWave = 0;
        continue;
      }
      slots.push({
        startHole,
        wave: label(wave),
        time: addMinutes(firstTeeTime, wave * waveGapMinutes),
      });
      placedInWave += 1;
      return;
    }
  };

  for (const { flightName, groups } of flightGroupCounts) {
    if (groups === 0) continue;
    const startWave = wave;
    if (groups > holes) {
      warnings.push(
        `Flight ${flightName} has ${groups} groups, more than the ${holes} holes in one wave, so it was split across waves.`,
      );
    } else if (!fillSequentially && groups > roomNow() && placedInWave > 0) {
      wave += 1;
      placedInWave = 0;
    }
    for (let i = 0; i < groups; i++) place();
    if (fillSequentially && groups <= holes && wave > startWave) {
      warnings.push(
        `Class ${flightName} plays across waves ${label(startWave)} to ${label(wave)}.`,
      );
    }
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
