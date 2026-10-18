import { describe, expect, it } from "vitest";
import { t } from "@/lib/i18n/t";
import { mapPortalState, paymentLabel, startLabel, statusLabel } from "./portal";

/** The jsonb the database function returns for a linked player with one entry. */
const raw = {
  linked: true,
  player: { id: "p1", name: "Ana Reyes", ngapId: "10023" },
  entries: [
    {
      tournamentId: "t1",
      eventName: "Bamboo Tee",
      eventDate: "2026-11-12",
      dates: ["2026-11-12", "2026-11-13"],
      startFormat: "shotgun",
      firstTeeTime: "06:30",
      state: "open",
      status: "ok",
      reasons: [],
      frozenIndex: 11.4,
      playingHandicap: 12,
      category: "Ladies",
      tee: "Red",
      flight: "Ladies A",
      paymentStatus: "unpaid",
      published: true,
      start: { hole: 10, wave: "A", time: "06:30" },
    },
  ],
};

describe("mapPortalState", () => {
  it("maps a linked player and their entry", () => {
    const state = mapPortalState(raw);
    expect(state.linked).toBe(true);
    expect(state.player).toEqual({ id: "p1", name: "Ana Reyes", ngapId: "10023" });
    expect(state.entries).toHaveLength(1);
    expect(state.entries[0]).toMatchObject({
      eventName: "Bamboo Tee",
      dates: ["2026-11-12", "2026-11-13"],
      status: "ok",
      frozenIndex: 11.4,
      playingHandicap: 12,
      flight: "Ladies A",
      published: true,
      start: { hole: 10, wave: "A", time: "06:30" },
    });
  });

  it("treats a null payload as an unlinked account rather than throwing", () => {
    expect(mapPortalState(null)).toEqual({ linked: false, player: null, entries: [] });
    expect(mapPortalState({ linked: true })).toEqual({
      linked: false,
      player: null,
      entries: [],
    });
  });

  it("keeps unknown statuses and payments on the safe default", () => {
    const state = mapPortalState({
      linked: true,
      player: { id: "p1", name: "Ana" },
      entries: [{ tournamentId: "t1", status: "something_new", paymentStatus: "part_paid" }],
    });
    expect(state.entries[0]?.status).toBe("ok");
    expect(state.entries[0]?.paymentStatus).toBe("unpaid");
    expect(state.entries[0]?.frozenIndex).toBeNull();
    expect(state.entries[0]?.start).toBeNull();
  });

  it("reads numbers that arrive as strings, and drops junk from lists", () => {
    const state = mapPortalState({
      linked: true,
      player: { id: "p1", name: "Ana" },
      entries: [
        {
          tournamentId: "t1",
          frozenIndex: "9.8",
          playingHandicap: "10",
          reasons: ["Index above the maximum", 7, null],
          dates: ["2026-11-12", 5],
        },
      ],
    });
    expect(state.entries[0]?.frozenIndex).toBe(9.8);
    expect(state.entries[0]?.playingHandicap).toBe(10);
    expect(state.entries[0]?.reasons).toEqual(["Index above the maximum"]);
    expect(state.entries[0]?.dates).toEqual(["2026-11-12"]);
  });
});

describe("portal wording", () => {
  it("says plainly whether an entry is confirmed", () => {
    expect(statusLabel(t, "ok")).toBe("Entered");
    expect(statusLabel(t, "needs_review")).toMatch(/being checked/);
    expect(statusLabel(t, "ineligible")).toMatch(/cannot be placed/i);
  });

  it("never claims a payment the club did not record", () => {
    expect(paymentLabel(t, "unpaid")).toBe("Not recorded yet");
    expect(paymentLabel(t, "paid")).toBe("Recorded as paid");
    expect(paymentLabel(t, "waived")).toBe("Waived");
  });

  it("shows the frozen start, and says why when there is none", () => {
    const entry = mapPortalState(raw).entries[0];
    if (!entry) throw new Error("fixture missing");
    expect(startLabel(entry, t, (time) => time)).toBe("Hole 10A · 06:30");
    expect(startLabel({ ...entry, start: null, published: false }, t, (time) => time)).toMatch(
      /not out yet/,
    );
    expect(startLabel({ ...entry, start: null, published: true }, t, (time) => time)).toMatch(
      /ask the club/i,
    );
  });

  it("labels a two-tee start as a tee, not a hole", () => {
    const entry = mapPortalState(raw).entries[0];
    if (!entry) throw new Error("fixture missing");
    const twoTee = {
      ...entry,
      startFormat: "two_tee" as const,
      start: { hole: 1, wave: null, time: "12:00" },
    };
    expect(startLabel(twoTee, t, (time) => time)).toBe("Tee 1 · 12:00");
  });
});
