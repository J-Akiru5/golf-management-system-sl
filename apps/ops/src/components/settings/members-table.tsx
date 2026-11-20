"use client";

import { useEffect, useState, useTransition } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Select } from "@/components/ui/field";
import { WORKSPACE_ROLES } from "@/lib/db/constants";
import type { WorkspaceMemberStatus, WorkspaceRole } from "@/lib/db/types";
import type { ActionResult } from "@/lib/members/errors";
import { roleLabel, statusLabel } from "@/lib/members/format";
import { decide, type MemberFacts } from "@/lib/members/rules";

export type MemberTableRow = {
  userId: string;
  displayName: string;
  /** Owners receive emails; everyone else gets null and the column is hidden. */
  email: string | null;
  role: WorkspaceRole;
  status: WorkspaceMemberStatus;
  /** Already formatted on the server, so the browser never disagrees about the date. */
  joined: string;
};

export type MemberTableActions = {
  setRole: (userId: string, role: WorkspaceRole) => Promise<ActionResult>;
  setStatus: (userId: string, status: WorkspaceMemberStatus) => Promise<ActionResult>;
  remove: (userId: string) => Promise<ActionResult>;
};

type Props = {
  rows: MemberTableRow[];
  viewer: MemberFacts;
  /** Owners only. Without it the table is read only. */
  canManage: boolean;
  showEmail: boolean;
  actions: MemberTableActions;
};

const CELL = "flex items-center justify-between gap-3 md:table-cell md:px-4 md:py-3";
const LABEL = "overline md:hidden";

/**
 * The member list. A real table on a wide screen; on a phone each row stacks, with the column name
 * beside the value because the header row is hidden. Every control is at least 44px tall.
 */
export function MembersTable({ rows, viewer, canManage, showEmail, actions }: Props) {
  const facts: MemberFacts[] = rows.map((row) => ({
    userId: row.userId,
    role: row.role,
    status: row.status,
  }));

  if (rows.length === 0) {
    return <p className="hint">No members yet.</p>;
  }

  return (
    <table className="w-full table-fixed border-collapse text-sm">
      <caption className="sr-only">Workspace members and roles</caption>
      <thead className="hidden md:table-header-group">
        <tr className="border-b border-line text-left">
          <th scope="col" className="overline w-[19%] px-4 py-2 font-semibold">
            Member
          </th>
          {showEmail ? (
            <th scope="col" className="overline w-[22%] px-4 py-2 font-semibold">
              Email
            </th>
          ) : null}
          <th scope="col" className="overline w-[16%] px-4 py-2 font-semibold">
            Role
          </th>
          <th scope="col" className="overline w-[9%] px-4 py-2 font-semibold">
            Status
          </th>
          <th scope="col" className="overline w-[11%] px-4 py-2 font-semibold">
            Joined
          </th>
          {canManage ? (
            <th scope="col" className="overline w-[23%] px-4 py-2 font-semibold">
              Actions
            </th>
          ) : null}
        </tr>
      </thead>
      <tbody className="block md:table-row-group">
        {rows.map((row) => (
          <MemberRow
            key={row.userId}
            row={row}
            viewer={viewer}
            facts={facts}
            canManage={canManage}
            showEmail={showEmail}
            actions={actions}
          />
        ))}
      </tbody>
    </table>
  );
}

