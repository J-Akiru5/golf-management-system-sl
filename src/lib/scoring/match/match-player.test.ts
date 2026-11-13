import { describe, expect, it } from "vitest";
import type { CardReading, MatchOptions, RoundPlayer } from "./index";
import { matchPlayers } from "./index";
import { nameSimilarity } from "./match-player";

/**
 * Invented players. The surnames are the club's, so the Day 1 misreadings can be replayed, but
 * every given name here is made up. Several surnames sit one letter apart so ranking has to work.
 */
const ROSTER: readonly RoundPlayer[] = [
  { playerId: "gormley", name: "GORMLEY, DARIO", tee: "B", playingHandicap: 12, group: "1A" },
  { playerId: "germley", name: "GERMLEY, NELIO", tee: "B", playingHandicap: 13, group: "1A" },
  { playerId: "lim", name: "LIM, TONY", tee: "W", playingHandicap: 8, group: "2A" },
  { playerId: "lom", name: "LOM, BERTO", tee: "W", playingHandicap: 9, group: "2A" },
  { playerId: "lorena", name: "LORENA, MARISOL", tee: "W", playingHandicap: 10, group: "2A" },
  { playerId: "loreza", name: "LOREZA, PIO", tee: "W", playingHandicap: 10, group: "3A" },
  { playerId: "henares", name: "HENARES, BINGO", tee: "B", playingHandicap: 15, group: "3A" },
  { playerId: "lagman", name: "LAGMAN, EFREN", tee: "W", playingHandicap: 9, group: "3B" },
  {
    playerId: "alinsangan",
    name: "ALINSANGAN, GIRLIE",
    tee: "B",
    playingHandicap: 14,
    group: "4A",
  },
  { playerId: "alquiros", name: "ALQUIROS, HECTOR", tee: "W", playingHandicap: 7, group: "4A" },
  { playerId: "alquiras", name: "ALQUIRAS, IVO", tee: "W", playingHandicap: 7, group: "4B" },
  { playerId: "jabinigay", name: "JABINIGAY, LITO", tee: "L", playingHandicap: 11, group: "5A" },
  { playerId: "clavero", name: "CLAVERO, MYLENE", tee: "L", playingHandicap: 11, group: "5A" },
  { playerId: "tanada", name: "TAÑADA, NILO", tee: "L", playingHandicap: 13, group: "5B" },
];

function idsFor(reading: CardReading, options?: MatchOptions): string[] {
  return matchPlayers(reading, ROSTER, options).map((candidate) => candidate.playerId);
}

function placeOf(reading: CardReading, playerId: string): number {
  const place = idsFor(reading).indexOf(playerId);
  return place === -1 ? Number.POSITIVE_INFINITY : place;
}

function scoreFor(reading: CardReading, playerId: string): number {
  return (
    matchPlayers(reading, ROSTER).find((candidate) => candidate.playerId === playerId)?.score ?? -1
  );
}

/** The nine names read off Day 1 cards, with the registered surname they should find. */
const MISREADINGS = [
  { card: "Wormley", playerId: "gormley", given: "Dario", tee: "B" },
  { card: "Um", playerId: "lim", given: "Tony", tee: "W" },
  { card: "Lorona", playerId: "lorena", given: "Marisol", tee: "W" },
  { card: "Homaros", playerId: "henares", given: "Bingo", tee: "B" },
  { card: "Uhlman", playerId: "lagman", given: "Efren", tee: "W" },
  { card: "Aunsanan", playerId: "alinsangan", given: "Girlie", tee: "B" },
  { card: "Alquinos", playerId: "alquiros", given: "Hector", tee: "W" },
  { card: "Jabinugay", playerId: "jabinigay", given: "Lito", tee: "L" },
  { card: "Clayero", playerId: "clavero", given: "Mylene", tee: "L" },
] as const;

describe("day 1 misreadings", () => {
  it.each(MISREADINGS)("$card finds $playerId from the surname alone", ({ card, playerId }) => {
    expect(placeOf({ name: card }, playerId)).toBeLessThan(2);
  });

  it.each(MISREADINGS)(
    "$card with a given name puts $playerId first",
    ({ card, playerId, given, tee }) => {
      const reading: CardReading = { name: `${card}, ${given}`, tee };
      expect(idsFor(reading)[0]).toBe(playerId);
      expect(scoreFor(reading, playerId)).toBeGreaterThan(scoreFor({ name: card }, playerId));
    },
  );
});

