"use client";

import { UserPlus } from "lucide-react";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Input, Label, Select, Textarea } from "@/components/ui/field";
import { isEmail, isWorkspaceRoleInput } from "@/lib/admin/rules";
import type {
  AdminActionResult,
  AdminActions,
  AdminClub,
  DeskRoleInput,
  InviteInput,
  WorkspaceRoleInput,
} from "@/lib/admin/types";
import { ResultBanner } from "./result-banner";

/**
 * Invite a person by email. The account is created by Supabase Auth; the person chooses their own
 * password from the link, so no password is ever typed here. The chosen access is applied after
 * the account exists.
 */
export function InviteDialog({
  actions,
  clubs,
  disabled,
}: {
  actions: AdminActions;
  clubs: ReadonlyArray<AdminClub>;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [workspaceRole, setWorkspaceRole] = useState<WorkspaceRoleInput>("member");
  const [deskClubId, setDeskClubId] = useState("");
  const [deskRole, setDeskRole] = useState<DeskRoleInput>("none");
  const [tabulator, setTabulator] = useState(false);
  const [note, setNote] = useState("");
  const [result, setResult] = useState<AdminActionResult | null>(null);
  const [pending, startTransition] = useTransition();

  function reset(): void {
    setEmail("");
    setDisplayName("");
    setWorkspaceRole("member");
    setDeskClubId("");
    setDeskRole("none");
    setTabulator(false);
    setNote("");
    setResult(null);
  }

  function submit(): void {
    if (!isEmail(email)) {
      setResult({ ok: false, message: "Enter a valid email address." });
      return;
    }
    if (displayName.trim().length === 0) {
      setResult({ ok: false, message: "Enter a display name." });
      return;
    }
    if (!isWorkspaceRoleInput(workspaceRole)) {
      setResult({ ok: false, message: "Choose a workspace role." });
      return;
    }
    const wantsDesk = deskRole !== "none";
    if (wantsDesk && deskClubId === "") {
      setResult({ ok: false, message: "Choose a club for the desk role." });
      return;
    }
    if (workspaceRole === "none" && !wantsDesk && !tabulator) {
      setResult({ ok: false, message: "Choose at least one kind of access." });
      return;
    }

    const input: InviteInput = {
      email,
      displayName,
      workspaceRole,
      deskClubId: wantsDesk ? deskClubId : null,
      deskRole,
      tabulator,
      note,
    };

    setResult(null);
    startTransition(async () => {
      const outcome = await actions.invite(input);
      setResult(outcome);
      if (outcome.ok) {
        reset();
        setOpen(false);
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setResult(null);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="primary" disabled={disabled}>
          <UserPlus aria-hidden="true" />
          Invite
        </Button>
      </DialogTrigger>
      <DialogContent
        title="Invite an account"
        description="The person receives an email and chooses their own password. The owner never sees or sets it."
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="invite-email">Email</Label>
            <Input
              id="invite-email"
              type="email"
              autoComplete="off"
              spellCheck={false}
              value={email}
              onChange={(event) => setEmail(event.currentTarget.value)}
              disabled={pending || disabled}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="invite-name">Display name</Label>
            <Input
              id="invite-name"
              maxLength={80}
              autoComplete="off"
              value={displayName}
              onChange={(event) => setDisplayName(event.currentTarget.value)}
              disabled={pending || disabled}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="invite-workspace">Workspace role</Label>
            <Select
              id="invite-workspace"
              value={workspaceRole}
              onChange={(event) =>
                setWorkspaceRole(event.currentTarget.value as WorkspaceRoleInput)
              }
              disabled={pending || disabled}
            >
              <option value="owner">Owner</option>
              <option value="partner">Partner</option>
              <option value="member">Member</option>
              <option value="none">No workspace access</option>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="invite-desk-club">Desk club</Label>
            <Select
              id="invite-desk-club"
              value={deskClubId}
              onChange={(event) => setDeskClubId(event.currentTarget.value)}
              disabled={pending || disabled || clubs.length === 0}
            >
              <option value="">No club</option>
              {clubs.map((club) => (
                <option key={club.id} value={club.id}>
                  {club.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="invite-desk-role">Desk role</Label>
            <Select
              id="invite-desk-role"
              value={deskRole}
              onChange={(event) => setDeskRole(event.currentTarget.value as DeskRoleInput)}
              disabled={pending || disabled}
            >
              <option value="owner">Owner</option>
              <option value="organizer">Organizer</option>
              <option value="desk">Desk</option>
              <option value="none">No desk access</option>
            </Select>
          </div>
          <label className="flex min-h-11 items-center gap-3 self-end text-sm">
            <input
              type="checkbox"
              className="size-5 accent-[var(--primary)]"
              checked={tabulator}
              onChange={(event) => setTabulator(event.currentTarget.checked)}
              disabled={pending || disabled}
            />
            Tabulation team
          </label>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="invite-note">Note (optional)</Label>
          <Textarea
            id="invite-note"
            value={note}
            onChange={(event) => setNote(event.currentTarget.value)}
            maxLength={300}
            className="min-h-20"
            disabled={pending || disabled}
          />
        </div>

        {disabled ? <p className="hint">Needs the service-role key on this project.</p> : null}

        <ResultBanner result={result} />

        <div className="flex flex-wrap justify-end gap-2">
          <DialogClose asChild>
            <Button variant="secondary" disabled={pending}>
              Cancel
            </Button>
          </DialogClose>
          <Button variant="primary" disabled={pending || disabled} onClick={submit}>
            {pending ? "Sending..." : "Send invitation"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
