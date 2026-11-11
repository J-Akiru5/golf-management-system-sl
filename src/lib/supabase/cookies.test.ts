import { describe, expect, it } from "vitest";
import { hasSupabaseAuthCookie } from "./cookies";

describe("hasSupabaseAuthCookie", () => {
  it("recognises the Supabase session cookie and its chunked parts", () => {
    expect(hasSupabaseAuthCookie(["sb-abcdefghijklmnop-auth-token"])).toBe(true);
    expect(
      hasSupabaseAuthCookie([
        "desk-lang",
        "sb-abcdefghijklmnop-auth-token.0",
        "sb-abcdefghijklmnop-auth-token.1",
      ]),
    ).toBe(true);
  });

  it("does not count unrelated cookies or a missing session", () => {
    expect(hasSupabaseAuthCookie([])).toBe(false);
    expect(hasSupabaseAuthCookie(["desk-lang", "theme", "sb-other-project-token"])).toBe(false);
    expect(hasSupabaseAuthCookie(["sb-auth-token"])).toBe(false);
  });
});