describe("word order on the card", () => {
  it("reads the given name first or the surname first", () => {
    expect(idsFor({ name: "Tony Lim" })[0]).toBe("lim");
    expect(idsFor({ name: "LIM, TONY" })[0]).toBe("lim");
    expect(idsFor({ name: "tony lim", tee: "W" })[0]).toBe("lim");
    expect(idsFor({ name: "Tony Lim", tee: "W" })[0]).toBe("lim");
  });

  it("keeps a two word surname together when the comma gives the order", () => {
    const roster: RoundPlayer[] = [
      { playerId: "delacruz", name: "DE LA CRUZ, MARIO" },
      { playerId: "cruz", name: "CRUZ, BINO" },
    ];
    const ranked = matchPlayers({ name: "De La Cruz, Mario" }, roster);
    expect(ranked[0]?.playerId).toBe("delacruz");
  });
});

describe("accents, case and punctuation", () => {
  it("matches TAÑADA however it was typed", () => {
    expect(idsFor({ name: "Tanada, Nilo" })[0]).toBe("tanada");
    expect(idsFor({ name: "TAÑADA, NILO" })[0]).toBe("tanada");
    expect(idsFor({ name: "tañada nilo" })[0]).toBe("tanada");
    expect(idsFor({ name: "TANADA-NILO" })[0]).toBe("tanada");
  });
});

describe("blank and missing parts", () => {
  it("returns nothing for a blank name", () => {
    expect(matchPlayers({ name: "" }, ROSTER)).toEqual([]);
    expect(matchPlayers({ name: "   " }, ROSTER)).toEqual([]);
    expect(matchPlayers({ name: " , " }, ROSTER)).toEqual([]);
  });

  it("does not let a missing given name hurt a good surname", () => {
    const ranked = matchPlayers({ name: "Gormley" }, ROSTER);
    expect(ranked[0]?.playerId).toBe("gormley");
    expect(ranked[0]?.reasons).toContainEqual({ code: "surname-exact", text: "surname matches" });
    expect(scoreFor({ name: "Gormley" }, "gormley")).toBeGreaterThan(0.7);
  });

  it("does not invent a tee, handicap or group that the card does not carry", () => {
    const plain = scoreFor({ name: "Wormley, Dario" }, "gormley");
    expect(scoreFor({ name: "Wormley, Dario", tee: null }, "gormley")).toBe(plain);
    expect(scoreFor({ name: "Wormley, Dario", cardHandicap: null }, "gormley")).toBe(plain);
    expect(scoreFor({ name: "Wormley, Dario", group: null }, "gormley")).toBe(plain);
  });
});

describe("supporting signals", () => {
  it("adds for a tee that agrees and lowers for one that does not", () => {
    const agreed = scoreFor({ name: "Wormley, Dario", tee: "B" }, "gormley");
    const plain = scoreFor({ name: "Wormley, Dario" }, "gormley");
    const disagreed = scoreFor({ name: "Wormley, Dario", tee: "W" }, "gormley");
    expect(agreed).toBeGreaterThan(plain);
    expect(disagreed).toBeLessThan(plain);
  });

  it("keeps a candidate whose tee does not match", () => {
    expect(placeOf({ name: "Wormley, Dario", tee: "W" }, "gormley")).toBe(0);
  });

  it("adds for a handicap within 1 and for the same group", () => {
    const plain = scoreFor({ name: "Wormley, Dario" }, "gormley");
    expect(scoreFor({ name: "Wormley, Dario", cardHandicap: 12 }, "gormley")).toBeGreaterThan(
      plain,
    );
    expect(scoreFor({ name: "Wormley, Dario", cardHandicap: 13 }, "gormley")).toBeGreaterThan(
      plain,
    );
    expect(scoreFor({ name: "Wormley, Dario", group: "1a" }, "gormley")).toBeGreaterThan(plain);
    expect(scoreFor({ name: "Wormley, Dario", cardHandicap: 30 }, "gormley")).toBe(plain);
    expect(scoreFor({ name: "Wormley, Dario", group: "9Z" }, "gormley")).toBe(plain);
  });
});

