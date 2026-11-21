"use client";

import { KeyRound, Loader2, Save, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { type FormEvent, useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label, Select } from "@/components/ui/field";
import {
  type AiProviderId,
  type AiProviderView,
  REASONING_EFFORTS,
  type ReasoningEffort,
  type SaveProviderInput,
  type SetProviderKeyInput,
} from "@/lib/ai/providers";
import { checkReason, MIN_REASON } from "@/lib/ai/rules";

type ActionMessage = { ok: true; message: string } | { ok: false; message: string };

export type AiProviderActions = {
  save: (input: SaveProviderInput) => Promise<ActionMessage>;
  saveKey: (input: SetProviderKeyInput) => Promise<ActionMessage>;
  clearKey: (provider: AiProviderId, reason: string) => Promise<ActionMessage>;
};

type Props = {
  providers: AiProviderView[];
  storageConfigured: boolean;
  demo: boolean;
  actions: AiProviderActions;
};

const EFFORT_LABEL: Record<ReasoningEffort, string> = {
  none: "None",
  low: "Low",
  medium: "Medium",
  high: "High",
};

const INTRO =
  "Teeo tries providers in priority order and falls back on any failure. Keys are encrypted with AES-256-GCM; only the last four characters are ever shown. Without a stored key, the environment variable named on each card is used, and a provider with neither is skipped.";

function KeyBadge({ provider }: { provider: AiProviderView }) {
  if (provider.keySource === "stored") {
    return <Badge tone="success">Stored key ••••{provider.keyHint ?? "****"}</Badge>;
  }
  if (provider.keySource === "env") return <Badge tone="info">Key from environment</Badge>;
  return <Badge tone="warning">No key</Badge>;
}

function ProviderCard({
  provider,
  storageConfigured,
  demo,
  actions,
}: {
  provider: AiProviderView;
  storageConfigured: boolean;
  demo: boolean;
  actions: AiProviderActions;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [model, setModel] = useState(provider.model);
  const [priority, setPriority] = useState(String(provider.priority));
  const [apiKeyEnv, setApiKeyEnv] = useState(provider.apiKeyEnv);
  const [reasoningEffort, setReasoningEffort] = useState<ReasoningEffort>(provider.reasoningEffort);
  const [baseUrl, setBaseUrl] = useState(provider.baseUrl ?? "");
  const [enabled, setEnabled] = useState(provider.enabled);
  const [reason, setReason] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [keyError, setKeyError] = useState<string | null>(null);
  const [keyNotice, setKeyNotice] = useState<string | null>(null);

  const id = provider.provider;
  const reasonProblem = checkReason(reason);

  const submitSettings = (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setKeyError(null);
    setKeyNotice(null);

    if (reasonProblem) {
      setError(reasonProblem);
      return;
    }

    startTransition(async () => {
      const result = await actions.save({
        provider: id,
        model,
        priority: Number(priority),
        enabled,
        reasoningEffort,
        baseUrl: provider.baseUrl === null && baseUrl.trim() === "" ? null : baseUrl,
        apiKeyEnv,
        reason,
      });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setReason("");
      setNotice(result.message);
      router.refresh();
    });
  };

  const saveKey = () => {
    setError(null);
    setNotice(null);
    setKeyError(null);
    setKeyNotice(null);

    if (reasonProblem) {
      setKeyError(reasonProblem);
      return;
    }
    if (apiKey.trim().length === 0) {
      setKeyError("Paste the provider key first.");
      return;
    }

    startTransition(async () => {
      const result = await actions.saveKey({ provider: id, apiKey, reason });
      if (!result.ok) {
        setKeyError(result.message);
        return;
      }
      setApiKey("");
      setReason("");
      setKeyNotice(result.message);
      router.refresh();
    });
  };

  const clearKey = () => {
    setError(null);
    setNotice(null);
    setKeyError(null);
    setKeyNotice(null);

    if (reasonProblem) {
      setKeyError(reasonProblem);
      return;
    }

    startTransition(async () => {
      const result = await actions.clearKey(id, reason);
      if (!result.ok) {
        setKeyError(result.message);
        return;
      }
      setReason("");
      setKeyNotice(result.message);
      router.refresh();
    });
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <CardTitle>{provider.label}</CardTitle>
            <p className="text-sm text-ink-muted">
              {id} · updated {provider.updatedLabel}
            </p>
          </div>
          <KeyBadge provider={provider} />
        </div>
      </CardHeader>

      <CardBody className="flex flex-col gap-4">
        <form onSubmit={submitSettings} className="flex flex-col gap-4" aria-busy={pending}>
          <fieldset className="grid gap-3 sm:grid-cols-2">
            <legend className="sr-only">{provider.label} settings</legend>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${id}-model`}>Model</Label>
              <Input
                id={`${id}-model`}
                name="model"
                value={model}
                onChange={(event) => setModel(event.currentTarget.value)}
                maxLength={100}
                autoComplete="off"
                disabled={pending}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${id}-priority`}>Priority (lower runs first)</Label>
              <Input
                id={`${id}-priority`}
                name="priority"
                type="number"
                min={0}
                max={1000}
                step={1}
                value={priority}
                onChange={(event) => setPriority(event.currentTarget.value)}
                disabled={pending}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${id}-env`}>API key env var (name only)</Label>
              <Input
                id={`${id}-env`}
                name="apiKeyEnv"
                value={apiKeyEnv}
                onChange={(event) => setApiKeyEnv(event.currentTarget.value)}
                placeholder={provider.apiKeyEnv}
                autoComplete="off"
                spellCheck={false}
                aria-describedby={`${id}-env-hint`}
                disabled={pending}
              />
              <p id={`${id}-env-hint`} className="hint">
                Used only when no key is stored here.
              </p>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${id}-effort`}>Reasoning effort</Label>
              <Select
                id={`${id}-effort`}
                name="reasoningEffort"
                value={reasoningEffort}
                onChange={(event) =>
                  setReasoningEffort(event.currentTarget.value as ReasoningEffort)
                }
                disabled={pending}
              >
                {REASONING_EFFORTS.map((effort) => (
                  <option key={effort} value={effort}>
                    {EFFORT_LABEL[effort]}
                  </option>
                ))}
              </Select>
            </div>

            {id === "openai_compat" ? (
              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <Label htmlFor={`${id}-base-url`}>Base URL (OpenAI-compatible only)</Label>
                <Input
                  id={`${id}-base-url`}
                  name="baseUrl"
                  type="url"
                  value={baseUrl}
                  onChange={(event) => setBaseUrl(event.currentTarget.value)}
                  placeholder="https://api.example.com/v1"
                  autoComplete="off"
                  spellCheck={false}
                  aria-describedby={`${id}-base-url-hint`}
                  disabled={pending}
                />
                <p id={`${id}-base-url-hint`} className="hint">
                  https only. A local or private address is refused.
                </p>
              </div>
            ) : null}
          </fieldset>

          <label className="flex min-h-11 items-center gap-3 text-sm font-medium text-ink">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(event) => setEnabled(event.currentTarget.checked)}
              className="size-5 accent-[var(--color-primary)]"
              disabled={pending}
            />
            Enabled in the fallback chain
          </label>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${id}-reason`}>Reason (required)</Label>
            <Input
              id={`${id}-reason`}
              name="reason"
              value={reason}
              onChange={(event) => setReason(event.currentTarget.value)}
              minLength={MIN_REASON}
              autoComplete="off"
              aria-describedby={`${id}-reason-hint`}
              disabled={pending}
            />
            <p id={`${id}-reason-hint`} className="hint">
              Recorded in the audit log. At least {MIN_REASON} characters.
            </p>
          </div>

          {error ? (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          ) : null}
          {notice ? (
            <p role="status" className="text-sm text-success">
              {notice}
            </p>
          ) : null}

          <div>
            <Button type="submit" variant="primary" disabled={pending}>
              {pending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <Save className="size-4" aria-hidden="true" />
              )}
              Save
            </Button>
          </div>
        </form>

        <fieldset className="flex flex-col gap-3 rounded-md border border-line bg-surface-sunken p-3">
          <legend className="px-1 text-[13px] font-semibold text-ink">API key</legend>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <KeyBadge provider={provider} />
            <p className="text-xs text-ink-muted">
              {provider.keySource === "stored"
                ? `Last changed ${provider.updatedLabel}. Only the last four characters are kept for display.`
                : provider.keySource === "env"
                  ? `Read from ${provider.apiKeyEnv} in the golf app's environment at call time.`
                  : "Teeo skips this provider until a key is available."}
            </p>
          </div>

          {!storageConfigured ? (
            <p className="text-sm text-warning">
              {demo
                ? "Key storage is off in demo mode. Nothing is saved."
                : "Key storage is off until AI_SECRET_KEY is set on this project."}
            </p>
          ) : null}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${id}-key`}>Paste the provider key</Label>
            <Input
              id={`${id}-key`}
              name="apiKey"
              type="password"
              value={apiKey}
              onChange={(event) => setApiKey(event.currentTarget.value)}
              autoComplete="new-password"
              spellCheck={false}
              aria-describedby={`${id}-key-hint`}
              disabled={pending || !storageConfigured}
            />
            <p id={`${id}-key-hint`} className="hint">
              Tested with one tiny live call before it is stored.
            </p>
          </div>

          {keyError ? (
            <p role="alert" className="text-sm text-danger">
              {keyError}
            </p>
          ) : null}
          {keyNotice ? (
            <p role="status" className="text-sm text-success">
              {keyNotice}
            </p>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="primary"
              onClick={saveKey}
              disabled={pending || !storageConfigured || apiKey.trim().length === 0}
            >
              {pending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <KeyRound className="size-4" aria-hidden="true" />
              )}
              Save key
            </Button>
            {provider.keySource === "stored" ? (
              <Button type="button" variant="secondary" onClick={clearKey} disabled={pending}>
                <Trash2 className="size-4" aria-hidden="true" />
                Remove stored key
              </Button>
            ) : null}
          </div>
        </fieldset>
      </CardBody>
    </Card>
  );
}

export function AiProvidersSettings({ providers, storageConfigured, demo, actions }: Props) {
  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Teeo provider chain</CardTitle>
          <p className="text-sm text-ink-muted">{INTRO}</p>
        </CardHeader>
      </Card>

      {providers.length === 0 ? (
        <Card>
          <CardBody>
            <p className="text-sm text-ink-muted">
              No providers are configured. Apply the pending migration and reload this page.
            </p>
          </CardBody>
        </Card>
      ) : (
        providers.map((provider) => (
          <ProviderCard
            key={provider.provider}
            provider={provider}
            storageConfigured={storageConfigured}
            demo={demo}
            actions={actions}
          />
        ))
      )}
    </div>
  );
}
