import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  describeFieldSchedule,
  fieldIssues,
  parseFieldSheet,
  parseSchedule,
  parseWaitingList,
  summariseField,
} from "./bamboo-tee-field";

const SEED = join(process.cwd(), "supabase", "seed");

const field = parseFieldSheet(readFileSync(join(SEED, "bamboo-tee-2026-field.psv"), "utf8"));
const waiting = parseWaitingList(
  readFileSync(join(SEED, "bamboo-tee-2026-waiting-list.psv"), "utf8"),
);
const issues = fieldIssues(field);
const summary = summariseField(field, issues);
const pair = (number: number) => {
  const found = field.find((entry) => entry.number === number);
  if (!found) throw new Error(`Pair ${number} is not in the sheet.`);
  return found;
};

describe("parseSchedule", () => {
  it("reads a day and its session", () => {
    expect(parseSchedule("DAY 3 AM & DAY 4 AM")).toEqual({
      schedule: [
        { day: 3, session: "AM" },
        { day: 4, session: "AM" },
      ],
      note: null,
    });
  });

  it("accepts the sheet's missing spaces around the ampersand", () => {
    expect(parseSchedule("DAY 1 PM &DAY 3 PM").schedule).toEqual([
      { day: 1, session: "PM" },
      { day: 3, session: "PM" },
    ]);
  });

  it("keeps a day that has no session but says so", () => {
    const parsed = parseSchedule("DAY 1 AM & DAY 2");
    expect(parsed.schedule).toEqual([{ day: 1, session: "AM" }]);
    expect(parsed.note).toContain("without AM or PM");
  });

  it("returns nothing for an empty cell without inventing a day", () => {
    expect(parseSchedule("")).toEqual({ schedule: [], note: null });
  });

  it("does not repeat a day and session named twice", () => {
    expect(parseSchedule("DAY 2 PM & DAY 2 PM").schedule).toEqual([{ day: 2, session: "PM" }]);
  });
});

describe("the club's field sheet", () => {
  it("has 144 numbered pairs", () => {
    expect(summary.pairs).toBe(144);
    expect(field.map((entry) => entry.number)).toEqual(
      Array.from({ length: 144 }, (_, index) => index + 1),
    );
    expect(summary.players).toBe(288);
  });

  it("keeps every name from the sheet", () => {
    expect(pair(1).member.name).toBe("ADORIO, RONNEL");
    expect(pair(1).guest.name).toBe("SULPICO, RANDY");
    expect(pair(144).member.name).toBe("CAMBAY, JESUS");
  });

  it("keeps the index as printed, including one decimal", () => {
    expect(pair(1).member.index).toBe(1.8);
    expect(pair(12).guest.index).toBe(30);
    expect(pair(70).member.index).toBe(30.5);
  });

  it("leaves a blank index blank instead of reading it as zero", () => {
    expect(pair(5).guest.index).toBeNull();
    expect(pair(144).member.index).toBeNull();
  });

  it("reads each partner's own schedule", () => {
    expect(describeFieldSchedule(pair(2).member)).toBe("Day 2 PM, Day 4 PM");
    expect(describeFieldSchedule(pair(2).guest)).toBe("Day 3 AM, Day 4 PM");
  });
});

describe("what the desk has to decide", () => {
  it("names the pair whose partners are on different schedules", () => {
    const mismatch = issues.filter((issue) => issue.kind === "mismatched_schedule");
    expect(mismatch.map((issue) => issue.pair)).toContain(2);
    expect(mismatch.map((issue) => issue.pair)).toContain(58);
    expect(mismatch.map((issue) => issue.pair)).not.toContain(1);
  });

  it("flags the number that cannot be a handicap index", () => {
    const unreadable = issues.filter((issue) => issue.kind === "index_unreadable");
    expect(unreadable).toHaveLength(1);
    expect(unreadable[0]?.pair).toBe(104);
    expect(unreadable[0]?.message).toContain("203");
  });

  it("does not treat 30.5 as a data problem: the event limit decides that", () => {
    expect(issues.filter((issue) => issue.pair === 70)).toEqual([]);
  });

  it("flags the day that has no session", () => {
    const incomplete = issues.filter((issue) => issue.kind === "incomplete_schedule");
    expect(incomplete.map((issue) => issue.pair)).toContain(93);
  });

  it("flags the pair with no schedule at all", () => {
    expect(
      issues
        .filter((issue) => issue.kind === "no_schedule")
        .map((issue) => `${issue.pair}:${issue.player}`),
    ).toEqual(expect.arrayContaining(["139:member", "139:guest", "142:guest"]));
  });

  it("flags the player who is on one day only", () => {
    expect(
      issues.filter((issue) => issue.kind === "single_day").map((issue) => issue.pair),
    ).toContain(59);
  });

  it("counts every issue without fixing any of them", () => {
    expect(summary.missingIndex).toBeGreaterThan(0);
    expect(
      summary.mismatched +
        summary.missingIndex +
        summary.noSchedule +
        summary.incomplete +
        summary.singleDay +
        summary.unreadableIndex,
    ).toBe(issues.length);
  });
});

describe("the waiting list", () => {
  it("keeps the players who have no partner yet", () => {
    expect(waiting).toHaveLength(17);
    expect(waiting.map((entry) => entry.name)).toContain("ALAS-AS, FRED");
    expect(waiting.map((entry) => entry.name)).toContain("DAANOY, NORMAN");
  });

  it("keeps a PAID marker and the schedule some of them gave", () => {
    const paid = waiting.filter((entry) => entry.paid);
    expect(paid.map((entry) => entry.name)).toEqual([
      "DIAZ, JAN JASON",
      "DIVINAGRACIA, ANN",
      "LIM, ADOY",
      "SEO, EUN JIN",
    ]);
    expect(waiting.find((entry) => entry.name === "MIN, HYANG GEE")?.schedule).toEqual([
      { day: 1, session: "PM" },
      { day: 3, session: "PM" },
    ]);
  });
});
