import { describe, expect, it } from "vitest";
import { buildFlightQueue } from "./flight-queue";
import type { DrawGroup } from "./validate";

let seq = 0;
const group = (over: Partial<DrawGroup> & Pick<DrawGroup, "flightId" | "startHole" | "time">) => {
  seq += 1;
  return {
    number: seq,
    playerIds: ["p1", "p2", "p3", "p4"],
    wave: null,
    locked: false,
    ...over,
  } satisfies DrawGroup;
};

const flights = [
  { id: "a", name: "A" },
  { id: "b", name: "B" },
];

describe("buildFlightQueue", () => {
  it("lists every hole, including holes nobody starts on", () => {
    const model = buildFlightQueue(
      [group({ flightId: "a", startHole: 3, time: "06:30" })],
      flights,
      18,
    );
    expect(model.holes).toBe(18);
    expect(model.byHole).toHaveLength(18);
    expect(model.byHole[0]).toEqual({ hole: 1, entries: [] });
    expect(model.byHole[2]?.entries).toHaveLength(1);
  });

  it("orders a hole's queue by time, then by group number", () => {
    const late = group({ number: 1, flightId: "b", startHole: 1, time: "06:45" });
    const earlyHigh = group({ number: 9, flightId: "a", startHole: 1, time: "06:30" });
    const earlyLow = group({ number: 4, flightId: "a", startHole: 1, time: "06:30" });
    const model = buildFlightQueue([late, earlyHigh, earlyLow], flights, 18);
    expect(model.byHole[0]?.entries.map((e) => e.groupNumber)).toEqual([4, 9, 1]);
  });

  it("describes each entry with its flight, time, lock and player count", () => {
    const model = buildFlightQueue(
      [
        group({
          number: 7,
          flightId: "a",
          startHole: 2,
          time: "06:30",
          locked: true,
          playerIds: ["x", "y"],
        }),
      ],
      flights,
      18,
    );
    expect(model.byHole[1]?.entries[0]).toEqual({
      groupNumber: 7,
      flightId: "a",
      time: "06:30",
      startHole: 2,
      locked: true,
      players: 2,
    });
  });

  it("queues Flight B behind Flight A and counts vacant holes in each wave", () => {
    const draw: DrawGroup[] = [];
    for (let hole = 1; hole <= 10; hole++) {
      draw.push(group({ flightId: "a", startHole: hole, time: "06:30" }));
    }
    for (let hole = 1; hole <= 6; hole++) {
      draw.push(group({ flightId: "b", startHole: hole, time: "06:45" }));
    }
    const model = buildFlightQueue(draw, flights, 18);

    expect(model.flights.map((f) => [f.flightName, f.position, f.groups, f.players])).toEqual([
      ["A", 1, 10, 40],
      ["B", 2, 6, 24],
    ]);
    const waveA = model.flights[0]?.waves[0];
    expect(waveA?.holes).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(waveA?.vacantHoles).toEqual([11, 12, 13, 14, 15, 16, 17, 18]);
    const waveB = model.flights[1]?.waves[0];
    expect(waveB?.vacantHoles).toHaveLength(12);
    expect(waveB?.vacantHoles[0]).toBe(7);
    // On hole 1 the A group goes first and the B group waits behind it.
    expect(model.byHole[0]?.entries.map((e) => e.flightId)).toEqual(["a", "b"]);
  });

  it("ranks flights by their earliest start, then by the order they were given", () => {
    const draw = [
      group({ flightId: "b", startHole: 1, time: "06:30" }),
      group({ flightId: "a", startHole: 2, time: "06:30" }),
    ];
    const model = buildFlightQueue(draw, flights, 18);
    // Same first start: the flight listed first (A) leads.
    expect(model.flights.map((f) => f.flightId)).toEqual(["a", "b"]);

    const later = buildFlightQueue(
      [
        group({ flightId: "a", startHole: 1, time: "06:45" }),
        group({ flightId: "b", startHole: 1, time: "06:30" }),
      ],
      flights,
      18,
    );
    expect(later.flights.map((f) => f.flightId)).toEqual(["b", "a"]);
    expect(later.flights.map((f) => f.position)).toEqual([1, 2]);
  });

  it("gives a flight that spans two starts one wave per start", () => {
    const draw = [
      ...Array.from({ length: 18 }, (_, i) =>
        group({ flightId: "a", startHole: i + 1, time: "06:30" }),
      ),
      group({ flightId: "a", startHole: 4, time: "06:45" }),
      group({ flightId: "a", startHole: 9, time: "06:45" }),
    ];
    const waves = buildFlightQueue(draw, flights, 18).flights[0]?.waves;
    expect(waves?.map((w) => [w.time, w.groups])).toEqual([
      ["06:30", 18],
      ["06:45", 2],
    ]);
    expect(waves?.[0]?.vacantHoles).toEqual([]);
    expect(waves?.[1]?.holes).toEqual([4, 9]);
  });

  it("counts a slot taken by another flight as taken", () => {
    const draw = [
      group({ flightId: "a", startHole: 1, time: "06:30" }),
      group({ flightId: "b", startHole: 2, time: "06:30" }),
    ];
    const waveA = buildFlightQueue(draw, flights, 4).flights[0]?.waves[0];
    expect(waveA?.holes).toEqual([1]);
    expect(waveA?.vacantHoles).toEqual([3, 4]);
  });

  it("keeps a group of an unknown flight in the hole queue but not in the flights", () => {
    const draw = [
      group({ flightId: "zzz", startHole: 5, time: "06:30" }),
      group({ flightId: "a", startHole: 6, time: "06:30" }),
    ];
    const model = buildFlightQueue(draw, flights, 18);
    expect(model.byHole[4]?.entries[0]?.flightId).toBe("zzz");
    expect(model.flights.map((f) => f.flightId)).toEqual(["a"]);
    // The unknown group still holds hole 5, so it is not reported as vacant.
    expect(model.flights[0]?.waves[0]?.vacantHoles).not.toContain(5);
  });

  it("leaves out a flight with no groups", () => {
    const model = buildFlightQueue(
      [group({ flightId: "a", startHole: 1, time: "06:30" })],
      flights,
      18,
    );
    expect(model.flights.map((f) => f.flightId)).toEqual(["a"]);
  });

  it("skips a group that starts off the course", () => {
    const model = buildFlightQueue(
      [
        group({ flightId: "a", startHole: 19, time: "06:30" }),
        group({ flightId: "a", startHole: 0, time: "06:30" }),
      ],
      flights,
      18,
    );
    expect(model.byHole.every((h) => h.entries.length === 0)).toBe(true);
    expect(model.flights).toEqual([]);
  });

  it("does not change its input", () => {
    const draw = [
      group({ flightId: "b", startHole: 1, time: "06:45" }),
      group({ flightId: "a", startHole: 1, time: "06:30" }),
    ];
    const copy = JSON.parse(JSON.stringify(draw));
    buildFlightQueue(draw, flights, 18);
    expect(draw).toEqual(copy);
  });

  it("returns an empty model for an empty draw", () => {
    const model = buildFlightQueue([], flights, 18);
    expect(model.flights).toEqual([]);
    expect(model.byHole).toHaveLength(18);
  });
});
