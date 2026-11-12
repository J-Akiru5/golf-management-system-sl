import { describe, expect, it } from "vitest";
import type { PublicProgramme } from "@/lib/data/types";
import { publicProfileTeeTimes } from "./public-profile-tee-times";

describe("publicProfileTeeTimes", () => {
  const programme: Pick<PublicProgramme, "days"> = {
    days: [
      {
        dayNumber: 1,
        label: "Day 1",
        playDate: "2026-11-12",
        startTime: "06:30",
        players: [
          { name: "ORDOÑEZ, ULYSSES", teeTime: "06:12", startHole: 10, confirmed: true },
          { name: "ANA REYES", teeTime: null, startHole: null, confirmed: false },
        ],
      },
      {
        dayNumber: 2,
        label: "Day 2",
        playDate: "2026-11-13",
        startTime: "06:30",
        players: [{ name: "ULYSSES ORDOÑEZ", teeTime: "12:42", startHole: 3, confirmed: true }],
      },
      {
        dayNumber: 3,
        label: "Day 3",
        playDate: "2026-11-14",
        startTime: "06:00",
        players: [{ name: "ULYSSES ORDOÑEZ", teeTime: "06:12", startHole: 1, confirmed: true }],
      },
      {
        dayNumber: 4,
        label: "Day 4",
        playDate: "2026-11-15",
        startTime: "06:00",
        players: [{ name: "ULYSSES ORDOÑEZ", teeTime: "11:42", startHole: 10, confirmed: true }],
      },
    ],
  };

  it("replaces each day's flight wave time with the session time", () => {
    expect(publicProfileTeeTimes(programme, "Ulysses Ordoñez")).toEqual([
      {
        dayNumber: 1,
        dayLabel: "Day 1",
        playDate: "2026-11-12",
        teeTime: "06:30",
        startHole: 10,
      },
      {
        dayNumber: 2,
        dayLabel: "Day 2",
        playDate: "2026-11-13",
        teeTime: "12:30",
        startHole: 3,
      },
      {
        dayNumber: 3,
        dayLabel: "Day 3",
        playDate: "2026-11-14",
        teeTime: "06:00",
        startHole: 1,
      },
      {
        dayNumber: 4,
        dayLabel: "Day 4",
        playDate: "2026-11-15",
        teeTime: "11:30",
        startHole: 10,
      },
    ]);
  });

  it("keeps the hole and the day order it was given", () => {
    const rows = publicProfileTeeTimes(programme, "Ulysses Ordoñez");
    expect(rows.map((row) => row.dayNumber)).toEqual([1, 2, 3, 4]);
    expect(rows.map((row) => row.startHole)).toEqual([10, 3, 1, 10]);
  });

  it("omits a day without a confirmed time, as the raw rows do", () => {
    expect(publicProfileTeeTimes(programme, "Ulysses Ordoñez").map((row) => row.dayNumber)).toEqual(
      [1, 2, 3, 4],
    );
    expect(publicProfileTeeTimes(programme, "Ana Reyes")).toEqual([]);
    expect(publicProfileTeeTimes(programme, "Someone Else")).toEqual([]);
    expect(publicProfileTeeTimes({ days: [] }, "Ulysses Ordoñez")).toEqual([]);
  });

  it("keeps the stored time on a day outside the club's rule", () => {
    const extended: Pick<PublicProgramme, "days"> = {
      days: [
        ...programme.days,
        {
          dayNumber: 5,
          label: "Day 5",
          playDate: "2026-11-16",
          startTime: "06:30",
          players: [{ name: "ULYSSES ORDOÑEZ", teeTime: "06:40", startHole: 1, confirmed: true }],
        },
      ],
    };
    expect(publicProfileTeeTimes(extended, "Ulysses Ordoñez").at(-1)?.teeTime).toBe("06:40");
  });
});
