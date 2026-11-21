/**
 * Resolves the provider chain.
 *
 * The chain lives in `public.ai_provider_settings`, managed by a workspace owner in the ops app
 * (`apps/ops`). Rows are read with the server-only service role, because the table has no policy for
 * `anon` or `authenticated`; see `supabase/migrations/20261123000000_ai_provider_settings.sql`.
 * For each enabled row, in priority order: a stored key is decrypted with `AI_SECRET_KEY`, otherwise
 * the environment variable named in the row is used. A row with neither is skipped.
 *
 * The table is optional. When it is missing, unreachable, empty or the service key is absent, this
 * falls back to the original environment-only chain, so a deployment without the new migration keeps
 * working exactly as before. The result is cached for 60 seconds; an owner's change appears within a
 * minute without a redeploy.
 *
 * Relevant variables (names only here; `.env.example` documents them):
 *   GEMINI_API_KEY, GEMINI_MODEL,
 *   OPENAI_COMPAT_BASE_URL, OPENAI_COMPAT_API_KEY, OPENAI_COMPAT_MODEL,
 *   OPENCODE_GO_API_KEY, OPENCODE_GO_MODEL,
 *   SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SECRET_ROLE_KEY), AI_SECRET_KEY,
 *   AI_SECRET_KEY_VERSION, AI_SECRET_KEY_PREVIOUS.
 */

import { createClient } from "@supabase/supabase-js";
import { parseReasoningEffort } from "./reasoning";
import { getProvider, PROVIDER_ORDER } from "./registry";
import { decryptProviderKey, isSecretStorageConfigured } from "./secrets";
import type { AiProviderRuntimeConfig } from "./types";
import { checkProviderBaseUrl } from "./url-safety";

export type AiEnvironment = Record<string, string | undefined>;

/** One `public.ai_provider_settings` row, as the service role reads it. */
export interface AiProviderSettingsRow {
  provider: string;
  model: string | null;
  priority: number;
  enabled: boolean;
  reasoning_effort: string;
  base_url: string | null;
  api_key_env: string | null;
  key_ciphertext: string | null;
  key_iv: string | null;
  key_tag: string | null;
  key_version: number | null;
  key_hint: string | null;
}

/** Returns null when the table cannot be read; an empty array is a read with no rows. */
export type ProviderSettingsLoader = () => Promise<AiProviderSettingsRow[] | null>;

/** The database provider names mapped to the adapter ids in `registry.ts`. */
const REGISTRY_ID: Record<string, string> = {
  gemini: "gemini",
  openai_compat: "openai-compatible",
  opencode_go: "opencode-go",
};

const CACHE_TTL_MS = 60_000;

let cache: { at: number; configs: AiProviderRuntimeConfig[] } | null = null;

/** Tests and a deliberate refresh use this; the app normally waits for the TTL. */
export function resetProviderConfigCache(): void {
  cache = null;
}

function read(env: AiEnvironment, name: string): string {
  return env[name]?.trim() ?? "";
}

function modelFor(env: AiEnvironment, name: string, fallback: string): string {
  return read(env, name) || fallback;
}

/**
 * The environment-only chain. This is the original behaviour, kept as the fallback and used by the
 * existing tests; it never reads a database.
 */
