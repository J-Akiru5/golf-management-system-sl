"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { Input, Label, Select } from "@/components/ui/field";
import { reasonProblem } from "@/lib/admin/rules";
import type {
  AdminActions,
  BulkAdminResult,
  GodAccount,
  GodApp,
  WorkspaceRoleInput,
} from "@/lib/admin/types";
import { GOD_APPS } from "@/lib/admin/types";
import { ResultBanner } from "./result-banner";

export type BulkKind = "role" | "suspend" | "restore" | "signout";

const TITLES: Record<BulkKind, string> = {
  role: "Change the workspace role",
  suspend: "Suspend the selected accounts",
  restore: "Restore the selected accounts",
  signout: "Sign the selected accounts out everywhere",
};

const DESCRIPTIONS: Record<BulkKind, string> = {
  role: "The same role is applied to every selected account. Removing access needs a reason.",
  suspend:
    "The chosen access is removed, what each person had is recorded, and every session ends. No account is deleted.",
  restore: "Each suspended account gets back exactly the access its suspension recorded.",
  signout: "Every session on every device ends. Access does not change.",
};

const APP_LABELS: Record<GodApp, string> = {
  workspace: "Workspace",
  desk: "Golf desk",
  tabulator: "Tabulator",
};

const CONFIRM: Record<BulkKind, string> = {
  role: "Change the role",
  suspend: "Suspend",
  restore: "Restore",
  signout: "Sign out everywhere",
};

/** One dialog for every bulk action, so the reason and the confirmation always look the same. */
export function BulkDialog({
  kind,
  accounts,
  actions,
  onClose,
  onDone,
}: {
  kind: BulkKind | null;
  accounts: ReadonlyArray<GodAccount>;
  actions: AdminActions;
  onClose: () => void;
  onDone: (result: BulkAdminResult) => void;
}) {
  const [role, setRole] = useState<WorkspaceRoleInput>("member");
  const [apps, setApps] = useState<GodApp[]>([...GOD_APPS]);
  const [reason, setReason] = useState("");
  const [result, setResult] = useState<BulkAdminResult | null>(null);
  const [pending, startTransition] = useTransition();

  if (kind === null) return null;

  const userIds = accounts.map((account) => account.userId);

  function toggle(app: GodApp, checked: boolean): void {
    setApps((previous) =>
      checked ? [...previous, app] : previous.filter((entry) => entry !== app),
    );
  }

  function submit(): void {
    const problem = reasonProblem(reason);
    if (problem) {
      setResult({ ok: false, message: problem, succeeded: 0, failures: [] });
      return;
    }
    if (kind === "suspend" && apps.length === 0) {
      setResult({ ok: false, message: "Choose at least one app.", succeeded: 0, failures: [] });
      return;
    }

    setResult(null);
    startTransition(async () => {
      let outcome: BulkAdminResult;
      if (kind === "role") {
        outcome = await actions.bulkWorkspaceRole(userIds, role, reason);
      } else if (kind === "suspend") {
        outcome = await actions.bulkSuspend(userIds, apps, reason);
      } else if (kind === "restore") {
        outcome = await actions.bulkRestore(userIds, reason);
      } else {
        outcome = await actions.bulkSignOut(userIds, reason);
      }
      setResult(outcome);
      onDone(outcome);
    });
  }

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent
        title={`${TITLES[kind]} (${accounts.length} selected)`}
        description={DESCRIPTIONS[kind]}
      >
        {kind === "role" ? (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="bulk-role">Workspace role</Label>
            <Select
              id="bulk-role"
              value={role}
              onChange={(event) => setRole(event.currentTarget.value as WorkspaceRoleInput)}
              disabled={pending}
            >
              <option value="owner">Owner</option>
              <option value="partner">Partner</option>
              <option value="member">Member</option>
              <option value="none">No workspace access</option>
            </Select>
          </div>
        ) : null}

        {kind === "suspend" ? (
          <fieldset className="flex flex-col gap-2">
            <legend className="overline mb-1">Access to remove</legend>
            {GOD_APPS.map((app) => (
              <label key={app} className="flex min-h-11 items-center gap-3 text-sm">
                <input
                  type="checkbox"
                  className="size-5 accent-[var(--primary)]"
                  checked={apps.includes(app)}
                  onChange={(event) => toggle(app, event.currentTarget.checked)}
                  disabled={pending}
                />
                {APP_LABELS[app]}
              </label>
            ))}
          </fieldset>
        ) : null}

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="bulk-reason">Reason (required)</Label>
          <Input
            id="bulk-reason"
            value={reason}
            onChange={(event) => setReason(event.currentTarget.value)}
            maxLength={200}
            placeholder="At least 5 characters"
            disabled={pending}
          />
        </div>

        <ResultBanner result={result} />

        <div className="flex flex-wrap justify-end gap-2">
          <DialogClose asChild>
            <Button variant="secondary" disabled={pending}>
              Cancel
            </Button>
          </DialogClose>
          <Button
            variant={kind === "suspend" || kind === "signout" ? "danger" : "primary"}
            disabled={pending}
            onClick={submit}
          >
            {pending ? "Working..." : CONFIRM[kind]}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
