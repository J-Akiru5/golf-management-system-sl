import { describe, expect, it } from "vitest";
import { safeRedirectPath } from "./redirect";

describe("safeRedirectPath", () => {
  it("accepts a local path, query, and fragment", () => {
    expect(safeRedirectPath("/players?q=ana#results")).toBe("/players?q=ana#results");
  });

  it.each([
    "https://evil.example",
    "//evil.example",
    "/\\evil.example",
    "javascript:alert(1)",
    null,
  ])("rejects an external or invalid redirect: %s", (value) => {
    expect(safeRedirectPath(value)).toBe("/");
  });
});
