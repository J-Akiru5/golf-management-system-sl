import { describe, expect, it } from "vitest";
import { entryPath, entryUrl } from "./public-link";

describe("entryPath", () => {
  it("builds the public entry route", () => {
    expect(entryPath("abc-123")).toBe("/enter/abc-123");
  });

  it("encodes an id that would otherwise break the URL", () => {
    expect(entryPath("a/b c")).toBe("/enter/a%2Fb%20c");
  });
});

describe("entryUrl", () => {
  it("prefers the configured site URL over the current origin", () => {
    expect(
      entryUrl({
        tournamentId: "abc",
        siteUrl: "https://golf.syntaxure.dev",
        origin: "http://localhost:3000",
      }),
    ).toBe("https://golf.syntaxure.dev/enter/abc");
  });

  it("tolerates a trailing slash on the configured URL", () => {
    expect(entryUrl({ tournamentId: "abc", siteUrl: "https://golf.syntaxure.dev/" })).toBe(
      "https://golf.syntaxure.dev/enter/abc",
    );
  });

  it("falls back to the origin when nothing is configured, for local development", () => {
    expect(entryUrl({ tournamentId: "abc", origin: "http://localhost:3000" })).toBe(
      "http://localhost:3000/enter/abc",
    );
  });

  it("returns the path alone when neither is known, instead of inventing a host", () => {
    expect(entryUrl({ tournamentId: "abc" })).toBe("/enter/abc");
  });
});
