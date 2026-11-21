import { beforeEach, describe, expect, it } from "vitest";
import {
  createDemoAiProviderRepo,
  parseSnapshot,
  providerError,
  resetDemoAiProviders,
} from "./repo";

beforeEach(() => {
  resetDemoAiProviders();
});

describe("the snapshot parser", () => {
  it("reads providers and audit rows from the RPC's jsonb value", () => {
    const snapshot = parseSnapshot({
      providers: [
        {
          provider: "gemini",
          model: "gemini-2.5-flash",
          priority: 10,
          enabled: true,
          reasoning_effort: "high",
          base_url: null,
          api_key_env: "GEMINI_API_KEY",
          key_version: 2,
          key_hint: "abcd",
          has_stored_key: true,
          updated_at: "2026-11-21T06:00:00.000Z",
          updated_by: "00000000-0000-4000-8000-000000000001",
        },
      ],
      audit: [
        {
          id: 3,
          provider: "gemini",
          action: "set_key",
          reason: "rotate the key for November",
          changes: { has_stored_key: true, key_version: 2 },
          actor: "00000000-0000-4000-8000-000000000001",
          at: "2026-11-21T06:00:00.000Z",
        },
      ],
    });

    expect(snapshot.providers).toHaveLength(1);
    expect(snapshot.providers[0]).toMatchObject({
      provider: "gemini",
      priority: 10,
      reasoning_effort: "high",
      has_stored_key: true,
      key_hint: "abcd",
    });
    expect(snapshot.audit[0]).toMatchObject({ action: "set_key", id: 3 });
  });

  it("drops a row with an unknown provider or action", () => {
    const snapshot = parseSnapshot({
      providers: [{ provider: "unknown" }],
      audit: [{ id: 1, provider: "gemini", action: "deleted", reason: "x" }],
    });
    expect(snapshot).toEqual({ providers: [], audit: [] });
  });

  it("accepts a jsonb string and refuses anything else", () => {
    expect(parseSnapshot('{"providers":[],"audit":[]}')).toEqual({ providers: [], audit: [] });
    expect(parseSnapshot(null)).toEqual({ providers: [], audit: [] });
  });
});

describe("the demo repository", () => {
  it("refuses anyone who is not an owner", () => {
    expect(() => createDemoAiProviderRepo("member")).toThrow();
  });

  it("saves a setting and records an audit row", async () => {
    const repo = createDemoAiProviderRepo("owner");
    await repo.save({
      provider: "gemini",
      model: "gemini-2.5-pro",
      priority: 5,
      enabled: true,
      reasoningEffort: "medium",
      baseUrl: null,
      apiKeyEnv: "GEMINI_API_KEY",
      reason: "raise Gemini to the front of the chain",
    });

    const snapshot = await repo.list();
    const gemini = snapshot.providers.find((row) => row.provider === "gemini");
    expect(gemini?.model).toBe("gemini-2.5-pro");
    expect(gemini?.priority).toBe(5);
    expect(snapshot.audit[0]).toMatchObject({
      action: "save",
      provider: "gemini",
      reason: "raise Gemini to the front of the chain",
    });
  });

  it("records a key as stored without keeping a value", async () => {
    const repo = createDemoAiProviderRepo("owner");
    await repo.setKey({
      provider: "gemini",
      ciphertext: "ciphertext",
      iv: "iv",
      tag: "tag",
      keyVersion: 1,
      hint: "abcd",
      reason: "add a key for the live event",
    });
    const snapshot = await repo.list();
    const gemini = snapshot.providers.find((row) => row.provider === "gemini");
    expect(gemini).toMatchObject({ has_stored_key: true, key_hint: "abcd", key_version: 1 });
    expect(JSON.stringify(snapshot.audit)).not.toContain("ciphertext");
  });

  it("clears a stored key", async () => {
    const repo = createDemoAiProviderRepo("owner");
    await repo.setKey({
      provider: "gemini",
      ciphertext: "ciphertext",
      iv: "iv",
      tag: "tag",
      keyVersion: 1,
      hint: "abcd",
      reason: "add a key for the live event",
    });
    await repo.clearKey("gemini", "return to the environment key");
    const snapshot = await repo.list();
    const gemini = snapshot.providers.find((row) => row.provider === "gemini");
    expect(gemini?.has_stored_key).toBe(false);
    expect(snapshot.audit[0]?.action).toBe("clear_key");
  });
});

describe("the coded error", () => {
  it("keeps the database code for the message mapper", () => {
    const error = providerError("42501", "nope") as Error & { code?: string };
    expect(error.code).toBe("42501");
  });
});
