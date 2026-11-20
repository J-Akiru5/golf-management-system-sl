import { describe, expect, it, vi } from "vitest";
import { normaliseConcern } from "@/lib/data/concerns";
import {
  CHAT_CONVERSATION_POLICY,
  CHAT_IP_POLICY,
  CHAT_SUBMIT_POLICY,
  chatRateKey,
  checkChatRateLimit,
  clientAddressFromHeaders,
  normaliseConversationId,
} from "./rate-limit";

function rpcClient(result: { data?: unknown; error?: { code?: string; message?: string } | null }) {
  const rpc = vi.fn(async () => ({ data: result.data ?? null, error: result.error ?? null }));
  return { rpc, calls: rpc };
}

describe("the rate-limit key", () => {
  it("is pseudonymous, prefixed and short enough for the column", async () => {
    const key = await chatRateKey("ip", "203.0.113.7");
    expect(key.startsWith("ip:")).toBe(true);
    expect(key.slice(3)).toMatch(/^[0-9a-f]{32}$/);
    expect(key.length).toBeLessThanOrEqual(64);
  });

  it("does not contain the address and is stable", async () => {
    const first = await chatRateKey("ip", "203.0.113.7");
    expect(first).not.toContain("203.0.113.7");
    expect(await chatRateKey("ip", "203.0.113.7")).toBe(first);
    expect(await chatRateKey("conversation", "203.0.113.7")).not.toBe(first);
  });

  it("reads the first proxy address, then the real-ip header", () => {
    expect(
      clientAddressFromHeaders(
        new Headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1", "x-real-ip": "10.0.0.2" }),
      ),
    ).toBe("203.0.113.7");
    expect(clientAddressFromHeaders(new Headers({ "x-real-ip": "10.0.0.2" }))).toBe("10.0.0.2");
    expect(clientAddressFromHeaders(new Headers())).toBeNull();
  });

  it("accepts only a conversation id the panel could have made", () => {
    expect(normaliseConversationId("3f1c2a9e-1b2c-4d5e-8f90-abcdef123456")).toBe(
      "3f1c2a9e-1b2c-4d5e-8f90-abcdef123456",
    );
    expect(normaliseConversationId("short")).toBeNull();
    expect(normaliseConversationId("has spaces in it")).toBeNull();
    expect(normaliseConversationId(42)).toBeNull();
  });
});

describe("the rate check", () => {
  it("calls chat_rate_check with the policy's limit and window", async () => {
    const client = rpcClient({ data: true });
    const decision = await checkChatRateLimit(client, "ip:abc", CHAT_CONVERSATION_POLICY);
    expect(decision).toEqual({ allowed: true, degraded: false });
    expect(client.calls).toHaveBeenCalledWith("chat_rate_check", {
      p_key: "ip:abc",
      p_limit: CHAT_CONVERSATION_POLICY.limit,
      p_window_seconds: CHAT_CONVERSATION_POLICY.windowSeconds,
    });
  });

  it("refuses when the database says the bucket is full", async () => {
    const client = rpcClient({ data: false });
    await expect(checkChatRateLimit(client, "ip:abc", CHAT_IP_POLICY)).resolves.toEqual({
      allowed: false,
      degraded: false,
    });
  });

  it("allows the turn and reports the degradation when there is no database", async () => {
    await expect(checkChatRateLimit(null, "ip:abc", CHAT_IP_POLICY)).resolves.toEqual({
      allowed: true,
      degraded: true,
    });
  });

  it("allows the turn and reports the degradation when the function is missing", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const client = rpcClient({
      error: { code: "PGRST202", message: "Could not find the function public.chat_rate_check" },
    });
    await expect(checkChatRateLimit(client, "ip:abc", CHAT_IP_POLICY)).resolves.toEqual({
      allowed: true,
      degraded: true,
    });
    vi.restoreAllMocks();
  });

  it("allows the turn when the client throws", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const client = {
      rpc: async () => {
        throw new Error("offline");
      },
    };
    await expect(checkChatRateLimit(client, "ip:abc", CHAT_IP_POLICY)).resolves.toEqual({
      allowed: true,
      degraded: true,
    });
    vi.restoreAllMocks();
  });

  it("keeps the filling limits small enough to be a real cap", () => {
    expect(CHAT_SUBMIT_POLICY.limit).toBeLessThan(CHAT_IP_POLICY.limit);
    expect(CHAT_CONVERSATION_POLICY.limit).toBe(20);
  });
});

describe("the limits do not lose the note", () => {
  it("a filed note still validates through the contract", () => {
    const checked = normaliseConcern({
      concerns: ["score"],
      holeNo: 7,
      source: "chat",
      transcript: [{ role: "user", content: "my score on 7 is wrong" }],
    });
    expect(checked.ok).toBe(true);
  });
});
