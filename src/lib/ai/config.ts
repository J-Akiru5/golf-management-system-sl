/**
 * Resolves the provider chain from environment variables only.
 *
 * There is no provider table and no console: a friendly public chatbot does not need one, and the
 * brief for this work says keys come from the environment. A provider without its key is skipped,
 * so a deployment with one key still works and a deployment with none falls back cleanly.
 *
 * Relevant variables (names only here; `.env.example` documents them):
 *   GEMINI_API_KEY, GEMINI_MODEL,
 *   OPENAI_COMPAT_BASE_URL, OPENAI_COMPAT_API_KEY, OPENAI_COMPAT_MODEL,
 *   OPENCODE_GO_API_KEY, OPENCODE_GO_MODEL.
 *
 * Adapted from `apps/web/lib/ai-providers/config.ts`, with the database rows and encrypted key
 * storage removed.
 */

import { parseReasoningEffort } from "./reasoning";
import { getProvider, PROVIDER_ORDER } from "./registry";
import type { AiProviderRuntimeConfig } from "./types";
import { checkProviderBaseUrl } from "./url-safety";

export type AiEnvironment = Record<string, string | undefined>;

function read(env: AiEnvironment, name: string): string {
  return env[name]?.trim() ?? "";
}

function modelFor(env: AiEnvironment, name: string, fallback: string): string {
  return read(env, name) || fallback;
}

/**
 * The enabled, keyed providers in call order. An empty array means the chat uses its fixed
 * fallback copy; it is not an error.
 */
export function loadProviderConfigs(
  env: AiEnvironment = process.env,
  options: { reasoningEffort?: string | null } = {},
): AiProviderRuntimeConfig[] {
  const effortSource =
    options.reasoningEffort === undefined
      ? (env.OPENCODE_GO_REASONING_EFFORT ?? null)
      : options.reasoningEffort;
  const reasoningEffort = parseReasoningEffort(effortSource);
  const configs: AiProviderRuntimeConfig[] = [];

  for (const id of PROVIDER_ORDER) {
    const provider = getProvider(id);
    if (!provider) continue;
    const apiKey = read(env, provider.defaultApiKeyEnv);
    if (!apiKey) continue;

    if (id === "gemini") {
      configs.push({
        provider: id,
        kind: id,
        model: modelFor(env, "GEMINI_MODEL", provider.defaultModel),
        apiKey,
        reasoningEffort,
      });
      continue;
    }

    if (id === "openai-compatible") {
      const baseUrl = read(env, "OPENAI_COMPAT_BASE_URL");
      if (!baseUrl) {
        console.warn(
          "[ai] OPENAI_COMPAT_API_KEY is set but OPENAI_COMPAT_BASE_URL is not; skipping",
        );
        continue;
      }
      const checked = checkProviderBaseUrl(baseUrl);
      if (!checked.ok) {
        console.warn(`[ai] the OpenAI-compatible base URL was refused: ${checked.error}`);
        continue;
      }
      configs.push({
        provider: id,
        kind: id,
        model: modelFor(env, "OPENAI_COMPAT_MODEL", provider.defaultModel),
        apiKey,
        reasoningEffort,
        baseUrl: checked.url,
      });
      continue;
    }

    configs.push({
      provider: id,
      kind: id,
      model: modelFor(env, "OPENCODE_GO_MODEL", provider.defaultModel),
      apiKey,
      reasoningEffort,
    });
  }

  return configs;
}

/** Diagnostics for a log line: provider ids, models and key presence. Never a key. */
export function describeProviderChain(configs: readonly AiProviderRuntimeConfig[]): string {
  if (configs.length === 0) return "none";
  return configs.map((config) => `${config.provider}:${config.model}`).join(" -> ");
}
