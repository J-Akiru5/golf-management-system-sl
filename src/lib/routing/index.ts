import { matchCategories, matchFlights } from "./classify";
import { chunk, groupSizes } from "./groups";
import { ageOn, playingHandicap } from "./handicap";
import { planShotgunFrom, planTwoTeeFrom, type Slot, shotgunKey, twoTeeKey } from "./schedule";
import type {
  CategoryRule,
  FlightRule,
  Group,
  Player,
  ProvisionalPlayer,
  Registration,
  RoutingResult,
  Tee,
  TournamentConfig,
} from "./types";

export { ageOn, courseHandicap, playingHandicap, rawCourseHandicap } from "./handicap";
export { addMinutes } from "./schedule";
export * from "./types";

/**
 * The heading used for a confirmed player the engine could not classify. It is a label for a
 * group, not a category or a flight: the player's own category and flight stay empty.
 */
export const UNCLASSIFIED_LABEL = "Unclassified";

export interface RoutingInput {
  players: Player[];
  config: TournamentConfig;
  tees: Tee[];
  categories: CategoryRule[];
  flights: FlightRule[];
  /**
   * Desk-confirmed players missing a routing fact. They are placed in Unclassified groups so they
   * can play today; the missing details are corrected later and the draw is re-run.
   */
  provisional?: ProvisionalPlayer[];
}

/** A group the organizer has locked. A re-run keeps it exactly as it is. */
export interface LockedGroup {
  number: number;
  flightId: string;
  playerIds: string[];
  startHole: number;
  wave: string | null;
  time: string;
}

export interface RouteOptions {
  /** Groups that must not move when the draw is re-run. */
  lockedGroups?: LockedGroup[];
}

/** Steps 2 to 7 of the routing flow: classify one player. Pure, so it can be tested alone. */
export function classifyPlayer(player: Player, input: RoutingInput): Registration {
  const { config, tees, categories, flights } = input;
  const age = ageOn(player.birthdate, config.date);
  const reg: Registration = {
    playerId: player.id,
    playerName: player.name,
    status: "ok",
    reasons: [],
    index: player.index,
    age,
    categoryId: null,
    teeId: null,
    playingHandicap: null,
    flightId: null,
  };
  const review = (reason: string) => {
    reg.status = "needs_review";
    reg.reasons.push(reason);
    return reg;
  };

  // The event rule treats an unverified handicap as 0: a player with no index on file still plays,
  // joins a class and can be paired. The reason names the number so the desk can correct it later.
  const index = player.index ?? 0;
  if (player.index === null) reg.reasons.push("No handicap index on file; 0 is used.");
  if (index > config.maxIndex) {
    reg.status = "ineligible";
    reg.reasons.push(`Index ${index} is above the maximum of ${config.maxIndex}.`);
    return reg;
  }

  const matches = matchCategories(categories, player.gender, age);
  if (matches.length === 0) return review(`No category fits a ${age}-year-old (${player.gender}).`);
  if (matches.length > 1) {
    return review(`Category rules overlap: ${matches.map((m) => m.name).join(", ")}.`);
  }
  const category = matches[0] as CategoryRule;
  reg.categoryId = category.id;

  const tee = tees.find((t) => t.id === category.teeId);
  if (!tee) return review(`Tee ${category.teeId} for ${category.name} is not set up.`);
  reg.teeId = tee.id;
  reg.playingHandicap = playingHandicap(index, tee, config.allowance);

  const value = config.flightBasis === "index" ? index : reg.playingHandicap;
  // Class first: the ranges are field-wide, so a player joins a class on their number alone and the
  // tee group plays no part.
  const flightMatches = matchFlights(flights, value);
  if (flightMatches.length !== 1) {
    return review(
      flightMatches.length === 0
        ? `No class covers ${config.flightBasis} ${value}.`
        : `Class ranges overlap at ${value}.`,
    );
  }
  reg.flightId = (flightMatches[0] as FlightRule).id;
  return reg;
}

