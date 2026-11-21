import { describe, expect, it } from "vitest";
import {
  parseDeskAssignments,
  parsePreviousAccess,
  previousAccessIsEmpty,
  previousAccessLines,
} from "./snapshot";

describe("parsePreviousAccess", () => {
  it("reads the shape the suspend function records", () => {
    expect(
      parsePreviousAccess({
        workspace: { role: "partner", status: "suspended" },
        desk: [
          { clubId: "c1", clubName: "IGCC", role: "desk" },
          { clubId: "c2", clubName: "MDM", role: "organizer" },
        ],
        tabulator: true,
      }),
    ).toEqual({
      workspace: { role: "partner", status: "suspended" },
      desk: [
        { clubId: "c1", clubName: "IGCC", role: "desk" },
        { clubId: "c2", clubName: "MDM", role: "organizer" },
      ],
      tabulator: true,
    });
  });

  it("treats a missing or malformed snapshot as nothing recorded", () => {
    const empty = { workspace: null, desk: [], tabulator: false };
    expect(parsePreviousAccess(null)).toEqual(empty);
    expect(parsePreviousAccess("not json")).toEqual(empty);
    expect(parsePreviousAccess({ workspace: "owner", desk: "IGCC", tabulator: "yes" })).toEqual(
      empty,
    );
  });

  it("keeps only desk entries that make sense", () => {
    expect(
      parseDeskAssignments([
        { clubId: "c1", clubName: "IGCC", role: "desk" },
        { clubId: "", clubName: "Broken", role: "desk" },
        { clubId: "c2", clubName: "No role", role: "superuser" },
        "nonsense",
      ]),
    ).toEqual([{ clubId: "c1", clubName: "IGCC", role: "desk" }]);
  });
});

describe("previousAccessLines", () => {
  it("says plainly what a restore will put back", () => {
    expect(
      previousAccessLines({
        workspace: { role: "owner", status: "active" },
        desk: [{ clubId: "c1", clubName: "IGCC", role: "desk" }],
        tabulator: true,
      }),
    ).toEqual(["Workspace: owner (active)", "Desk: IGCC desk", "Tabulator: yes"]);
  });

  it("says none where nothing was held", () => {
    expect(previousAccessLines({ workspace: null, desk: [], tabulator: false })).toEqual([
      "Workspace: no access",
      "Desk: no access",
      "Tabulator: no",
    ]);
    expect(previousAccessIsEmpty({ workspace: null, desk: [], tabulator: false })).toBe(true);
  });
});
