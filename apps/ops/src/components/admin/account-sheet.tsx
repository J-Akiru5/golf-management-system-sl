"use client";

import { History, KeyRound, LogOut, ShieldCheck, ShieldOff } from "lucide-react";
import { type ReactNode, useState, useTransition } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Input, Label, Select } from "@/components/ui/field";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import {
  ACCESS_LEVEL_LABEL,
  type AccessLevel,
  effectiveAccess,
  isAccessLevel,
  ROLE_DEFAULTS,
  type WorkspacePage,
  workspacePages,
} from "@/lib/access/pages";
import type { UserPermission } from "@/lib/access/types";
import { deskSummary, formatDate, relativeTime } from "@/lib/admin/format";
import {
  accountStatus,
  accountStatusLabel,
  accountStatusTone,
  appsForAccount,
  cleanReason,
  DESK_ROLE_OPTIONS,
  isInactive,
  reasonProblem,
} from "@/lib/admin/rules";
import {
  parsePreviousAccess,
  previousAccessIsEmpty,
  previousAccessLines,
} from "@/lib/admin/snapshot";
import type {
  AdminActionResult,
  AdminActions,
  AdminClub,
  DeskRoleInput,
  GodAccount,
  GodApp,
  GodAuditEntry,
  WorkspaceRoleInput,
} from "@/lib/admin/types";
import { GOD_APPS } from "@/lib/admin/types";
import type { WorkspaceRole } from "@/lib/db/types";
import { ResultBanner } from "./result-banner";

const WORKSPACE_OPTIONS: ReadonlyArray<{ id: WorkspaceRoleInput; label: string }> = [
  { id: "owner", label: "Owner" },
  { id: "partner", label: "Partner" },
  { id: "member", label: "Member" },
  { id: "none", label: "No workspace access" },
];

const APP_LABELS: Record<GodApp, string> = {
  workspace: "Workspace",
  desk: "Golf desk",
  tabulator: "Tabulator",
};

