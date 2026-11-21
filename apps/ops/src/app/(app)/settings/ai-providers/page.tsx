import { KeyRound } from "lucide-react";
import type { Metadata } from "next";
import {
  type AiProviderActions,
  AiProvidersSettings,
} from "@/components/settings/ai-providers-settings";
import { DemoBanner } from "@/components/settings/demo-banner";
import { Card, CardBody, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import {
  AI_PROVIDERS,
  type AiAuditAction,
  type AiKeySource,
  type AiProviderAuditView,
  type AiProviderId,
  type AiProviderSettingsRow,
  type AiProviderView,
  actorLabel,
  formatWhen,
  providerMeta,
} from "@/lib/ai/providers";
import { aiProviderRepo } from "@/lib/ai/repo";
import { isSecretStorageConfigured } from "@/lib/ai/secrets";
import { demoMode } from "@/lib/flags";
import { roleLabel } from "@/lib/members/format";
import { parseDemoViewer, settingsMembersRepo } from "@/lib/members/viewer";
import { clearAiProviderKeyAction, saveAiProviderAction, saveAiProviderKeyAction } from "./actions";

export const metadata: Metadata = { title: "AI providers" };

const ACTION_LABEL: Record<AiAuditAction, string> = {
  save: "Settings saved",
  set_key: "Key saved",
  clear_key: "Key removed",
};

function keySource(row: AiProviderSettingsRow): AiKeySource {
  if (row.has_stored_key) return "stored";
  // The golf app reads this variable from its own deployment. The workspace cannot see that
  // project's environment, so the badge names the mechanism rather than claiming the value is set.
  return row.api_key_env.trim() !== "" ? "env" : "none";
}

function viewFromRow(row: AiProviderSettingsRow): AiProviderView {
  return {
    provider: row.provider,
    label: providerMeta(row.provider).label,
    model: row.model,
    priority: row.priority,
    enabled: row.enabled,
    reasoningEffort: row.reasoning_effort,
    baseUrl: row.base_url,
    apiKeyEnv: row.api_key_env || providerMeta(row.provider).defaultApiKeyEnv,
    keySource: keySource(row),
    keyHint: row.key_hint,
    keyVersion: row.key_version,
    updatedLabel: formatWhen(row.updated_at),
  };
}

const KNOWN_PROVIDERS = new Set<AiProviderId>(AI_PROVIDERS.map((meta) => meta.id));

export default async function AiProvidersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const demoViewer = parseDemoViewer(params.as);
  const members = await settingsMembersRepo(demoViewer);
  const me = await members.getMe();
  const demo = demoMode();

  if (me === null) {
    return (
      <EmptyState icon={KeyRound} title="No member record">
        Your account is not on the workspace member list. Ask an owner to add you.
      </EmptyState>
    );
  }

  if (me.role !== "owner" || me.status !== "active") {
    return (
      <Card>
        <CardHeader>
          <CardTitle>AI providers</CardTitle>
          <CardDescription>
            Only a workspace owner can manage AI providers. Ask an owner if a provider key needs to
            change.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  let providers: AiProviderView[] = [];
  let audit: AiProviderAuditView[] = [];
  let unavailable = false;

  try {
    const repo = await aiProviderRepo(demoViewer);
    const snapshot = await repo.list();
    providers = snapshot.providers
      .filter((row) => KNOWN_PROVIDERS.has(row.provider))
      .map(viewFromRow)
      .sort(
        (left, right) =>
          left.priority - right.priority || left.provider.localeCompare(right.provider),
      );
    audit = snapshot.audit.map((row) => ({
      id: row.id,
      provider: row.provider,
      action: row.action,
      reason: row.reason,
      actorLabel: actorLabel(row.actor),
      atLabel: formatWhen(row.at),
    }));
  } catch {
    unavailable = true;
  }

  const storageConfigured = !demo && isSecretStorageConfigured();
  const actions: AiProviderActions = {
    save: saveAiProviderAction.bind(null, demoViewer),
    saveKey: saveAiProviderKeyAction.bind(null, demoViewer),
    clearKey: clearAiProviderKeyAction.bind(null, demoViewer),
  };

  return (
    <div className="flex flex-col gap-4">
      {demo ? <DemoBanner viewer={`${me.displayName} (${roleLabel(me.role)})`} /> : null}

      {unavailable ? (
        <Card>
          <CardHeader>
            <CardTitle>AI providers are not available yet</CardTitle>
            <CardDescription>
              The AI provider table could not be read. Apply the pending migration from
              docs/ai-providers/apply-on-live.sql, then reload this page.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <AiProvidersSettings
          providers={providers}
          storageConfigured={storageConfigured}
          demo={demo}
          actions={actions}
        />
      )}

      {unavailable ? null : (
        <Card>
          <CardHeader>
            <CardTitle>Recent changes</CardTitle>
            <CardDescription>
              The last 20 recorded changes. A reason is kept with each one; no key is ever written
              here.
            </CardDescription>
          </CardHeader>
          <CardBody>
            {audit.length === 0 ? (
              <p className="hint">No changes yet.</p>
            ) : (
              <ol className="flex flex-col divide-y divide-line">
                {audit.map((entry) => (
                  <li key={entry.id} className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className="text-sm font-semibold text-ink">
                        {ACTION_LABEL[entry.action]} · {providerMeta(entry.provider).label}
                      </p>
                      <p className="tnum text-xs text-ink-muted">{entry.atLabel}</p>
                    </div>
                    <p className="text-sm text-ink-muted">{entry.reason}</p>
                    <p className="text-xs text-ink-muted">{entry.actorLabel}</p>
                  </li>
                ))}
              </ol>
            )}
          </CardBody>
        </Card>
      )}
    </div>
  );
}
