import { describe, expect, it } from "vitest";
import { matchesName, sameName } from "./name-match";

/**
 * Stored names are written as the card writes them: family name first, capitals, a comma between
 * the halves. Each case below is a real way a player types their own name on a phone.
 */
const STORED = "MATILING, CHARLES";

describe("matchesName", () => {
  it("ignores case", () => {
    expect(matchesName(STORED, "charles")).toBe(true);
    expect(matchesName(STORED, "CHARLES")).toBe(true);
    expect(matchesName(STORED, "MaTiLiNg")).toBe(true);
  });

  it("accepts the words in any order, including first name first", () => {
    expect(matchesName(STORED, "charles matiling")).toBe(true);
    expect(matchesName(STORED, "matiling charles")).toBe(true);
    expect(matchesName(STORED, "charles")).toBe(true);
    expect(matchesName(STORED, "matiling")).toBe(true);
  });

  it("does not care where the comma is, or whether it is typed at all", () => {
    expect(matchesName(STORED, "matiling, charles")).toBe(true);
    expect(matchesName(STORED, "CHARLES, MATILING")).toBe(true);
    expect(matchesName(STORED, "matiling,charles")).toBe(true);
  });

  it("ignores accents typed either way, in the name and in the query", () => {
    expect(matchesName("PEÑA, JOSÉ", "jose pena")).toBe(true);
    expect(matchesName("PENA, JOSE", "josé peña")).toBe(true);
    expect(matchesName("PEÑA, JOSÉ", "peña josé")).toBe(true);
  });

  it("ignores a full stop in an initial", () => {
    expect(matchesName("DELA CRUZ, JUAN P.", "juan p. dela cruz")).toBe(true);
    expect(matchesName("DELA CRUZ, JUAN P.", "juan p dela cruz")).toBe(true);
  });

  it("matches a partial word, because a phone search is typed as you go", () => {
    expect(matchesName(STORED, "mat")).toBe(true);
    expect(matchesName(STORED, "char m")).toBe(true);
    expect(matchesName(STORED, "atili harl")).toBe(true);
  });

  it("requires every word of the query, so a stray word finds nothing", () => {
    expect(matchesName(STORED, "charles matiling jr")).toBe(false);
    expect(matchesName(STORED, "charles santos")).toBe(false);
  });

  it("treats an empty or blank query as no filter at all", () => {
    expect(matchesName(STORED, "")).toBe(true);
    expect(matchesName(STORED, "   ")).toBe(true);
    expect(matchesName(STORED, ", ")).toBe(true);
    expect(matchesName("", "")).toBe(true);
  });

  it("never matches a name against a real query when the name is empty", () => {
    expect(matchesName("", "charles")).toBe(false);
  });
});

describe("sameName", () => {
  it("accepts the same words in any order, case and accents", () => {
    expect(sameName("MATILING, CHARLES", "Charles Matiling")).toBe(true);
    expect(sameName("PEÑA, JOSÉ", "jose pena")).toBe(true);
    expect(sameName("DELA CRUZ, JUAN P.", "juan p dela cruz")).toBe(true);
  });

  it("refuses a name with an extra or missing word", () => {
    expect(sameName("MATILING, CHARLES", "Charles Matiling Jr")).toBe(false);
    expect(sameName("ORDOÑEZ, ULYSSES JR", "Ulysses Ordoñez")).toBe(false);
    expect(sameName("MATILING, CHARLES", "Charles")).toBe(false);
    expect(sameName("", "")).toBe(false);
  });
});
