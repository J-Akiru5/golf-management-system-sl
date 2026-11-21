import { describe, expect, it } from "vitest";
import {
  checkApiKeyEnv,
  checkBaseUrl,
  checkModel,
  checkPriority,
  checkProviderKey,
  checkReason,
  sanitiseProviderError,
} from "./rules";

describe("AI provider validation", () => {
  it("requires a reason of at least ten characters", () => {
    expect(checkReason("short")).not.toBeNull();
    expect(checkReason("  rotate the key  ")).toBeNull();
  });

  it("limits the model name", () => {
    expect(checkModel("a".repeat(101))).not.toBeNull();
    expect(checkModel("gemini-2.5-flash")).toBeNull();
  });

  it("accepts only a whole priority from 0 to 1000", () => {
    expect(checkPriority(-1)).not.toBeNull();
    expect(checkPriority(10.5)).not.toBeNull();
    expect(checkPriority(1001)).not.toBeNull();
    expect(checkPriority(10)).toBeNull();
  });

  it("accepts an environment variable name, never a pasted key", () => {
    expect(checkApiKeyEnv("GEMINI_API_KEY")).toBeNull();
    expect(checkApiKeyEnv("")).toBeNull();
    expect(checkApiKeyEnv("gemini_key")).not.toBeNull();
    expect(checkApiKeyEnv("sk-live-abc123")).not.toBeNull();
  });

  it("refuses a base URL on a provider that does not take one", () => {
    const result = checkBaseUrl("gemini", "https://api.example.test/v1");
    expect(result.ok).toBe(false);
  });

  it("accepts an https base URL and strips a trailing slash", () => {
    const result = checkBaseUrl("openai_compat", "https://api.example.test/v1/");
    expect(result).toEqual({ ok: true, value: "https://api.example.test/v1" });
  });

  it("refuses plain http, credentials and a local address", () => {
    expect(checkBaseUrl("openai_compat", "http://api.example.test/v1").ok).toBe(false);
    expect(checkBaseUrl("openai_compat", "https://user:pass@api.example.test/v1").ok).toBe(false);
    expect(checkBaseUrl("openai_compat", "https://localhost/v1").ok).toBe(false);
    expect(checkBaseUrl("openai_compat", "https://127.0.0.1/v1").ok).toBe(false);
    expect(checkBaseUrl("openai_compat", "https://10.0.0.5/v1").ok).toBe(false);
    expect(checkBaseUrl("openai_compat", "https://[::1]/v1").ok).toBe(false);
  });

  it("allows an empty base URL on the OpenAI-compatible provider", () => {
    expect(checkBaseUrl("openai_compat", "")).toEqual({ ok: true, value: null });
  });

  it("requires a key with no spaces", () => {
    expect(checkProviderKey("short")).not.toBeNull();
    expect(checkProviderKey("sk-test key with space")).not.toBeNull();
    expect(checkProviderKey("sk-test-abcdefgh")).toBeNull();
  });

  it("redacts the key from a provider error", () => {
    const message = sanitiseProviderError(
      new Error("401 for key sk-test-abcdefgh, try again"),
      "sk-test-abcdefgh",
    );
    expect(message).not.toContain("sk-test-abcdefgh");
    expect(message).toContain("[redacted]");
  });
});
