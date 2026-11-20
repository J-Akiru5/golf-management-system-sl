import { describe, expect, it } from "vitest";
import { parseDemoViewer } from "./viewer";

describe("parseDemoViewer", () => {
  it("accepts the three roles", () => {
    expect(parseDemoViewer("owner")).toBe("owner");
    expect(parseDemoViewer("partner")).toBe("partner");
    expect(parseDemoViewer("member")).toBe("member");
  });

  it("takes the first value when the parameter repeats", () => {
    expect(parseDemoViewer(["member", "owner"])).toBe("member");
  });

  it("falls back to the owner for a missing or unknown value", () => {
    expect(parseDemoViewer(undefined)).toBe("owner");
    expect(parseDemoViewer("")).toBe("owner");
    expect(parseDemoViewer("admin")).toBe("owner");
    expect(parseDemoViewer([])).toBe("owner");
  });
});
