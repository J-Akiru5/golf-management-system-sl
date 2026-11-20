import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import type { Database } from "@/lib/supabase/types";
import {
  loadLandingFeature,
  parseLandingFeature,
  parseLandingFeatureResult,
  setLandingFeature,
} from "./landing-feature";

describe("parseLandingFeature", () => {
  it("reads the column as true only for an explicit true", () => {
    expect(parseLandingFeature({ landing_featured: true })).toEqual({ featured: true });
    expect(parseLandingFeature({ landing_featured: false })).toEqual({ featured: false });
  });

  it("treats a missing or malformed value as not featured", () => {
    expect(parseLandingFeature({ landing_featured: "true" })).toEqual({ featured: false });
    expect(parseLandingFeature({})).toEqual({ featured: false });
  });

  it("answers null for anything that is not a row", () => {
    expect(parseLandingFeature(null)).toBeNull();
    expect(parseLandingFeature("a row")).toBeNull();
    expect(parseLandingFeature([{ landing_featured: true }])).toBeNull();
  });
});

describe("parseLandingFeatureResult", () => {
  it("keeps the boolean the function returned", () => {
    expect(parseLandingFeatureResult({ featured: true }, false)).toBe(true);
    expect(parseLandingFeatureResult({ featured: false }, true)).toBe(false);
  });

  it("falls back to the requested value when the reply is not usable", () => {
    expect(parseLandingFeatureResult(null, true)).toBe(true);
    expect(parseLandingFeatureResult({}, true)).toBe(true);
    expect(parseLandingFeatureResult({ featured: "yes" }, false)).toBe(false);
  });
});

type TableAnswer = {
  data: unknown;
  error: { code: string; message: string } | null;
};

function clientWith(table: TableAnswer, rpc: TableAnswer): SupabaseClient<Database> {
  const maybeSingle = vi.fn(async () => table);
  const chain = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    maybeSingle,
  };
  return {
    from: vi.fn(() => chain),
    rpc: vi.fn(async () => rpc),
  } as unknown as SupabaseClient<Database>;
}

describe("loadLandingFeature", () => {
  it("reads the setting for the event", async () => {
    const client = clientWith(
      { data: { landing_featured: true }, error: null },
      { data: null, error: null },
    );
    expect(await loadLandingFeature(client, "t1")).toEqual({ featured: true });
  });

  it("answers null when the column is missing or the row is not visible", async () => {
    const missing = clientWith(
      { data: null, error: { code: "42703", message: "column does not exist" } },
      { data: null, error: null },
    );
    expect(await loadLandingFeature(missing, "t1")).toBeNull();

    const empty = clientWith({ data: null, error: null }, { data: null, error: null });
    expect(await loadLandingFeature(empty, "t1")).toBeNull();
  });
});

describe("setLandingFeature", () => {
  it("sends the new value and returns the function's answer", async () => {
    const rpc = vi.fn(async () => ({ data: { featured: true }, error: null }));
    const client = { rpc } as unknown as SupabaseClient<Database>;

    expect(await setLandingFeature(client, "t1", true)).toBe(true);
    expect(rpc).toHaveBeenCalledWith("set_landing_feature", {
      p_tournament: "t1",
      p_featured: true,
    });
  });

  it("throws the database message when the database refuses", async () => {
    const client = {
      rpc: vi.fn(async () => ({
        data: null,
        error: { code: "42501", message: "Only the owner or an organizer can change it" },
      })),
    } as unknown as SupabaseClient<Database>;

    await expect(setLandingFeature(client, "t1", true)).rejects.toThrow(
      "Only the owner or an organizer can change it",
    );
  });
});
