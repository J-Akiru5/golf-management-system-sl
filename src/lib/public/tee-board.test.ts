import { describe, expect, it } from "vitest";
import type { PublicTeeTimePlayer } from "@/lib/data/types";
import {
  type BoardSection,
  type BoardSectionKey,
  confirmedTeeTime,
  teeBoardSections,
} from "./tee-board";

const player = (name: string, teeTime: string | null, confirmed = true): PublicTeeTimePlayer => ({
  name,
  teeTime,
  startHole: teeTime ? 1 : null,
  confirmed,
});

const section = (sections: BoardSection[], key: BoardSectionKey): BoardSection => {
  const found = sections.find((item) => item.key === key);
  if (!found) throw new Error(`no ${key} section`);
  return found;
};

const names = (sections: BoardSection[], key: BoardSectionKey): string[] =>
  section(sections, key).players.map((item) => item.name);

describe("confirmedTeeTime", () => {
  it("prints a confirmed clock time and nothing else", () => {
    expect(confirmedTeeTime(player("Adela Reyes", "06:40"))).toBe("06:40");
    expect(confirmedTeeTime(player("Adela Reyes", null))).toBeNull();
    expect(confirmedTeeTime(player("Adela Reyes", "  "))).toBeNull();
    expect(confirmedTeeTime(player("Adela Reyes", "06:40", false))).toBeNull();
  });
});

describe("teeBoardSections", () => {
  it("puts a morning start under AM and an afternoon start under PM", () => {
    const day = {
      players: [
        player("Benjamin Bautista", "12:40"),
        player("Adela Reyes", "06:40"),
        player("Carlos Castillo", "13:00"),
      ],
    };
    const sections = teeBoardSections(day, 0, 2);
    expect(names(sections, "AM")).toEqual(["Adela Reyes"]);
    expect(names(sections, "PM")).toEqual(["Benjamin Bautista", "Carlos Castillo"]);
    expect(names(sections, "unassigned")).toEqual([]);
  });

  it("sorts each session by name, not by the order the rows arrived in", () => {
    const day = {
      players: [
        player("Dolores Tan", "06:30"),
        player("Adela Reyes", "06:40"),
        player("Carmela Lim", "07:00"),
      ],
    };
    expect(names(teeBoardSections(day, 0, 2), "AM")).toEqual([
      "Adela Reyes",
      "Carmela Lim",
      "Dolores Tan",
    ]);
  });

  it("reads the turn-over from the day's own afternoon start, not from noon", () => {
    // The last day's second session starts at 11:30, so 11:45 is the afternoon there.
    const day = {
      players: [player("Adela Reyes", "11:20"), player("Dolores Tan", "11:45")],
    };
    const sections = teeBoardSections(day, 1, 2);
    expect(names(sections, "AM")).toEqual(["Adela Reyes"]);
    expect(names(sections, "PM")).toEqual(["Dolores Tan"]);
  });

  it("puts a player with no confirmed time under unassigned, with no time", () => {
    const sections = teeBoardSections({ players: [player("Adela Reyes", null)] }, 0, 2);
    expect(names(sections, "unassigned")).toEqual(["Adela Reyes"]);
    expect(section(sections, "unassigned").players[0]?.teeTime).toBeNull();
  });

  it("withholds a confirmed time that is not a clock time instead of guessing a session", () => {
    const sections = teeBoardSections({ players: [player("Adela Reyes", "morning")] }, 0, 2);
    expect(names(sections, "AM")).toEqual([]);
    expect(names(sections, "PM")).toEqual([]);
    expect(names(sections, "unassigned")).toEqual(["Adela Reyes"]);
    expect(section(sections, "unassigned").players[0]?.teeTime).toBeNull();
  });

  it("never prints a time the desk has not confirmed", () => {
    const sections = teeBoardSections({ players: [player("Adela Reyes", "06:40", false)] }, 0, 2);
    expect(names(sections, "unassigned")).toEqual(["Adela Reyes"]);
    expect(section(sections, "unassigned").players[0]?.teeTime).toBeNull();
  });

  it("always answers AM, PM and unassigned in that order", () => {
    const sections = teeBoardSections({ players: [player("Adela Reyes", "06:40")] }, 0, 2);
    expect(sections.map((item) => item.key)).toEqual(["AM", "PM", "unassigned"]);
  });

  it("drops a blank name rather than printing an empty row", () => {
    const sections = teeBoardSections({ players: [player("   ", "06:40")] }, 0, 2);
    expect(names(sections, "AM")).toEqual([]);
    expect(names(sections, "unassigned")).toEqual([]);
  });
});
