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
});
