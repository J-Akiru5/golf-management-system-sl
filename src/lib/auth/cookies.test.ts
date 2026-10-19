import { describe, expect, it } from "vitest";
import { authCookieOptions, rememberPreference } from "./cookies";

describe("remember me", () => {
  it("reads a stored choice", () => {
    expect(rememberPreference("1")).toBe(true);
    expect(rememberPreference("0")).toBe(false);
    expect(rememberPreference(undefined)).toBeNull();
    expect(rememberPreference("")).toBeNull();
  });

  it("turns auth cookies into session cookies when not remembered", () => {
    const options = { path: "/", maxAge: 3600, expires: new Date("2030-01-01T00:00:00Z") };
    expect(authCookieOptions(options, false)).toEqual({ path: "/" });
  });

  it("keeps the library's lifetime when remembered or when no choice exists", () => {
    const options = { path: "/", maxAge: 3600 };
    expect(authCookieOptions(options, true)).toEqual(options);
    expect(authCookieOptions(options, null)).toEqual(options);
  });
});
