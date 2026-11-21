/**
 * The provider metadata and view shapes for the AI providers screen.
 *
 * The database names (`gemini`, `openai_compat`, `opencode_go`) are the contract with
 * `supabase/migrations/20261123000000_ai_provider_settings.sql` and the golf app's config loader.
 * The labels and default models mirror the adapters in the golf app.
 */

export type AiProviderId = "gemini" | "openai_compat" | "opencode_go";
export type ReasoningEffort = "none" | "low" | "medium" | "high";
export type AiKeySource = "stored" | "env" | "none";
export type AiAuditAction = "save" | "set_key" | "clear_key";

export interface AiProviderMeta {
  id: AiProviderId;
  label: string;
  defaultModel: string;
  defaultApiKeyEnv: string;
  supportsBaseUrl: boolean;
}

export const AI_PROVIDERS: readonly AiProviderMeta[] = [
  {
    id: "gemini",
    label: "Google Gemini",
    defaultModel: "gemini-2.5-flash",
    defaultApiKeyEnv: "GEMINI_API_KEY",
    supportsBaseUrl: false,
  },
  {
    id: "openai_compat",
    label: "OpenAI-compatible",
    defaultModel: "gpt-4o-mini",
    defaultApiKeyEnv: "OPENAI_COMPAT_API_KEY",
    supportsBaseUrl: true,
  },
  {
    id: "opencode_go",
    label: "OpenCode Go",
    defaultModel: "deepseek-v4.1-flash",
    defaultApiKeyEnv: "OPENCODE_GO_API_KEY",
    supportsBaseUrl: false,
  },
];

export const REASONING_EFFORTS: readonly ReasoningEffort[] = ["none", "low", "medium", "high"];

export function isAiProviderId(value: unknown): value is AiProviderId {
  return value === "gemini" || value === "openai_compat" || value === "opencode_go";
}

export function isReasoningEffort(value: unknown): value is ReasoningEffort {
  return value === "none" || value === "low" || value === "medium" || value === "high";
}

export function providerMeta(id: AiProviderId): AiProviderMeta {
  const meta = AI_PROVIDERS.find((candidate) => candidate.id === id);
  if (!meta) throw new Error(`Unknown AI provider "${id}".`);
  return meta;
}

/** A stored row, exactly as `ws_list_ai_providers()` returns it (no ciphertext). */
export interface AiProviderSettingsRow {
  provider: AiProviderId;
  model: string;
  priority: number;
  enabled: boolean;
  reasoning_effort: ReasoningEffort;
  base_url: string | null;
  api_key_env: string;
  key_version: number | null;
  key_hint: string | null;
  has_stored_key: boolean;
  updated_at: string | null;
  updated_by: string | null;
}

export interface AiProviderAuditRow {
  id: number;
  provider: AiProviderId;
  action: AiAuditAction;
  reason: string;
  changes: Record<string, unknown>;
  actor: string | null;
  at: string;
}

/** What the screen renders for one provider. Derived on the server; no key material. */
export interface AiProviderView {
  provider: AiProviderId;
  label: string;
  model: string;
  priority: number;
  enabled: boolean;
  reasoningEffort: ReasoningEffort;
  baseUrl: string | null;
  apiKeyEnv: string;
  keySource: AiKeySource;
  keyHint: string | null;
  keyVersion: number | null;
  updatedLabel: string;
}

export interface AiProviderAuditView {
  id: number;
  provider: AiProviderId;
  action: AiAuditAction;
  reason: string;
  actorLabel: string;
  atLabel: string;
}

/** The argument bundle a client card passes back to the server action. */
export interface SaveProviderInput {
  provider: AiProviderId;
  model: string;
  priority: number;
  enabled: boolean;
  reasoningEffort: ReasoningEffort;
  baseUrl: string | null;
  apiKeyEnv: string;
  reason: string;
}

export interface SetProviderKeyInput {
  provider: AiProviderId;
  apiKey: string;
  reason: string;
}

const MANILA = "Asia/Manila";

/** A stable label for the server and the browser; never a locale guess at hydration time. */
export function formatWhen(iso: string | null): string {
  if (!iso) return "Not yet";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Not yet";
  return new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: MANILA,
  }).format(date);
}

/** An owner uuid is not a name; show enough to identify the actor without pretending it is one. */
export function actorLabel(actor: string | null): string {
  if (!actor) return "Someone";
  return `Owner ${actor.slice(0, 8)}`;
}
