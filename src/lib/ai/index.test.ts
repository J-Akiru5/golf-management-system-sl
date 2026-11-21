import { afterEach, describe, expect, it, vi } from "vitest";
import { aiDebugInfo, completeAi, isAiEnabled, stableSessionId, streamAi } from "./index";
import type { AiProviderRuntimeConfig } from "./types";

const GEMINI: AiProviderRuntimeConfig = {
  provider: "gemini",
  kind: "gemini",
  model: "gemini-2.5-flash",
  apiKey: "gemini-key",
  reasoningEffort: "low",
};

const GO: AiProviderRuntimeConfig = {
  provider: "opencode-go",
  kind: "opencode-go",
  model: "deepseek-v4.1-flash",
  apiKey: "go-key",
  reasoningEffort: "low",
};

const TURNS = [{ role: "user" as const, text: "My score on hole 7 is wrong." }];

function mockFetch(handler: (url: string) => Promise<Response>) {
  const spy = vi.fn(async (input: RequestInfo | URL) => handler(String(input)));
  vi.stubGlobal("fetch", spy);
  return spy;
}

function geminiAnswer(text: string): Response {
  return Response.json({ candidates: [{ content: { parts: [{ text }] } }] });
}

function chatAnswer(text: string): Response {
  return Response.json({ choices: [{ message: { content: text } }] });
}

async function collect(iterator: AsyncGenerator<string>): Promise<string[]> {
  const chunks: string[] = [];
  for await (const chunk of iterator) chunks.push(chunk);
  return chunks;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("the AI facade", () => {
  it("reports no key when the chain is empty", async () => {
    await expect(isAiEnabled({ configs: [] })).resolves.toBe(false);
    await expect(aiDebugInfo({ configs: [] })).resolves.toMatchObject({
      primary: "none",
      hasKey: false,
    });
  });

  it("keeps the key out of the diagnostics", async () => {
    const info = await aiDebugInfo({ configs: [GEMINI] });
    expect(info).toMatchObject({ primary: "gemini", model: "gemini-2.5-flash", hasKey: true });
    expect(JSON.stringify(info)).not.toContain("gemini-key");
  });

  it("makes a stable session id that names the app", () => {
    const first = stableSessionId("concern", "conversation-1");
    expect(first).toBe(stableSessionId("concern", "conversation-1"));
    expect(first).not.toBe(stableSessionId("concern", "conversation-2"));
    expect(first.startsWith("teeline-")).toBe(true);
  });

  it("returns the first provider's completion", async () => {
    const fetchSpy = mockFetch(async () => geminiAnswer("Hello from Gemini"));
    const result = await completeAi(TURNS, "system", "session", { configs: [GEMINI] });
    expect(result?.content).toBe("Hello from Gemini");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("falls through to the next provider when the first fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const fetchSpy = mockFetch(async (url) =>
      url.includes("generativelanguage")
        ? new Response("nope", { status: 500 })
        : chatAnswer("Hello from Go"),
    );
    const result = await completeAi(TURNS, "system", "session", { configs: [GEMINI, GO] });
    expect(result?.content).toBe("Hello from Go");
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("returns null when every provider fails, without throwing at the caller", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mockFetch(async () => new Response("nope", { status: 503 }));
    await expect(completeAi(TURNS, "system", "session", { configs: [GEMINI, GO] })).resolves.toBe(
      null,
    );
  });

  it("treats a provider without a key as inactive", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetchSpy = mockFetch(async () => chatAnswer("Hello from Go"));
    const result = await completeAi(TURNS, "system", "session", {
      configs: [{ ...GEMINI, apiKey: "" }, GO],
    });
    expect(result?.content).toBe("Hello from Go");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("streams the first provider that produces text", async () => {
    const fetchSpy = mockFetch(async (url) =>
      url.includes("generativelanguage")
        ? new Response('data: {"candidates":[{"content":{"parts":[{"text":"Hello "}]}}]}\n\n')
        : new Response('data: {"choices":[{"delta":{"content":"Go"}}]}\n\n'),
    );
    const chunks = await collect(streamAi(TURNS, "system", "session", { configs: [GEMINI, GO] }));
    expect(chunks.join("")).toBe("Hello ");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("moves to the next provider when a stream fails before its first token", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mockFetch(async (url) =>
      url.includes("generativelanguage")
        ? new Response("nope", { status: 429 })
        : new Response('data: {"choices":[{"delta":{"content":"Go"}}]}\n\n'),
    );
    const chunks = await collect(streamAi(TURNS, "system", "session", { configs: [GEMINI, GO] }));
    expect(chunks.join("")).toBe("Go");
  });

  it("does not splice two answers when a stream fails mid-way", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const broken = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          new TextEncoder().encode(
            'data: {"candidates":[{"content":{"parts":[{"text":"a"}]}}]}\n\n',
          ),
        );
      },
      // The consumer asks for more after the first chunk, and the connection then breaks.
      pull(controller) {
        controller.error(new Error("boom"));
      },
    });
    mockFetch(async () => new Response(broken));
    await expect(
      collect(streamAi(TURNS, "system", "session", { configs: [GEMINI] })),
    ).rejects.toThrow("boom");
  });

  it("yields nothing when no provider is configured", async () => {
    const chunks = await collect(streamAi(TURNS, "system", "session", { configs: [] }));
    expect(chunks).toEqual([]);
  });
});
