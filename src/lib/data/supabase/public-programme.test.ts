import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import type { Database } from "@/lib/supabase/types";
import { loadPublicProgramme, loadPublicReleaseState, setPublicRelease } from "./public-programme";

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
