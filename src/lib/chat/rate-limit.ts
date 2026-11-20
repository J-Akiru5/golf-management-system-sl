/**
 * The concern chat's rate limits, backed by `public.chat_rate_check` (migration 20261122000100).
 *
 * The key is pseudonymous, like the feedback form's: a SHA-256 digest of the connection address (or
 * of the conversation id) under a fixed application prefix, truncated to 32 hex characters. It is
 * not the address itself and cannot be read back as one, but it is also not a cryptographic
 * commitment, so it is treated as the smallest thing that can group requests and no more. No raw
 * address and no user agent is stored.
 *
 * The limits are chosen for a player on a phone: 30 turns in ten minutes from one connection, 20 in
 * one conversation, and 5 filed notes in ten minutes. The database function counts and records in
 * one guarded call, so two simultaneous requests cannot both slip in as the last allowed one.
 *
 * A database that is unreachable or lacks the migration does not block the chat. That is deliberate:
 * the chat is a convenience, the model cost per turn is bounded by the turn cap in code, and the
 * note itself is still protected by `submit_feedback`'s own bucket. The decision is reported as
 * `degraded` so a route can log it instead of pretending the check happened.
 */

export interface ChatRatePolicy {
  limit: number;
  windowSeconds: number;
}

export const CHAT_IP_POLICY: ChatRatePolicy = { limit: 30, windowSeconds: 600 };
export const CHAT_CONVERSATION_POLICY: ChatRatePolicy = { limit: 20, windowSeconds: 3600 };
export const CHAT_SUBMIT_POLICY: ChatRatePolicy = { limit: 5, windowSeconds: 600 };

const KEY_PREFIX = "teeline-chat";
const CONVERSATION_PATTERN = /^[A-Za-z0-9-]{8,64}$/;

/** The client address as the platform reports it, or null when it reports none. */
export function clientAddressFromHeaders(headers: Headers): string | null {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (forwarded) return forwarded.slice(0, 64);
  const real = headers.get("x-real-ip")?.trim();
  return real ? real.slice(0, 64) : null;
}

/**
 * A conversation id is the panel's own uuid-shaped token. Anything else is refused rather than
 * hashed, so a browser cannot pick a key that collides with another player's.
 */
export function normaliseConversationId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const id = value.trim();
  return CONVERSATION_PATTERN.test(id) ? id : null;
}

/** `${kind}:` plus 32 hex characters. Never reversible to the address on its own. */
export async function chatRateKey(kind: "ip" | "conversation", value: string): Promise<string> {
  const data = new TextEncoder().encode(`${KEY_PREFIX}|${kind}|${value}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  const hex = Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  return `${kind}:${hex.slice(0, 32)}`;
}

/** The one function this module calls. Narrow on purpose: it is not in the generated types yet. */
export interface ChatRateRpcClient {
  rpc(
    fn: "chat_rate_check",
    args: { p_key: string; p_limit: number; p_window_seconds: number },
  ): Promise<{ data: unknown; error: { code?: string; message?: string } | null }>;
}

export interface ChatRateDecision {
  allowed: boolean;
  /** True when the check could not run; the caller logs it and continues. */
  degraded: boolean;
}

export async function checkChatRateLimit(
  client: ChatRateRpcClient | null,
  key: string,
  policy: ChatRatePolicy,
): Promise<ChatRateDecision> {
  if (!client) return { allowed: true, degraded: true };

  try {
    const { data, error } = await client.rpc("chat_rate_check", {
      p_key: key,
      p_limit: policy.limit,
      p_window_seconds: policy.windowSeconds,
    });

    if (error) {
      console.warn(
        `[chat] the rate check could not run: ${error.message ?? error.code ?? "error"}`,
      );
      return { allowed: true, degraded: true };
    }

    if (typeof data === "boolean") return { allowed: data, degraded: false };

    console.warn("[chat] the rate check answered with an unexpected value");
    return { allowed: true, degraded: true };
  } catch (error) {
    console.warn("[chat] the rate check threw", error);
    return { allowed: true, degraded: true };
  }
}
