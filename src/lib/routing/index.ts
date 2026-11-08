import { applyTeamClasses, defaultCategoryFor, matchCategories, matchFlights } from "./classify";
import { chunk, groupSizes, packUnits } from "./groups";
import { ageOn, playingHandicap } from "./handicap";
import {
  planShotgunFrom,
  planTwoTeeFrom,
  type Slot,
  seedFrom,
  shotgunKey,
  twoTeeKey,
} from "./schedule";
import type {
  CategoryRule,
  FlightRule,
  Group,
  Player,
  ProvisionalPlayer,
  Registration,
  RoutingResult,
  Session,
  SessionInput,
  Tee,
  TournamentConfig,
} from "./types";

export { averageIndex, defaultCategoryFor } from "./classify";
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
   * The category a player joins when their birthdate or gender is not on file. Schedule first, then
   * collect the missing details for scoring; nothing about the player is invented.
   */
  defaultCategoryId?: string;
  /**
   * Desk-confirmed players missing a routing fact. They are placed in Unclassified groups so they
   * can play today; the missing details are corrected later and the draw is re-run.
   */
  provisional?: ProvisionalPlayer[];
  /**
   * The day's morning and afternoon shotguns. When it is given, the field is cut and slotted per
   * session: each session fills its own holes from its own start time, and a wave is labelled with
   * the day and session it belongs to (D3-AM-A).
   */
  sessions?: SessionInput;
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
  /**
   * Fixes the shuffled hole order. Left out, the draw seeds itself from the field, so the same field
   * draws the same holes and a re-run never reshuffles a board the desk has already seen.
   */
  seed?: number;
  /**
   * Fill each wave as it goes and let a class continue into the next wave when the holes run out,
   * instead of moving the whole class on. The club fills a day this way: wave 1 takes groups until
   * the 18 holes are used, and wave 2 takes whoever is left.
   */
  splitClassesAcrossWaves?: boolean;
}

