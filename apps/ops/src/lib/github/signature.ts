import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * The GitHub webhook signature check.
 *
 * GitHub signs the raw request body with the webhook secret and sends
 * `X-Hub-Signature-256: sha256=<hex>`. The check is constant-time: a comparison that returns early
 * on the first different byte leaks how much of a guess was right.
 *
 * A missing secret, a missing header, a header without the `sha256=` prefix or a value that is not
 * 64 hex characters is a refusal, not an exception. The caller answers 401 and says nothing else.
 */

const PREFIX = "sha256=";
const HEX_64 = /^[0-9a-f]{64}$/;

/** The header value for a body, so a test and a script can sign exactly as GitHub does. */
export function signWebhookBody(secret: string, body: string): string {
  return `${PREFIX}${createHmac("sha256", secret).update(body, "utf8").digest("hex")}`;
}

/**
 * True only when `header` is GitHub's signature of `body` under `secret`. Every other case,
 * including a secret that is empty or absent, is false.
 */
export function verifyWebhookSignature(
  secret: string | null | undefined,
  body: string,
  header: string | null | undefined,
): boolean {
  const key = (secret ?? "").trim();
  if (key === "") return false;
  if (typeof header !== "string") return false;

  const value = header.trim().toLowerCase();
  if (!value.startsWith(PREFIX)) return false;

  const given = value.slice(PREFIX.length);
  if (!HEX_64.test(given)) return false;

  const expected = createHmac("sha256", key).update(body, "utf8").digest();
  const received = Buffer.from(given, "hex");
  if (received.length !== expected.length) return false;

  return timingSafeEqual(received, expected);
}
