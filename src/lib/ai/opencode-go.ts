/**
 * OpenCode Go adapter (OpenAI-compatible chat completions).
 *
 * Two behaviours make Go unlike a plain OpenAI endpoint:
 *   - every request must carry a stable `x-opencode-session` header, or the server answers HTTP 400
 *     with type "MissingSessionID";
 *   - reasoning arrives in `reasoning_content`, not `reasoning_details`.
 *
 * Ported from `apps/web/lib/ai-providers/opencode-go.ts`.
 */

import type { AiHttpError, AiProvider, CompletionResult, ProviderRequest } from "./types";

const API_URL = "https://opencode.ai/inference/go/openai/v1/chat/completions";
const USER_AGENT = "teeline-golf/1.0";
const REQUEST_TIMEOUT_MS = 60_000;

function buildBody(request: ProviderRequest, stream: boolean) {
  const { turns, systemPrompt, config } = request;
  return {
    model: config.model,
    messages: [
      { role: "system", content: systemPrompt },
      ...turns.map((turn) => ({ role: turn.role, content: turn.text })),
    ],
    stream,
    // Pin the effort explicitly so behaviour does not follow a vendor default.
    ...(config.reasoningEffort !== "none" ? { reasoning: { effort: config.reasoningEffort } } : {}),
    ...(request.json ? { response_format: { type: "json_object" } } : {}),
  };
}

function requestHeaders(config: ProviderRequest["config"], sessionId: string) {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${config.apiKey}`,
    "User-Agent": USER_AGENT,
    "x-opencode-session": sessionId,
  };
}

function httpError(response: Response): AiHttpError {
  const error = new Error(
    `OpenCode Go HTTP ${response.status}: ${response.statusText}`,
  ) as AiHttpError;
  error.status = response.status;
  return error;
}

export const opencodeGoProvider: AiProvider = {
  id: "opencode-go",
  label: "OpenCode Go",
  defaultModel: "deepseek-v4.1-flash",
  defaultApiKeyEnv: "OPENCODE_GO_API_KEY",

  async *stream(request: ProviderRequest): AsyncGenerator<string> {
    if (!request.config.apiKey) return;

    const response = await fetch(API_URL, {
      method: "POST",
      headers: requestHeaders(request.config, request.sessionId),
      body: JSON.stringify(buildBody(request, true)),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!response.ok || !response.body) throw httpError(response);

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
          const parsed = JSON.parse(payload) as {
            choices?: { delta?: { content?: string; reasoning_content?: string } }[];
          };
          // Reasoning deltas arrive in `reasoning_content`; only the answer text is surfaced, so
          // thinking stays server-side.
          const text = parsed.choices?.[0]?.delta?.content;
          if (text) yield text;
        } catch {
          // Ignore malformed keep-alive or heartbeat lines.
        }
      }
    }
  },

  async complete(request: ProviderRequest): Promise<CompletionResult | null> {
    if (!request.config.apiKey) return null;

    const response = await fetch(API_URL, {
      method: "POST",
      headers: requestHeaders(request.config, request.sessionId),
      body: JSON.stringify(buildBody(request, false)),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!response.ok) throw httpError(response);

    const data = (await response.json()) as {
      choices?: {
        message?: { content?: string | null; reasoning_content?: string | null };
      }[];
    };

    const message = data.choices?.[0]?.message;
    return {
      content: message?.content ?? "",
      reasoning: message?.reasoning_content?.trim() || null,
    };
  },
};
