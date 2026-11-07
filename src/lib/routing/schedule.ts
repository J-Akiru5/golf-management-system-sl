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

export interface Slot {
  startHole: number;
  time: string;
}

export interface ShotgunPlan {
  slots: Slot[];
  warnings: string[];
}

/** A shotgun slot: a start time and the hole the group tees off on. */
export const shotgunKey = (time: string, hole: number) => `${time}:${hole}`;
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
 * Assigns each flight's groups to shotgun holes at start times.
 *
 * Every hole carries one group per start. The first start is the session's own time; when the holes
 * are full, the next group goes off one gap later in the same session. There are no wave letters:
 * a group is described by its time and the hole it starts on, and nothing else.
 *
 * A flight stays whole: if it does not fit in the holes left at the current start, it waits for the
 * next one. Only a flight with more groups than holes is split, and that is flagged.
 *
 * With a `seed`, the holes of each start are shuffled before they are handed out, so a class is
 * spread around the course instead of running down holes 1..N, and the order differs from start to
 * start. The same seed always produces the same board. Without a seed the holes stay in order.
 *
 * `occupied` holds time+hole slots already taken by locked groups, so a re-run never lands on top of
 * them. `flightGroupCounts` is the number of groups in each flight, in play order.
 */
export function planShotgunFrom(
  flightGroupCounts: { flightName: string; groups: number }[],
  holes: number,
  firstTeeTime: string,
  gapMinutes: number,
  occupied: ReadonlySet<string> = new Set(),
  seed?: number,
  /**
   * Keep filling the start a class is already in and let the class continue into the next start when
   * the holes run out, instead of moving the whole class on. The club fills a day this way: the first
   * start takes groups until the holes are used, and the next start takes whoever is left.
   */
  fillSequentially = false,
): ShotgunPlan {
  const slots: Slot[] = [];
  const warnings: string[] = [];
  let start = 0;
  let placedNow = 0;
  const random = seed === undefined ? null : mulberry32(seed);
  const orders = new Map<number, number[]>();
  const timeOf = (index: number) => addMinutes(firstTeeTime, index * gapMinutes);

  /** The free holes at a start, in the order they will be handed out. */
  const orderFor = (index: number) => {
    const cached = orders.get(index);
    if (cached) return cached;
    const list: number[] = [];
    for (let hole = 1; hole <= holes; hole++) {
      if (!occupied.has(shotgunKey(timeOf(index), hole))) list.push(hole);
    }
    if (random) shuffle(list, random);
    orders.set(index, list);
    return list;
  };

  /** Free holes left at this start. */
  const roomNow = () => orderFor(start).length;

  const place = () => {
    for (;;) {
      const order = orderFor(start);
      const startHole = order.shift();
      if (startHole === undefined) {
        start += 1;
        placedNow = 0;
        continue;
      }
      slots.push({ startHole, time: timeOf(start) });
      placedNow += 1;
      return;
    }
  };

  for (const { flightName, groups } of flightGroupCounts) {
    if (groups === 0) continue;
    const startIndex = start;
    if (groups > holes) {
      warnings.push(
        `Flight ${flightName} has ${groups} groups, more than the ${holes} holes at one start, so it was split across start times.`,
      );
    } else if (!fillSequentially && groups > roomNow() && placedNow > 0) {
      start += 1;
      placedNow = 0;
    }
    for (let i = 0; i < groups; i++) place();
    if (fillSequentially && groups <= holes && start > startIndex) {
      warnings.push(
        `Class ${flightName} plays across the ${timeOf(startIndex)} and ${timeOf(start)} starts.`,
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
  gapMinutes: number,
): ShotgunPlan {
  return planShotgunFrom(flightGroupCounts, holes, firstTeeTime, gapMinutes);
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
