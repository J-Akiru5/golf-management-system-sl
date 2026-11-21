import { describe, expect, it } from "vitest";
import { isGithubLogin, normaliseLogin } from "./rules";

describe("a GitHub login", () => {
  it("is stored lower case so matching is case-insensitive", () => {
    expect(normaliseLogin("Karlcalimotan")).toBe("karlcalimotan");
    expect(normaliseLogin("  dev-lou ")).toBe("dev-lou");
  });

  it("may hold letters, digits and inner hyphens", () => {
    expect(normaliseLogin("a")).toBe("a");
    expect(normaliseLogin("j-akiru5")).toBe("j-akiru5");
    expect(normaliseLogin("a".repeat(39))).toBe("a".repeat(39));
  });

  it("refuses a leading or trailing hyphen, an underscore, a space and an over-long value", () => {
    expect(normaliseLogin("-start")).toBeNull();
    expect(normaliseLogin("end-")).toBeNull();
    expect(normaliseLogin("with_underscore")).toBeNull();
    expect(normaliseLogin("two words")).toBeNull();
    expect(normaliseLogin("a".repeat(40))).toBeNull();
    expect(normaliseLogin("")).toBeNull();
  });

  it("answers the yes or no question the same way", () => {
    expect(isGithubLogin("dev-lou")).toBe(true);
    expect(isGithubLogin("not a login")).toBe(false);
  });
});
