import { describe, expect, it } from "vitest";
import { isPairingsBack, isPairingsReferrer } from "./back-link";

const origin = "https://golf.syntaxure.dev";

describe("isPairingsReferrer", () => {
  it("accepts the pairings page and its tabs", () => {
    expect(isPairingsReferrer(`${origin}/pairings`, origin)).toBe(true);
    expect(isPairingsReferrer(`${origin}/pairings?tab=profile`, origin)).toBe(true);
    expect(isPairingsReferrer(`${origin}/pairings/`, origin)).toBe(true);
  });

  it("rejects another page on the same site", () => {
    expect(isPairingsReferrer(`${origin}/`, origin)).toBe(false);
    expect(isPairingsReferrer(`${origin}/rules`, origin)).toBe(false);
    expect(isPairingsReferrer(`${origin}/pairings-old`, origin)).toBe(false);
  });

  it("rejects another site that happens to use a pairings path", () => {
    expect(isPairingsReferrer("https://example.com/pairings", origin)).toBe(false);
  });

  it("rejects an empty or malformed referrer", () => {
    expect(isPairingsReferrer(null, origin)).toBe(false);
    expect(isPairingsReferrer("", origin)).toBe(false);
    expect(isPairingsReferrer("not a url", origin)).toBe(false);
  });
});

describe("isPairingsBack", () => {
  it("accepts the explicit from=pairings marker", () => {
    expect(isPairingsBack("?from=pairings", null, origin)).toBe(true);
  });

  it("falls back to a same-origin pairings referrer", () => {
    expect(isPairingsBack("", `${origin}/pairings?tab=profile`, origin)).toBe(true);
  });

  it("rejects another page and another site", () => {
    expect(isPairingsBack("", `${origin}/rules`, origin)).toBe(false);
    expect(isPairingsBack("", "https://example.com/pairings", origin)).toBe(false);
    expect(isPairingsBack("?from=other", null, origin)).toBe(false);
  });
});
