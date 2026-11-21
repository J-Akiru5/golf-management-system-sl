import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, WorkspaceRole } from "@/lib/db/types";
import { demoMode } from "@/lib/flags";
import { getServerSupabase } from "@/lib/supabase/server";
import {
  type AiAuditAction,
  type AiProviderAuditRow,
  type AiProviderId,
  type AiProviderSettingsRow,
  isAiProviderId,
  isReasoningEffort,
  providerMeta,
  type SaveProviderInput,
} from "./providers";

/**
 * The AI provider repository.
 *
 * Two implementations behind one interface: the Supabase one calls the SECURITY DEFINER functions
 * added by `supabase/migrations/20261123000000_ai_provider_settings.sql`, and an in-memory demo
 * keeps the screen usable in `OPS_DEMO=1` without a database. The functions check that the caller is
 * an active owner; the demo checks the `?as=` viewer.
 */

export interface AiProviderSnapshot {
  providers: AiProviderSettingsRow[];
  audit: AiProviderAuditRow[];
}

export interface StoredProviderKeyInput {
  provider: AiProviderId;
  ciphertext: string;
  iv: string;
  tag: string;
  keyVersion: number;
  hint: string;
  reason: string;
}

export interface AiProviderRepo {
  list(): Promise<AiProviderSnapshot>;
  save(input: SaveProviderInput): Promise<void>;
  setKey(input: StoredProviderKeyInput): Promise<void>;
  clearKey(provider: AiProviderId, reason: string): Promise<void>;
}

export type CodedError = Error & { code?: string };

export function providerError(code: string, message: string): Error {
  const error = new Error(message) as CodedError;
  error.code = code;
  return error;
}

export function codeOf(error: unknown): string | null {
  if (typeof error !== "object" || error === null) return null;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : null;
}

type SupabaseError = { code?: string | null; message: string };

function throwIf(error: SupabaseError | null): void {
  if (!error) return;
  throw providerError(error.code ?? "unknown", error.message);
}

