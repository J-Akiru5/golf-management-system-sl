import { describe, expect, it } from "vitest";
import { supabaseSettings } from "./env";

describe("supabaseSettings", () => {
  it("is null when neither value is set", () => {
    expect(supabaseSettings({})).toBeNull();
    expect(
      supabaseSettings({ NEXT_PUBLIC_SUPABASE_URL: "", NEXT_PUBLIC_SUPABASE_ANON_KEY: "" }),
    ).toBeNull();
  });

  it("returns both values, trimmed", () => {
    expect(
      supabaseSettings({
        NEXT_PUBLIC_SUPABASE_URL: " https://example.test ",
        NEXT_PUBLIC_SUPABASE_ANON_KEY: " key ",
      }),
    ).toEqual({ url: "https://example.test", anonKey: "key" });
  });

  it("refuses half a configuration", () => {
    expect(() => supabaseSettings({ NEXT_PUBLIC_SUPABASE_URL: "https://example.test" })).toThrow(
      /half configured/,
    );
    expect(() => supabaseSettings({ NEXT_PUBLIC_SUPABASE_ANON_KEY: "key" })).toThrow(
      /half configured/,
    );
  });
});
