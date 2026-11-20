/**
 * The provider registry. Adding a provider means writing one adapter and registering it here.
 *
 * Ported from `apps/web/lib/ai-providers/registry.ts`, without the console-only "custom instance"
 * idea: this app has no provider console, so `kind` always equals `provider`.
 */

import { geminiProvider } from "./gemini";
import { openAiCompatibleProvider } from "./openai-compatible";
import { opencodeGoProvider } from "./opencode-go";
import type { AiProvider } from "./types";

/** The order a player's turn is tried in: Gemini first (the default), then the other two. */
export const PROVIDER_ORDER = ["gemini", "openai-compatible", "opencode-go"] as const;

const PROVIDERS: Record<string, AiProvider> = {
  [geminiProvider.id]: geminiProvider,
  [openAiCompatibleProvider.id]: openAiCompatibleProvider,
  [opencodeGoProvider.id]: opencodeGoProvider,
};

export function getProvider(id: string): AiProvider | undefined {
  return PROVIDERS[id];
}

export function listProviders(): AiProvider[] {
  return Object.values(PROVIDERS);
}
