import { describe, expect, it } from "vitest";
import { type RoutingInput, route, UNCLASSIFIED_LABEL } from "./index";
import type { Player, ProvisionalPlayer, Tee, TournamentConfig } from "./types";

const tees: Tee[] = [{ id: "white", name: "White", courseRating: 71.5, slope: 128, par: 72 }];
const categories = [
  { id: "regular", name: "Regular", gender: "M" as const, minAge: 0, maxAge: null, teeId: "white" },
];
const flights = [
  { id: "r-a", categoryId: "regular", name: "Regular A", min: 0, max: 18 },
  { id: "r-b", categoryId: "regular", name: "Regular B", min: 18.1, max: 30 },
];

const config: TournamentConfig = {
  date: "2026-11-14",
  maxIndex: 30,
  allowance: 1,
  flightBasis: "index",
  startFormat: "shotgun",
  holes: 18,
  groupSize: 4,
  minGroupSize: 3,
  firstTeeTime: "07:00",
  intervalMinutes: 12,
  waveGapMinutes: 300,
};

const player = (id: string, name: string, index: number | null): Player => ({
  id,
  name,
  birthdate: "1980-01-01",
  gender: "M",
  index,
});

const loose = (id: string, name: string, missing: string[]): ProvisionalPlayer => ({
  id,
  name,
  index: null,
  missing,
});

const input = (players: Player[], provisional: ProvisionalPlayer[]): RoutingInput => ({
  players,
  provisional,
  config,
  tees,
  categories,
  flights,
});

describe("route with provisional players", () => {
  it("places a confirmed provisional player with a start hole and time", () => {
    const out = route(input([], [loose("p1", "PROVISIONAL ONE", ["birthdate"])]));
    const group = out.groups[0];

    expect(group).toBeDefined();
    expect(group?.playerIds).toEqual(["p1"]);
    expect(group?.startHole).toBeGreaterThan(0);
    expect(group?.time).toBe("07:00");
    expect(group?.flightId).toBe("r-a");
  });

  it("keeps category, tee and flight empty on the provisional registration", () => {
    const out = route(input([], [loose("p1", "PROVISIONAL ONE", ["birthdate", "handicap index"])]));
    const reg = out.registrations.find((r) => r.playerId === "p1");

    expect(reg?.status).toBe("ok");
    expect(reg?.provisional).toBe(true);
    expect(reg?.categoryId).toBeNull();
    expect(reg?.teeId).toBeNull();
    expect(reg?.flightId).toBeNull();
    expect(reg?.playingHandicap).toBeNull();
  });

  it("groups provisional players together, by name, apart from classified flights", () => {
    const out = route(
      input(
        [player("classed", "CLASSED PLAYER", 8)],
        [
          loose("z", "ZULU PROVISIONAL", ["gender"]),
          loose("a", "ALPHA PROVISIONAL", ["birthdate"]),
        ],
      ),
    );

    const classed = out.groups.find((g) => g.playerIds.includes("classed"));
    const unclassified = out.groups.find((g) => g.playerIds.includes("a"));

    expect(classed?.playerIds).toEqual(["classed"]);
    expect(unclassified?.playerIds).toEqual(["a", "z"]);
    expect(unclassified?.flightId).toBe(classed?.flightId);
    expect(out.warnings.some((w) => w.includes(UNCLASSIFIED_LABEL))).toBe(true);
  });

  it("never puts a provisional player in a real flight group", () => {
    const out = route(
      input(
        Array.from({ length: 8 }, (_, i) => player(`c${i}`, `CLASSED ${i}`, 8)),
        [loose("p1", "PROVISIONAL ONE", ["handicap index"])],
      ),
    );
    const groupsWithProvisional = out.groups.filter((g) => g.playerIds.includes("p1"));

    expect(groupsWithProvisional).toHaveLength(1);
    expect(groupsWithProvisional[0]?.playerIds).toEqual(["p1"]);
  });

  it("does not duplicate a provisional player who is already locked into a group", () => {
    const out = route(input([], [loose("p1", "PROVISIONAL ONE", ["birthdate"])]), {
      lockedGroups: [
        {
          number: 1,
          flightId: "r-a",
          playerIds: ["p1"],
          startHole: 3,
          wave: "A",
          time: "07:00",
        },
      ],
    });

    expect(out.groups).toHaveLength(1);
    expect(out.groups[0]?.playerIds).toEqual(["p1"]);
    expect(out.groups[0]?.startHole).toBe(3);
  });
});
