import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const configured = vi.fn(() => true);
const loadRelease = vi.fn();
const loadReveal = vi.fn();

vi.mock("@/lib/supabase/env", () => ({ isSupabaseConfigured: () => configured() }));
vi.mock("@/lib/supabase/public", () => ({ createSupabasePublicClient: () => ({}) }));
vi.mock("@/lib/data/supabase/public-programme", () => ({
  loadPublicReleaseState: (...args: unknown[]) => loadRelease(...args),
  loadPublicRevealState: (...args: unknown[]) => loadReveal(...args),
}));

import { parseLaneRevealMap } from "@/lib/public/results-reveal";
import { GET } from "./route";

beforeEach(() => {
  configured.mockReturnValue(true);
  loadRelease.mockReset();
  loadReveal.mockReset();
});

function callGet() {
  return GET(new NextRequest("http://localhost/api/results/reveal"));
}

("/** The release state as the database sends it: true means that surface is released. */");
const release = (leaderboard: boolean, roster: boolean) => ({
  tournamentId: "t1",
  pairings: true,
  teeTimes: true,
  roster,
  leaderboard,
  photos: true,
  rules: true,
});

describe("GET /api/results/reveal", () => {
  it("answers the surface keys and the six lanes", async () => {
    loadRelease.mockResolvedValue(release(false, false));
    loadReveal.mockResolvedValue({
      tournamentId: "t1",
      revealAt: "2026-11-15T14:00:15.000Z",
      // The loader hands the route a complete lane map, so the mock does the same.
      lanes: parseLaneRevealMap({
        classA: {
          state: "released",
          board: [{ position: 1, name: "A1 / A1b", score: 42, tie: false }],
        },
        classB: { state: "held", releaseAt: "2026-11-15T14:00:30.000Z" },
      }),
    });

    const response = await callGet();
    expect(response.status).toBe(200);
    expect(response.headers.get("x-request-id")).toBeTruthy();
    const body = await response.json();
    // Neither surface is released, so both are held.
    expect(body.held).toEqual({ leaderboard: true, roster: true });
    expect(body.revealAt).toBe("2026-11-15T14:00:15.000Z");
    expect(body.lanes.classA.board).toHaveLength(1);
    expect(body.lanes.classB.state).toBe("held");
    // A lane the database did not name is present and released, never a missing key.
    expect(body.lanes.grossOverall).toEqual({ state: "released", releaseAt: null, board: [] });
  });

  it("reports a held surface as held", async () => {
    loadRelease.mockResolvedValue(release(true, false));
    loadReveal.mockResolvedValue(null);
    const body = await (await callGet()).json();
    expect(body.held).toEqual({ leaderboard: false, roster: true });
  });

  it("lets shared caches absorb the countdown's polling", async () => {
    loadRelease.mockResolvedValue(release(false, false));
    loadReveal.mockResolvedValue(null);
    const cache = (await callGet()).headers.get("cache-control") ?? "";
    expect(cache).toContain("public");
    expect(cache).toMatch(/s-maxage=\d+/);
  });

  it("answers without a lane reader when the migration is not applied", async () => {
    // PGRST202 surfaces as null; the route must still answer, with every lane released and empty.
    loadRelease.mockResolvedValue(release(true, true));
    loadReveal.mockResolvedValue(null);
    const body = await (await callGet()).json();
    expect(body.held).toEqual({ leaderboard: false, roster: false });
    expect(body.lanes.classA).toEqual({ state: "released", releaseAt: null, board: [] });
  });

  it("reports a failed read as an error that is never cached", async () => {
    loadRelease.mockResolvedValue(release(false, false));
    loadReveal.mockRejectedValue(new Error("database down"));
    const response = await callGet();
    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(JSON.stringify(await response.json())).not.toContain("database down");
  });

  it("is not found when the build has no Supabase, and not cached", async () => {
    configured.mockReturnValue(false);
    const response = await callGet();
    expect(response.status).toBe(404);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(loadReveal).not.toHaveBeenCalled();
  });
});