function clubOptions(account: GodAccount, clubs: ReadonlyArray<AdminClub>): AdminClub[] {
  const byId = new Map<string, AdminClub>();
  for (const club of clubs) byId.set(club.id, club);
  for (const desk of account.deskRoles) {
    if (!byId.has(desk.clubId)) byId.set(desk.clubId, { id: desk.clubId, name: desk.clubName });
  }
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function roleTone(role: string): "gold" | "info" | "neutral" {
  if (role === "owner") return "gold";
  if (role === "partner" || role === "organizer") return "info";
  return "neutral";
}

/**
 * The full picture for one account, and every action on it. Destructive actions confirm in a
 * dialog that names the person and the effect; nothing happens on a single stray click.
 */
export function AccountSheet({
  account,
  clubs,
  audit,
  overrides,
  permissionsReady,
  nowIso,
  viewerId,
  canUseServiceRole,
  actions,
  onClose,
}: {
  account: GodAccount;
  clubs: ReadonlyArray<AdminClub>;
  audit: ReadonlyArray<GodAuditEntry>;
  overrides: ReadonlyArray<UserPermission>;
  permissionsReady: boolean;
  nowIso: string;
  viewerId: string;
  canUseServiceRole: boolean;
  actions: AdminActions;
  onClose: () => void;
}) {
  const status = accountStatus(account);
  const personAudit = audit.filter((entry) => entry.targetId === account.userId);
  const suspendEntry = personAudit.find((entry) => entry.action === "suspend");
  const previous = suspendEntry ? parsePreviousAccess(suspendEntry.details.previous) : null;

  const options = clubOptions(account, clubs);
  const initialClub = account.deskRoles[0]?.clubId ?? options[0]?.id ?? "";
  const [workspaceRole, setWorkspaceRole] = useState<WorkspaceRoleInput>(
    account.workspaceRole ?? "none",
  );
  const [deskClub, setDeskClub] = useState<string>(initialClub);
  const [deskRole, setDeskRole] = useState<DeskRoleInput>(
    account.deskRoles.find((desk) => desk.clubId === initialClub)?.role ?? "none",
  );
  const [reason, setReason] = useState("");
  const [result, setResult] = useState<AdminActionResult | null>(null);
  const [pending, startTransition] = useTransition();

  // The Access section: one row per page, the stored override, and the level being edited.
  const pages = workspacePages();
  const storedOverrides = new Map(
    overrides
      .filter((entry) => entry.userId === account.userId)
      .map((entry) => [entry.page, entry.level]),
  );
  const [savedOverrides, setSavedOverrides] = useState<Map<string, AccessLevel>>(
    () => new Map(storedOverrides),
  );
  const [accessDraft, setAccessDraft] = useState<Record<string, AccessLevel | "">>(() => {
    const draft: Record<string, AccessLevel | ""> = {};
    for (const page of pages) draft[page.id] = storedOverrides.get(page.id) ?? "";
    return draft;
  });
  const [accessResult, setAccessResult] = useState<AdminActionResult | null>(null);
  const [accessPending, setAccessPending] = useState(false);

  const overrideMap: Record<string, AccessLevel> = {};
  for (const [page, level] of savedOverrides) overrideMap[page] = level;

  const isOwner = account.workspaceRole === "owner";
  const canOverride =
    permissionsReady &&
    account.workspaceRole !== null &&
    account.workspaceStatus === "active" &&
    !isOwner;

  const accessChanges = pages.filter(
    (page) => (accessDraft[page.id] ?? "") !== (savedOverrides.get(page.id) ?? ""),
  );

  function run(call: () => Promise<AdminActionResult>): void {
    setResult(null);
    startTransition(async () => {
      setResult(await call());
    });
  }

  function requireReason(): boolean {
    const problem = reasonProblem(reason);
    if (problem) {
      setResult({ ok: false, message: problem });
      return false;
    }
    return true;
  }

  function changeDeskClub(clubId: string): void {
    setDeskClub(clubId);
    setDeskRole(account.deskRoles.find((desk) => desk.clubId === clubId)?.role ?? "none");
  }

  async function saveAccess(): Promise<void> {
    const problem = reasonProblem(reason);
    if (problem) {
      setAccessResult({ ok: false, message: problem });
      return;
    }
    if (accessChanges.length === 0) {
      setAccessResult({ ok: false, message: "Nothing has changed yet." });
      return;
    }

    setAccessPending(true);
    setAccessResult(null);

    const next = new Map(savedOverrides);
    const failures: string[] = [];
    let saved = 0;

    for (const page of accessChanges) {
      const draft = accessDraft[page.id] ?? "";
      try {
        const outcome = await actions.setUserPermission(
          account.userId,
          page.id,
          draft === "" ? null : draft,
          reason,
        );
        if (outcome.ok) {
          saved += 1;
          if (draft === "") next.delete(page.id);
          else next.set(page.id, draft);
        } else {
          failures.push(`${page.label}: ${outcome.message}`);
        }
      } catch {
        failures.push(`${page.label}: something went wrong.`);
      }
    }

    setSavedOverrides(next);
    setAccessPending(false);
    setAccessResult(
      failures.length === 0
        ? { ok: true, message: saved === 1 ? "Access saved." : `${saved} pages saved.` }
        : {
            ok: false,
            message:
              saved === 0
                ? failures.join(" ")
                : `Saved ${saved}, but some pages were refused. ${failures.join(" ")}`,
          },
    );
  }

  function resetAccessDraft(): void {
    const draft: Record<string, AccessLevel | ""> = {};
    for (const page of pages) draft[page.id] = savedOverrides.get(page.id) ?? "";
    setAccessDraft(draft);
    setAccessResult(null);
  }

  return (
    <Sheet open onOpenChange={(open) => (open ? undefined : onClose())}>
      <SheetContent
        title={account.displayName}
        description={account.email ?? "No email on this account"}
      >
        <div className="flex flex-col gap-5">
          <div className="flex items-start gap-3">
            <Avatar id={account.userId} name={account.displayName} size="lg" />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={accountStatusTone(status)}>{accountStatusLabel(status)}</Badge>
                {account.userId === viewerId ? <Badge tone="neutral">You</Badge> : null}
                {isInactive(account, nowIso) ? (
                  <Badge tone="warning">Inactive 30+ days</Badge>
                ) : null}
              </div>
              <p className="mt-1 break-all text-sm text-ink-muted">
                {account.email ?? "No email address"}
              </p>
            </div>
          </div>

          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <div>
              <dt className="overline">Created</dt>
              <dd className="text-ink">{formatDate(account.accountCreatedAt)}</dd>
            </div>
            <div>
              <dt className="overline">Last sign-in</dt>
              <dd className="text-ink">{relativeTime(account.lastSignInAt, nowIso)}</dd>
            </div>
            <div>
              <dt className="overline">Last active</dt>
              <dd className="text-ink">{relativeTime(account.lastActiveAt, nowIso)}</dd>
            </div>
            <div>
              <dt className="overline">Linked player</dt>
              <dd className="text-ink">{account.playerName ?? "None"}</dd>
            </div>
          </dl>

          {account.suspended ? (
            <div className="rounded-md border border-danger bg-danger-soft p-3 text-sm">
              <p className="font-semibold text-ink">Suspended</p>
              <p className="mt-1 text-ink">
                {relativeTime(account.suspendedAt, nowIso)}
                {account.suspendedReason ? `: ${account.suspendedReason}` : ""}
              </p>
              {previous ? (
                <div className="mt-2">
                  <p className="overline">A restore puts back</p>
                  <ul className="mt-1 list-disc pl-5 text-[13px] text-ink">
                    {previousAccessLines(previous).map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                  {previousAccessIsEmpty(previous) ? (
                    <p className="mt-1 text-[13px] text-ink-muted">
                      Nothing was recorded, so a restore only clears the suspension.
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}

          <section className="flex flex-col gap-2">
            <h3 className="font-display text-base font-bold">Workspace</h3>
            <div className="flex flex-wrap items-end gap-2">
              <div className="flex min-w-40 flex-col gap-1.5">
                <Label htmlFor="god-workspace-role">Role</Label>
                <Select
                  id="god-workspace-role"
                  value={workspaceRole}
                  disabled={pending}
                  onChange={(event) =>
                    setWorkspaceRole(event.currentTarget.value as WorkspaceRoleInput)
                  }
                >
                  {WORKSPACE_OPTIONS.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </div>
              <Button
                variant="secondary"
                disabled={
                  pending ||
                  workspaceRole === (account.workspaceRole ?? "none") ||
                  (workspaceRole === "none" && account.workspaceRole !== null)
                }
                onClick={() =>
                  run(() => actions.setWorkspaceRole(account.userId, workspaceRole, reason))
                }
              >
                Save workspace role
              </Button>

              {workspaceRole === "none" && account.workspaceRole !== null ? (
                <ConfirmDialog
                  title={`Remove ${account.displayName}'s workspace access?`}
                  description="They lose the workspace apps. The account stays, and their desk and tabulator access is unchanged."
                  confirmLabel="Remove workspace access"
                  reasonRequired
                  pending={pending}
                  onConfirm={(why) => actions.setWorkspaceRole(account.userId, "none", why)}
                  onResult={setResult}
                >
                  <Button variant="danger" disabled={pending}>
                    Remove workspace access
                  </Button>
                </ConfirmDialog>
              ) : null}
            </div>
          </section>

          <section className="flex flex-col gap-2">
            <h3 className="font-display text-base font-bold">Access to pages</h3>
            <p className="hint">
              A page with No access is hidden from their menu and refused if they open its address.
              A change here uses the Reason box below.
            </p>

            {isOwner ? (
              <p className="rounded-md border border-line bg-surface-sunken px-3 py-2 text-[13px] text-ink">
                An owner has Edit on every page, and the owner cannot be lowered.
              </p>
            ) : account.workspaceRole === null ? (
              <p className="rounded-md border border-line bg-surface-sunken px-3 py-2 text-[13px] text-ink">
                This account is not a workspace member, so every page is hidden. Set a workspace
                role first.
              </p>
            ) : account.workspaceStatus !== "active" ? (
              <p className="rounded-md border border-line bg-surface-sunken px-3 py-2 text-[13px] text-ink">
                This account is suspended, so every page is hidden. Reactivate it before setting a
                page.
              </p>
            ) : (
              <PageAccessSection
                role={account.workspaceRole}
                accountName={account.displayName}
                pages={pages}
                savedOverrides={savedOverrides}
                overrideMap={overrideMap}
                accessDraft={accessDraft}
                canOverride={canOverride}
                permissionsReady={permissionsReady}
                accessPending={accessPending}
                accessChanges={accessChanges}
                accessResult={accessResult}
                onDraft={(page, value) => {
                  setAccessDraft((previous) => ({ ...previous, [page]: value }));
                  setAccessResult(null);
                }}
                onSave={() => void saveAccess()}
                onReset={resetAccessDraft}
              />
            )}
          </section>

          <section className="flex flex-col gap-2">
            <h3 className="font-display text-base font-bold">Golf desk</h3>
            <p className="text-[13px] text-ink-muted">{deskSummary(account.deskRoles)}</p>
            <div className="flex flex-wrap items-end gap-2">
              <div className="flex min-w-40 flex-col gap-1.5">
                <Label htmlFor="god-desk-club">Club</Label>
                <Select
                  id="god-desk-club"
                  value={deskClub}
                  disabled={pending || options.length === 0}
                  onChange={(event) => changeDeskClub(event.currentTarget.value)}
                >
                  {options.map((club) => (
                    <option key={club.id} value={club.id}>
                      {club.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="flex min-w-36 flex-col gap-1.5">
                <Label htmlFor="god-desk-role">Role</Label>
                <Select
                  id="god-desk-role"
                  value={deskRole}
                  disabled={pending}
                  onChange={(event) => setDeskRole(event.currentTarget.value as DeskRoleInput)}
                >
                  {DESK_ROLE_OPTIONS.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                  <option value="none">No desk access</option>
                </Select>
              </div>
              <Button
                variant="secondary"
                disabled={
                  pending ||
                  deskClub === "" ||
                  (deskRole === "none" &&
                    account.deskRoles.some((desk) => desk.clubId === deskClub))
                }
                onClick={() =>
                  run(() => actions.setDeskRole(account.userId, deskClub, deskRole, reason))
                }
              >
                Save desk role
              </Button>

              {deskRole === "none" && account.deskRoles.some((desk) => desk.clubId === deskClub) ? (
                <ConfirmDialog
                  title={`Remove ${account.displayName}'s desk access?`}
                  description={`They lose the golf desk for ${
                    options.find((club) => club.id === deskClub)?.name ?? "this club"
                  }. Their other access is unchanged.`}
                  confirmLabel="Remove desk access"
                  reasonRequired
                  pending={pending}
                  onConfirm={(why) => actions.setDeskRole(account.userId, deskClub, "none", why)}
                  onResult={setResult}
                >
                  <Button variant="danger" disabled={pending}>
                    Remove desk access
                  </Button>
                </ConfirmDialog>
              ) : null}
            </div>
          </section>

          <section className="flex flex-col gap-2">
            <h3 className="font-display text-base font-bold">Tabulator</h3>
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={account.tabulator ? "info" : "neutral"}>
                {account.tabulator ? "Tabulation team" : "Not a tabulator"}
              </Badge>
              <Button
                variant="secondary"
                disabled={pending || !canUseServiceRole}
                onClick={() => {
                  if (account.tabulator && !requireReason()) return;
                  run(() => actions.setTabulator(account.userId, !account.tabulator, reason));
                }}
              >
                {account.tabulator ? "Remove tabulator access" : "Grant tabulator access"}
              </Button>
            </div>
            {!canUseServiceRole ? (
              <p className="hint">Needs the service-role key on this project.</p>
            ) : null}
          </section>

          <section className="flex flex-col gap-2">
            <h3 className="font-display text-base font-bold">Reason</h3>
            <Label htmlFor="god-reason">Why (required for a removal or a suspend)</Label>
            <Input
              id="god-reason"
              value={reason}
              onChange={(event) => setReason(event.currentTarget.value)}
              maxLength={200}
              placeholder="What happened, in a few words"
            />
          </section>

          <section className="flex flex-col gap-2">
            <h3 className="font-display text-base font-bold">Account actions</h3>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                disabled={pending || !account.email}
                onClick={() => run(() => actions.sendPasswordReset(account.userId, reason))}
              >
                <KeyRound aria-hidden="true" />
                Send password reset
              </Button>

              <ConfirmDialog
                title={`Sign ${account.displayName} out everywhere?`}
                description="Every session on every device ends. Their access does not change. They sign in again with their own password."
                confirmLabel="Sign out everywhere"
                pending={pending}
                onConfirm={(why) => actions.signOutEverywhere(account.userId, why)}
                onResult={setResult}
              >
                <Button variant="secondary" disabled={pending}>
                  <LogOut aria-hidden="true" />
                  Sign out everywhere
                </Button>
              </ConfirmDialog>

              {account.suspended ? (
                <Button
                  variant="primary"
                  disabled={pending}
                  onClick={() => run(() => actions.restore(account.userId, reason))}
                >
                  <ShieldCheck aria-hidden="true" />
                  Restore access
                </Button>
              ) : (
                <SuspendDialog
                  account={account}
                  pending={pending}
                  onResult={setResult}
                  onSuspend={(apps, why) => actions.suspend(account.userId, apps, why)}
                >
                  <Button variant="danger" disabled={pending}>
                    <ShieldOff aria-hidden="true" />
                    Suspend
                  </Button>
                </SuspendDialog>
              )}
            </div>
            <ResultBanner result={result} className="mt-1" />
          </section>

          <section className="flex flex-col gap-2">
            <h3 className="flex items-center gap-2 font-display text-base font-bold">
              <History className="size-4" aria-hidden="true" />
              This person's history
            </h3>
            {personAudit.length === 0 ? (
              <p className="hint">No actions recorded for this account yet.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {personAudit.slice(0, 10).map((entry) => (
                  <li key={entry.id} className="rounded-md border border-line p-2 text-[13px]">
                    <p className="font-semibold text-ink">{entry.action}</p>
                    <p className="text-ink-muted">
                      {relativeTime(entry.at, nowIso)} by {entry.actorEmail ?? "an owner"}
                    </p>
                    {entry.reason ? <p className="mt-1 text-ink">{entry.reason}</p> : null}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function SuspendDialog({
  account,
  pending,
  onResult,
  onSuspend,
  children,
}: {
  account: GodAccount;
  pending: boolean;
  onResult: (result: AdminActionResult) => void;
  onSuspend: (apps: GodApp[], reason: string) => Promise<AdminActionResult>;
  children: ReactNode;
}) {
  const current = appsForAccount(account);
  const initial = (current.length > 0 ? current : [...GOD_APPS]) as GodApp[];
  const [open, setOpen] = useState(false);
  const [apps, setApps] = useState<GodApp[]>(initial);
  const [reason, setReason] = useState("");
  const [result, setResult] = useState<AdminActionResult | null>(null);
  const [busy, startTransition] = useTransition();

  function toggle(app: GodApp, checked: boolean): void {
    setApps((previous) =>
      checked ? [...previous, app] : previous.filter((entry) => entry !== app),
    );
  }

  function submit(): void {
    const problem = reasonProblem(reason);
    if (problem) {
      setResult({ ok: false, message: problem });
      return;
    }
    if (apps.length === 0) {
      setResult({ ok: false, message: "Choose at least one app." });
      return;
    }

    setResult(null);
    startTransition(async () => {
      const outcome = await onSuspend(apps, cleanReason(reason) ?? "");
      setResult(outcome);
      onResult(outcome);
      if (outcome.ok) setOpen(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent
        title={`Suspend ${account.displayName}?`}
        description="This removes the chosen access, records what they had, and signs them out everywhere. No account or data is deleted."
      >
        <fieldset className="flex flex-col gap-2">
          <legend className="overline mb-1">Access to remove</legend>
          {GOD_APPS.map((app) => (
            <label key={app} className="flex min-h-11 items-center gap-3 text-sm">
              <input
                type="checkbox"
                className="size-5 accent-[var(--primary)]"
                checked={apps.includes(app)}
                onChange={(event) => toggle(app, event.currentTarget.checked)}
                disabled={busy || pending}
              />
              {APP_LABELS[app]}
            </label>
          ))}
        </fieldset>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="god-suspend-reason">Reason</Label>
          <Input
            id="god-suspend-reason"
            value={reason}
            onChange={(event) => setReason(event.currentTarget.value)}
            maxLength={200}
            placeholder="At least 5 characters"
            disabled={busy || pending}
          />
        </div>

        <ResultBanner result={result} />

        <div className="flex flex-wrap justify-end gap-2">
          <DialogClose asChild>
            <Button variant="secondary" disabled={busy || pending}>
              Cancel
            </Button>
          </DialogClose>
          <Button variant="danger" disabled={busy || pending || apps.length === 0} onClick={submit}>
            Suspend {account.displayName}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ConfirmDialog({
  title,
  description,
  confirmLabel,
  reasonRequired = false,
  pending,
  onConfirm,
  onResult,
  children,
}: {
  title: string;
  description: string;
  confirmLabel: string;
  reasonRequired?: boolean;
  pending: boolean;
  onConfirm: (reason: string) => Promise<AdminActionResult>;
  onResult: (result: AdminActionResult) => void;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [result, setResult] = useState<AdminActionResult | null>(null);
  const [busy, startTransition] = useTransition();

  function submit(): void {
    if (reasonRequired) {
      const problem = reasonProblem(reason);
      if (problem) {
        setResult({ ok: false, message: problem });
        return;
      }
    }
    setResult(null);
    startTransition(async () => {
      const outcome = await onConfirm(cleanReason(reason) ?? "");
      setResult(outcome);
      onResult(outcome);
      if (outcome.ok) setOpen(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent title={title} description={description}>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="god-confirm-reason">
            Reason {reasonRequired ? "(required)" : "(optional)"}
          </Label>
          <Input
            id="god-confirm-reason"
            value={reason}
            onChange={(event) => setReason(event.currentTarget.value)}
            maxLength={200}
            placeholder={reasonRequired ? "At least 5 characters" : ""}
            disabled={busy || pending}
          />
        </div>
        <ResultBanner result={result} />
        <div className="flex flex-wrap justify-end gap-2">
          <DialogClose asChild>
            <Button variant="secondary" disabled={busy || pending}>
              Cancel
            </Button>
          </DialogClose>
          <Button variant="danger" disabled={busy || pending} onClick={submit}>
            {confirmLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** The role badges a row shows in the table. Kept here so the table and the sheet agree. */
export function WorkspaceBadge({ role }: { role: WorkspaceRoleInput }) {
  return <Badge tone={roleTone(role)}>{role === "none" ? "none" : role}</Badge>;
}

/**
 * One person's override per page. The effective level is shown first, with its source, then the
 * control. Choosing the role default clears the override.
 */
function PageAccessSection({
  role,
  accountName,
  pages,
  savedOverrides,
  overrideMap,
  accessDraft,
  canOverride,
  permissionsReady,
  accessPending,
  accessChanges,
  accessResult,
  onDraft,
  onSave,
  onReset,
}: {
  role: WorkspaceRole;
  accountName: string;
  pages: ReadonlyArray<WorkspacePage>;
  savedOverrides: ReadonlyMap<string, AccessLevel>;
  overrideMap: Readonly<Record<string, AccessLevel>>;
  accessDraft: Readonly<Record<string, AccessLevel | "">>;
  canOverride: boolean;
  permissionsReady: boolean;
  accessPending: boolean;
  accessChanges: ReadonlyArray<WorkspacePage>;
  accessResult: AdminActionResult | null;
  onDraft: (page: string, value: AccessLevel | "") => void;
  onSave: () => void;
  onReset: () => void;
}) {
  return (
    <>
      {permissionsReady ? null : (
        <p className="hint">
          The permissions table has not been applied yet, so the role defaults are in use. Apply the
          migration to set an override.
        </p>
      )}

      <ul className="flex flex-col divide-y divide-line">
        {pages.map((page) => {
          const stored = savedOverrides.get(page.id);
          const effective = effectiveAccess(role, overrideMap, page.id);
          const roleDefault = ROLE_DEFAULTS[role][page.id];
          return (
            <li
              key={page.id}
              className="flex flex-col gap-1 py-2 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between sm:gap-3"
            >
              <div className="min-w-0">
                <p className="text-sm font-semibold text-ink">{page.label}</p>
                <p className="text-[11px] text-ink-muted">
                  {ACCESS_LEVEL_LABEL[effective]} ·{" "}
                  {stored === undefined ? "role default" : "override"}
                </p>
              </div>
              <div className="sm:w-56">
                <Select
                  value={accessDraft[page.id] ?? ""}
                  disabled={!canOverride || accessPending}
                  aria-label={`${page.label} for ${accountName}`}
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    onDraft(page.id, isAccessLevel(value) ? value : "");
                  }}
                >
                  <option value="">Role default ({ACCESS_LEVEL_LABEL[roleDefault]})</option>
                  <option value="none">No access</option>
                  <option value="view">View</option>
                  <option value="edit">Edit</option>
                </Select>
              </div>
            </li>
          );
        })}
      </ul>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="secondary"
          onClick={onSave}
          disabled={!canOverride || accessPending || accessChanges.length === 0}
        >
          {accessPending ? "Saving..." : "Save access"}
        </Button>
        {accessChanges.length > 0 ? (
          <Button variant="ghost" onClick={onReset} disabled={accessPending}>
            Reset
          </Button>
        ) : null}
        <p className="hint">
          {accessChanges.length === 0
            ? "No changes yet."
            : `${accessChanges.length} page${accessChanges.length === 1 ? "" : "s"} will change.`}
        </p>
      </div>
      <ResultBanner result={accessResult} />
    </>
  );
}