describe("candidate list", () => {
  it("copies hasCard from the player", () => {
    const roster: RoundPlayer[] = [
      { playerId: "gormley", name: "GORMLEY, DARIO", hasCard: true },
      { playerId: "germley", name: "GERMLEY, NELIO" },
    ];
    const ranked = matchPlayers({ name: "Gormley" }, roster);
    expect(ranked[0]?.playerId).toBe("gormley");
    expect(ranked[0]?.hasCard).toBe(true);
    expect(ranked[1]?.hasCard).toBe(false);
  });

  it("orders two equal scores by name and keeps them stable", () => {
    const roster: RoundPlayer[] = [
      { playerId: "santos-b", name: "SANTOS, BETA", tee: "B" },
      { playerId: "santos-a", name: "SANTOS, ALPHA", tee: "B" },
    ];
    const first = matchPlayers({ name: "Santos" }, roster);
    expect(first.map((candidate) => candidate.playerId)).toEqual(["santos-a", "santos-b"]);
    expect(first[0]?.score).toBe(first[1]?.score);
    expect(matchPlayers({ name: "Santos" }, [...roster].reverse())[0]?.playerId).toBe("santos-a");
  });

  it("uses the given name to separate two players with the same surname", () => {
    const roster: RoundPlayer[] = [
      { playerId: "santos-a", name: "SANTOS, ALPHA" },
      { playerId: "santos-b", name: "SANTOS, BETA" },
    ];
    expect(matchPlayers({ name: "Santos, Beta" }, roster)[0]?.playerId).toBe("santos-b");
    expect(matchPlayers({ name: "Santos, A" }, roster)[0]?.playerId).toBe("santos-a");
  });

  it("honours limit and minScore", () => {
    const all = matchPlayers({ name: "Lim" }, ROSTER, { minScore: 0 });
    expect(all.length).toBe(4);
    expect(matchPlayers({ name: "Lim" }, ROSTER, { minScore: 0, limit: 2 }).length).toBe(2);
    expect(matchPlayers({ name: "Lim" }, ROSTER, { limit: 0 })).toEqual([]);
    expect(matchPlayers({ name: "Gormley" }, ROSTER, { minScore: 0.99 })).toEqual([]);
  });

  it("carries a plain reason on every candidate", () => {
    const ranked = matchPlayers({ name: "Lim" }, ROSTER, { minScore: 0, limit: 20 });
    expect(ranked.length).toBeGreaterThan(1);
    for (const candidate of ranked) {
      expect(candidate.reasons.length).toBeGreaterThan(0);
      for (const reason of candidate.reasons) expect(reason.text.trim()).not.toBe("");
    }
  });

  it("returns only the named fields, never a chosen player", () => {
    const [candidate] = matchPlayers({ name: "Gormley" }, ROSTER);
    expect(candidate).toBeDefined();
    expect(Object.keys(candidate ?? {}).sort()).toEqual([
      "hasCard",
      "playerId",
      "reasons",
      "score",
    ]);
    expect(candidate?.playerId).toBe("gormley");
    expect(candidate?.score).toBeGreaterThan(0);
    expect(candidate?.score).toBeLessThanOrEqual(1);
  });

  it("describes a one letter surname as one letter off", () => {
    expect(matchPlayers({ name: "Wormley" }, ROSTER)[0]?.reasons[0]).toEqual({
      code: "surname-close",
      text: "surname one letter off",
    });
  });
});

describe("inputs are left alone", () => {
  it("does not mutate the roster or the reading", () => {
    const roster = structuredClone(ROSTER) as RoundPlayer[];
    const rosterBefore = structuredClone(roster);
    const reading: CardReading = { name: "Wormley, Dario", tee: "B", group: "1A" };
    const readingBefore = structuredClone(reading);
    matchPlayers(reading, roster);
    expect(roster).toEqual(rosterBefore);
    expect(reading).toEqual(readingBefore);
  });

  it("accepts a frozen roster", () => {
    const roster = Object.freeze([
      Object.freeze({ playerId: "lim", name: "LIM, TONY" }),
      Object.freeze({ playerId: "lom", name: "LOM, BERTO" }),
    ]);
    expect(matchPlayers({ name: "Lim" }, roster)[0]?.playerId).toBe("lim");
  });
});

describe("nameSimilarity and the handwriting table", () => {
  it("treats a handwriting confusion as cheaper than a random letter", () => {
    const pairs: ReadonlyArray<readonly [string, string]> = [
      ["rn", "m"],
      ["u", "n"],
      ["c", "e"],
      ["l", "i"],
      ["a", "o"],
      ["li", "u"],
    ];
    for (const [left, right] of pairs) {
      expect(nameSimilarity(left, right)).toBeGreaterThan(nameSimilarity(left, "z"));
      expect(nameSimilarity(left, right)).toBe(nameSimilarity(right, left));
    }
  });

  it("still counts an ordinary substitution in full", () => {
    expect(nameSimilarity("gormley", "wormley")).toBeCloseTo(6 / 7, 6);
    expect(nameSimilarity("abc", "axc")).toBeCloseTo(2 / 3, 6);
  });

  it("rewards one letter off in a long surname more than in a short one", () => {
    expect(nameSimilarity("gormley", "wormley")).toBeGreaterThan(nameSimilarity("lim", "lom"));
  });

  it("handles empty input and identical names", () => {
    expect(nameSimilarity("", "lim")).toBe(0);
    expect(nameSimilarity("lim", "")).toBe(0);
    expect(nameSimilarity("tanada", "tanada")).toBe(1);
  });
});
