import { describe, expect, it } from "vitest";
import { type Action, initialState, reducer } from "@/lib/store/state";
import { createMockAdapters, type NewEntryInput } from "./adapters";

/**
 * The demo adapters are built from one state snapshot. A screen that adds a walk-up and then gives
 * it its days makes both writes before React re-renders, so the second write has to find the row
 * the first one queued. Without that, the staff walk-up screen reports "That registration was not
 * found." after the player and entry have already been written.
 */
describe("mock adapters", () => {
  const walkUp: NewEntryInput = {
    playerId: "p-walkup",
    role: "guest",
    sponsor: null,
    shirt: null,
    teePreferences: {},
    selectedDays: [1],
    declaredWshId: null,
    declaredWshHandicap: null,
    extra: {},
    paymentStatus: "pending",
  };

  it("gives a walk-up its days in the same save", async () => {
    let state = initialState();
    const dispatch = (action: Action) => {
      state = reducer(state, action);
    };
    const adapters = createMockAdapters(state, dispatch);

    const entry = adapters.registrations.add("bamboo-tee-2026", walkUp);
    await adapters.registrations.setDays(entry.id, [1, 2], { 1: "AM", 2: "AM" });

    const saved = state.entries.find((row) => row.id === entry.id);
    expect(saved?.selectedDays).toEqual([1, 2]);
    expect(saved?.daySessions).toEqual({ 1: "AM", 2: "AM" });
  });

  it("still refuses days for an entry that does not exist", async () => {
    const adapters = createMockAdapters(initialState(), () => {});
    await expect(adapters.registrations.setDays("e-missing", [1], {})).rejects.toThrow(
      "That registration was not found.",
    );
  });

  function withEntries() {
    let state = initialState();
    const dispatch = (action: Action) => {
      state = reducer(state, action);
    };
    let adapters = createMockAdapters(state, dispatch);
    const member = adapters.registrations.add("bamboo-tee-2026", {
      ...walkUp,
      playerId: "p-member",
      role: "member",
    });
    const guest = adapters.registrations.add("bamboo-tee-2026", walkUp);
    // The adapter reads the snapshot it was built from, so rebuild it once both rows exist.
    adapters = createMockAdapters(state, dispatch);
    return { adapters, member, guest, dispatch, getState: () => state };
  }

  it("assigns a pair and clears the partner it replaced", async () => {
    const { adapters, member, guest, dispatch, getState } = withEntries();
    await adapters.pairs.save({
      tournamentId: "bamboo-tee-2026",
      number: 124,
      memberEntryId: member.id,
      guestEntryId: guest.id,
      action: "pair.create",
    });
    expect(getState().entries.find((row) => row.id === member.id)?.teamNo).toBe(124);
    expect(getState().entries.find((row) => row.id === guest.id)?.teamNo).toBe(124);

    // The real store rebuilds its adapters after each state change; do the same here.
    const afterFirst = createMockAdapters(getState(), dispatch);
    await afterFirst.pairs.save({
      tournamentId: "bamboo-tee-2026",
      number: 124,
      memberEntryId: member.id,
      guestEntryId: null,
      action: "pair.remove",
    });
    expect(getState().entries.find((row) => row.id === guest.id)?.teamNo).toBeNull();
  });

  it("swaps one side between two pairs", async () => {
    const { adapters, member, guest, dispatch, getState } = withEntries();
    await adapters.pairs.save({
      tournamentId: "bamboo-tee-2026",
      number: 124,
      memberEntryId: member.id,
      guestEntryId: guest.id,
      action: "pair.create",
    });
    const member2 = adapters.registrations.add("bamboo-tee-2026", {
      ...walkUp,
      playerId: "p-member-2",
      role: "member",
    });
    const guest2 = adapters.registrations.add("bamboo-tee-2026", {
      ...walkUp,
      playerId: "p-guest-2",
      role: "guest",
    });
    const next = createMockAdapters(getState(), dispatch);
    await next.pairs.save({
      tournamentId: "bamboo-tee-2026",
      number: 125,
      memberEntryId: member2.id,
      guestEntryId: guest2.id,
      action: "pair.create",
    });
    // Rebuild after the save so the swap reads both pairs as they now stand.
    const afterPair = createMockAdapters(getState(), dispatch);
    await afterPair.pairs.swap({
      tournamentId: "bamboo-tee-2026",
      numberA: 124,
      numberB: 125,
      side: "guest",
    });

    const byId = (id: string) => getState().entries.find((row) => row.id === id);
    expect(byId(guest.id)?.teamNo).toBe(125);
    expect(byId(guest2.id)?.teamNo).toBe(124);
    expect(byId(member.id)?.teamNo).toBe(124);
    expect(byId(member2.id)?.teamNo).toBe(125);
  });

  it("saves a manual handicap record for a demo player", async () => {
    let state = initialState();
    const dispatch = (action: Action) => {
      state = reducer(state, action);
    };
    const adapters = createMockAdapters(state, dispatch);
    const player = state.players[0];
    if (!player) throw new Error("The demo seed has no players.");

    await adapters.players.saveHandicapRecord(player.id, {
      index: 14.2,
      effectiveDate: "2026-11-14",
      reason: "Added from the scorecard",
    });

    const saved = state.records.find(
      (row) => row.playerId === player.id && row.effectiveDate === "2026-11-14",
    );
    expect(saved?.index).toBe(14.2);
    expect(saved?.source).toBe("manual_fix");
  });

  it("refuses a demo record outside the index range", async () => {
    const state = initialState();
    const player = state.players[0];
    if (!player) throw new Error("The demo seed has no players.");
    const adapters = createMockAdapters(state, () => {});

    await expect(
      adapters.players.saveHandicapRecord(player.id, {
        index: 60,
        effectiveDate: "2026-11-14",
        reason: "Outside the record range",
      }),
    ).rejects.toThrow("The handicap index must be a number from -10 to 54.");
  });
});
