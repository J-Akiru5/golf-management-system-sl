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
}: {
  name: string;
  action: (state: ActionResult, formData: FormData) => Promise<ActionResult>;
}) {
  const [state, formAction, pending] = useActionState(action, INITIAL);
  // Controlled, so a saved name is what the field shows afterwards. The server value is the truth.
  const [value, setValue] = useState(name);

  useEffect(() => {
    setValue(name);
  }, [name]);

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