export function loadProviderConfigsFromEnv(
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

/** One row to one runtime config, or null when the row cannot be used. Never logs a key. */
function configFromRow(
  row: AiProviderSettingsRow,
  env: AiEnvironment,
): AiProviderRuntimeConfig | null {
  const kind = REGISTRY_ID[row.provider];
  if (!kind) {
    console.warn(`[ai] unknown provider "${row.provider}" in ai_provider_settings; skipping`);
    return null;
  }
  const provider = getProvider(kind);
  if (!provider) return null;

  const storedKey = row.key_ciphertext
    ? decryptProviderKey({
        provider: row.provider,
        keyCiphertext: row.key_ciphertext,
        keyIv: row.key_iv,
        keyTag: row.key_tag,
        keyVersion: row.key_version,
      })
    : null;
  if (row.key_ciphertext && !storedKey && isSecretStorageConfigured()) {
    // A wrong generation or a tampered value. Never fatal: the environment fallback may still work.
    console.warn(
      `[ai] the stored key for "${row.provider}" could not be decrypted; using fallback`,
    );
  }

  const envName = row.api_key_env?.trim() || provider.defaultApiKeyEnv;
  const apiKey = storedKey ?? read(env, envName);
  if (!apiKey) return null;

  const model = row.model?.trim() || provider.defaultModel;
  const reasoningEffort = parseReasoningEffort(row.reasoning_effort);

  if (kind === "openai-compatible") {
    const baseUrl = row.base_url?.trim();
    if (!baseUrl) {
      console.warn(`[ai] provider "${row.provider}" has no base URL; skipping`);
      return null;
    }
    const checked = checkProviderBaseUrl(baseUrl);
    if (!checked.ok) {
      console.warn(`[ai] the base URL for "${row.provider}" was refused: ${checked.error}`);
      return null;
    }
    return {
      provider: kind,
      kind,
      model,
      apiKey,
      reasoningEffort,
      baseUrl: checked.url,
    };
  }

  return { provider: kind, kind, model, apiKey, reasoningEffort };
}

/** The service-role read. Null means "not available", never an error to the caller. */
async function readProviderSettings(): Promise<AiProviderSettingsRow[] | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || process.env.SUPABASE_SECRET_ROLE_KEY?.trim();
  if (!url || !key) return null;

  try {
    const supabase = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await supabase
      .from("ai_provider_settings")
      .select(
        "provider, model, priority, enabled, reasoning_effort, base_url, api_key_env, key_ciphertext, key_iv, key_tag, key_version, key_hint",
      )
      .order("priority", { ascending: true });

    if (error) {
      console.warn(`[ai] ai_provider_settings is unavailable: ${error.message}`);
      return null;
    }
    return (data ?? []) as AiProviderSettingsRow[];
  } catch (error) {
    console.warn("[ai] ai_provider_settings could not be reached", error);
    return null;
  }
}

export interface LoadProviderConfigsOptions {
  /** Tests pass a fixed environment; production reads `process.env`. */
  env?: AiEnvironment;
  reasoningEffort?: string | null;
  /** Tests inject the rows; production uses the service-role read. */
  loader?: ProviderSettingsLoader;
  /** Tests turn the 60-second cache off. */
  cache?: boolean;
}

/**
 * The enabled, keyed providers in call order. An empty array means the chat uses its fixed fallback
 * copy; it is not an error.
 */
export async function loadProviderConfigs(
  options: LoadProviderConfigsOptions = {},
): Promise<AiProviderRuntimeConfig[]> {
  const env = options.env ?? process.env;
  const loader = options.loader ?? (options.env ? null : readProviderSettings);
  if (!loader) return loadProviderConfigsFromEnv(env, options);

  const useCache =
    options.loader === undefined && options.env === undefined && options.cache !== false;
  const now = Date.now();
  if (useCache && cache && now - cache.at < CACHE_TTL_MS) return cache.configs;

  const rows = await loader();
  const configs =
    rows && rows.length > 0
      ? rows
          .filter((row) => row.enabled)
          .sort((left, right) => left.priority - right.priority)
          .map((row) => configFromRow(row, env))
          .filter((config): config is AiProviderRuntimeConfig => config !== null)
      : loadProviderConfigsFromEnv(env, options);

  if (useCache) cache = { at: now, configs };
  return configs;
}

/** Diagnostics for a log line: provider ids, models and key presence. Never a key. */
export function describeProviderChain(configs: readonly AiProviderRuntimeConfig[]): string {
  if (configs.length === 0) return "none";
  return configs.map((config) => `${config.provider}:${config.model}`).join(" -> ");
}
