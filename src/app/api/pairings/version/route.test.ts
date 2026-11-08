import { beforeEach, describe, expect, it, vi } from "vitest";

const configured = vi.fn(() => true);
const load = vi.fn();

vi.mock("@/lib/supabase/env", () => ({ isSupabaseConfigured: () => configured() }));
vi.mock("@/lib/supabase/public", () => ({ createSupabasePublicClient: () => ({}) }));
vi.mock("@/lib/data/supabase/public-pairings", () => ({
  loadPublicPairings: (...args: unknown[]) => load(...args),
}));

import { pairingsSignature } from "@/lib/public/pairings-live";
import { GET } from "./route";

beforeEach(() => {
  configured.mockReturnValue(true);
  load.mockReset();
});

describe("GET /api/pairings/version", () => {
  it("answers the published version and time, and the signature the page compares", async () => {
    const published = { at: "2026-11-12T06:00:00+00:00", version: 4 };
    load.mockResolvedValue({ published });
    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      signature: pairingsSignature(published),
      published: true,
      version: 4,
      at: "2026-11-12T06:00:00+00:00",
    });
  });

  it("lets shared caches absorb the polling", async () => {
    load.mockResolvedValue({ published: { at: "2026-11-12T06:00:00+00:00", version: 1 } });
    const cache = (await GET()).headers.get("cache-control") ?? "";
    expect(cache).toContain("public");
    expect(cache).toMatch(/s-maxage=\d+/);
  });

  it("says nothing is published, rather than failing, when there is no published version", async () => {
    load.mockResolvedValue({ published: null });
    const body = await (await GET()).json();
    expect(body).toEqual({ signature: "none", published: false, version: null, at: null });

    load.mockResolvedValue(null);
    expect((await (await GET()).json()).signature).toBe("none");
  });

  it("answers a publish that has no version number", async () => {
    load.mockResolvedValue({ published: { at: "2026-11-12T06:00:00+00:00" } });
    const body = await (await GET()).json();
    expect(body.version).toBeNull();
    expect(body.signature).toBe("v-@2026-11-12T06:00:00+00:00");
  });

  it("reports a failed read as an error that is never cached", async () => {
    load.mockRejectedValue(new Error("database down"));
    const response = await GET();
    expect(response.status).toBe(502);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(JSON.stringify(await response.json())).not.toContain("database down");
  });

  it("is not found when the build has no Supabase, and not cached", async () => {
    configured.mockReturnValue(false);
    const response = await GET();
    expect(response.status).toBe(404);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(load).not.toHaveBeenCalled();
  });
});