/**
 * Full routing: classify everyone, then form groups and assign starts.
 * It only proposes. The organizer reviews and overrides before publishing.
 *
 * Locked groups are kept untouched: their players are left out of the re-grouping and their slots
 * are held, so re-running the draw never moves a locked group. A lock that no longer makes sense
 * (a player left the field, changed category or flight, or the group is over size) is released and
 * named in the warnings rather than being applied blindly.
 */
export function route(input: RoutingInput, options: RouteOptions = {}): RoutingResult {
  const { players, config, categories, flights } = input;
  const provisional = input.provisional ?? [];
  // A provisional registration is confirmed but has no category or flight. It exists so the draw
  // can hold a slot for the player without inventing the facts the desk still has to collect.
  const provisionalRegistrations: Registration[] = provisional.map((p) => ({
    playerId: p.id,
    playerName: p.name,
    status: "ok",
    reasons: [`Confirmed as provisional; still missing ${p.missing.join(", ")}.`],
    index: p.index,
    age: 0,
    categoryId: null,
    teeId: null,
    playingHandicap: null,
    flightId: null,
    provisional: true,
  }));
  const registrations = [
    ...players.map((p) => classifyPlayer(p, input)),
    ...provisionalRegistrations,
  ];
  const byId = new Map(registrations.map((r) => [r.playerId, r]));
  const warnings: string[] = [];

  const kept: LockedGroup[] = [];
  const lockedIds = new Set<string>();
  for (const g of options.lockedGroups ?? []) {
    if (g.playerIds.length === 0) continue;
    const members = g.playerIds.map((id) => byId.get(id));
    const missing = members.some((m) => !m);
    const notOk = members.some((m) => m && m.status !== "ok");
    const flightIds = new Set(members.map((m) => m?.flightId ?? null));
    const provisionalOnly = members.length > 0 && members.every((m) => m?.provisional === true);
    const oneFlight =
      (flightIds.size === 1 && !flightIds.has(null)) || (provisionalOnly && !missing);
    const overSize = g.playerIds.length > config.groupSize;
    const repeated = g.playerIds.find((id) => lockedIds.has(id));
    if (repeated !== undefined) {
      warnings.push(
        `Locked group ${g.number} was released: this player is already in another locked group.`,
      );
      continue;
    }
    if (missing || notOk || !oneFlight || overSize) {
      const why = missing
        ? "a player in it is no longer in the field"
        : notOk
          ? "a player in it is no longer ready to play"
          : overSize
            ? `it has more than ${config.groupSize} players`
            : "its players no longer share one flight";
      warnings.push(
        `Locked group ${g.number} was released: ${why}, so it went back into the draw.`,
      );
      continue;
    }
    kept.push({ ...g, flightId: provisionalOnly ? g.flightId : ([...flightIds][0] as string) });
    for (const id of g.playerIds) lockedIds.add(id);
  }

  // Class play order: the lowest handicap range first. Classes never sort by category or tee, so a
  // class stays whole even when its players come from different tee groups.
  const orderedFlights = [...flights].sort((a, b) => a.min - b.min);

  const placed: { flight: FlightRule; groups: string[][] }[] = [];
  for (const flight of orderedFlights) {
    const members = registrations
      .filter((r) => r.status === "ok" && r.flightId === flight.id && !lockedIds.has(r.playerId))
      .sort(
        (a, b) =>
          (a.playingHandicap ?? 0) - (b.playingHandicap ?? 0) ||
          a.playerName.localeCompare(b.playerName),
      );
    if (members.length === 0) continue;
    const sizes = groupSizes(members.length, config.groupSize);
    const cut = chunk(members, sizes);
    for (const g of cut) {
      if (g.length < config.minGroupSize) {
        warnings.push(`Class ${flight.name}: a group has only ${g.length} player(s).`);
      }
    }
    placed.push({ flight, groups: cut.map((g) => g.map((r) => r.playerId)) });
  }

  // Unclassified placement: confirmed players the engine cannot classify. They keep empty
  // category, tee and flight; only a group heading and a start slot are supplied. They are listed
  // after every real flight and sorted by name so a re-run is stable. The group row needs a real
  // flight id for the database, so the first flight's id is used as a carrier only: the board and
  // the published snapshot label the group from its provisional members, never from that flight.
  const loose = provisional
    .filter((p) => !lockedIds.has(p.id))
    .sort((a, b) => a.name.localeCompare(b.name));
  if (loose.length > 0) {
    const carrierFlightId = orderedFlights[0]?.id ?? "";
    if (carrierFlightId === "") {
      warnings.push(
        `The event has no flights set up, so ${UNCLASSIFIED_LABEL} groups cannot be saved. Set up at least one flight in Settings.`,
      );
    }
    const sizes = groupSizes(loose.length, config.groupSize);
    const cut = chunk(loose, sizes);
    for (const g of cut) {
      if (g.length < config.minGroupSize) {
        warnings.push(`${UNCLASSIFIED_LABEL}: a group has only ${g.length} player(s).`);
      }
    }
    placed.push({
      flight: { id: carrierFlightId, name: UNCLASSIFIED_LABEL, categoryId: "", min: 0, max: 0 },
      groups: cut.map((g) => g.map((r) => r.id)),
    });
    warnings.push(
      `${loose.length} confirmed player(s) are missing a birthdate, gender or handicap index and were placed in ${UNCLASSIFIED_LABEL} groups. Correct the details and re-run the draw.`,
    );
  }

  const newGroupCount = placed.reduce((n, p) => n + p.groups.length, 0);
  const occupied = new Set(
    kept.map((g) =>
      config.startFormat === "shotgun"
        ? shotgunKey(g.wave ?? "A", g.startHole)
        : twoTeeKey(g.startHole, g.time),
    ),
  );

  let slots: Slot[];
  if (config.startFormat === "shotgun") {
    const plan = planShotgunFrom(
      placed.map((p) => ({ flightName: p.flight.name, groups: p.groups.length })),
      config.holes,
      config.firstTeeTime,
      config.waveGapMinutes,
      occupied,
    );
    warnings.push(...plan.warnings);
    slots = plan.slots;
  } else {
    slots = planTwoTeeFrom(newGroupCount, config.firstTeeTime, config.intervalMinutes, occupied);
  }

  // A locked slot inside the first wave can force a flight that would fit into two waves.
  if (config.startFormat === "shotgun" && kept.length > 0) {
    let cursor = 0;
    for (const flight of placed) {
      const waves = new Set<string>();
      for (let i = 0; i < flight.groups.length; i++) {
        const slot = slots[cursor + i];
        if (slot?.wave) waves.add(slot.wave);
      }
      cursor += flight.groups.length;
      if (waves.size > 1 && flight.groups.length <= config.holes) {
        warnings.push(
          `Class ${flight.flight.name} is split across waves because locked groups hold slots in the first wave.`,
        );
      }
    }
  }

  const groups: Group[] = kept.map((g) => ({
    number: g.number,
    flightId: g.flightId,
    playerIds: [...g.playerIds],
    startHole: g.startHole,
    wave: g.wave,
    time: g.time,
  }));

  // New groups take the lowest numbers a locked group has not claimed.
  const takenNumbers = new Set(kept.map((g) => g.number));
  const nextNumber = () => {
    let n = 1;
    while (takenNumbers.has(n)) n += 1;
    takenNumbers.add(n);
    return n;
  };

  let n = 0;
  for (const { flight, groups: cutGroups } of placed) {
    for (const playerIds of cutGroups) {
      const slot = slots[n];
      if (!slot) throw new Error("Routing bug: fewer slots than groups.");
      groups.push({
        number: nextNumber(),
        flightId: flight.id,
        playerIds,
        startHole: slot.startHole,
        wave: slot.wave,
        time: slot.time,
      });
      n += 1;
    }
  }

  groups.sort(
    (a, b) => a.time.localeCompare(b.time) || a.startHole - b.startHole || a.number - b.number,
  );
  return { registrations, groups, warnings };
}
