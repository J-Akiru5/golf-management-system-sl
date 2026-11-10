import { describe, expect, it } from "vitest";
import { mailChannelConfigured } from "./config";

describe("mailChannelConfigured", () => {
  it("requires both the provider key and the from address", () => {
    expect(mailChannelConfigured({ RESEND_API_KEY: "key", EMAIL_FROM: "club@example.test" })).toBe(
      true,
    );
    expect(mailChannelConfigured({ RESEND_API_KEY: "key" })).toBe(false);
    expect(mailChannelConfigured({ EMAIL_FROM: "club@example.test" })).toBe(false);
    expect(mailChannelConfigured({})).toBe(false);
  });

  it("does not treat whitespace as configuration", () => {
    expect(mailChannelConfigured({ RESEND_API_KEY: "   ", EMAIL_FROM: "club@example.test" })).toBe(
      false,
    );
    expect(mailChannelConfigured({ RESEND_API_KEY: "key", EMAIL_FROM: "  " })).toBe(false);
  });
});
