import { describe, expect, it } from "vitest";
import { signInErrorCode } from "./sign-in-error";

describe("signInErrorCode", () => {
  it("tells an unconfirmed account from a wrong password", () => {
    expect(signInErrorCode("Email not confirmed")).toBe("email_not_confirmed");
    expect(signInErrorCode("Invalid login credentials")).toBe("invalid_credentials");
  });

  it("names rate limiting and disabled sign-ups", () => {
    expect(
      signInErrorCode("For security purposes, you can only request this after 60 seconds"),
    ).toBe("rate_limited");
    expect(signInErrorCode("Signups not allowed for this instance")).toBe("sign_in_disabled");
  });

  it("falls back to a neutral failure", () => {
    expect(signInErrorCode("Something unexpected happened")).toBe("sign_in_failed");
  });
});
