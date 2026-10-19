import { describe, expect, it } from "vitest";
import { toPublicEvent } from "./public-events";

// The payload comes from `public_open_events()`. These pin the field names so a change on one side
// cannot quietly blank the landing page.

const good = {
  tournamentId: "t1",
  name: "24th Bamboo Tee",
  dates: ["2026-11-12", "2026-11-13"],
  startFormat: "shotgun",
  firstTeeTime: "06:30",
  cutOffDate: "2026-11-01",
  entered: 87,
};

describe("toPublicEvent", () => {
  it("keeps a good row", () => {
    expect(toPublicEvent(good)).toEqual(good);
  });

  it("drops a row with no id, because there is nowhere to send anyone", () => {
    expect(toPublicEvent({ ...good, tournamentId: "" })).toBeNull();
    expect(toPublicEvent({ ...good, tournamentId: undefined })).toBeNull();
  });

  it("drops a row with no name, because there is nothing to show", () => {
    expect(toPublicEvent({ ...good, name: "" })).toBeNull();
  });

  it("drops anything that is not an object", () => {
    expect(toPublicEvent(null)).toBeNull();
    expect(toPublicEvent("a string")).toBeNull();
    expect(toPublicEvent(42)).toBeNull();
  });

  it("keeps the event when a lesser field is missing, rather than hiding it", () => {
    const bare = { tournamentId: "t1", name: "Monthly Medal" };
    expect(toPublicEvent(bare)).toEqual({
      tournamentId: "t1",
      name: "Monthly Medal",
      dates: [],
      startFormat: "",
      firstTeeTime: "",
      cutOffDate: "",
      entered: 0,
    });
  });

  it("never lets a negative or fractional entry count reach the page", () => {
    expect(toPublicEvent({ ...good, entered: -5 })?.entered).toBe(0);
    expect(toPublicEvent({ ...good, entered: 12.7 })?.entered).toBe(12);
    expect(toPublicEvent({ ...good, entered: "19" })?.entered).toBe(19);
    expect(toPublicEvent({ ...good, entered: "many" })?.entered).toBe(0);
  });

  it("filters a dates list down to strings", () => {
    expect(toPublicEvent({ ...good, dates: ["2026-11-12", null, 7, "2026-11-13"] })?.dates).toEqual(
      ["2026-11-12", "2026-11-13"],
    );
    expect(toPublicEvent({ ...good, dates: "2026-11-12" })?.dates).toEqual([]);
  });

  it("does not carry anything the database should not have sent", () => {
    const withExtras = {
      ...good,
      instructions: "call Jun",
      responseEmail: "a@b.c",
      players: ["x"],
    };
    expect(Object.keys(toPublicEvent(withExtras) ?? {}).sort()).toEqual([
      "cutOffDate",
      "dates",
      "entered",
      "firstTeeTime",
      "name",
      "startFormat",
      "tournamentId",
    ]);
  });
});
