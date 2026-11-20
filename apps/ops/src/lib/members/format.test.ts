import { describe, expect, it } from "vitest";
import { formatJoined, roleLabel, roleSummary, statusLabel } from "./format";

describe("formatJoined", () => {
  it("formats a date in one stable, readable form", () => {
    expect(formatJoined("2026-10-05T08:00:00.000Z")).toBe("5 Oct 2026");
  });

  it("does not shift the day for a late UTC timestamp", () => {
    expect(formatJoined("2026-10-05T23:30:00.000Z")).toBe("5 Oct 2026");
  });

  it("says Unknown for a value it cannot read", () => {
    expect(formatJoined("not a date")).toBe("Unknown");
    expect(formatJoined("")).toBe("Unknown");
  });
});

describe("role labels", () => {
  it("uses the labels and summaries from WORKSPACE_ROLES", () => {
    expect(roleLabel("owner")).toBe("Owner");
    expect(roleLabel("partner")).toBe("Partner");
    expect(roleLabel("member")).toBe("Member");
    expect(roleSummary("owner")).toBe("Everything, including members and roles.");
  });
});

describe("statusLabel", () => {
  it("says the status in plain words", () => {
    expect(statusLabel("active")).toBe("Active");
    expect(statusLabel("suspended")).toBe("Suspended");
  });
});
