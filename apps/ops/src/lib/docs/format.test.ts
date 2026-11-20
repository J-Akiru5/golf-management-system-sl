import { describe, expect, it } from "vitest";
import { formatWhen, versionNameFor } from "./format";

describe("formatWhen", () => {
  it("formats a moment in the team's time zone", () => {
    expect(formatWhen("2026-11-20T06:32:00.000Z")).toBe("20 Nov 2026, 14:32");
    expect(formatWhen("2026-01-02T23:59:00.000Z")).toBe("03 Jan 2026, 07:59");
  });

  it("says unknown rather than making a date up", () => {
    expect(formatWhen("not a date")).toBe("Unknown time");
    expect(formatWhen("")).toBe("Unknown time");
  });
});

describe("versionNameFor", () => {
  it("starts the name with the moment", () => {
    expect(versionNameFor(new Date("2026-11-20T06:32:00.000Z"))).toBe(
      "Version, 20 Nov 2026, 14:32",
    );
  });
});
