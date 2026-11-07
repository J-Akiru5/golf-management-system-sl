import { describe, expect, it } from "vitest";
import { summariseIssues } from "./issue-causes";
import type { Issue } from "./validate";

const warn = (id: string, message: string, group?: number): Issue => ({
  id,
  severity: "warning",
  message,
  group,
});

describe("summariseIssues", () => {
  it("folds one line per player into a single re-freeze cause", () => {
    const issues = Array.from({ length: 281 }, (_, i) =>
      warn(`flag-${i}`, `P${i}: Records now select the 9 index. Re-freeze before the draw.`),
    );
    const causes = summariseIssues(issues);
    expect(causes).toHaveLength(1);
    expect(causes[0]).toMatchObject({ kind: "refreeze", count: 281, action: "refreeze" });
    expect(causes[0]?.title).toBe("281 players need their handicap index frozen");
  });

  it("names the flight mismatch and offers a redraw", () => {
    const issues = [1, 2, 3].map((n) =>
      warn(`flight-${n}`, `Group ${n} (Class A) has 1 player from another flight.`, n),
    );
    const [cause] = summariseIssues(issues);
    expect(cause).toMatchObject({ kind: "flights", count: 3, action: "redraw" });
    expect(cause?.title).toBe("3 groups no longer match the players' classes");
  });

  it("orders the biggest cause first and keeps singular wording", () => {
    const issues = [
      warn("flight-1", "x", 1),
      ...Array.from({ length: 5 }, (_, i) => warn(`flag-${i}`, "Re-freeze before the draw.")),
      warn("small-4", "Group 4 has only 1 player.", 4),
    ];
    const causes = summariseIssues(issues);
    expect(causes.map((c) => c.kind)).toEqual(["refreeze", "flights", "small"]);
    expect(causes[1]?.title).toBe("1 group no longer match the players' classes");
  });

  it("never folds a blocking issue, and leaves unknown warnings out of the causes", () => {
    const issues: Issue[] = [
      { id: "dup-1", severity: "blocking", message: "In two groups." },
      { id: "flight-9", severity: "blocking", message: "blocking flight" },
      warn("engine-0", "Something from the engine"),
    ];
    expect(summariseIssues(issues)).toEqual([]);
  });

  it("a flag that is not about freezing stays out of the re-freeze cause", () => {
    const issues = [warn("flag-1", "The frozen index dates from 2025-01-01. Import a fresh file.")];
    expect(summariseIssues(issues)).toEqual([]);
  });
});
