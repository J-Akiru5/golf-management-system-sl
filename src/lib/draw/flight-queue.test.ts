import { describe, expect, it } from "vitest";
import { buildFlightQueue, flightLetter } from "./flight-queue";
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

const classes = [
  { id: "a", name: "Class A" },
  { id: "b", name: "Class B" },
];
const morning = (time: string) => (time < "12:00" ? "AM" : "PM");

/** n groups, one per hole from hole 1, all at `time`. */
const wave = (n: number, time: string, flightId = "a", firstHole = 1) =>
  Array.from({ length: n }, (_, i) => group({ flightId, startHole: firstHole + i, time }));

describe("buildFlightQueue", () => {
  it("lists every hole, including holes nobody starts on", () => {
    const model = buildFlightQueue(
      [group({ flightId: "a", startHole: 3, time: "06:30" })],
      classes,
      18,
    );
    expect(model.holes).toBe(18);
    expect(model.byHole).toHaveLength(18);
    expect(model.byHole[0]).toEqual({ hole: 1, entries: [] });
    expect(model.byHole[2]?.entries).toHaveLength(1);
  });

  it("calls the first group on a hole Flight A and the next one Flight B", () => {
    const draw = [...wave(18, "06:30"), ...wave(6, "06:45", "b")];
    const model = buildFlightQueue(draw, classes, 18, morning);

    expect(model.flights.map((f) => [f.label, f.time, f.groups])).toEqual([
      ["Flight A", "06:30", 18],
      ["Flight B", "06:45", 6],
    ]);
    // Hole 1: the A group first, the B group behind it, labelled 1A and 1B.
    expect(model.byHole[0]?.entries.map((e) => e.slot)).toEqual(["1A", "1B"]);
    // Hole 12 only has a Flight A group, because Flight B stopped at hole 6.
    expect(model.byHole[11]?.entries.map((e) => e.slot)).toEqual(["12A"]);
  });

  it("lets a class straddle two flights, since a class does not make a flight", () => {
    const draw = [
      ...wave(10, "06:30", "a"),
      ...wave(8, "06:30", "b", 11),
      ...wave(4, "06:45", "b"),
    ];
    const model = buildFlightQueue(draw, classes, 18, morning);
    expect(model.flights).toHaveLength(2);
    expect(model.flights[0]?.classNames).toEqual(["Class A", "Class B"]);
    expect(model.flights[1]?.classNames).toEqual(["Class B"]);
  });

  it("has only Flight A when the groups fit on the holes, and lists the vacant holes", () => {
    const model = buildFlightQueue(wave(10, "06:30"), classes, 18, morning);
    expect(model.flights).toHaveLength(1);
    expect(model.flights[0]?.vacantHoles).toEqual([11, 12, 13, 14, 15, 16, 17, 18]);
    expect(model.flights[0]?.holes).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it("restarts the letters in the afternoon session", () => {
    const draw = [
      ...wave(18, "06:30"),
      ...wave(3, "06:45"),
      ...wave(18, "12:30"),
      ...wave(2, "12:45"),
    ];
    const model = buildFlightQueue(draw, classes, 18, morning);
    expect(model.flights.map((f) => `${f.session} ${f.letter}`)).toEqual([
      "AM A",
      "AM B",
      "PM A",
      "PM B",
    ]);
    expect(new Set(model.flights.map((f) => f.key)).size).toBe(4);
    const hole1 = model.byHole[0]?.entries.map((e) => `${e.session} ${e.slot}`);
    expect(hole1).toEqual(["AM 1A", "AM 1B", "PM 1A", "PM 1B"]);
  });

  it("treats the whole draw as one session when no session finder is given", () => {
    const model = buildFlightQueue([...wave(2, "06:30"), ...wave(2, "12:30")], classes, 18);
    expect(model.flights.map((f) => f.letter)).toEqual(["A", "B"]);
    expect(model.flights.every((f) => f.session === null)).toBe(true);
  });

  it("orders a hole's queue by time, then by group number", () => {
    const late = group({ number: 1, flightId: "b", startHole: 1, time: "06:45" });
    const earlyHigh = group({ number: 9, flightId: "a", startHole: 1, time: "06:30" });
    const earlyLow = group({ number: 4, flightId: "a", startHole: 1, time: "06:30" });
    const model = buildFlightQueue([late, earlyHigh, earlyLow], classes, 18, morning);
    expect(model.byHole[0]?.entries.map((e) => e.groupNumber)).toEqual([4, 9, 1]);
  });

  it("describes each entry with its class, time, lock and player count", () => {
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
      classes,
      18,
      morning,
    );
    expect(model.byHole[1]?.entries[0]).toEqual({
      groupNumber: 7,
      className: "Class A",
      time: "06:30",
      startHole: 2,
      locked: true,
      players: 2,
      session: "AM",
      letter: "A",
      slot: "2A",
    });
  });

  it("shows an unknown class by its id", () => {
    const model = buildFlightQueue(
      [group({ flightId: "zzz", startHole: 5, time: "06:30" })],
      classes,
      18,
    );
    expect(model.byHole[4]?.entries[0]?.className).toBe("zzz");
  });

  it("skips a group that starts off the course", () => {
    const model = buildFlightQueue(
      [
        group({ flightId: "a", startHole: 19, time: "06:30" }),
        group({ flightId: "a", startHole: 0, time: "06:30" }),
      ],
      classes,
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
    buildFlightQueue(draw, classes, 18, morning);
    expect(draw).toEqual(copy);
  });

  it("returns an empty model for an empty draw", () => {
    const model = buildFlightQueue([], classes, 18);
    expect(model.flights).toEqual([]);
    expect(model.byHole).toHaveLength(18);
  });
});

describe("flightLetter", () => {
  it("runs A to Z and then falls back to numbers", () => {
    expect(flightLetter(0)).toBe("A");
    expect(flightLetter(1)).toBe("B");
    expect(flightLetter(25)).toBe("Z");
    expect(flightLetter(26)).toBe("27");
  });
});
