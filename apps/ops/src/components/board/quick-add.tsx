"use client";

import { Plus } from "lucide-react";
import { type FormEvent, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";

/**
 * Quick create at the top of a column: a title and a club, nothing else. Everything else is set
 * later in the detail sheet. Returns a plain error message, or null when the card was added.
 */
export function QuickAdd({
  stageLabel,
  onCreate,
}: {
  stageLabel: string;
  onCreate: (values: { title: string; clubName: string }) => Promise<string | null>;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const titleId = useId();
  const clubId = useId();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const title = String(form.get("title") ?? "");
    const clubName = String(form.get("clubName") ?? "");
    setSaving(true);
    setError(null);
    const message = await onCreate({ title, clubName });
    setSaving(false);
    if (message === null) setOpen(false);
    else setError(message);
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex min-h-11 w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-line-strong px-2 text-[12.5px] font-semibold text-ink-muted hover:bg-surface-raised hover:text-ink"
      >
        <Plus className="size-4" aria-hidden="true" />
        Add to {stageLabel}
      </button>
    );
  }

  return (
    <form
      onSubmit={submit}
      className="rounded-md border border-line bg-surface-raised p-2"
      aria-label={`Add a card to ${stageLabel}`}
    >
      <label htmlFor={titleId} className="sr-only">
        Card title
      </label>
      <Input
        id={titleId}
        name="title"
        placeholder="Title"
        maxLength={160}
        autoFocus
        autoComplete="off"
        className="h-9 text-[13px]"
      />
      <label htmlFor={clubId} className="sr-only">
        Club
      </label>
      <Input
        id={clubId}
        name="clubName"
        placeholder="Club"
        maxLength={160}
        autoComplete="off"
        className="mt-1.5 h-9 text-[13px]"
      />
      {error === null ? null : (
        <p role="alert" className="mt-1.5 text-[12px] text-danger">
          {error}
        </p>
      )}
      <div className="mt-2 flex gap-1.5">
        <Button type="submit" size="sm" variant="primary" disabled={saving}>
          {saving ? "Adding" : "Add"}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={saving}
          onClick={() => {
            setOpen(false);
            setError(null);
          }}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
