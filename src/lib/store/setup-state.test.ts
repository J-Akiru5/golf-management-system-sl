import { describe, expect, it } from "vitest";
import { buildRegistrations, emptyState, initialState, reducer, routingInputFor } from "./state";

describe("the connected desk starts empty", () => {
  it("holds nothing from the demo", () => {
    const s = emptyState();
    expect(s.players).toEqual([]);
    expect(s.tournaments).toEqual([]);
    expect(s.entries).toEqual([]);
    expect(s.tees).toEqual([]);
    expect(s.holes).toEqual([]);
    expect(s.activeTournamentId).toBeNull();
    expect(s.club.name).toBe("");
    expect(buildRegistrations(s)).toEqual([]);
    expect(routingInputFor(s)).toBeNull();
  });

  it("is the demo only when asked for", () => {
    const s = initialState();
    expect(s.players.length).toBeGreaterThan(50);
    expect(s.tees).toHaveLength(4);
  });
});

describe("tees live in the state, so an edit reaches the draw", () => {
  it("routes against the saved tee numbers, not the demo constants", () => {
    const before = initialState();
    const tournament = before.tournaments.find((t) => t.id === before.activeTournamentId);
    if (!tournament) throw new Error("demo has an active tournament");
    const regs = buildRegistrations(before);
    const sample = regs.find((r) => r.teeId && r.playingHandicap !== null);
    if (!sample?.teeId) throw new Error("demo has a routed player");

    // A much higher Slope on the player's own tee must raise their course handicap.
    const tees = before.tees.map((t) => (t.id === sample.teeId ? { ...t, slope: 150 } : t));
    const after = reducer(before, { type: "saveSetup", tournament, tees, holes: before.holes });

    const changed = buildRegistrations(after).find((r) => r.playerId === sample.playerId);
    expect(changed?.playingHandicap).toBeGreaterThan(sample.playingHandicap ?? 0);
    expect(routingInputFor(after)?.tees.find((t) => t.id === sample.teeId)?.slope).toBe(150);
    // The original state is untouched: a reducer returns a new one.
    expect(before.tees.find((t) => t.id === sample.teeId)?.slope).not.toBe(150);
  });

  it("does not feed a stored review back into the draw", () => {
    const before = initialState();
    const entry = before.entries[0];
    if (!entry) throw new Error("demo has an entry");
    const marked = {
      ...before,
      entries: before.entries.map((candidate) =>
        candidate.id === entry.id
          ? {
              ...candidate,
              status: "needs_review" as const,
              reasons: ["No group in this player's class has an open place in the PM session."],
            }
          : candidate,
      ),
    };

    const input = routingInputFor(marked);
    expect(input?.players.some((player) => player.id === entry.playerId)).toBe(false);
    expect(input?.provisional?.some((player) => player.id === entry.playerId)).toBe(false);
  });

  it("saves the event row together with the tees and holes", () => {
    const before = initialState();
    const tournament = before.tournaments[0];
    if (!tournament) throw new Error("demo has a tournament");
    const holes = before.holes.map((h) => ({ ...h, par: 4, strokeIndex: h.number }));
    const after = reducer(before, {
      type: "saveSetup",
      tournament: { ...tournament, name: "Renamed" },
      tees: before.tees,
      holes,
    });
    expect(after.tournaments.find((t) => t.id === tournament.id)?.name).toBe("Renamed");
    expect(after.holes.every((h) => h.par === 4)).toBe(true);
  });

  it("adds an event that does not exist yet", () => {
    const before = emptyState();
    const base = initialState().tournaments[0];
    if (!base) throw new Error("demo has a tournament");
    const after = reducer(before, { type: "saveSetup", tournament: base, tees: [], holes: [] });
    expect(after.tournaments).toHaveLength(1);
  });
});

