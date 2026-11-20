"use client";

import { useActionState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/field";
import { WORKSPACE_ROLES } from "@/lib/db/constants";
import type { ActionResult } from "@/lib/members/errors";

const INITIAL: ActionResult = { ok: true, message: "" };

/**
 * Adds an existing Supabase account to the workspace. It does not create the account: that stays
 * in the Supabase dashboard, and the database function looks the email up there.
 */
export function AddMemberForm({
  action,
}: {
  action: (state: ActionResult, formData: FormData) => Promise<ActionResult>;
}) {
  const [state, formAction, pending] = useActionState(action, INITIAL);
  const formRef = useRef<HTMLFormElement>(null);

  // Clear the fields after a successful add, so a second person starts from a blank form.
  useEffect(() => {
    if (state.ok && state.message) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="new-member-email">Email</Label>
          <Input
            id="new-member-email"
            name="email"
            type="email"
            required
            autoComplete="off"
            placeholder="name@example.com"
            disabled={pending}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="new-member-name">Display name</Label>
          <Input
            id="new-member-name"
            name="displayName"
            required
            maxLength={80}
            autoComplete="off"
            disabled={pending}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="new-member-role">Role</Label>
          <Select id="new-member-role" name="role" required defaultValue="" disabled={pending}>
            <option value="" disabled>
              Choose a role
            </option>
            {WORKSPACE_ROLES.map((role) => (
              <option key={role.id} value={role.id}>
                {role.label}
              </option>
            ))}
          </Select>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? "Adding..." : "Add member"}
        </Button>
        {state.message ? (
          <p role="status" className={state.ok ? "hint" : "text-sm text-danger"}>
            {state.message}
          </p>
        ) : null}
      </div>
    </form>
  );
}
