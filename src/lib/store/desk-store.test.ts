import { describe, expect, it } from "vitest";
import { createDemoDeskState, createInitialDeskState, reducer } from "./desk-store";

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

describe("re-running the draw", () => {
  it("keeps a locked group exactly as it was, players and start slot included", () => {
    const drawn = reducer(createDemoDeskState(), { type: "generate" });
    const firstGroup = drawn.draw?.[0];
    expect(firstGroup).toBeDefined();
    const lockedNumber = (firstGroup as { number: number }).number;

    const withLock = reducer(drawn, { type: "lock", group: lockedNumber });
    const lockedGroup = withLock.draw?.find((group) => group.number === lockedNumber);
    expect(lockedGroup?.locked).toBe(true);

    // A late entry changes the field, which is exactly when a re-run happens.
    const withPlayer = reducer(withLock, {
      type: "addPlayer",
      player: {
        id: "late-entry",
        name: "Ramon Aguilar Jr",
        birthdate: "1990-04-02",
        gender: "M",
        index: 9.4,
        ngapId: "3999",
      },
    });
    const rerun = reducer(withPlayer, { type: "generate" });

    expect(rerun.draw?.find((group) => group.number === lockedNumber)).toEqual(lockedGroup);
  });

  it("still rebuilds the groups that are not locked", () => {
    const drawn = reducer(createDemoDeskState(), { type: "generate" });
    const lockedNumber = (drawn.draw?.[0] as { number: number }).number;
    const withLock = reducer(drawn, { type: "lock", group: lockedNumber });

    const rerun = reducer(withLock, { type: "generate" });
    const unlocked = rerun.draw?.filter((group) => group.number !== lockedNumber) ?? [];
    expect(unlocked.length).toBeGreaterThan(0);
    expect(unlocked.every((group) => !group.locked)).toBe(true);

    const numbers = (rerun.draw ?? []).map((group) => group.number);
    expect(new Set(numbers).size).toBe(numbers.length);
  });

  it("takes the published list down on a re-run", () => {
    const drawn = reducer(createDemoDeskState(), { type: "generate" });
    const published = reducer(drawn, { type: "publish" });
    expect(published.published).not.toBeNull();
    expect(reducer(published, { type: "generate" }).published).toBeNull();
  });
});