describe("a member-guest pair is classed on its average index", () => {
  it("gives both partners the class of the pair, not of each own index", () => {
    const before = initialState();
    const tournament = before.tournaments.find((t) => t.id === before.activeTournamentId);
    if (!tournament) throw new Error("demo has an active tournament");
    const [a, b] = before.entries.filter((e) => e.tournamentId === tournament.id && !e.overridden);
    if (!a || !b) throw new Error("demo has two entries");
    const withFrozen = (index: number) => (e: typeof a) => ({
      ...e,
      teamNo: 1,
      frozen: { ...e.frozen, index },
    });
    const state = {
      ...before,
      entries: before.entries.map((e) =>
        e.id === a.id ? withFrozen(2)(e) : e.id === b.id ? withFrozen(27)(e) : e,
      ),
    };
    const solo = buildRegistrations({
      ...state,
      entries: state.entries.map((e) =>
        e.id === a.id || e.id === b.id ? { ...e, teamNo: null } : e,
      ),
    });
    const paired = buildRegistrations(state);
    const pick = (list: typeof paired, id: string) => list.find((r) => r.entryId === id);
    // On their own the partners fall in different classes ...
    expect(pick(solo, a.id)?.flightId).not.toBe(pick(solo, b.id)?.flightId);
    // ... as a pair they share one class.
    expect(pick(paired, a.id)?.flightId).toBeTruthy();
    expect(pick(paired, a.id)?.flightId).toBe(pick(paired, b.id)?.flightId);
  });
});

describe("an index edit on one partner classes the pair", () => {
  it("keeps the pair key when a class is stored, so both partners take it", () => {
    const before = initialState();
    const tournament = before.tournaments.find((t) => t.id === before.activeTournamentId);
    if (!tournament) throw new Error("demo has an active tournament");
    const [a, b] = before.entries.filter((e) => e.tournamentId === tournament.id && !e.overridden);
    if (!a || !b) throw new Error("demo has two entries");
    const category = tournament.categories[0];
    if (!category) throw new Error("demo has a category");

    const state = {
      ...before,
      entries: before.entries.map((e) => {
        if (e.id === a.id) {
          // The desk corrected one partner's index and stored the pair's class with it.
          return {
            ...e,
            teamNo: 4,
            status: "ok" as const,
            overridden: true,
            categoryId: category.id,
            teeId: category.teeId,
            flightId: "d",
            playingHandicap: 26,
            frozen: { ...e.frozen, index: 2 },
          };
        }
        if (e.id === b.id) {
          return { ...e, teamNo: 4, frozen: { ...e.frozen, index: 27 } };
        }
        return e;
      }),
    };

    const regs = buildRegistrations(state);
    const pick = (id: string) => regs.find((r) => r.entryId === id);
    // The stored class is Class D. The average index of 2 and 27 is 14.5, which is Class B, so this
    // only holds because the pair key is kept and the stored class is applied to both partners.
    expect(pick(a.id)?.flightId).toBe("d");
    expect(pick(b.id)?.flightId).toBe("d");
    expect(pick(b.id)?.teamKey).toBe("team-4");
    expect(pick(b.id)?.pairKey).toBe("team-4");
  });

  it("does not invent a pair class when the stored override names none", () => {
    const before = initialState();
    const tournament = before.tournaments.find((t) => t.id === before.activeTournamentId);
    if (!tournament) throw new Error("demo has an active tournament");
    const [a, b] = before.entries.filter((e) => e.tournamentId === tournament.id && !e.overridden);
    if (!a || !b) throw new Error("demo has two entries");

    const state = {
      ...before,
      entries: before.entries.map((e) =>
        e.id === a.id
          ? {
              ...e,
              teamNo: 9,
              status: "ok" as const,
              overridden: true,
              categoryId: null,
              teeId: null,
              flightId: null,
              playingHandicap: null,
              frozen: { ...e.frozen, index: 2 },
            }
          : e.id === b.id
            ? { ...e, teamNo: 9, frozen: { ...e.frozen, index: 27 } }
            : e,
      ),
    };

    const regs = buildRegistrations(state);
    const stored = regs.find((r) => r.entryId === a.id);
    const partner = regs.find((r) => r.entryId === b.id);
    // The override has no class yet, so the player plays Unclassified and the partner keeps the
    // class their own index gives them. Nothing is guessed.
    expect(stored?.flightId).toBeNull();
    expect(stored?.provisional).toBe(true);
    expect(partner?.flightId).not.toBeNull();
    expect(partner?.flightId).not.toBe(stored?.flightId);
  });
});
