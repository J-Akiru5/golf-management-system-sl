import { describe, expect, it } from "vitest";
import { signWebhookBody, verifyWebhookSignature } from "./signature";

const SECRET = "a-webhook-secret-for-the-test";
const BODY = JSON.stringify({ action: "opened", issue: { number: 350 } });

describe("the webhook signature", () => {
  it("accepts GitHub's own signature of the body", () => {
    expect(verifyWebhookSignature(SECRET, BODY, signWebhookBody(SECRET, BODY))).toBe(true);
  });

  it("accepts the hex in either case", () => {
    const header = signWebhookBody(SECRET, BODY);
    expect(verifyWebhookSignature(SECRET, BODY, `sha256=${header.slice(7).toUpperCase()}`)).toBe(
      true,
    );
  });

  it("refuses a body that changed after signing", () => {
    const header = signWebhookBody(SECRET, BODY);
    expect(verifyWebhookSignature(SECRET, `${BODY} `, header)).toBe(false);
    expect(verifyWebhookSignature(SECRET, "", header)).toBe(false);
  });

  it("refuses a signature made with another secret", () => {
    expect(verifyWebhookSignature(SECRET, BODY, signWebhookBody("another-secret", BODY))).toBe(
      false,
    );
  });

  it("refuses a missing or empty secret", () => {
    const header = signWebhookBody(SECRET, BODY);
    expect(verifyWebhookSignature(null, BODY, header)).toBe(false);
    expect(verifyWebhookSignature(undefined, BODY, header)).toBe(false);
    expect(verifyWebhookSignature("   ", BODY, header)).toBe(false);
  });

  it("refuses a missing, prefixed or malformed header", () => {
    const header = signWebhookBody(SECRET, BODY);
    expect(verifyWebhookSignature(SECRET, BODY, null)).toBe(false);
    expect(verifyWebhookSignature(SECRET, BODY, "")).toBe(false);
    expect(verifyWebhookSignature(SECRET, BODY, header.slice(7))).toBe(false);
    expect(verifyWebhookSignature(SECRET, BODY, `sha1=${header.slice(7)}`)).toBe(false);
    expect(verifyWebhookSignature(SECRET, BODY, "sha256=not-hex")).toBe(false);
    expect(verifyWebhookSignature(SECRET, BODY, `sha256=${header.slice(7, 40)}`)).toBe(false);
  });
});
