import { afterEach, describe, expect, it, vi } from "vitest";
import {
  type AiProviderSettingsRow,
  loadProviderConfigs,
  loadProviderConfigsFromEnv,
} from "./config";

/** The fixed vector from `secrets.test.ts`; both copies must decrypt it. */
const TEST_KEY = "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8=";

function silenceWarnings() {
  return vi.spyOn(console, "warn").mockImplementation(() => {});
}

function row(overrides: Partial<AiProviderSettingsRow> = {}): AiProviderSettingsRow {
  return {
    provider: "gemini",
    model: "gemini-2.5-flash",
    priority: 10,
    enabled: true,
    reasoning_effort: "low",
    base_url: null,
    api_key_env: "GEMINI_API_KEY",
    key_ciphertext: null,
    key_iv: null,
    key_tag: null,
    key_version: null,
    key_hint: null,
    ...overrides,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("the provider chain from the environment", () => {
  it("is empty when no key is configured, which is not an error", () => {
    expect(loadProviderConfigsFromEnv({})).toEqual([]);
  });

  it("places Gemini first with its default model", () => {
    const configs = loadProviderConfigsFromEnv({ GEMINI_API_KEY: "test-key" });
    expect(configs).toHaveLength(1);
    expect(configs[0]).toMatchObject({
      provider: "gemini",
      kind: "gemini",
      model: "gemini-2.5-flash",
      apiKey: "test-key",
    });
  });

  it("takes the model from the environment and trims it", () => {
    const configs = loadProviderConfigsFromEnv({
      GEMINI_API_KEY: "  key  ",
      GEMINI_MODEL: "  gemini-2.5-pro ",
    });
    expect(configs[0]?.model).toBe("gemini-2.5-pro");
    expect(configs[0]?.apiKey).toBe("key");
  });

  it("orders Gemini, then OpenAI-compatible, then OpenCode Go", () => {
    silenceWarnings();
    const configs = loadProviderConfigsFromEnv({
      GEMINI_API_KEY: "g",
      OPENAI_COMPAT_API_KEY: "o",
      OPENAI_COMPAT_BASE_URL: "https://api.example.test/v1",
      OPENAI_COMPAT_MODEL: "example-model",
      OPENCODE_GO_API_KEY: "c",
      OPENCODE_GO_MODEL: "go-model",
    });
    expect(configs.map((config) => config.provider)).toEqual([
      "gemini",
      "openai-compatible",
      "opencode-go",
    ]);
    expect(configs[1]?.baseUrl).toBe("https://api.example.test/v1");
    expect(configs[2]?.model).toBe("go-model");
  });

  it("skips the OpenAI-compatible provider when its base URL is missing", () => {
    const warn = silenceWarnings();
    const configs = loadProviderConfigsFromEnv({ OPENAI_COMPAT_API_KEY: "o" });
    expect(configs).toEqual([]);
    expect(warn).toHaveBeenCalled();
  });

  it("skips the OpenAI-compatible provider when its base URL is not https", () => {
    silenceWarnings();
    const configs = loadProviderConfigsFromEnv({
      OPENAI_COMPAT_API_KEY: "o",
      OPENAI_COMPAT_BASE_URL: "http://api.example.test/v1",
    });
    expect(configs).toEqual([]);
  });

  it("parses the reasoning effort once for the chain and defaults it to low", () => {
    const configs = loadProviderConfigsFromEnv({ OPENCODE_GO_API_KEY: "c" });
    expect(configs[0]?.reasoningEffort).toBe("low");

    const explicit = loadProviderConfigsFromEnv({
      OPENCODE_GO_API_KEY: "c",
      OPENCODE_GO_REASONING_EFFORT: "none",
    });
    expect(explicit[0]?.reasoningEffort).toBe("none");
  });
});

describe("the provider chain from the settings table", () => {
  it("uses the environment exactly as before when the rows cannot be read", async () => {
    const configs = await loadProviderConfigs({
      env: { GEMINI_API_KEY: "env-key" },
      loader: async () => null,
    });
    expect(configs).toHaveLength(1);
    expect(configs[0]).toMatchObject({ provider: "gemini", apiKey: "env-key" });
  });

  it("uses the environment when the table is reachable but empty", async () => {
    const configs = await loadProviderConfigs({
      env: { OPENCODE_GO_API_KEY: "env-key" },
      loader: async () => [],
    });
    expect(configs.map((config) => config.provider)).toEqual(["opencode-go"]);
  });

  it("orders enabled rows by priority and maps the provider names", async () => {
    const configs = await loadProviderConfigs({
      env: {
        GEMINI_API_KEY: "g",
        OPENAI_COMPAT_API_KEY: "o",
        OPENCODE_GO_API_KEY: "c",
      },
      loader: async () => [
        row({ provider: "opencode_go", priority: 30, api_key_env: "OPENCODE_GO_API_KEY" }),
        row({ provider: "gemini", priority: 10 }),
        row({ provider: "openai_compat", priority: 20, base_url: "https://api.example.test/v1" }),
      ],
    });
    expect(configs.map((config) => config.provider)).toEqual([
      "gemini",
      "openai-compatible",
      "opencode-go",
    ]);
    expect(configs[1]?.baseUrl).toBe("https://api.example.test/v1");
  });

  it("skips a disabled row and a row with no key", async () => {
    const configs = await loadProviderConfigs({
      env: { OPENCODE_GO_API_KEY: "env-key" },
      loader: async () => [
        row({ enabled: false, key_ciphertext: null }),
        row({ provider: "opencode_go", api_key_env: "OPENCODE_GO_API_KEY" }),
      ],
    });
    expect(configs.map((config) => config.provider)).toEqual(["opencode-go"]);
  });

  it("reads a stored key, which wins over the environment", async () => {
    vi.stubEnv("AI_SECRET_KEY", TEST_KEY);
    const configs = await loadProviderConfigs({
      env: { GEMINI_API_KEY: "env-key" },
      loader: async () => [
        row({
          key_ciphertext: "M2elb+iTp3j5LuWm2owBQLLktAA=",
          key_iv: "AAECAwQFBgcICQoL",
          key_tag: "kREUaUxdjPH8s4Ghx4JrlA==",
          key_version: 1,
          key_hint: "1234",
        }),
      ],
    });
    expect(configs[0]?.apiKey).toBe("test-vector-key-1234");
  });

  it("falls back to the environment when the stored key cannot be decrypted", async () => {
    silenceWarnings();
    const configs = await loadProviderConfigs({
      env: { GEMINI_API_KEY: "env-key" },
      loader: async () => [
        row({
          key_ciphertext: "not-a-valid-ciphertext",
          key_iv: "not-an-iv",
          key_tag: "not-a-tag",
          key_version: 1,
          key_hint: "1234",
        }),
      ],
    });
    expect(configs[0]?.apiKey).toBe("env-key");
  });

  it("takes the reasoning effort from each row", async () => {
    const configs = await loadProviderConfigs({
      env: { GEMINI_API_KEY: "env-key" },
      loader: async () => [row({ reasoning_effort: "high" })],
    });
    expect(configs[0]?.reasoningEffort).toBe("high");
  });

  it("skips an unknown provider and a base URL the guard refuses", async () => {
    const warn = silenceWarnings();
    const configs = await loadProviderConfigs({
      env: { OPENAI_COMPAT_API_KEY: "env-key", GEMINI_API_KEY: "env-key" },
      loader: async () => [
        row({ provider: "unknown" }),
        row({
          provider: "openai_compat",
          base_url: "http://api.example.test/v1",
          api_key_env: "OPENAI_COMPAT_API_KEY",
        }),
        row(),
      ],
    });
    expect(configs.map((config) => config.provider)).toEqual(["gemini"]);
    expect(warn).toHaveBeenCalled();
  });
});
