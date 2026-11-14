import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import type { Database } from "@/lib/supabase/types";
import {
  loadPublicProgramme,
  loadPublicReleaseState,
  loadPublicRevealState,
  setPublicRelease,
} from "./public-programme";

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

describe("loadPublicReleaseState", () => {
  it("reads the event's booleans without asking for the stored object", async () => {
    const calls: RpcCall[] = [];
    const client = fakeClient(calls, {
      data: {
        tournamentId: "t1",
        pairings: false,
        teeTimes: true,
        roster: false,
        leaderboard: true,
        photos: false,
        rules: true,
      },
      error: null,
    });

    await expect(loadPublicReleaseState(client, "t1")).resolves.toEqual({
      tournamentId: "t1",
      pairings: false,
      teeTimes: true,
      roster: false,
      leaderboard: true,
      photos: false,
      rules: true,
    });
    expect(calls).toEqual([{ fn: "public_release_state", args: { p_tournament: "t1" } }]);
    expect(Object.keys((await loadPublicReleaseState(client, "t1")) ?? {}).sort()).toEqual([
      "leaderboard",
      "pairings",
      "photos",
      "roster",
      "rules",
      "teeTimes",
      "tournamentId",
    ]);
  });

  it("returns null when the event does not resolve or the read is not deployed", async () => {
    await expect(
      loadPublicReleaseState(fakeClient([], { data: null, error: null }), "t1"),
    ).resolves.toBeNull();
    await expect(
      loadPublicReleaseState(
        fakeClient([], {
          data: null,
          error: { code: "PGRST202", message: "Could not find the function" },
        }),
      ),
    ).resolves.toBeNull();
  });

  it("surfaces a real database error", async () => {
    await expect(
      loadPublicReleaseState(
        fakeClient([], { data: null, error: { code: "42501", message: "permission denied" } }),
      ),
    ).rejects.toThrow(/permission denied/);
  });
});

describe("loadPublicRevealState", () => {
  it("reads the six lanes and the stopgap reveal time without asking for anything else", async () => {
    const calls: RpcCall[] = [];
    const client = fakeClient(calls, {
      data: {
        tournamentId: "t1",
        revealAt: "2026-11-15T14:00:15Z",
        lanes: {
          classA: { state: "held", releaseAt: "2026-11-15T14:00:15Z" },
          classB: { state: "released" },
        },
      },
      error: null,
    });

    const state = await loadPublicRevealState(client, "t1");
    expect(state?.revealAt).toBe("2026-11-15T14:00:15.000Z");
    expect(state?.lanes.classA).toEqual({
      state: "held",
      releaseAt: "2026-11-15T14:00:15.000Z",
      board: [],
    });
    expect(state?.lanes.classB).toEqual({ state: "released", releaseAt: null, board: [] });
    // The database sends no lane this build does not list, and a lane it omits is released.
    expect(state?.lanes.grossOverall).toEqual({ state: "released", releaseAt: null, board: [] });
    expect(calls).toEqual([{ fn: "public_reveal_state", args: { p_tournament: "t1" } }]);
  });

  it("reads an older database's answer as no countdown", async () => {
    // Before the lanes existed the function answered the event and the time only.
    const state = await loadPublicRevealState(
      fakeClient([], { data: { tournamentId: "t1", revealAt: null }, error: null }),
      "t1",
    );
    expect(state?.revealAt).toBeNull();
    expect(Object.keys(state?.lanes ?? {}).sort()).toEqual([
      "classA",
      "classB",
      "classC",
      "classD",
      "grossOverall",
      "netOverall",
    ]);
  });

  it("returns null when the function is not applied and surfaces a real error", async () => {
    await expect(
      loadPublicRevealState(
        fakeClient([], {
          data: null,
          error: { code: "PGRST202", message: "Could not find the function" },
        }),
        "t1",
      ),
    ).resolves.toBeNull();
    await expect(
      loadPublicRevealState(
        fakeClient([], { data: null, error: { code: "42501", message: "permission denied" } }),
        "t1",
      ),
    ).rejects.toThrow(/permission denied/);
  });
});

describe("loadPublicProgramme", () => {
  it("reads a held programme as empty sections instead of failing the page", async () => {
    const client = fakeClient([], {
      data: { tournamentId: "t1", name: "Bamboo Tee", rulesOfPlay: null, days: [], players: [] },
      error: null,
    });

    await expect(loadPublicProgramme(client, "t1")).resolves.toEqual({
      days: [],
      players: [],
      rulesOfPlay: null,
    });
  });
});

describe("setPublicRelease", () => {
  it("sends one surface to the guarded setter and reads the returned state", async () => {
    const calls: RpcCall[] = [];
    const client = fakeClient(calls, {
      data: {
        tournamentId: "t1",
        pairings: false,
        teeTimes: true,
        roster: true,
        leaderboard: true,
        photos: true,
        rules: true,
      },
      error: null,
    });

    await expect(setPublicRelease(client, "t1", "pairings", false)).resolves.toMatchObject({
      tournamentId: "t1",
      pairings: false,
    });
    expect(calls).toEqual([
      {
        fn: "set_public_release",
        args: { p_tournament: "t1", p_surface: "pairings", p_released: false },
      },
    ]);
  });

  it("surfaces the database refusal so the release panel can show it", async () => {
    await expect(
      setPublicRelease(
        fakeClient([], {
          data: null,
          error: {
            code: "42501",
            message: "Only an owner or organizer may change the public release",
          },
        }),
        "t1",
        "roster",
        false,
      ),
    ).rejects.toThrow(/owner or organizer/);
  });
});
