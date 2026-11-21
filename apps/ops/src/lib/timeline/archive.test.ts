import { describe, expect, it } from "vitest";
import {
  ARCHIVE_FUNCTIONS,
  DEFAULT_PUBLIC_SITE,
  demoGithub,
  demoTournaments,
  parseArchiveEvents,
  publicSiteBase,
} from "./archive";

describe("publicSiteBase", () => {
  it("uses the configured site and strips a trailing slash", () => {
    expect(publicSiteBase({ NEXT_PUBLIC_SITE_URL: "https://example.test/" })).toBe(
      "https://example.test",
    );
    expect(publicSiteBase({ NEXT_PUBLIC_SITE_URL: "  https://example.test  " })).toBe(
      "https://example.test",
    );
  });

  it("falls back to the production site rather than a relative link", () => {
    expect(publicSiteBase({})).toBe(DEFAULT_PUBLIC_SITE);
    expect(publicSiteBase({ NEXT_PUBLIC_SITE_URL: "   " })).toBe(DEFAULT_PUBLIC_SITE);
  });
});

describe("parseArchiveEvents", () => {
  it("keeps an announced event with its days, sorted", () => {
    expect(
      parseArchiveEvents([
        {
          tournamentId: "t-1",
          name: "24th Bamboo Tee",
          dates: ["2026-12-13", "2026-12-12"],
          finished: false,
        },
      ]),
    ).toEqual([
      {
        id: "t-1",
        name: "24th Bamboo Tee",
        dates: ["2026-12-12", "2026-12-13"],
        finished: false,
      },
    ]);
  });

  it("drops a row with no id, no name or no readable day", () => {
    expect(parseArchiveEvents([{ name: "No id", dates: ["2026-12-12"] }])).toEqual([]);
    expect(parseArchiveEvents([{ tournamentId: "t", dates: ["2026-12-12"] }])).toEqual([]);
    expect(parseArchiveEvents([{ tournamentId: "t", name: "No day", dates: [] }])).toEqual([]);
    expect(
      parseArchiveEvents([{ tournamentId: "t", name: "Bad day", dates: ["2026-02-31"] }]),
    ).toEqual([]);
  });

  it("only calls an event finished when the flag is exactly true", () => {
    const [row] = parseArchiveEvents([
      { tournamentId: "t", name: "Name", dates: ["2026-12-12"], finished: "yes" },
    ]);
    expect(row?.finished).toBe(false);
  });

  it("answers nothing for a payload that is not a list", () => {
    expect(parseArchiveEvents(null)).toEqual([]);
    expect(parseArchiveEvents({ tournamentId: "t" })).toEqual([]);
  });
});

describe("demo rows", () => {
  it("lists three events around the live-event window", () => {
    expect(demoTournaments()).toHaveLength(3);
    for (const event of demoTournaments()) expect(event.dates.length).toBeGreaterThan(0);
  });

  it("has one milestone and one release", () => {
    expect(demoGithub().milestones).toHaveLength(1);
    expect(demoGithub().releases).toHaveLength(1);
  });
});

describe("the function order", () => {
  it("prefers the archive and falls back to the showcase payload", () => {
    expect(ARCHIVE_FUNCTIONS).toEqual(["public_event_archive", "public_showcase_events"]);
  });
});
