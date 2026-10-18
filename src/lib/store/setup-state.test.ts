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
