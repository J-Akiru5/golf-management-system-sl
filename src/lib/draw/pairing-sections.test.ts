import { describe, expect, it } from "vitest";
import type { DrawGroup } from "@/lib/draw/validate";
import { fmtTime } from "@/lib/format";
import { UNCLASSIFIED_LABEL } from "@/lib/routing";
import { buildPairingSections, type PairingFlight } from "./pairing-sections";

const group = (number: number, startHole: number, time: string, flightId = "a"): DrawGroup => ({
  number,
  flightId,
  playerIds: [`p${number}`],
  startHole,
  wave: "A",
  time,
  locked: false,
});

const classes: Record<string, string> = { a: "Class A", b: "Class B" };
const classNameOf = (g: DrawGroup) => classes[g.flightId] ?? g.flightId;

const flights: Record<number, PairingFlight> = {
  1: { time: "06:30", letter: "A", session: "AM" },
  2: { time: "06:30", letter: "A", session: "AM" },
  3: { time: "06:45", letter: "B", session: "AM" },
  4: { time: "12:30", letter: "A", session: "PM" },
};
const flightOf = (g: DrawGroup) => flights[g.number] ?? null;

describe("buildPairingSections", () => {
  it("keeps the class-first order when class is chosen", () => {
    const sections = buildPairingSections({
      groups: [group(1, 7, "06:30"), group(3, 3, "06:45", "b"), group(2, 1, "06:30")],
      categorization: "class",
      classNameOf,
      flightOf,
    });
    expect(sections.map((s) => s.key)).toEqual([
      `${fmtTime("06:30")} · Class A`,
      `${fmtTime("06:45")} · Class B`,
    ]);
    expect(sections[0]?.groups.map((g) => g.number)).toEqual([1, 2]);
  });

  it("puts unclassified groups under their own class heading", () => {
    const sections = buildPairingSections({
      groups: [group(5, 1, "06:30", "unc")],
      categorization: "class",
      classNameOf: (g) => (g.flightId === "unc" ? UNCLASSIFIED_LABEL : classNameOf(g)),
      flightOf,
    });
    expect(sections).toHaveLength(1);
    expect(sections[0]?.heading).toBe(UNCLASSIFIED_LABEL);
  });

  it("groups by flight and orders each flight by hole when flight is chosen", () => {
    const sections = buildPairingSections({
      groups: [
        group(1, 7, "06:30"),
        group(2, 1, "06:30"),
        group(3, 3, "06:45", "b"),
        group(4, 2, "12:30"),
      ],
      categorization: "flight",
      classNameOf,
      flightOf,
    });
    expect(sections.map((s) => s.heading)).toEqual([
      `${fmtTime("06:30")} · Flight A`,
      `${fmtTime("06:45")} · Flight B`,
      `${fmtTime("12:30")} · Flight A`,
    ]);
    expect(sections[0]?.groups.map((g) => g.number)).toEqual([2, 1]);
    expect(sections[1]?.groups.map((g) => g.number)).toEqual([3]);
    expect(sections[2]?.groups.map((g) => g.number)).toEqual([4]);
  });

  it("keeps a group the queue cannot place, last and visible", () => {
    const sections = buildPairingSections({
      groups: [group(9, 19, "06:30"), group(1, 1, "06:30")],
      categorization: "flight",
      classNameOf,
      flightOf,
    });
    expect(sections.map((s) => s.key)).toEqual(["AM:06:30:A", "not-in-flight-queue"]);
    expect(sections[1]?.groups.map((g) => g.number)).toEqual([9]);
    expect(sections[1]?.heading).toBe("Not in the flight queue");
  });

  it("does not mutate the input groups", () => {
    const input = [group(1, 7, "06:30"), group(2, 1, "06:30")];
    const copy = structuredClone(input);
    buildPairingSections({ groups: input, categorization: "flight", classNameOf, flightOf });
    expect(input).toEqual(copy);
  });
});
