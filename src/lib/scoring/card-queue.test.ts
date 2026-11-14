import { describe, expect, it } from "vitest";
import {
  buildCardQueue,
  type CardQueueEntry,
  type CardQueueFilters,
  type CardQueuePlacement,
  type CardQueuePlayer,
  cardQueueCounts,
  cardQueueState,
  filterCardQueue,
  nextCardInQueue,
} from "./card-queue";
import type { Scorecard } from "./types";

function card(
  overrides: Partial<Scorecard> & Pick<Scorecard, "playerId">,
): Scorecard & Pick<Scorecard, "playerId"> {
  return {
    id: `card-${overrides.playerId}-${overrides.revision ?? 1}`,
    roundId: "round-1",
    scorerId: "someone-else",
    source: "manual",
    revision: 1,
    status: "submitted",
    entries: [],
    writtenTotal: null,
    submittedAt: "2026-11-14T00:00:00Z",
    ...overrides,
  };
}

const PLAYERS: CardQueuePlayer[] = [
  { playerId: "p-tanada", playerName: "TAÑADA, JOSE", className: "Class B", classKey: "class-b" },
  {
    playerId: "p-adorio",
    playerName: "ADORIO, RONNEL",
    className: "Class A",
    classKey: "class-a",
  },
  { playerId: "p-bravo", playerName: "BRAVO, LEE" },
];

const PLACEMENTS = new Map<string, CardQueuePlacement>([
  ["p-tanada", { session: "PM", groupNumber: 2, startHole: 7, teeTime: "12:30" }],
  ["p-adorio", { session: "AM", groupNumber: 1, startHole: 1, teeTime: "06:30" }],
]);

function filters(overrides: Partial<CardQueueFilters> = {}): CardQueueFilters {
  return { session: "all", classKey: null, state: "all", query: "", ...overrides };
}

function queue(): CardQueueEntry[] {
  return buildCardQueue(PLAYERS, [], PLACEMENTS);
}

describe("cardQueueState", () => {
  it("is missing when the player has no card", () => {
    expect(cardQueueState([], "p-adorio")).toBe("none");
  });

  it("counts a submitted or in-review card as entered", () => {
    expect(cardQueueState([card({ playerId: "p-adorio" })], "p-adorio")).toBe("entered");
    expect(cardQueueState([card({ playerId: "p-adorio", status: "in_review" })], "p-adorio")).toBe(
      "entered",
    );
  });

  it("counts only an approved card as verified", () => {
    expect(cardQueueState([card({ playerId: "p-adorio", status: "approved" })], "p-adorio")).toBe(
      "verified",
    );
  });

  it("lets the newest revision decide", () => {
    const cards = [
      card({ playerId: "p-adorio", revision: 1, status: "approved" }),
      card({ playerId: "p-adorio", revision: 2, status: "submitted" }),
    ];
    expect(cardQueueState(cards, "p-adorio")).toBe("entered");
  });

  it("ignores a card that no longer counts", () => {
    for (const status of ["rejected", "revoked", "superseded"] as const) {
      expect(cardQueueState([card({ playerId: "p-adorio", status })], "p-adorio")).toBe("none");
    }
  });

  it("reads another player's card as no card", () => {
    expect(cardQueueState([card({ playerId: "p-adorio" })], "p-bravo")).toBe("none");
  });
});

describe("buildCardQueue", () => {
  it("orders by group, then starting hole, then name, with no group last", () => {
    expect(queue().map((entry) => entry.playerId)).toEqual(["p-adorio", "p-tanada", "p-bravo"]);
  });

  it("carries the placement the screen already knows", () => {
    const tanada = queue().find((entry) => entry.playerId === "p-tanada");
    expect(tanada).toMatchObject({
      session: "PM",
      groupNumber: 2,
      startHole: 7,
      teeTime: "12:30",
      className: "Class B",
      classKey: "class-b",
    });
  });

  it("leaves a player with no placement unknown rather than guessing", () => {
    const bravo = queue().find((entry) => entry.playerId === "p-bravo");
    expect(bravo).toMatchObject({
      session: null,
      groupNumber: null,
      startHole: null,
      teeTime: null,
      className: null,
      classKey: null,
    });
  });

  it("takes each player's card state from the cards", () => {
    const cards = [
      card({ playerId: "p-adorio", status: "approved" }),
      card({ playerId: "p-tanada" }),
    ];
    expect(buildCardQueue(PLAYERS, cards, PLACEMENTS).map((entry) => entry.state)).toEqual([
      "verified",
      "entered",
      "none",
    ]);
  });
});

