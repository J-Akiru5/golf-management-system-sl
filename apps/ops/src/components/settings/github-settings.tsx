"use client";

import { useActionState, useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label, Select } from "@/components/ui/field";
import { directionLabel, formatWhen, outcomeLabel, outcomeTone } from "@/lib/github/format";
import type { GithubConnection, GithubSyncLogRow, GithubUserMapRow } from "@/lib/github/types";
import type { TaskMember } from "@/lib/tasks/types";

/**
 * The owner's GitHub section on Settings.
 *
 * It reports whether the token and the webhook secret are present (never their values), lets the
 * owner say which GitHub login belongs to which member, starts the first import, and shows what the
 * sync did recently. Everything it changes goes through a server action that checks the owner again.
 */

export type GithubActionResult = { ok: true; message: string } | { ok: false; message: string };

export type GithubSettingsActions = {
  importIssues: () => Promise<GithubActionResult>;
  saveMapping: (state: GithubActionResult, formData: FormData) => Promise<GithubActionResult>;
  removeMapping: (login: string) => Promise<GithubActionResult>;
};

const INITIAL: GithubActionResult = { ok: true, message: "" };

function Present({ value }: { value: boolean }) {
  return <Badge tone={value ? "success" : "warning"}>{value ? "Present" : "Missing"}</Badge>;
}

