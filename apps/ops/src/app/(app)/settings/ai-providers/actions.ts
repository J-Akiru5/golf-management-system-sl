"use server";

import { revalidatePath } from "next/cache";
import { requireAccess } from "@/lib/access/server";
import { testProviderKey } from "@/lib/ai/key-test";
import {
  type AiProviderId,
  isAiProviderId,
  type SaveProviderInput,
  type SetProviderKeyInput,
} from "@/lib/ai/providers";
import { type AiProviderRepo, aiProviderRepo, codeOf } from "@/lib/ai/repo";
import {
  checkApiKeyEnv,
  checkBaseUrl,
  checkModel,
  checkPriority,
  checkProviderKey,
  checkReason,
  checkReasoningEffort,
  MIN_REASON,
} from "@/lib/ai/rules";
import { encryptProviderKey, isSecretStorageConfigured, keyHint } from "@/lib/ai/secrets";
import type { WorkspaceRole } from "@/lib/db/types";
import { demoMode } from "@/lib/flags";
import { settingsMembersRepo } from "@/lib/members/viewer";

/**
 * Server actions for the AI providers screen.
 *
 * Every action checks that the caller is an active owner before doing anything, including the live
 * key test. The database functions check again, so a direct call cannot get around the screen. A key
 * is encrypted before it leaves this module, and no action returns or logs it.
 */

export type ActionResult = { ok: true; message: string } | { ok: false; message: string };

const OWNER_ONLY = "Only a workspace owner can manage AI providers.";
const STORAGE_OFF = "Key storage is off until AI_SECRET_KEY is set on this project.";

function revalidateProviders(): void {
  revalidatePath("/settings/ai-providers");
}

function mapError(error: unknown): string {
  switch (codeOf(error)) {
    case "42501":
      return OWNER_ONLY;
    case "P0002":
      return "That provider is not in the table. Apply the pending migration first.";
    case "22023":
      return "The database refused the change. Check the values and try again.";
    default:
      return "Something went wrong. Nothing was changed.";
  }
}

/** Null when the caller may manage providers; a refusal sentence otherwise. */
async function ownerRefusal(demoViewer: WorkspaceRole): Promise<string | null> {
  if (demoMode()) return demoViewer === "owner" ? null : OWNER_ONLY;
  try {
    // The page check comes first, so a per-person override of `none` refuses before any work.
    await requireAccess("settings.ai_providers", "edit");
  } catch (error) {
    return error instanceof Error && error.message.trim() !== "" ? error.message : OWNER_ONLY;
  }
  try {
    const me = await (await settingsMembersRepo(demoViewer)).getMe();
    if (!me || me.role !== "owner" || me.status !== "active") return OWNER_ONLY;
    return null;
  } catch {
    return "Your workspace role could not be checked. Try again.";
  }
}

async function repoFor(demoViewer: WorkspaceRole): Promise<AiProviderRepo> {
  return aiProviderRepo(demoViewer);
}

export async function saveAiProviderAction(
  demoViewer: WorkspaceRole,
  input: SaveProviderInput,
): Promise<ActionResult> {
  const refusal = await ownerRefusal(demoViewer);
  if (refusal) return { ok: false, message: refusal };

  if (!isAiProviderId(input.provider)) return { ok: false, message: "Choose a provider." };
  const reasonProblem = checkReason(input.reason);
  if (reasonProblem) return { ok: false, message: reasonProblem };
  const modelProblem = checkModel(input.model);
  if (modelProblem) return { ok: false, message: modelProblem };
  const priorityProblem = checkPriority(input.priority);
  if (priorityProblem) return { ok: false, message: priorityProblem };
  const effortProblem = checkReasoningEffort(input.reasoningEffort);
  if (effortProblem) return { ok: false, message: effortProblem };
  const envProblem = checkApiKeyEnv(input.apiKeyEnv);
  if (envProblem) return { ok: false, message: envProblem };
  const baseUrl = checkBaseUrl(input.provider, input.baseUrl);
  if (!baseUrl.ok) return { ok: false, message: baseUrl.message };

  try {
    const repo = await repoFor(demoViewer);
    await repo.save({
      provider: input.provider,
      model: input.model.trim(),
      priority: input.priority,
      enabled: input.enabled === true,
      reasoningEffort: input.reasoningEffort,
      baseUrl: baseUrl.value,
      apiKeyEnv: input.apiKeyEnv.trim(),
      reason: input.reason.trim(),
    });
    revalidateProviders();
    return { ok: true, message: "Provider settings saved." };
  } catch (error) {
    return { ok: false, message: mapError(error) };
  }
}

export async function saveAiProviderKeyAction(
  demoViewer: WorkspaceRole,
  input: SetProviderKeyInput,
): Promise<ActionResult> {
  const refusal = await ownerRefusal(demoViewer);
  if (refusal) return { ok: false, message: refusal };

  if (!isAiProviderId(input.provider)) return { ok: false, message: "Choose a provider." };
  const reasonProblem = checkReason(input.reason);
  if (reasonProblem) return { ok: false, message: reasonProblem };
  const keyProblem = checkProviderKey(input.apiKey);
  if (keyProblem) return { ok: false, message: keyProblem };

  if (demoMode() || !isSecretStorageConfigured()) {
    return { ok: false, message: STORAGE_OFF };
  }

  const apiKey = input.apiKey.trim();
  try {
    const repo = await repoFor(demoViewer);
    const snapshot = await repo.list();
    const row = snapshot.providers.find((candidate) => candidate.provider === input.provider);
    if (!row) {
      return {
        ok: false,
        message: "That provider is not in the table. Apply the pending migration first.",
      };
    }

    // One live call first. Nothing is stored when the provider refuses the key.
    const test = await testProviderKey(row, apiKey);
    if (!test.ok) {
      return { ok: false, message: `The provider rejected this key: ${test.error}` };
    }

    const encrypted = encryptProviderKey(input.provider, apiKey);
    if (!encrypted) return { ok: false, message: STORAGE_OFF };

    await repo.setKey({
      provider: input.provider,
      ciphertext: encrypted.ciphertext,
      iv: encrypted.iv,
      tag: encrypted.tag,
      keyVersion: encrypted.keyVersion,
      hint: keyHint(apiKey),
      reason: input.reason.trim(),
    });
    revalidateProviders();
    return {
      ok: true,
      message: `Key saved and tested in ${test.latencyMs} ms. Only the last four characters are kept for display.`,
    };
  } catch (error) {
    return { ok: false, message: mapError(error) };
  }
}

export async function clearAiProviderKeyAction(
  demoViewer: WorkspaceRole,
  provider: AiProviderId,
  reason: string,
): Promise<ActionResult> {
  const refusal = await ownerRefusal(demoViewer);
  if (refusal) return { ok: false, message: refusal };

  if (!isAiProviderId(provider)) return { ok: false, message: "Choose a provider." };
  if (reason.trim().length < MIN_REASON) {
    return {
      ok: false,
      message: `Give a reason of at least ${MIN_REASON} characters. It is recorded in the audit log.`,
    };
  }

  try {
    const repo = await repoFor(demoViewer);
    await repo.clearKey(provider, reason.trim());
    revalidateProviders();
    return { ok: true, message: "Stored key removed. The environment variable is used instead." };
  } catch (error) {
    return { ok: false, message: mapError(error) };
  }
}
