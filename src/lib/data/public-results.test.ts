import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import type { Database } from "@/lib/supabase/types";
import {
  loadPublicPhotos,
  type PublicRoundSummary,
  parsePublicLeaderboard,
} from "./public-results";

const round: PublicRoundSummary = {
  roundId: "round-1",
  tournamentId: "event-1",
  eventName: "Bamboo Tee",
  dayNumber: 1,
  playDate: "2026-11-12",
  version: 2,
  state: "provisional",
  publishedAt: "2026-11-12T10:00:00.000Z",
};

describe("parsePublicLeaderboard", () => {
  it("keeps only the leaderboard fields and preserves the frozen order", () => {
    const board = parsePublicLeaderboard(round, {
      gross: [
        {
          playerId: "p1",
          playerName: "Antonio Alcantara",
          flightName: "Regular A",
          points: 36,
          strokes: 72,
          holesCounted: 18,
          holesTotal: 18,
          contactNumber: "+63 917 000 0000",
          birthdate: "1972-05-04",
        },
        {
          playerId: "p2",
          playerName: "Maria Santos",
          flightName: "Ladies",
          points: 34,
          strokes: 74,
          holesCounted: 17,
          holesTotal: 18,
        },
      ],
      net: [],
    });

    expect(board.round).toEqual(round);
    expect(board.gross).toEqual([
      {
        playerId: "p1",
        playerName: "ANTONIO ALCANTARA",
        flightName: "Regular A",
        points: 36,
        strokes: 72,
        holesCounted: 18,
        holesTotal: 18,
        photoPath: null,
      },
      {
        playerId: "p2",
        playerName: "MARIA SANTOS",
        flightName: "Ladies",
        points: 34,
        strokes: 74,
        holesCounted: 17,
        holesTotal: 18,
        photoPath: null,
      },
    ]);
    expect(JSON.stringify(board)).not.toContain("contactNumber");
    expect(JSON.stringify(board)).not.toContain("1972-05-04");
  });

  it("keeps old snapshots readable when they have no player ids", () => {
    const board = parsePublicLeaderboard(round, {
      gross: [{ playerName: "Ramon Aguilar", points: 30, holesCounted: 18, holesTotal: 18 }],
    });
    expect(board.gross[0]).toMatchObject({ playerId: null, playerName: "RAMON AGUILAR" });
    expect(board.net).toEqual([]);
  });

  it("drops rows without a name and tolerates a missing snapshot body", () => {
    expect(parsePublicLeaderboard(round, {}).gross).toEqual([]);
    expect(parsePublicLeaderboard(round, { gross: [{ points: 4 }] }).gross).toEqual([]);
  });
});

type RpcCall = { fn: string; args: unknown };
type RpcResult = { data: unknown; error: { code?: string; message?: string } | null };

function fakeClient(
  calls: RpcCall[],
  answer: RpcResult | ((call: RpcCall) => RpcResult),
): SupabaseClient<Database> {
  return {
    rpc: async (fn: string, args: unknown) => {
      const call = { fn, args };
      calls.push(call);
      return typeof answer === "function" ? answer(call) : answer;
    },
  } as unknown as SupabaseClient<Database>;
}

describe("loadPublicPhotos", () => {
  it("asks for the event's photos and keeps only the returned paths", async () => {
    const calls: RpcCall[] = [];
    const client = fakeClient(calls, {
      data: [
        { player_id: "p1", photo_path: "public/p1.jpg" },
        { player_id: "p2", photo_path: null },
        { player_id: "p1", photo_path: "public/p1.jpg" },
      ],
      error: null,
    });

    await expect(loadPublicPhotos(client, ["p1", "p2", "p1", ""], "t1")).resolves.toEqual({
      p1: "public/p1.jpg",
    });
    expect(calls).toEqual([
      { fn: "public_player_photos", args: { p_ids: ["p1", "p2"], p_tournament: "t1" } },
    ]);
  });

  it("returns no path when the event holds photos or the event is not published", async () => {
    const calls: RpcCall[] = [];
    const client = fakeClient(calls, { data: [], error: null });

    await expect(loadPublicPhotos(client, ["p1"], "held-event")).resolves.toEqual({});
    expect(calls[0]?.args).toEqual({ p_ids: ["p1"], p_tournament: "held-event" });
  });

  it("does not call the database when there is no player to look up", async () => {
    const calls: RpcCall[] = [];
    const client = fakeClient(calls, { data: [], error: null });

    await expect(loadPublicPhotos(client, [], "t1")).resolves.toEqual({});
    expect(calls).toEqual([]);
  });

  it("retries without the event on a database before the release migration", async () => {
    const calls: RpcCall[] = [];
    const client = fakeClient(calls, (call) =>
      call.args && Object.keys(call.args as object).includes("p_tournament")
        ? {
            data: null,
            error: {
              code: "PGRST202",
              message:
                "Could not find the function public.public_player_photos(p_ids, p_tournament)",
            },
          }
        : { data: [{ player_id: "p1", photo_path: "public/p1.jpg" }], error: null },
    );

    await expect(loadPublicPhotos(client, ["p1"], "t1")).resolves.toEqual({
      p1: "public/p1.jpg",
    });
    expect(calls.map((call) => call.args)).toEqual([
      { p_ids: ["p1"], p_tournament: "t1" },
      { p_ids: ["p1"] },
    ]);
  });

  it("surfaces a real database error instead of silently dropping every photo", async () => {
    const client = fakeClient([], {
      data: null,
      error: { code: "42501", message: "permission denied" },
    });

    await expect(loadPublicPhotos(client, ["p1"], "t1")).rejects.toThrow(/permission denied/);
  });
});
