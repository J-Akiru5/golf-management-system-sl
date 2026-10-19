import { describe, expect, it } from "vitest";
import { passwordProblem } from "./password";

describe("password reset rules", () => {
  it("asks for at least eight characters", () => {
    expect(passwordProblem("short", "short")).toBe("password_short");
  });

  it("asks for a matching confirmation", () => {
    expect(passwordProblem("long-enough", "different")).toBe("password_mismatch");
  });

  it("accepts a matching password of eight or more characters", () => {
    expect(passwordProblem("long-enough", "long-enough")).toBeNull();
  });
});
