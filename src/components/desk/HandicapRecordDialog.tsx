"use client";

import { BadgeCheck } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { fmtIso } from "@/lib/data/labels";
import type { HandicapRecord } from "@/lib/data/types";
import { fmtIndex } from "@/lib/format";
import {
  HANDICAP_INDEX_MAX,
  HANDICAP_INDEX_MIN,
  type HandicapRecordInput,
  readHandicapRecordForm,
} from "@/lib/player/handicap-record";

/**
 * Adds a missing index to a player's record history, or corrects one already on file.
 *
 * This is the player's history, not the index the current event uses: the event keeps the index
 * frozen on its registration, and the Handicap card's **Edit index** button changes that one.
 */
export function HandicapRecordDialog({
  open,
  onOpenChange,
  playerName,
  record,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  playerName: string;
  /** The record being corrected, or null when a date is being added. */
  record: HandicapRecord | null;
  onSave: (input: HandicapRecordInput) => Promise<void>;
}) {
  const [index, setIndex] = useState(
    record?.index === null || record?.index === undefined ? "" : String(record.index),
  );
  const [effectiveDate, setEffectiveDate] = useState(record?.effectiveDate ?? "");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    if (busy) return;
    const read = readHandicapRecordForm({ index, effectiveDate, reason });
    if (!read.ok) {
      setError(read.message);
      return;
    }
    setError("");
    setBusy(true);
    try {
      await onSave(read.value);
      onOpenChange(false);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "The record was not saved. Nothing was changed.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        title={record ? "Correct handicap record" : "Add handicap index"}
        description={`${playerName} · record history`}
        className="w-[min(520px,calc(100vw-24px))]"
      >
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <div className="notice" role="note">
            <p className="m-0 text-[13px]">
              <b>This changes the player's record history, not the index this event uses.</b> The
              event keeps the index frozen on its registration. To change that one, close this and
              use <b>Edit index</b> in the Handicap card above.
            </p>
          </div>

          <label className="field">
            <span>Handicap index</span>
            <input
              type="number"
              step="0.1"
              min={HANDICAP_INDEX_MIN}
              max={HANDICAP_INDEX_MAX}
              value={index}
              onChange={(event) => {
                setIndex(event.target.value);
                setError("");
              }}
              aria-label="Handicap index"
              required
            />
            <span className="hint">
              One decimal, from {HANDICAP_INDEX_MIN} to {HANDICAP_INDEX_MAX}. A plus handicap is
              entered as a negative number.
            </span>
          </label>

          <label className="field">
            <span>Effective date</span>
            <input
              type="date"
              value={effectiveDate}
              onChange={(event) => {
                setEffectiveDate(event.target.value);
                setError("");
              }}
              aria-label="Effective date"
              required
            />
            <span className="hint">
              {record
                ? `On file for this date: ${fmtIndex(record.index)}. Keep ${fmtIso(record.effectiveDate)} to correct that record, or enter another date to add a separate one.`
                : "The date this index took effect. A date that already has a record is corrected instead of added."}
            </span>
          </label>

          <label className="field">
            <span>Reason (required)</span>
            <input
              type="text"
              value={reason}
              onChange={(event) => {
                setReason(event.target.value);
                setError("");
              }}
              placeholder={
                record ? "Why is this index being corrected?" : "Where did this index come from?"
              }
              aria-label="Reason for the record"
              minLength={3}
              required
            />
            <span className="hint">
              Stored in the audit log with who made the change, when, and the old and new index.
            </span>
          </label>

          {error && (
            <p className="hint !text-danger" role="alert">
              {error}
            </p>
          )}

          <div className="flex flex-wrap justify-end gap-2 border-t border-line pt-4">
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={busy}>
              <BadgeCheck aria-hidden="true" />
              {busy ? "Saving…" : record ? "Save correction" : "Add index"}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
