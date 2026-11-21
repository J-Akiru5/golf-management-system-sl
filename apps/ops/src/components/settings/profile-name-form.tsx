"use client";

import { useActionState, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/field";
import type { ActionResult } from "@/lib/members/errors";

const INITIAL: ActionResult = { ok: true, message: "" };

/** The display name form on the profile page. Saves through the action the page passes in. */
export function ProfileNameForm({
  name,
  action,
  canEdit = true,
}: {
  name: string;
  action: (state: ActionResult, formData: FormData) => Promise<ActionResult>;
  /** False at view level: the name is shown, not the form. */
  canEdit?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, INITIAL);
  // Controlled, so a saved name is what the field shows afterwards. The server value is the truth.
  const [value, setValue] = useState(name);

  useEffect(() => {
    setValue(name);
  }, [name]);

  if (!canEdit) {
    return (
      <div className="flex flex-col gap-1.5">
        <p className="text-[13px] font-medium text-ink">Display name</p>
        <p className="text-sm text-ink">{name}</p>
        <p className="hint">
          You can view this page but not change it. Ask an owner for edit access to your profile.
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="display-name">Display name</Label>
        <Input
          id="display-name"
          name="displayName"
          value={value}
          onChange={(event) => setValue(event.currentTarget.value)}
          required
          maxLength={80}
          autoComplete="name"
          disabled={pending}
        />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? "Saving..." : "Save name"}
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
