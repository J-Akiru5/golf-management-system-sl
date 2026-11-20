import { afterEach, describe, expect, it, vi } from "vitest";
import { loadProviderConfigs } from "./config";

function silenceWarnings() {
  return vi.spyOn(console, "warn").mockImplementation(() => {});
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("the provider chain from the environment", () => {
  it("is empty when no key is configured, which is not an error", () => {
    expect(loadProviderConfigs({})).toEqual([]);
  });

  it("places Gemini first with its default model", () => {
    const configs = loadProviderConfigs({ GEMINI_API_KEY: "test-key" });
    expect(configs).toHaveLength(1);
    expect(configs[0]).toMatchObject({
      provider: "gemini",
      kind: "gemini",
      model: "gemini-2.5-flash",
      apiKey: "test-key",
    });
  });

  it("takes the model from the environment and trims it", () => {
    const configs = loadProviderConfigs({
      GEMINI_API_KEY: "  key  ",
      GEMINI_MODEL: "  gemini-2.5-pro ",
    });
    expect(configs[0]?.model).toBe("gemini-2.5-pro");
    expect(configs[0]?.apiKey).toBe("key");
  });

  it("orders Gemini, then OpenAI-compatible, then OpenCode Go", () => {
    silenceWarnings();
    const configs = loadProviderConfigs({
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
    const configs = loadProviderConfigs({ OPENAI_COMPAT_API_KEY: "o" });
    expect(configs).toEqual([]);
    expect(warn).toHaveBeenCalled();
  });

  it("skips the OpenAI-compatible provider when its base URL is not https", () => {
    silenceWarnings();
    const configs = loadProviderConfigs({
      OPENAI_COMPAT_API_KEY: "o",
      OPENAI_COMPAT_BASE_URL: "http://api.example.test/v1",
    });
    expect(configs).toEqual([]);
  });

  it("parses the reasoning effort once for the chain and defaults it to low", () => {
    const configs = loadProviderConfigs({ OPENCODE_GO_API_KEY: "c" });
    expect(configs[0]?.reasoningEffort).toBe("low");

    const explicit = loadProviderConfigs({
      OPENCODE_GO_API_KEY: "c",
      OPENCODE_GO_REASONING_EFFORT: "none",
    });
    expect(explicit[0]?.reasoningEffort).toBe("none");
  });
});
