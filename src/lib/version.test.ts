import { describe, expect, it } from "vitest";
import { versionLabel } from "./version";

describe("versionLabel", () => {
  it("shows the version, the commit when there is one, and the build date", () => {
    expect(versionLabel({ version: "0.5.1", commit: "5db2afd", builtOn: "2026-10-18" })).toBe(
      "TeeLine Golf v0.5.1 · 5db2afd · built 2026-10-18",
    );
  });

  it("leaves out a commit a hand deploy does not have", () => {
    expect(versionLabel({ version: "0.5.1", commit: "", builtOn: "2026-10-18" })).toBe(
      "TeeLine Golf v0.5.1 · built 2026-10-18",
    );
  });

  it("says dev rather than nothing when the build did not set a version", () => {
    expect(versionLabel({})).toBe("TeeLine Golf vdev");
  });
});
