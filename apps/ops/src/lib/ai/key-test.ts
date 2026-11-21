/**
 * One tiny live call to prove a pasted provider key works before it is stored.
 *
 * This is the only outbound call the ops app makes to a provider. It is deliberately small (a
 * single "ping"), short-lived, and it never logs or returns the key. A failure is summarised for the
 * owner and nothing is stored, so a typo cannot replace a working key.
 *
 * The endpoints and headers mirror the golf app's adapters; if an adapter moves, this moves too.
 */

import type { AiProviderSettingsRow } from "./providers";
import { providerMeta } from "./providers";
import { sanitiseProviderError } from "./rules";

const TEST_TIMEOUT_MS = 12_000;
const USER_AGENT = "teeline-ops/1.0";
const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const OPENCODE_GO_URL = "https://opencode.ai/inference/go/openai/v1/chat/completions";

export type KeyTestResult = { ok: true; latencyMs: number } | { ok: false; error: string };

function timeout(): AbortSignal {
  return AbortSignal.timeout(TEST_TIMEOUT_MS);
}

function geminiRequest(row: AiProviderSettingsRow, apiKey: string): Promise<Response> {
  const model = row.model.trim() || providerMeta("gemini").defaultModel;
  return fetch(`${GEMINI_BASE}/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
      "User-Agent": USER_AGENT,
    },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: "ping" }] }],
      generationConfig: { maxOutputTokens: 16 },
    }),
    signal: timeout(),
  });
}

function chatRequest(
  url: string,
  row: AiProviderSettingsRow,
  apiKey: string,
  session: boolean,
): Promise<Response> {
  const model = row.model.trim() || providerMeta(row.provider).defaultModel;
  return fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "User-Agent": USER_AGENT,
      ...(session ? { "x-opencode-session": "teeline-provider-key-test" } : {}),
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: "ping" }],
      max_tokens: 8,
      stream: false,
    }),
    signal: timeout(),
    redirect: "error",
  });
}

/** Calls the provider once. Never throws; a refusal comes back as a sentence for the owner. */
export async function testProviderKey(
  row: AiProviderSettingsRow,
  apiKey: string,
): Promise<KeyTestResult> {
  const started = Date.now();
  try {
    let response: Response;
    if (row.provider === "gemini") {
      response = await geminiRequest(row, apiKey);
    } else if (row.provider === "opencode_go") {
      response = await chatRequest(OPENCODE_GO_URL, row, apiKey, true);
    } else {
      const baseUrl = row.base_url?.trim().replace(/\/+$/, "");
      if (!baseUrl) {
        return { ok: false, error: "Save the base URL for this provider before adding a key." };
      }
      response = await chatRequest(`${baseUrl}/chat/completions`, row, apiKey, false);
    }

    // Drain the body so the connection is released; a key test needs only the status and shape.
    const detail = await response.text().catch(() => "");
    if (!response.ok) {
      const error = new Error(`The provider answered HTTP ${response.status}. ${detail}`);
      return { ok: false, error: sanitiseProviderError(error, apiKey) };
    }

    let body: unknown = null;
    try {
      body = JSON.parse(detail) as unknown;
    } catch {
      return {
        ok: false,
        error: "The provider answered with something that is not a completion.",
      };
    }
    const hasReply =
      row.provider === "gemini"
        ? Array.isArray((body as { candidates?: unknown }).candidates)
        : Array.isArray((body as { choices?: unknown }).choices);
    if (!hasReply) {
      return {
        ok: false,
        error: "The provider accepted the request but returned no completion. Check the key.",
      };
    }
    return { ok: true, latencyMs: Date.now() - started };
  } catch (error) {
    return { ok: false, error: sanitiseProviderError(error, apiKey) };
  }
}