// --------------------------------------------------------------------------------------------
// Parsing: the RPC returns one jsonb value, so every field is checked before it reaches a page.

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asText(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asNullableText(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

function asNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function asNullableNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function parseProvider(value: unknown): AiProviderSettingsRow | null {
  if (!isRecord(value) || !isAiProviderId(value.provider)) return null;
  const effort = isReasoningEffort(value.reasoning_effort) ? value.reasoning_effort : "low";
  return {
    provider: value.provider,
    model: asText(value.model),
    priority: asNumber(value.priority, 100),
    enabled: value.enabled === true,
    reasoning_effort: effort,
    base_url: asNullableText(value.base_url),
    api_key_env: asText(value.api_key_env),
    key_version: asNullableNumber(value.key_version),
    key_hint: asNullableText(value.key_hint),
    has_stored_key: value.has_stored_key === true,
    updated_at: asNullableText(value.updated_at),
    updated_by: asNullableText(value.updated_by),
  };
}

const AUDIT_ACTIONS: readonly AiAuditAction[] = ["save", "set_key", "clear_key"];

function parseAudit(value: unknown): AiProviderAuditRow | null {
  if (!isRecord(value) || !isAiProviderId(value.provider)) return null;
  if (!AUDIT_ACTIONS.includes(value.action as AiAuditAction)) return null;
  return {
    id: asNumber(value.id, 0),
    provider: value.provider,
    action: value.action as AiAuditAction,
    reason: asText(value.reason),
    changes: isRecord(value.changes) ? value.changes : {},
    actor: asNullableText(value.actor),
    at: asText(value.at),
  };
}

export function parseSnapshot(value: unknown): AiProviderSnapshot {
  let parsed = value;
  if (typeof parsed === "string") {
    try {
      parsed = JSON.parse(parsed) as unknown;
    } catch {
      parsed = null;
    }
  }
  if (!isRecord(parsed)) return { providers: [], audit: [] };
  const providers = Array.isArray(parsed.providers)
    ? parsed.providers
        .map(parseProvider)
        .filter((row): row is AiProviderSettingsRow => row !== null)
    : [];
  const audit = Array.isArray(parsed.audit)
    ? parsed.audit.map(parseAudit).filter((row): row is AiProviderAuditRow => row !== null)
    : [];
  return { providers, audit };
}

// --------------------------------------------------------------------------------------------
// Supabase

type RpcClient = {
  rpc(
    name: string,
    args?: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: SupabaseError | null }>;
};

export function createSupabaseAiProviderRepo(client: SupabaseClient<Database>): AiProviderRepo {
  const rpc = client as unknown as RpcClient;

  return {
    async list() {
      const { data, error } = await rpc.rpc("ws_list_ai_providers");
      throwIf(error);
      return parseSnapshot(data);
    },

    async save(input) {
      const { error } = await rpc.rpc("ws_save_ai_provider", {
        p_provider: input.provider,
        p_model: input.model,
        p_priority: input.priority,
        p_enabled: input.enabled,
        p_reasoning_effort: input.reasoningEffort,
        p_base_url: input.baseUrl,
        p_api_key_env: input.apiKeyEnv,
        p_reason: input.reason,
      });
      throwIf(error);
    },

    async setKey(input) {
      const { error } = await rpc.rpc("ws_set_ai_provider_key", {
        p_provider: input.provider,
        p_ciphertext: input.ciphertext,
        p_iv: input.iv,
        p_tag: input.tag,
        p_key_version: input.keyVersion,
        p_hint: input.hint,
        p_reason: input.reason,
      });
      throwIf(error);
    },

    async clearKey(provider, reason) {
      const { error } = await rpc.rpc("ws_clear_ai_provider_key", {
        p_provider: provider,
        p_reason: reason,
      });
      throwIf(error);
    },
  };
}

// --------------------------------------------------------------------------------------------
// Demo

type DemoState = { providers: AiProviderSettingsRow[]; audit: AiProviderAuditRow[] };

const DEMO_ACTOR = "demo-owner";
let demoState: DemoState | null = null;

function seededProvider(id: AiProviderId, priority: number): AiProviderSettingsRow {
  const meta = providerMeta(id);
  return {
    provider: id,
    model: meta.defaultModel,
    priority,
    enabled: true,
    reasoning_effort: "low",
    base_url: null,
    api_key_env: meta.defaultApiKeyEnv,
    key_version: null,
    key_hint: null,
    has_stored_key: false,
    updated_at: null,
    updated_by: null,
  };
}

function state(): DemoState {
  if (demoState === null) {
    demoState = {
      providers: [
        seededProvider("gemini", 10),
        seededProvider("openai_compat", 20),
        seededProvider("opencode_go", 30),
      ],
      audit: [],
    };
  }
  return demoState;
}

/** Back to the seed. Tests use it; the app never calls it. */
export function resetDemoAiProviders(): void {
  demoState = null;
}

function findDemo(id: AiProviderId): AiProviderSettingsRow {
  const row = state().providers.find((candidate) => candidate.provider === id);
  if (!row) throw providerError("P0002", "That provider is not in the table.");
  return row;
}

function record(
  provider: AiProviderId,
  action: AiAuditAction,
  reason: string,
  changes: Record<string, unknown>,
): void {
  const nextId = state().audit.length === 0 ? 1 : (state().audit[0]?.id ?? 0) + 1;
  state().audit.unshift({
    id: nextId,
    provider,
    action,
    reason,
    changes,
    actor: DEMO_ACTOR,
    at: new Date().toISOString(),
  });
}

export function createDemoAiProviderRepo(viewerRole: WorkspaceRole): AiProviderRepo {
  if (viewerRole !== "owner") {
    throw providerError("42501", "only an owner can manage AI providers");
  }

  return {
    async list() {
      return {
        providers: state().providers.map((row) => ({ ...row })),
        audit: state().audit.map((row) => ({ ...row, changes: { ...row.changes } })),
      };
    },

    async save(input) {
      const row = findDemo(input.provider);
      const before = {
        model: row.model,
        priority: row.priority,
        enabled: row.enabled,
        reasoning_effort: row.reasoning_effort,
        base_url: row.base_url,
        api_key_env: row.api_key_env,
      };
      row.model = input.model;
      row.priority = input.priority;
      row.enabled = input.enabled;
      row.reasoning_effort = input.reasoningEffort;
      row.base_url = input.baseUrl;
      row.api_key_env = input.apiKeyEnv;
      row.updated_at = new Date().toISOString();
      row.updated_by = DEMO_ACTOR;
      record(input.provider, "save", input.reason, {
        before,
        after: {
          model: row.model,
          priority: row.priority,
          enabled: row.enabled,
          reasoning_effort: row.reasoning_effort,
          base_url: row.base_url,
          api_key_env: row.api_key_env,
        },
      });
    },

    async setKey(input) {
      const row = findDemo(input.provider);
      row.has_stored_key = true;
      row.key_hint = input.hint;
      row.key_version = input.keyVersion;
      row.updated_at = new Date().toISOString();
      row.updated_by = DEMO_ACTOR;
      record(input.provider, "set_key", input.reason, {
        has_stored_key: true,
        key_version: input.keyVersion,
      });
    },

    async clearKey(provider, reason) {
      const row = findDemo(provider);
      row.has_stored_key = false;
      row.key_hint = null;
      row.key_version = null;
      row.updated_at = new Date().toISOString();
      row.updated_by = DEMO_ACTOR;
      record(provider, "clear_key", reason, { has_stored_key: false });
    },
  };
}

/** The repository for a page or an action. */
export async function aiProviderRepo(demoViewer: WorkspaceRole): Promise<AiProviderRepo> {
  if (demoMode()) return createDemoAiProviderRepo(demoViewer);
  return createSupabaseAiProviderRepo(await getServerSupabase());
}