/** Steps 2 to 7 of the routing flow: classify one player. Pure, so it can be tested alone. */
export function classifyPlayer(player: Player, input: RoutingInput): Registration {
  const { config, tees, categories, flights } = input;
  // Age is measured on the day of play. A player without a birthdate on file is still drawn: the
  // age stays unknown and the class comes from the handicap alone.
  const age = player.birthdate === null ? 0 : ageOn(player.birthdate, config.date);
  const reg: Registration = {
    playerId: player.id,
    playerName: player.name,
    teamKey: player.teamKey ?? null,
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
  // The event rule caps an index above the maximum at the maximum: the player still plays, and the
  // class, tee and playing handicap use the capped number. The index on file is left as it is, so
  // the real number is not lost and the desk can see why the cap was applied.
  const onFile = player.index ?? 0;
  const index = Math.min(onFile, config.maxIndex);
  if (player.index === null) reg.reasons.push("No handicap index on file; 0 is used.");
  if (onFile > config.maxIndex) {
    reg.reasons.push(
      `Index ${onFile} is above the maximum of ${config.maxIndex}; ${index} is used.`,
    );
  }

  let category: CategoryRule | undefined;
  if (player.birthdate === null || player.gender === null) {
    // The owner's rule: schedule first. The club's open division is used until the birthdate and
    // gender are collected, which is when the tee and the playing handicap can be corrected.
    category =
      categories.find((rule) => rule.id === input.defaultCategoryId) ??
      defaultCategoryFor(categories) ??
      undefined;
    if (!category) {
      return review("No category is set up to draw a player whose birthdate or gender is unknown.");
    }
    reg.reasons.push(`No birthdate or gender on file; ${category.name} is used for the draw.`);
  } else {
    const matches = matchCategories(categories, player.gender, age);
    if (matches.length === 0)
      return review(`No category fits a ${age}-year-old (${player.gender}).`);
    if (matches.length > 1) {
      return review(`Category rules overlap: ${matches.map((m) => m.name).join(", ")}.`);
    }
    category = matches[0] as CategoryRule;
  }
  reg.categoryId = category.id;

  const tee = tees.find((t) => t.id === category.teeId);
  if (!tee) return review(`Tee ${category.teeId} for ${category.name} is not set up.`);
  reg.teeId = tee.id;
  reg.playingHandicap = playingHandicap(index, tee, config.allowance);

  // The club classes the field on the handicap index: a player's own index, and for a member-guest
  // pair the average of the two. The course handicap converter still sets the playing handicap.
  const value = index;
  // Class first: the ranges are field-wide, so a player joins a class on their number alone and the
  // tee group plays no part.
  const flightMatches = matchFlights(flights, value);
  if (flightMatches.length !== 1) {
    return review(
      flightMatches.length === 0
        ? `No class covers index ${value}.`
        : `Class ranges overlap at ${value}.`,
    );
  }
  reg.flightId = (flightMatches[0] as FlightRule).id;
  return reg;
}

/**
 * The players of one class, gathered into units: a team of two becomes one unit, everyone else a
 * unit of their own. The order is the class order, so the strongest pair still goes out first.
 */
function teamUnits(members: Registration[]): Registration[][] {
  const units: Registration[][] = [];
  const at = new Map<string, number>();
  for (const member of members) {
    const key = member.teamKey ?? null;
    if (key === null) {
      units.push([member]);
      continue;
    }
    const index = at.get(key);
    if (index === undefined) {
      at.set(key, units.length);
      units.push([member]);
    } else {
      units[index]?.push(member);
    }
  }
  return units;
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
    teamKey: null,
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
  // A member-guest pair is classed on the average of the two indexes, before any grouping, so both
  // partners share one class and cannot be split across groups.
  applyTeamClasses(registrations, flights, config.maxIndex);
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

  // A day can run two shotguns. When the caller names each player's session, the field is cut per
  // session, so the morning never borrows the afternoon's holes or its start time.
  const sessionInput = input.sessions;
  /**
   * Is this player playing the day being drawn? The map the caller passes is the day's own
   * registrations, so a player who is missing from it chose another day and must not be drawn
   * here. An explicit null value is different: the player is playing but the desk has not
   * recorded a session, so they are drawn in the morning and the warning names the gap.
   */
  const playingThisDay = (playerId: string): boolean => {
    if (!sessionInput) return true;
    const byPlayer = sessionInput.byPlayer;
    if (byPlayer instanceof Map) return byPlayer.has(playerId);
    return Object.prototype.hasOwnProperty.call(byPlayer, playerId);
  };
  const sessionOf = (playerId: string): Session | null => {
    if (!sessionInput) return null;
    const byPlayer = sessionInput.byPlayer;
    const value =
      byPlayer instanceof Map
        ? byPlayer.get(playerId)
        : (byPlayer as Record<string, Session | null | undefined>)[playerId];
    return value === "AM" || value === "PM" ? value : null;
  };
  const sessionFor = (r: Registration): Session | null =>
    sessionOf(r.playerId) ?? (sessionInput ? "AM" : null);
  const sessionOrder: (Session | null)[] = sessionInput ? ["AM", "PM"] : [null];
  if (sessionInput) {
    const unassigned = registrations.filter(
      (r) => r.status === "ok" && playingThisDay(r.playerId) && sessionOf(r.playerId) === null,
    );
    if (unassigned.length > 0) {
      warnings.push(
        `${unassigned.length} player(s) have no morning or afternoon session on this day, so they are drawn in the morning.`,
      );
    }
  }
  // A second start inside a session is spaced by the batch interval, not by the long gap between
  // sessions. Without an explicit interval the event setting is used.
  const batchGap =
    sessionInput?.batchGapMinutes !== undefined &&
    Number.isFinite(sessionInput.batchGapMinutes) &&
    sessionInput.batchGapMinutes > 0
      ? sessionInput.batchGapMinutes
      : config.waveGapMinutes;

  const placed: { flight: FlightRule; groups: string[][]; session: Session | null }[] = [];
  for (const session of sessionOrder) {
    for (const flight of orderedFlights) {
      const members = registrations
        .filter(
          (r) =>
            r.status === "ok" &&
            playingThisDay(r.playerId) &&
            r.flightId === flight.id &&
            !lockedIds.has(r.playerId) &&
            sessionFor(r) === session,
        )
        .sort(
          (a, b) =>
            (a.playingHandicap ?? 0) - (b.playingHandicap ?? 0) ||
            a.playerName.localeCompare(b.playerName),
        );
      if (members.length === 0) continue;
      // A pair is never split. When a class holds teams, groups are filled team by team; without
      // teams the even split is kept, so an ordinary event's groups stay as balanced as before.
      const units = teamUnits(members);
      const hasTeams = units.some((unit) => unit.length > 1);
      const cut = hasTeams
        ? packUnits(units, config.groupSize)
        : chunk(members, groupSizes(members.length, config.groupSize));
      for (const g of cut) {
        if (g.length < config.minGroupSize) {
          warnings.push(`Class ${flight.name}: a group has only ${g.length} player(s).`);
        }
      }
      placed.push({ flight, groups: cut.map((g) => g.map((r) => r.playerId)), session });
    }
  }

  // A session has room for `maxFlightsPerSession` flights of one group per hole, and no more. The
  // groups past that are left out of the draw, whole groups from the end of the class order, so a
  // pair is never split. Their players stay "not in a group" for the organizer to move to the other
  // session or day. Groups an organizer locked already hold holes, so they count against the room.
  if (sessionInput && config.startFormat === "shotgun") {
    const maxFlights = Math.max(1, Math.floor(config.maxFlightsPerSession ?? 2));
    const capacity = config.holes * maxFlights;
    for (const session of sessionOrder) {
      if (session === null) continue;
      const lockedHere = kept.filter(
        (g) => g.time >= sessionInput.starts.PM === (session === "PM"),
      ).length;
      let room = Math.max(0, capacity - lockedHere);
      let droppedGroups = 0;
      let droppedPlayers = 0;
      for (const entry of placed.filter((p) => p.session === session)) {
        if (entry.groups.length > room) {
          const left = entry.groups.splice(room);
          droppedGroups += left.length;
          droppedPlayers += left.reduce((sum, g) => sum + g.length, 0);
        }
        room -= entry.groups.length;
      }
      if (droppedGroups > 0) {
        warnings.push(
          `${session} session: the course fits ${capacity} groups (${maxFlights} flight${maxFlights === 1 ? "" : "s"} of ${config.holes} holes), so ${droppedGroups} group${droppedGroups === 1 ? "" : "s"} with ${droppedPlayers} player${droppedPlayers === 1 ? "" : "s"} ${droppedGroups === 1 ? "was" : "were"} left out. Move them to the other session or day.`,
        );
      }
    }
  }

  // Unclassified placement: confirmed players the engine cannot classify. They keep empty
  // category, tee and flight; only a group heading and a start slot are supplied. They are listed
  // after every real flight and sorted by name so a re-run is stable. The group row needs a real
  // flight id for the database, so the first flight's id is used as a carrier only: the board and
  // the published snapshot label the group from its provisional members, never from that flight.
  const looseRegistrations = provisionalRegistrations
    .filter((r) => !lockedIds.has(r.playerId) && playingThisDay(r.playerId))
    .sort((a, b) => a.playerName.localeCompare(b.playerName));
  if (looseRegistrations.length > 0) {
    const carrierFlightId = orderedFlights[0]?.id ?? "";
    if (carrierFlightId === "") {
      warnings.push(
        `The event has no flights set up, so ${UNCLASSIFIED_LABEL} groups cannot be saved. Set up at least one flight in Settings.`,
      );
    }
    // Each session keeps its own unclassified block, so a confirmed player who chose the
    // afternoon goes off in the afternoon instead of being dropped into the morning.
    for (const session of sessionOrder) {
      const loose = looseRegistrations.filter((r) => sessionFor(r) === session);
      if (loose.length === 0) continue;
      const cut = chunk(loose, groupSizes(loose.length, config.groupSize));
      for (const g of cut) {
        if (g.length < config.minGroupSize) {
          warnings.push(`${UNCLASSIFIED_LABEL}: a group has only ${g.length} player(s).`);
        }
      }
      const boundary = placed.reduce(
        (last, entry, index) => (entry.session === session ? index + 1 : last),
        0,
      );
      placed.splice(boundary, 0, {
        flight: { id: carrierFlightId, name: UNCLASSIFIED_LABEL, categoryId: "", min: 0, max: 0 },
        groups: cut.map((g) => g.map((r) => r.playerId)),
        session,
      });
    }
    warnings.push(
      `${looseRegistrations.length} confirmed player(s) are missing a birthdate, gender or handicap index and were placed in ${UNCLASSIFIED_LABEL} groups. Correct the details and re-run the draw.`,
    );
  }

  const newGroupCount = placed.reduce((n, p) => n + p.groups.length, 0);
  const occupied = new Set(
    kept.map((g) =>
      config.startFormat === "shotgun"
        ? shotgunKey(g.time, g.startHole)
        : twoTeeKey(g.startHole, g.time),
    ),
  );

  const drawSeed =
    options.seed ??
    seedFrom(
      registrations
        .map((r) => `${r.playerId}:${r.index ?? ""}`)
        .sort()
        .join("|"),
    );

  let slots: Slot[];
  if (config.startFormat === "shotgun") {
    if (sessionInput) {
      // Each session fills its own holes from its own start time, and a session that needs more
      // groups than the holes can hold gets a later start inside the same session.
      slots = [];
      for (const session of sessionOrder) {
        if (session === null) continue;
        const counts = placed
          .filter((p) => p.session === session)
          .map((p) => ({ flightName: p.flight.name, groups: p.groups.length }));
        if (counts.length === 0) continue;
        const plan = planShotgunFrom(
          counts,
          config.holes,
          sessionInput.starts[session],
          batchGap,
          occupied,
          drawSeed,
          options.splitClassesAcrossWaves ?? false,
        );
        warnings.push(...plan.warnings);
        slots.push(...plan.slots);
      }
    } else {
      const plan = planShotgunFrom(
        placed.map((p) => ({ flightName: p.flight.name, groups: p.groups.length })),
        config.holes,
        config.firstTeeTime,
        config.waveGapMinutes,
        occupied,
        drawSeed,
        options.splitClassesAcrossWaves ?? false,
      );
      warnings.push(...plan.warnings);
      slots = plan.slots;
    }
  } else {
    slots = planTwoTeeFrom(newGroupCount, config.firstTeeTime, config.intervalMinutes, occupied);
  }

  // A locked slot at the first start can force a flight that would fit into two starts.
  if (config.startFormat === "shotgun" && kept.length > 0) {
    let cursor = 0;
    for (const flight of placed) {
      const starts = new Set<string>();
      for (let i = 0; i < flight.groups.length; i++) {
        const slot = slots[cursor + i];
        if (slot?.time) starts.add(slot.time);
      }
      cursor += flight.groups.length;
      if (starts.size > 1 && flight.groups.length <= config.holes) {
        warnings.push(
          `Class ${flight.flight.name} is split across start times because locked groups hold slots at the first start.`,
        );
      }
    }
  }

  const groups: Group[] = kept.map((g) => ({
    number: g.number,
    flightId: g.flightId,
    playerIds: [...g.playerIds],
    startHole: g.startHole,
    // Kept for stored boards, but a draw no longer creates a wave: the time says when it starts.
    wave: null,
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
        wave: null,
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
