import { describe, expect, it } from "vitest";
import { decideAccess } from "./access";

describe("decideAccess", () => {
  it("is not_found when the feature flag is off, whatever else is true", () => {
    expect(decideAccess({ enabled: false, signedIn: false, member: null })).toBe("not_found");
    expect(decideAccess({ enabled: false, signedIn: true, member: "active" })).toBe("not_found");
  });

  it("asks a signed-out visitor to sign in", () => {
    expect(decideAccess({ enabled: true, signedIn: false, member: null })).toBe("login");
  });

  it("refuses a signed-in account with no workspace_members row", () => {
    expect(decideAccess({ enabled: true, signedIn: true, member: null })).toBe("no_access");
  });

  it("refuses a suspended member", () => {
    expect(decideAccess({ enabled: true, signedIn: true, member: "suspended" })).toBe("no_access");
  });

  it("allows an active member", () => {
    expect(decideAccess({ enabled: true, signedIn: true, member: "active" })).toBe("allow");
  });
});
