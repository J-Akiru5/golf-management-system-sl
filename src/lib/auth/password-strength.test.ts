import { describe, expect, it } from "vitest";
import { isAcceptablePassword, MIN_PASSWORD_LENGTH, passwordStrength } from "./password-strength";

describe("passwordStrength", () => {
  it("rejects anything under the minimum, however varied", () => {
    expect(passwordStrength("Ab3!xY9").level).toBe("too-short");
    expect(passwordStrength("Ab3!xY9").score).toBe(0);
    expect(passwordStrength("a".repeat(MIN_PASSWORD_LENGTH - 1)).level).toBe("too-short");
  });

  it("accepts exactly the minimum length", () => {
    expect(passwordStrength("a".repeat(MIN_PASSWORD_LENGTH)).level).not.toBe("too-short");
  });

  it("calls a common password weak even when it is long", () => {
    expect(passwordStrength("Password123").level).toBe("weak");
    expect(passwordStrength("password1234").label).toBe("Weak");
    expect(passwordStrength("Golf123456").level).toBe("weak");
  });

  it("sees through punctuation added to a common password", () => {
    expect(passwordStrength("p@ssword123").level).toBe("weak");
  });

  it("penalises a repeated character, which looks long but is not varied", () => {
    expect(passwordStrength("aaaaaaaaaaaaaa").score).toBeLessThan(3);
  });

  it("penalises a run of sequential characters", () => {
    expect(passwordStrength("abcdabcd1234").score).toBeLessThan(3);
  });

  it("rates a long, varied password strong", () => {
    expect(passwordStrength("fairway-dawn-2026!").level).toBe("strong");
    expect(passwordStrength("fairway-dawn-2026!").score).toBe(4);
  });

  it("gives every level some advice, never an empty string", () => {
    for (const candidate of ["short", "aaaaaaaaaa", "Fairway2026", "fairway-dawn-2026!"]) {
      expect(passwordStrength(candidate).advice.length).toBeGreaterThan(10);
    }
  });
});

describe("isAcceptablePassword", () => {
  it("is the same length gate the meter uses", () => {
    expect(isAcceptablePassword("a".repeat(MIN_PASSWORD_LENGTH - 1))).toBe(false);
    expect(isAcceptablePassword("a".repeat(MIN_PASSWORD_LENGTH))).toBe(true);
  });

  it("refuses a common password even at a usable length", () => {
    expect(isAcceptablePassword("password123")).toBe(false);
  });
});
