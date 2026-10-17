import { matchCategories, matchFlights } from "./classify";
import { chunk, groupSizes } from "./groups";
import { ageOn, playingHandicap } from "./handicap";
import { planShotgun, planTwoTee, type Slot, shotgunSlotKey, twoTeeSlotKey } from "./schedule";
import type {
  CategoryRule,
  FlightRule,
  Group,
  Player,
  Registration,
  RoutingResult,
  Tee,
  TournamentConfig,
} from "./types";

export { ageOn, playingHandicap, rawCourseHandicap } from "./handicap";
export { addMinutes } from "./schedule";
export * from "./types";

export interface RoutingInput {
  players: Player[];
  config: TournamentConfig;
  tees: Tee[];
  categories: CategoryRule[];
  flights: FlightRule[];
  /**
   * Groups the organizer locked. They keep their players, number and start slot, and the players
   * in them are not routed again. Everything else is rebuilt around them.
   */
  lockedGroups?: Group[];
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

  if (player.index === null) return review("No handicap index on file for the cut-off date.");
  if (player.index > config.maxIndex) {
    reg.status = "ineligible";
    reg.reasons.push(`Index ${player.index} is above the maximum of ${config.maxIndex}.`);
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
  reg.playingHandicap = playingHandicap(player.index, tee, config.allowance);

  const value = config.flightBasis === "index" ? player.index : reg.playingHandicap;
  const flightMatches = matchFlights(flights, category.id, value);
  if (flightMatches.length !== 1) {
    return review(
      flightMatches.length === 0
        ? `No ${category.name} flight covers ${config.flightBasis} ${value}.`
        : `Flight ranges overlap at ${value} in ${category.name}.`,
    );
  }
  reg.flightId = (flightMatches[0] as FlightRule).id;
  return reg;
}

/**
 * Full routing: classify everyone, then form groups and assign starts.
 * It only proposes. The organizer reviews and overrides before publishing.
 *
 * Locked groups are carried over untouched and their players are left out of the re-route, so
 * re-running the router never moves a locked group.
 */
export function route(input: RoutingInput): RoutingResult {
  const { players, config, categories, flights } = input;
  const lockedGroups = input.lockedGroups ?? [];
  const lockedPlayers = new Set(lockedGroups.flatMap((g) => g.playerIds));

  const registrations = players.map((p) => classifyPlayer(p, input));
  const warnings: string[] = [];

  // Flight play order: category order first, then lowest handicap range first.
  const catOrder = new Map(categories.map((c, i) => [c.id, i]));
  const orderedFlights = [...flights].sort(
    (a, b) =>
      (catOrder.get(a.categoryId) ?? 0) - (catOrder.get(b.categoryId) ?? 0) || a.min - b.min,
  );

  const placed: { flight: FlightRule; groups: string[][] }[] = [];
  for (const flight of orderedFlights) {
    const members = registrations
      .filter(
        (r) => r.status === "ok" && r.flightId === flight.id && !lockedPlayers.has(r.playerId),
      )
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
        warnings.push(`Flight ${flight.name}: a group has only ${g.length} player(s).`);
      }
    }
    placed.push({ flight, groups: cut.map((g) => g.map((r) => r.playerId)) });
  }

  // Locked groups keep their start slot, so the new groups take what is left.
  const occupied = new Set(
    lockedGroups.map((g) =>
      config.startFormat === "shotgun"
        ? shotgunSlotKey(g.wave ?? "", g.startHole)
        : twoTeeSlotKey(g.startHole, g.time),
    ),
  );

  const totalGroups = placed.reduce((n, p) => n + p.groups.length, 0);
  let slots: Slot[];
  if (config.startFormat === "shotgun") {
    const plan = planShotgun(
      placed.map((p) => ({ flightName: p.flight.name, groups: p.groups.length })),
      config.holes,
      config.firstTeeTime,
      config.waveGapMinutes,
      occupied,
    );
    warnings.push(...plan.warnings);
    slots = plan.slots;
  } else {
    slots = planTwoTee(totalGroups, config.firstTeeTime, config.intervalMinutes, occupied);
  }

  // New groups take the lowest free numbers; locked groups keep theirs.
  const usedNumbers = new Set(lockedGroups.map((g) => g.number));
  const nextNumber = () => {
    let n = 1;
    while (usedNumbers.has(n)) n += 1;
    usedNumbers.add(n);
    return n;
  };

  const groups: Group[] = [...lockedGroups];
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

  groups.sort((a, b) => a.number - b.number);
  return { registrations, groups, warnings };
}
