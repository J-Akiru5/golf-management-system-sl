import { describe, expect, it } from "vitest";
import { etagMatches, type PairingsVersion, pairingsVersionEtag } from "./pairings-version";

const version: PairingsVersion = {
  signature: "v4/2026-11-12T10:00:00.000Z/abc",
  published: true,
  version: 4,
  at: "2026-11-12T10:00:00.000Z",
};

describe("pairings version ETag", () => {
  it("builds a weak ETag from the signature and matches its exact value", () => {
    const etag = pairingsVersionEtag(version);

    expect(etag.startsWith('W/"')).toBe(true);
    expect(etagMatches(etag, etag)).toBe(true);
    expect(etagMatches(`"other", ${etag}`, etag)).toBe(true);
    expect(etagMatches("*", etag)).toBe(true);
    expect(etagMatches('"other"', etag)).toBe(false);
    expect(etagMatches(null, etag)).toBe(false);
  });
});