function MemberRow({
  row,
  viewer,
  facts,
  canManage,
  showEmail,
  actions,
}: {
  row: MemberTableRow;
  viewer: MemberFacts;
  facts: MemberFacts[];
  canManage: boolean;
  showEmail: boolean;
  actions: MemberTableActions;
}) {
  const target: MemberFacts = { userId: row.userId, role: row.role, status: row.status };
  const [selectedRole, setSelectedRole] = useState<WorkspaceRole>(row.role);
  const [error, setError] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [pending, startTransition] = useTransition();

  // After the server revalidates, the row carries the saved role. Follow it.
  useEffect(() => {
    setSelectedRole(row.role);
  }, [row.role]);

  const roleChanged = selectedRole !== row.role;
  const roleDecision = decide(viewer, target, { kind: "change_role", role: selectedRole }, facts);
  const nextStatus: WorkspaceMemberStatus = row.status === "active" ? "suspended" : "active";
  const statusDecision = decide(viewer, target, { kind: "set_status", status: nextStatus }, facts);
  const removeDecision = decide(viewer, target, { kind: "remove" }, facts);

  const blockedReasons = Array.from(
    new Set(
      [
        roleChanged && !roleDecision.allowed ? roleDecision.reason : null,
        !statusDecision.allowed ? statusDecision.reason : null,
        !removeDecision.allowed ? removeDecision.reason : null,
      ].filter((reason): reason is string => reason !== null),
    ),
  );

  function run(action: () => Promise<ActionResult>, onSuccess?: () => void) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (result.ok) onSuccess?.();
      else setError(result.message);
    });
  }

  return (
    <tr className="grid gap-2 border-b border-line px-4 py-4 last:border-b-0 md:table-row md:px-0 md:py-3">
      <td className={CELL}>
        <span className={LABEL}>Member</span>
        <span className="flex min-w-0 items-center gap-3">
          <Avatar id={row.userId} name={row.displayName} size="sm" />
          <span className="min-w-0">
            <span className="block truncate font-semibold text-ink" title={row.displayName}>
              {row.displayName}
            </span>
            {row.userId === viewer.userId ? (
              <span className="block text-xs text-ink-muted">You</span>
            ) : null}
          </span>
        </span>
      </td>

      {showEmail ? (
        <td className={CELL}>
          <span className={LABEL}>Email</span>
          <span className="min-w-0 break-all text-ink-muted">{row.email ?? "No email"}</span>
        </td>
      ) : null}

      <td className={CELL}>
        <span className={LABEL}>Role</span>
        {canManage ? (
          <span className="flex min-w-0 flex-wrap items-center justify-end gap-2 md:justify-start">
            <Select
              value={selectedRole}
              onChange={(event) => setSelectedRole(event.currentTarget.value as WorkspaceRole)}
              aria-label={`Role for ${row.displayName}`}
              disabled={pending}
              className="w-auto max-w-full"
            >
              {WORKSPACE_ROLES.map((role) => (
                <option key={role.id} value={role.id}>
                  {role.label}
                </option>
              ))}
            </Select>
            {roleChanged ? (
              <Button
                variant="secondary"
                onClick={() => run(() => actions.setRole(row.userId, selectedRole))}
                disabled={pending || !roleDecision.allowed}
                aria-label={`Save role for ${row.displayName}`}
              >
                Save role
              </Button>
            ) : null}
          </span>
        ) : (
          <Badge tone="neutral">{roleLabel(row.role)}</Badge>
        )}
      </td>

      <td className={CELL}>
        <span className={LABEL}>Status</span>
        <Badge tone={row.status === "active" ? "success" : "warning"}>
          {statusLabel(row.status)}
        </Badge>
      </td>

      <td className={CELL}>
        <span className={LABEL}>Joined</span>
        <span className="tnum text-ink-muted">{row.joined}</span>
      </td>

      {canManage ? (
        <td className="flex flex-col gap-2 md:table-cell md:px-4 md:py-3">
          <span className={LABEL}>Actions</span>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              onClick={() => run(() => actions.setStatus(row.userId, nextStatus))}
              disabled={pending || !statusDecision.allowed}
              aria-label={`${row.status === "active" ? "Suspend" : "Reactivate"} ${row.displayName}`}
            >
              {row.status === "active" ? "Suspend" : "Reactivate"}
            </Button>

            <Dialog open={confirmRemove} onOpenChange={setConfirmRemove}>
              <DialogTrigger asChild>
                <Button
                  variant="danger"
                  disabled={pending || !removeDecision.allowed}
                  aria-label={`Remove ${row.displayName}`}
                >
                  Remove
                </Button>
              </DialogTrigger>
              <DialogContent
                title={`Remove ${row.displayName}?`}
                description="This removes their access to the workspace. Their Supabase account is not deleted."
              >
                <div className="flex flex-wrap justify-end gap-2">
                  <DialogClose asChild>
                    <Button variant="secondary" disabled={pending}>
                      Cancel
                    </Button>
                  </DialogClose>
                  <Button
                    variant="danger"
                    disabled={pending}
                    onClick={() =>
                      run(
                        () => actions.remove(row.userId),
                        () => setConfirmRemove(false),
                      )
                    }
                  >
                    Remove {row.displayName}
                  </Button>
                </div>
                {error ? (
                  <p role="alert" className="text-sm text-danger">
                    {error}
                  </p>
                ) : null}
              </DialogContent>
            </Dialog>
          </div>
          {blockedReasons.length > 0 ? (
            <p className="text-xs text-ink-muted">{blockedReasons.join(" ")}</p>
          ) : null}
          {error && !confirmRemove ? (
            <p role="alert" className="text-xs text-danger">
              {error}
            </p>
          ) : null}
        </td>
      ) : null}
    </tr>
  );
}
