import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { PublicResultRow } from "@/lib/data/public-results";
import { ResultTable } from "./LeaderboardResults";

const rows: PublicResultRow[] = [
  {
    playerId: "p1",
    playerName: "Ana Santos",
    flightName: "A",
    points: 36,
    strokes: 72,
    holesCounted: 18,
    holesTotal: 18,
    photoPath: null,
  },
  {
    playerId: "p2",
    playerName: "Ben Cruz",
    flightName: "B",
    points: 31,
    strokes: null,
    holesCounted: 14,
    holesTotal: 18,
    photoPath: null,
  },
];

const render = (title: string, list: PublicResultRow[]) =>
  renderToStaticMarkup(createElement(ResultTable, { title, rows: list }));

describe("the published leaderboard", () => {
  it("renders a phone card list and the wide table from the same rows", () => {
    const html = render("Gross leaderboard", rows);
    expect(html).toContain("Ana Santos");
    expect(html).toContain("Ben Cruz");
    expect(html).toContain("36");
    expect(html).toContain("sm:hidden");
    expect(html).toContain("<table");
    expect(html).toContain("18/18 holes");
  });

  it("shows the empty state instead of an empty table", () => {
    const html = render("Net leaderboard", []);
    expect(html).toContain("No published net leaderboard results yet.");
    expect(html).not.toContain("<table");
  });
});
