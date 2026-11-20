/**
 * Gemini adapter (Google Generative Language REST API).
 *
 * Dependency-free: the REST API is called directly rather than adding the Google SDK for one
 * provider. Gemini is not OpenAI-compatible: it uses `systemInstruction` and `contents` (role
 * "user" | "model") and answers with `candidates[].content.parts[].text`.
 *
 * Ported from `apps/web/lib/ai-providers/gemini.ts`.
 */

import type { AiHttpError, AiProvider, CompletionResult, ProviderRequest } from "./types";

const BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models";
const REQUEST_TIMEOUT_MS = 60_000;

function endpoint(model: string, method: "generateContent" | "streamGenerateContent"): string {
  const suffix = method === "streamGenerateContent" ? "?alt=sse" : "";
  return `${BASE_URL}/${encodeURIComponent(model)}:${method}${suffix}`;
}

function buildBody(request: ProviderRequest) {
  const { turns, systemPrompt, json } = request;
  return {
    systemInstruction: { parts: [{ text: systemPrompt }] },
    contents: turns.map((turn) => ({
      role: turn.role === "assistant" ? "model" : "user",
      parts: [{ text: turn.text }],
    })),
    ...(json ? { generationConfig: { responseMimeType: "application/json" } } : {}),
  };
}

function requestHeaders(apiKey: string) {
  return { "Content-Type": "application/json", "x-goog-api-key": apiKey };
}

function httpError(response: Response, detail: string): AiHttpError {
  const error = new Error(
    `Gemini HTTP ${response.status}: ${detail || response.statusText}`,
  ) as AiHttpError;
  error.status = response.status;
  return error;
}

interface GeminiCandidate {
  content?: { parts?: { text?: string }[] };
  finishReason?: string;
}

function textFromCandidate(candidate: GeminiCandidate | undefined): string {
  if (!candidate?.content?.parts) return "";
  return candidate.content.parts.map((part) => part.text ?? "").join("");
}

export const geminiProvider: AiProvider = {
  id: "gemini",
  label: "Google Gemini",
  defaultModel: "gemini-2.5-flash",
  defaultApiKeyEnv: "GEMINI_API_KEY",

  async *stream(request: ProviderRequest): AsyncGenerator<string> {
    if (!request.config.apiKey) return;

    const response = await fetch(endpoint(request.config.model, "streamGenerateContent"), {
      method: "POST",
      headers: requestHeaders(request.config.apiKey),
      body: JSON.stringify(buildBody(request)),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!response.ok || !response.body) {
      const detail = await response.text().catch(() => "");
      throw httpError(response, detail);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const payload = trimmed.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;
        try {
          const parsed = JSON.parse(payload) as { candidates?: GeminiCandidate[] };
          const text = textFromCandidate(parsed.candidates?.[0]);
          if (text) yield text;
        } catch {
          // A keep-alive or partial line is skipped; the next read completes it.
        }
      }
    }
  },

  async complete(request: ProviderRequest): Promise<CompletionResult | null> {
    if (!request.config.apiKey) return null;

    const response = await fetch(endpoint(request.config.model, "generateContent"), {
      method: "POST",
      headers: requestHeaders(request.config.apiKey),
      body: JSON.stringify(buildBody(request)),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw httpError(response, detail);
    }

    const data = (await response.json()) as { candidates?: GeminiCandidate[] };
    return {
      content: textFromCandidate(data.candidates?.[0]),
      // This endpoint does not expose reasoning text.
      reasoning: null,
    };
  },
};