describe("filterCardQueue", () => {
  it("keeps only the chosen session, and leaves unknown sessions out", () => {
    expect(filterCardQueue(queue(), filters({ session: "AM" })).map((e) => e.playerId)).toEqual([
      "p-adorio",
    ]);
    expect(filterCardQueue(queue(), filters({ session: "PM" })).map((e) => e.playerId)).toEqual([
      "p-tanada",
    ]);
  });

  it("keeps only the chosen class", () => {
    expect(
      filterCardQueue(queue(), filters({ classKey: "class-b" })).map((e) => e.playerId),
    ).toEqual(["p-tanada"]);
  });

  it("keeps only the chosen card state", () => {
    const cards = [
      card({ playerId: "p-adorio", status: "approved" }),
      card({ playerId: "p-tanada" }),
    ];
    const entries = buildCardQueue(PLAYERS, cards, PLACEMENTS);
    expect(filterCardQueue(entries, filters({ state: "none" })).map((e) => e.playerId)).toEqual([
      "p-bravo",
    ]);
    expect(filterCardQueue(entries, filters({ state: "entered" })).map((e) => e.playerId)).toEqual([
      "p-tanada",
    ]);
    expect(filterCardQueue(entries, filters({ state: "verified" })).map((e) => e.playerId)).toEqual(
      ["p-adorio"],
    );
  });

  it("searches in any word order, without accents", () => {
    expect(filterCardQueue(queue(), filters({ query: "ronnel adorio" }))).toHaveLength(1);
    expect(filterCardQueue(queue(), filters({ query: "ADORIO,RONNEL" }))).toHaveLength(1);
    expect(filterCardQueue(queue(), filters({ query: "tanada" }))).toHaveLength(1);
    expect(filterCardQueue(queue(), filters({ query: "lee bravo" }))).toHaveLength(1);
    expect(filterCardQueue(queue(), filters({ query: "nobody" }))).toHaveLength(0);
  });

  it("combines the filters", () => {
    const cards = [card({ playerId: "p-tanada", status: "approved" })];
    const entries = buildCardQueue(PLAYERS, cards, PLACEMENTS);
    expect(
      filterCardQueue(entries, filters({ session: "PM", classKey: "class-b", state: "verified" })),
    ).toHaveLength(1);
    expect(
      filterCardQueue(entries, filters({ session: "PM", classKey: "class-b", state: "none" })),
    ).toHaveLength(0);
  });
});

describe("cardQueueCounts", () => {
  it("counts entered as any card in, verified inside it, and the rest as missing", () => {
    const cards = [
      card({ playerId: "p-adorio", status: "approved" }),
      card({ playerId: "p-tanada" }),
    ];
    expect(cardQueueCounts(buildCardQueue(PLAYERS, cards, PLACEMENTS))).toEqual({
      total: 3,
      entered: 2,
      verified: 1,
      missing: 1,
    });
  });

  it("counts an empty scope as zeros", () => {
    expect(cardQueueCounts([])).toEqual({ total: 0, entered: 0, verified: 0, missing: 0 });
  });
});

describe("nextCardInQueue", () => {
  const cards = [
    card({ playerId: "p-adorio", status: "approved" }),
    card({ playerId: "p-tanada" }),
  ];
  // Queue order: p-adorio (verified), p-tanada (entered), p-bravo (missing).
  const entries = buildCardQueue(PLAYERS, cards, PLACEMENTS);

  it("picks the next player without a card", () => {
    expect(nextCardInQueue(entries, "p-tanada")?.playerId).toBe("p-bravo");
  });

  it("wraps to the start of the list", () => {
    const withTwoMissing = buildCardQueue(PLAYERS, [], PLACEMENTS);
    expect(nextCardInQueue(withTwoMissing, "p-bravo")?.playerId).toBe("p-adorio");
  });

  it("skips a card that is in but not approved", () => {
    expect(nextCardInQueue(entries, "p-adorio")?.playerId).toBe("p-bravo");
  });

  it("returns nothing when every card is in", () => {
    const allCards = [
      card({ playerId: "p-adorio", status: "approved" }),
      card({ playerId: "p-tanada", status: "approved" }),
      card({ playerId: "p-bravo", status: "approved" }),
    ];
    expect(nextCardInQueue(buildCardQueue(PLAYERS, allCards, PLACEMENTS), "p-adorio")).toBeNull();
  });

  it("starts at the first missing card when the current player is not in the list", () => {
    expect(nextCardInQueue(entries, "p-unknown")?.playerId).toBe("p-bravo");
  });
});
