/**
 * The one AI facade the rest of the app talks to.
 *
 * Which providers exist, their order, models and keys are resolved at call time from the
 * environment (see `config.ts`). A caller never imports an adapter directly.
 *
 * Failover rule, ported from OptiFeed's `lib/ai.ts`: a provider may be skipped only while it has
 * produced nothing. Once a stream has yielded text we are committed to it, because the tokens are
 * already on the wire and switching would splice two answers together.
 */

import { describeProviderChain, loadProviderConfigs } from "./config";
import { getProvider } from "./registry";
import type { AiProviderRuntimeConfig, AiTurn, CompletionResult } from "./types";

export type { AiProviderRuntimeConfig, AiTurn, CompletionResult } from "./types";

export interface AiCallOptions {
  /** Override the resolved chain. Used by tests; production resolves from the environment. */
  configs?: AiProviderRuntimeConfig[];
  /** Ask the provider for a JSON object body where it supports that. */
  json?: boolean;
}

/**
 * Deterministic, collision-resistant-enough session id for providers that need conversation
 * affinity (`x-opencode-session`). FNV-1a keeps this dependency-free; the value is a routing hint,
 * not a secret.
 */
export function stableSessionId(...parts: (string | number | null | undefined)[]): string {
  const input = parts
    .filter((part) => part !== null && part !== undefined && part !== "")
    .map(String)
    .join("\u0000");
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `teeline-${(hash >>> 0).toString(36)}`;
}

/** True when at least one provider holds a usable key. */
export async function isAiEnabled(options: AiCallOptions = {}): Promise<boolean> {
  return (options.configs ?? (await loadProviderConfigs())).length > 0;
}

/** One log line naming the chain and never a key. */
export async function aiDebugInfo(options: AiCallOptions = {}) {
  const configs = options.configs ?? (await loadProviderConfigs());
  return {
    chain: describeProviderChain(configs),
    primary: configs[0]?.provider ?? "none",
    model: configs[0]?.model ?? "none",
    hasKey: configs.length > 0,
  };
}

/**
 * Streams a reply, walking the chain until one provider produces text. Yields nothing when no
 * provider is configured, so the caller can use its fixed fallback copy.
 */
export async function* streamAi(
  turns: AiTurn[],
  systemPrompt: string,
  sessionId: string,
  options: AiCallOptions = {},
): AsyncGenerator<string> {
  const configs = options.configs ?? (await loadProviderConfigs());
  let lastError: unknown = null;

  for (const config of configs) {
    const provider = getProvider(config.kind ?? config.provider);
    if (!provider) continue;

    let yielded = false;
    try {
      for await (const chunk of provider.stream({
        turns,
        systemPrompt,
        sessionId,
        config,
        json: options.json,
      })) {
        yielded = true;
        yield chunk;
      }
      return;
    } catch (error) {
      lastError = error;
      if (yielded) throw error;
      console.error(
        `[ai] ${config.provider} failed before the first token (chain: ${describeProviderChain(configs)})`,
        error,
      );
    }
  }

  if (lastError) console.error("[ai] every provider failed for a streamed turn", lastError);
}

/**
 * Non-streaming completion, walking the chain until one provider returns content.
 *
 * Returns null when no provider is configured or every one failed; each failure is logged. A public
 * route answers every failure the same way (the fixed fallback), so it does not need the exception.
 */
export async function completeAi(
  turns: AiTurn[],
  systemPrompt: string,
  sessionId: string,
  options: AiCallOptions = {},
): Promise<CompletionResult | null> {
  const configs = options.configs ?? (await loadProviderConfigs());
  let lastError: unknown = null;

  for (const config of configs) {
    const provider = getProvider(config.kind ?? config.provider);
    if (!provider) continue;

    try {
      const result = await provider.complete({
        turns,
        systemPrompt,
        sessionId,
        config,
        json: options.json,
      });
      if (result?.content?.trim()) return result;
      console.warn(`[ai] ${config.provider} returned empty content; trying the next provider`);
    } catch (error) {
      lastError = error;
      console.error(
        `[ai] ${config.provider} completion failed (chain: ${describeProviderChain(configs)})`,
        error,
      );
    }
  }

  if (lastError) console.error("[ai] every provider failed for a completion");
  return null;
}
