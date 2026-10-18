import { describe, expect, it } from "vitest";
import { claimCode, claimMessage, claimSucceeded, validateClaimInput } from "./claim";

describe("validateClaimInput", () => {
  it("needs a name or an NGAP number, not necessarily both", () => {
    expect(validateClaimInput({ name: "", ngapId: "" }).ok).toBe(false);
    expect(validateClaimInput({ name: "  ", ngapId: "  " }).ok).toBe(false);
    expect(validateClaimInput({ name: "Ana Reyes", ngapId: "" }).ok).toBe(true);
    expect(validateClaimInput({ name: "", ngapId: "10023" }).ok).toBe(true);
  });

  it("refuses values longer than a club record holds", () => {
    expect(validateClaimInput({ name: "a".repeat(121), ngapId: "" }).ok).toBe(false);
    expect(validateClaimInput({ name: "", ngapId: "1".repeat(41) }).ok).toBe(false);
    expect(validateClaimInput({ name: "a".repeat(120), ngapId: "" }).ok).toBe(true);
  });
});

describe("claim results", () => {
  it("reads the code and the ok flag out of the jsonb", () => {
    expect(claimCode({ ok: true, code: "linked" })).toBe("linked");
    expect(claimCode({ message: "no code" })).toBe("unknown");
    expect(claimCode(null)).toBe("unknown");
    expect(claimSucceeded({ ok: true, code: "linked" })).toBe(true);
    expect(claimSucceeded({ ok: false, code: "taken" })).toBe(false);
    expect(claimSucceeded(null)).toBe(false);
  });

  it("has club wording for every code the database can return", () => {
    for (const code of [
      "invalid",
      "ambiguous",
      "no_match",
      "taken",
      "signed_out",
      "already_linked",
    ]) {
      expect(claimMessage(code)).toBeTruthy();
    }
  });

  it("says nothing for a code it does not know, rather than inventing a reason", () => {
    expect(claimMessage("something_new")).toBeNull();
    expect(claimMessage("")).toBeNull();
  });
});
