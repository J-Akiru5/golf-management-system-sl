/**
 * Provider-agnostic AI contracts.
 *
 * Each adapter normalises its own wire format into these shapes so the one facade in `index.ts` can
 * treat Gemini, an OpenAI-compatible endpoint and OpenCode Go interchangeably. Ported and reduced
 * from OptiFeed's `apps/web/lib/ai-providers/types.ts` (same owner); the superadmin key storage is
 * deliberately not ported, because keys here come from environment variables only.
 */

export type ReasoningEffort = "none" | "low" | "medium" | "high";

export interface AiTurn {
  role: "user" | "assistant";
  text: string;
}

export interface CompletionResult {
  content: string;
  /** Provider-reported thinking text, when it exposes one. Never shown to a player. */
  reasoning: string | null;
}

/** Resolved, ready-to-call configuration for one provider. */
export interface AiProviderRuntimeConfig {
  /** Registry id: "gemini", "openai-compatible" or "opencode-go". */
  provider: string;
  /** Adapter id. Distinct from `provider` only for named OpenAI-compatible instances. */
  kind: string;
  /** Provider-specific model id. */
  model: string;
  /** Resolved secret value. Never logged and never returned in a response. */
  apiKey: string;
  reasoningEffort: ReasoningEffort;
  /** Base URL for the OpenAI-compatible adapter. */
  baseUrl?: string;
}

export interface ProviderRequest {
  turns: AiTurn[];
  systemPrompt: string;
  /** Stable per-conversation id; used where the provider needs affinity. */
  sessionId: string;
  config: AiProviderRuntimeConfig;
  /** Ask for a JSON object body where the provider supports it. */
  json?: boolean;
}

export interface AiProvider {
  /** Registry id. */
  id: string;
  /** Human label, for logs. */
  label: string;
  /** Used when the environment does not pin a model. */
  defaultModel: string;
  /** The environment variable that carries the key. Documented in .env.example. */
  defaultApiKeyEnv: string;
  stream(request: ProviderRequest): AsyncGenerator<string>;
  complete(request: ProviderRequest): Promise<CompletionResult | null>;
}

/** An error that carries the upstream HTTP status, so a caller can classify it. */
export interface AiHttpError extends Error {
  status?: number;
}
