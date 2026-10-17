import { describe, expect, it } from "vitest";
import { type PublishedLike, toPublicPairings } from "./public";

describe("toPublicPairings", () => {
  it("keeps only the allowed fields, however rich the source object is", () => {
    const source = {
      tournamentId: "bamboo-tee-2026",
      at: "2026-10-20T09:00:00+08:00",
      signature: "1:p1,p2",
      groups: [
        {
          number: 1,
          startHole: 1,
          wave: "A",
          time: "06:30",
          flight: "Regular A",
          players: ["Antonio Alcantara", "  Maria Santos  "],
          // Fields a richer object might carry; none may survive the projection.
          birthdate: ["1972-05-04"],
          contact: ["+63 917 000 0000"],
          photoConsent: [true],
          notes: "Organizer only",
        },
      ],
    } as unknown as PublishedLike & Record<string, unknown>;

    const out = toPublicPairings({
      published: source,
      tournamentName: "Bamboo Tee (demo)",
      dateLabel: "November 12, 2026",
      startFormat: "shotgun",
      firstTeeTime: "06:30",
    });

    expect(out.tournamentName).toBe("Bamboo Tee (demo)");
    expect(out.groups).toHaveLength(1);
    const group = out.groups[0] as NonNullable<(typeof out.groups)[number]>;
    expect(Object.keys(group).sort()).toEqual([
      "flight",
      "number",
      "players",
      "startHole",
      "time",
      "wave",
    ]);
    // Names are trimmed; nothing else about a player survives.
    expect(group.players).toEqual(["Antonio Alcantara", "Maria Santos"]);
    expect(JSON.stringify(out)).not.toContain("Organizer only");
    expect(JSON.stringify(out)).not.toContain("1972-05-04");
  });

  it("drops empty names rather than printing blanks", () => {
    const out = toPublicPairings({
      published: {
        groups: [
          {
            number: 2,
            startHole: 10,
            wave: null,
            time: "06:42",
            flight: "Regular B",
            players: ["", "   ", "Ramon Aguilar"],
          },
        ],
      },
      tournamentName: "Sample",
      dateLabel: "Sample",
      startFormat: "two_tee",
      firstTeeTime: "06:30",
    });
    expect(out.groups[0]?.players).toEqual(["Ramon Aguilar"]);
    expect(out.startFormat).toBe("two_tee");
  });
});