export function GithubSettings({
  connection,
  mappings,
  log,
  members,
  unavailable,
  actions,
}: {
  connection: GithubConnection;
  mappings: ReadonlyArray<GithubUserMapRow>;
  log: ReadonlyArray<GithubSyncLogRow>;
  members: ReadonlyArray<TaskMember>;
  /** A sentence when the sync tables could not be read, else null. */
  unavailable: string | null;
  actions: GithubSettingsActions;
}) {
  const [state, formAction, saving] = useActionState(actions.saveMapping, INITIAL);
  const [importMessage, setImportMessage] = useState<GithubActionResult | null>(null);
  const [removeMessage, setRemoveMessage] = useState<GithubActionResult | null>(null);
  const [importing, startImport] = useTransition();
  const [removing, startRemove] = useTransition();

  function runImport() {
    setImportMessage(null);
    startImport(async () => {
      setImportMessage(await actions.importIssues());
    });
  }

  function remove(login: string) {
    setRemoveMessage(null);
    startRemove(async () => {
      setRemoveMessage(await actions.removeMapping(login));
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>GitHub</CardTitle>
        <CardDescription>
          Issues from the development repository appear on the Tasks board. A title, status or
          assignee changed here is written back to the issue, and a change there comes back to the
          task. Labels and the milestone are edited on GitHub.
        </CardDescription>
      </CardHeader>

      <CardBody className="flex flex-col gap-5">
        {unavailable ? (
          <p role="status" className="text-sm text-warning">
            {unavailable}
          </p>
        ) : null}

        <dl className="grid gap-3 sm:grid-cols-3">
          <div>
            <dt className="overline">Token</dt>
            <dd className="mt-1 flex flex-wrap items-center gap-2">
              <Present value={connection.token} />
              <span className="text-[13px] text-ink-muted">GITHUB_TOKEN</span>
            </dd>
          </div>
          <div>
            <dt className="overline">Webhook secret</dt>
            <dd className="mt-1 flex flex-wrap items-center gap-2">
              <Present value={connection.webhookSecret} />
              <span className="text-[13px] text-ink-muted">GITHUB_WEBHOOK_SECRET</span>
            </dd>
          </div>
          <div>
            <dt className="overline">Repository</dt>
            <dd className="mt-1 break-all text-[13px] text-ink">{connection.repository}</dd>
          </div>
        </dl>

        {connection.ready ? null : (
          <p className="hint">
            Set {connection.missing.join(" and ")} on this deployment, then redeploy. Until then
            nothing is sent to GitHub and no issue is accepted, and the rest of the workspace works
            as usual. The webhook URL is this site plus /api/github/webhook, and it takes Issues
            events.
          </p>
        )}

        <div className="flex flex-col gap-2">
          <p className="overline">First load</p>
          <p className="hint">
            Import every open issue once. After that the webhook keeps the board current. Running it
            again only picks up what is missing.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="secondary"
              onClick={runImport}
              disabled={importing || !connection.ready || unavailable !== null}
            >
              {importing ? "Importing..." : "Import open issues now"}
            </Button>
            {importMessage === null ? null : (
              <p
                role="status"
                className={importMessage.ok ? "text-sm text-ink-muted" : "text-sm text-danger"}
              >
                {importMessage.message}
              </p>
            )}
          </div>
        </div>

        <fieldset className="flex flex-col gap-3 border-t border-line pt-4">
          <legend className="text-sm font-semibold text-ink">Who is who on GitHub</legend>
          <p className="hint">
            An issue assigned to one of these logins is assigned to that member here, and an
            assignee changed here is written to the issue as that login. Karl and Lou work in
            GitHub; map their logins so work crosses over.
          </p>

          <form action={formAction} className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex flex-1 flex-col gap-1.5">
              <Label htmlFor="github-login">GitHub login</Label>
              <Input
                id="github-login"
                name="login"
                required
                maxLength={39}
                autoComplete="off"
                spellCheck={false}
                placeholder="dev-lou"
                disabled={saving}
              />
            </div>
            <div className="flex flex-1 flex-col gap-1.5">
              <Label htmlFor="github-member">Workspace member</Label>
              <Select id="github-member" name="memberId" required disabled={saving}>
                <option value="">Choose a member</option>
                {members.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.displayName}
                  </option>
                ))}
              </Select>
            </div>
            <Button type="submit" variant="secondary" disabled={saving}>
              {saving ? "Saving..." : "Save mapping"}
            </Button>
          </form>

          {state.message ? (
            <p role="status" className={state.ok ? "hint" : "text-sm text-danger"}>
              {state.message}
            </p>
          ) : null}

          {mappings.length === 0 ? (
            <p className="hint">No login is mapped yet.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-line">
              {mappings.map((mapping) => (
                <li
                  key={mapping.login}
                  className="flex flex-wrap items-center justify-between gap-2 py-2.5"
                >
                  <span className="text-sm text-ink">
                    <span className="font-semibold">{mapping.login}</span>
                    <span className="text-ink-muted"> is </span>
                    <span className="font-semibold">{mapping.memberName}</span>
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => remove(mapping.login)}
                    disabled={removing}
                    aria-label={`Remove the mapping for ${mapping.login}`}
                  >
                    Remove
                  </Button>
                </li>
              ))}
            </ul>
          )}

          {removeMessage === null ? null : (
            <p role="status" className={removeMessage.ok ? "hint" : "text-sm text-danger"}>
              {removeMessage.message}
            </p>
          )}
        </fieldset>

        <div className="flex flex-col gap-2 border-t border-line pt-4">
          <h3 className="text-sm font-semibold text-ink">Recent changes</h3>
          <p className="hint">
            The last 20 sync attempts. No token, secret or issue body is recorded here.
          </p>
          {log.length === 0 ? (
            <p className="hint">Nothing has synced yet.</p>
          ) : (
            <ol className="flex flex-col divide-y divide-line">
              {log.map((entry) => (
                <li key={entry.id} className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="flex flex-wrap items-center gap-2 text-sm text-ink">
                      <Badge tone={outcomeTone(entry.outcome)}>{outcomeLabel(entry.outcome)}</Badge>
                      <span className="font-semibold">{directionLabel(entry.direction)}</span>
                      {entry.issueNumber === null ? null : (
                        <span className="tnum text-ink-muted">#{entry.issueNumber}</span>
                      )}
                    </p>
                    <p className="tnum text-xs text-ink-muted">{formatWhen(entry.createdAt)}</p>
                  </div>
                  {entry.detail === null ? null : (
                    <p className="text-[13px] text-ink-muted">{entry.detail}</p>
                  )}
                </li>
              ))}
            </ol>
          )}
        </div>
      </CardBody>
    </Card>
  );
}
