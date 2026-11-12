import { describe, expect, it } from "vitest";
import { loadPublicTeamCards } from "./public-team-cards";

function card(roundId: string) {
  return {
    roundId,
    dayNumber: 1,
    playDate: "2026-11-12",
    state: "provisional",
    version: 1,
    publishedAt: "2026-11-12T08:00:00Z",
    playingHandicap: 10,
    courseHandicap: 10,
    grossStrokes: 90,
    netStrokes: 80,
    grossPoints: 20,
    netPoints: 30,
    holesCounted: 1,
    holesTotal: 1,
    holes: [
      {
        hole: 1,
        par: 4,
        strokeIndex: 1,
        grossStrokes: 5,
        handicapStrokes: 1,
        netStrokes: 4,
        grossPoints: 1,
        netPoints: 2,
      },
    ],
  };
}

function fakeClient(responses: Record<string, unknown>) {
  return {
    rpc: async (_name: string, args: { p_player: string }) => {
      const value = responses[args.p_player];
      if (value instanceof Error) return { data: null, error: { message: value.message } };
      return { data: value ?? null, error: null };
    },
  } as never;
}

function profile(id: string, name: string) {
  return { tournamentId: "t1", player: { id, name }, cards: [card(`r-${id}`)] };
}

describe("loadPublicTeamCards", () => {
  it("returns each player's cards and asks once per player", async () => {
    const client = fakeClient({ a: profile("a", "ANA"), b: profile("b", "BEN") });
    const cards = await loadPublicTeamCards(client, ["a", "b", "a"], "t1");
    expect(Object.keys(cards).sort()).toEqual(["a", "b"]);
    expect(cards.a?.[0]?.roundId).toBe("r-a");
  });

  it("leaves out a player who failed or has no cards instead of failing the page", async () => {
    const client = fakeClient({
      a: profile("a", "ANA"),
      b: new Error("boom"),
      c: { tournamentId: "t1", player: { id: "c", name: "CAL" }, cards: [] },
    });
    const cards = await loadPublicTeamCards(client, ["a", "b", "c"], "t1");
    expect(Object.keys(cards)).toEqual(["a"]);
  });
});
