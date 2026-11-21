import { afterEach, describe, expect, it, vi } from "vitest";
import { testProviderKey } from "./key-test";
import type { AiProviderSettingsRow } from "./providers";

const KEY = "sk-test-abcdefgh";

function row(overrides: Partial<AiProviderSettingsRow> = {}): AiProviderSettingsRow {
  return {
    provider: "openai_compat",
    model: "example-model",
    priority: 20,
    enabled: true,
    reasoning_effort: "low",
    base_url: "https://api.example.test/v1",
    api_key_env: "OPENAI_COMPAT_API_KEY",
    key_version: null,
    key_hint: null,
    has_stored_key: false,
    updated_at: null,
    updated_by: null,
    ...overrides,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the provider key test", () => {
  it("accepts a chat completion", async () => {
    const fetchSpy = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      Response.json({ choices: [{ message: { content: "ok" } }] }),
    );
    vi.stubGlobal("fetch", fetchSpy);

    const result = await testProviderKey(row(), KEY);
    expect(result.ok).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] ?? [];
    expect(String(url)).toBe("https://api.example.test/v1/chat/completions");
    expect(init?.headers).toMatchObject({ Authorization: `Bearer ${KEY}` });
  });

  it("accepts a Gemini candidate", async () => {
    const fetchSpy = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      Response.json({ candidates: [{ content: {} }] }),
    );
    vi.stubGlobal("fetch", fetchSpy);

    const result = await testProviderKey(row({ provider: "gemini", model: "" }), KEY);
    expect(result.ok).toBe(true);
    expect(String(fetchSpy.mock.calls[0]?.[0])).toContain("gemini-2.5-flash");
  });

  it("summarises a refusal without echoing the key", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(`bad key ${KEY}`, { status: 401 })),
    );

    const result = await testProviderKey(row(), KEY);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).not.toContain(KEY);
      expect(result.error).toContain("[redacted]");
    }
  });

  it("refuses an OpenAI-compatible row with no base URL before calling out", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const result = await testProviderKey(row({ base_url: null }), KEY);
    expect(result.ok).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("reports a 200 that is not a completion", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ error: "nope" })),
    );
    const result = await testProviderKey(row(), KEY);
    expect(result.ok).toBe(false);
  });
});
