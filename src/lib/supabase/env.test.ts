import { afterEach, describe, expect, it, vi } from "vitest";
import { getSupabaseEnvironment, isSupabaseConfigured } from "./env";

describe("Supabase environment selection", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("uses demo mode when the URL is absent", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
    expect(isSupabaseConfigured()).toBe(false);
    expect(getSupabaseEnvironment()).toBeNull();
  });

  it("fails closed when the URL is set but the anon key is missing", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://club.example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
    expect(isSupabaseConfigured()).toBe(true);
    expect(() => getSupabaseEnvironment()).toThrow("NEXT_PUBLIC_SUPABASE_ANON_KEY is required");
  });

  it("reads only the public URL and anon key", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://club.example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-example");
    expect(getSupabaseEnvironment()).toEqual({
      url: "https://club.example.supabase.co",
      anonKey: "anon-example",
    });
  });
});
