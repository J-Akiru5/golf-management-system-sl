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
 * A daily ceiling bounds what the whole site can spend on model calls: 500 provider calls a day
 * unless `CHAT_DAILY_CAP` says otherwise. It is counted in the same bucket table as the other
 * limits, under one global key.
 *
 * Failure policy. With no provider configured a check that cannot run costs nothing, so the turn is
 * allowed and the decision is reported as `degraded` so the route can log it. With a provider
 * configured the turn is refused instead: an unreachable or not-yet-applied bucket must not become
 * an open tap on the provider bill.
 */

export interface ChatRatePolicy {
  limit: number;
  windowSeconds: number;
}

export const CHAT_IP_POLICY: ChatRatePolicy = { limit: 30, windowSeconds: 600 };
export const CHAT_CONVERSATION_POLICY: ChatRatePolicy = { limit: 20, windowSeconds: 3600 };
export const CHAT_SUBMIT_POLICY: ChatRatePolicy = { limit: 5, windowSeconds: 600 };

/** The daily ceiling on provider calls when `CHAT_DAILY_CAP` is unset or unusable. */
export const CHAT_DAILY_CAP_DEFAULT = 500;
/** `chat_rate_check` refuses a window longer than a day and a limit above this. */
export const CHAT_DAILY_CAP_MAX = 1000;
export const CHAT_DAILY_WINDOW_SECONDS = 86_400;
/** One global bucket: this is a site-wide budget, not a per-visitor limit. */
export const CHAT_DAILY_KEY = "daily:provider-calls";

const KEY_PREFIX = "teeline-chat";
const CONVERSATION_PATTERN = /^[A-Za-z0-9-]{8,64}$/;

/**
 * The daily provider budget from the environment. A missing, blank, non-numeric or non-positive
 * value falls back to the default rather than switching the ceiling off. A value above the
 * database function's own bound is clamped to it, so a typo cannot turn the check into a refusal.
 */
export function chatDailyCap(env: Record<string, string | undefined> = process.env): number {
  const raw = env.CHAT_DAILY_CAP;
  const parsed = typeof raw === "string" ? Number(raw.trim()) : Number.NaN;
  if (!Number.isFinite(parsed)) return CHAT_DAILY_CAP_DEFAULT;
  const cap = Math.trunc(parsed);
  if (cap < 1) return CHAT_DAILY_CAP_DEFAULT;
  return Math.min(cap, CHAT_DAILY_CAP_MAX);
}

/** The policy the daily bucket is checked with: one call a day per configured budget. */
export function chatDailyPolicy(cap: number = chatDailyCap()): ChatRatePolicy {
  const limit =
    Number.isFinite(cap) && cap >= 1
      ? Math.min(Math.trunc(cap), CHAT_DAILY_CAP_MAX)
      : CHAT_DAILY_CAP_DEFAULT;
  return { limit, windowSeconds: CHAT_DAILY_WINDOW_SECONDS };
}

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
  /** True when the check could not run. The route logs it and applies the failure policy. */
  degraded: boolean;
}

export interface ChatRateOptions {
  /**
   * True when a turn could spend money at a provider. A check that cannot run then refuses the
   * turn. False when no provider is configured, where allowing the turn spends nothing.
   */
  failClosed?: boolean;
}

function checkUnavailable(options?: ChatRateOptions): ChatRateDecision {
  return { allowed: options?.failClosed !== true, degraded: true };
}

export async function checkChatRateLimit(
  client: ChatRateRpcClient | null,
  key: string,
  policy: ChatRatePolicy,
  options?: ChatRateOptions,
): Promise<ChatRateDecision> {
  if (!client) return checkUnavailable(options);

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
      return checkUnavailable(options);
    }

    if (typeof data === "boolean") return { allowed: data, degraded: false };

    console.warn("[chat] the rate check answered with an unexpected value");
    return checkUnavailable(options);
  } catch (error) {
    console.warn("[chat] the rate check threw", error);
    return checkUnavailable(options);
  }
}

export interface ChatTurnGateInput {
  address: string | null;
  conversationId: string | null;
  /** True when at least one provider is configured, so an allowed turn can spend money. */
  providerConfigured: boolean;
}

/**
 * The result of the turn's buckets. `reason` is `rate_limited` when a bucket is full,
 * `unavailable` when the bucket could not be read and the provider rule refuses the turn.
 */
export type ChatTurnGate =
  | { allowed: true; degraded: boolean }
  | { allowed: false; degraded: boolean; reason: "rate_limited" | "unavailable" };

/** Both per-turn buckets, in the order they are charged: connection, then conversation. */
export async function checkChatTurn(
  client: ChatRateRpcClient | null,
  input: ChatTurnGateInput,
): Promise<ChatTurnGate> {
  const failClosed = input.providerConfigured;

  const ipCheck = await checkChatRateLimit(
    client,
    await chatRateKey("ip", input.address ?? "no-address"),
    CHAT_IP_POLICY,
    { failClosed },
  );
  if (!ipCheck.allowed) {
    return {
      allowed: false,
      degraded: ipCheck.degraded,
      reason: ipCheck.degraded ? "unavailable" : "rate_limited",
    };
  }

  let degraded = ipCheck.degraded;

  if (input.conversationId) {
    const conversationCheck = await checkChatRateLimit(
      client,
      await chatRateKey("conversation", input.conversationId),
      CHAT_CONVERSATION_POLICY,
      { failClosed },
    );
    if (!conversationCheck.allowed) {
      return {
        allowed: false,
        degraded: conversationCheck.degraded,
        reason: conversationCheck.degraded ? "unavailable" : "rate_limited",
      };
    }
    degraded = degraded || conversationCheck.degraded;
  }

  return { allowed: true, degraded };
}

export interface ChatBudgetInput {
  /** True when a provider is configured. Without one the budget is not consulted. */
  providerConfigured: boolean;
  cap?: number;
}

/**
 * The daily ceiling, charged once per provider call. It is deliberately asked just before the call
 * rather than at the start of the turn, so the count matches what is actually spent. A ceiling that
 * cannot run refuses the call when a provider is configured.
 */
export async function checkChatBudget(
  client: ChatRateRpcClient | null,
  input: ChatBudgetInput,
): Promise<ChatRateDecision> {
  if (!input.providerConfigured) return { allowed: true, degraded: false };

  return checkChatRateLimit(client, CHAT_DAILY_KEY, chatDailyPolicy(input.cap), {
    failClosed: true,
  });
}
