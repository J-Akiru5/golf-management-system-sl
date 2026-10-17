import { describe, expect, it } from "vitest";
import { createDemoDeskState, createInitialDeskState } from "./desk-store";

describe("demo Desk fallback", () => {
  it("keeps the existing demo state shape and seeded sample data", () => {
    const state = createInitialDeskState(false);
    expect(state).toMatchObject({
      name: "IGCC Monthly Medal (demo)",
      config: { date: "2026-11-14", startFormat: "shotgun", groupSize: 4 },
      draw: null,
      published: null,
      importedCount: 0,
      clubId: null,
      tournamentId: null,
    });
    expect(state.players).toHaveLength(68);
    expect(state.players[0]?.name).toBe("Antonio Alcantara");
    expect(state.tees).toHaveLength(4);
    expect(state.categories).toHaveLength(4);
    expect(state.flights).toHaveLength(8);
    expect(state.photoPaths).toEqual({});
  });

  it("starts empty in configured Supabase mode rather than flashing demo players", () => {
    const state = createInitialDeskState(true);
    expect(state.players).toEqual([]);
    expect(state.name).toBe("");
    expect(state.clubId).toBeNull();
    expect(state.tournamentId).toBeNull();
  });
});
