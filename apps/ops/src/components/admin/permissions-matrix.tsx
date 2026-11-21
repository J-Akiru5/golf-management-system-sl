"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/field";
import type { AccessLevel } from "@/lib/access/pages";
import {
  isWorkspaceRole,
  pageById,
  ROLE_DEFAULTS,
  WORKSPACE_ROLES,
  workspacePages,
} from "@/lib/access/pages";
import type { AccessActionResult, PermissionMatrix } from "@/lib/access/types";
import type { WorkspaceRole } from "@/lib/db/types";
import { cn } from "@/lib/ui/cn";
import { LevelControl } from "./level-control";
import { ResultBanner } from "./result-banner";

const ROLE_LABEL: Record<WorkspaceRole, string> = {
  owner: "Owner",
  partner: "Partner",
  member: "Member",
};

const REASON_HINT = "At least 5 characters. It is recorded in the audit log.";

function cellKey(role: WorkspaceRole, page: string): string {
  return `${role}|${page}`;
}

type Levels = Record<string, AccessLevel>;

/** The stored matrix, with a missing cell falling back to the seeded role default. */
function initialLevels(matrix: PermissionMatrix): Levels {
  const levels: Levels = {};
  for (const role of WORKSPACE_ROLES) {
    for (const page of workspacePages()) {
      levels[cellKey(role, page.id)] = ROLE_DEFAULTS[role][page.id];
    }
  }
  for (const row of matrix.roles) {
    if (isWorkspaceRole(row.role) && pageById(row.page) !== null) {
      levels[cellKey(row.role, row.page)] = row.level;
    }
  }
  // The owner is fixed at edit everywhere, whatever a stored row says.
  for (const page of workspacePages()) levels[cellKey("owner", page.id)] = "edit";
  return levels;
}

export type PermissionActions = {
  setRolePermission(
    role: WorkspaceRole,
    page: string,
    level: AccessLevel,
    reason: string,
  ): Promise<AccessActionResult>;
};

/**
 * The role matrix: pages down, roles across, one three-state control per cell. The owner column is
 * fixed at Edit because the owner cannot be lowered. Save sends only the cells that changed, each
 * with the same reason, and keeps a cell changed when the database refuses it.
 */
export function PermissionsMatrix({
  matrix,
  actions,
}: {
  matrix: PermissionMatrix;
  actions: PermissionActions;
}) {
  const [levels, setLevels] = useState<Levels>(() => initialLevels(matrix));
  const [saved, setSaved] = useState<Levels>(() => initialLevels(matrix));
  const [reason, setReason] = useState("");
  const [result, setResult] = useState<AccessActionResult | null>(null);
  const [pending, startTransition] = useTransition();

  const pages = workspacePages();
  const changes = WORKSPACE_ROLES.flatMap((role) =>
    pages
      .filter((page) => levels[cellKey(role, page.id)] !== saved[cellKey(role, page.id)])
      .map((page) => ({
        role,
        page,
        level: levels[cellKey(role, page.id)] as AccessLevel,
      })),
  );

  function change(role: WorkspaceRole, page: string, level: AccessLevel): void {
    setLevels((previous) => ({ ...previous, [cellKey(role, page)]: level }));
    setResult(null);
  }

  function save(): void {
    if (changes.length === 0) {
      setResult({ ok: false, message: "Nothing has changed yet." });
      return;
    }
    if (reason.trim().length < 5) {
      setResult({ ok: false, message: REASON_HINT });
      return;
    }

    setResult(null);
    startTransition(async () => {
      const applied: typeof changes = [];
      const failures: string[] = [];

      for (const entry of changes) {
        const outcome = await actions.setRolePermission(
          entry.role,
          entry.page.id,
          entry.level,
          reason.trim(),
        );
        if (outcome.ok) applied.push(entry);
        else failures.push(`${ROLE_LABEL[entry.role]} · ${entry.page.label}: ${outcome.message}`);
      }

      if (applied.length > 0) {
        setSaved((previous) => {
          const next = { ...previous };
          for (const entry of applied) next[cellKey(entry.role, entry.page.id)] = entry.level;
          return next;
        });
      }

      if (failures.length === 0) {
        setResult({ ok: true, message: "Role permissions saved." });
        setReason("");
      } else {
        setResult({
          ok: false,
          message:
            applied.length === 0
              ? failures.join(" ")
              : `Saved ${applied.length}, but some cells were refused. ${failures.join(" ")}`,
        });
      }
    });
  }

  const saveLabel =
    changes.length === 0
      ? "Save changes"
      : `Save ${changes.length} change${changes.length === 1 ? "" : "s"}`;

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-x-auto rounded-lg border border-line bg-surface-raised">
        <table className="w-full min-w-[860px] border-collapse text-sm">
          <caption className="sr-only">
            Role permissions. A page with No access is hidden from that role's menu and refused if
            someone opens its address.
          </caption>
          <thead className="border-b border-line">
            <tr>
              <th scope="col" className="px-3 py-2 text-left align-bottom font-semibold text-ink">
                Page
              </th>
              {WORKSPACE_ROLES.map((role) => (
                <th
                  key={role}
                  scope="col"
                  className="px-3 py-2 text-left align-bottom font-semibold text-ink"
                >
                  {ROLE_LABEL[role]}
                  {role === "owner" ? (
                    <span className="block text-[11px] font-medium text-ink-muted">
                      Always Edit
                    </span>
                  ) : null}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pages.map((page) => (
              <tr key={page.id} className="border-b border-line last:border-b-0">
                <th scope="row" className="px-3 py-3 text-left align-middle">
                  <span className="block font-semibold text-ink">{page.label}</span>
                  <span className="block text-[11px] font-normal text-ink-muted">{page.route}</span>
                </th>
                {WORKSPACE_ROLES.map((role) => {
                  const key = cellKey(role, page.id);
                  const isOwner = role === "owner";
                  return (
                    <td key={role} className="px-3 py-3 align-middle">
                      <LevelControl
                        name={key}
                        label={`${ROLE_LABEL[role]}, ${page.label}`}
                        value={levels[key] ?? "none"}
                        levels={page.levels}
                        onChange={(level) => change(role, page.id, level)}
                        disabled={isOwner || pending}
                        className={cn(isOwner && "opacity-70")}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-col gap-2 rounded-lg border border-line bg-surface-raised p-3">
        <div className="flex flex-col gap-1.5 sm:max-w-md">
          <Label htmlFor="permission-reason">Reason</Label>
          <Input
            id="permission-reason"
            value={reason}
            onChange={(event) => setReason(event.currentTarget.value)}
            maxLength={200}
            placeholder="Why this changes, in a few words"
            disabled={pending}
          />
          <p className="hint">{REASON_HINT}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="primary"
            onClick={save}
            disabled={pending || changes.length === 0 || reason.trim().length < 5}
          >
            {pending ? "Saving..." : saveLabel}
          </Button>
          <p className="hint">
            {changes.length === 0
              ? "No changes yet."
              : `${changes.length} cell${changes.length === 1 ? "" : "s"} will change.`}
          </p>
        </div>
        <ResultBanner result={result} />
      </div>
    </div>
  );
}
