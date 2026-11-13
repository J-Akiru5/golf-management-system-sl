import { afterEach, describe, expect, it, vi } from "vitest";
import { canAdministerScorecard, canUseScorecard, TABULATION_ROLE } from "./access";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("canUseScorecard", () => {
  it("accepts the tabulation role from the user's app metadata", () => {
    expect(
      canUseScorecard({
        email: "anyone@example.com",
        appMetadata: { scorecard_role: TABULATION_ROLE },
      }),
    ).toBe(true);
  });

  it("accepts an email on the explicit allowlist", () => {
    vi.stubEnv("SCORECARD_TABULATION_EMAILS", "one@example.com, Two@Example.com");
    expect(canUseScorecard({ email: "two@example.com" })).toBe(true);
  });

  it("refuses a staff account that is not on the tabulation list", () => {
    vi.stubEnv("SCORECARD_TABULATION_EMAILS", "");
    expect(canUseScorecard({ email: "desk@example.com", appMetadata: { role: "desk" } })).toBe(
      false,
    );
  });

  it("refuses an account with no email and no role", () => {
    expect(canUseScorecard({})).toBe(false);
  });
});

describe("canAdministerScorecard", () => {
  it("lets the owner and organizer review the handoff", () => {
    expect(canAdministerScorecard("owner")).toBe(true);
    expect(canAdministerScorecard("organizer")).toBe(true);
  });

  it("keeps desk volunteers out of the tabulation handoff", () => {
    expect(canAdministerScorecard("desk")).toBe(false);
    expect(canAdministerScorecard("player")).toBe(false);
  });
});
