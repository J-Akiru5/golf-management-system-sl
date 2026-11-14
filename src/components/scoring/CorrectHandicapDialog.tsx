"use client";

import { BadgeCheck } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { fmtIso } from "@/lib/data/labels";
import type { CorrectHandicapInput, ScoringRoundStatus } from "@/lib/data/scoring";
import { handicapCorrectionProblem } from "@/lib/data/scoring";
import { fmtHcp, fmtIndex } from "@/lib/format";
import type { HandicapSnapshot } from "@/lib/scoring";

/**
 * Corrects the handicap snapshot a played round is scored from.
 *
 * This is the committee's correction, not an edit of the player's record: the history is changed on
 * the player page, and the event's frozen index on the registration. The database function records
 * who made the change, why, and the old and new values, and recalculates that player's result.
 */
export function CorrectHandicapDialog({
  open,
  onOpenChange,
  playerId,
  playerName,
  handicap,
  roundStatus,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  playerId: string;
  playerName: string;
  handicap: HandicapSnapshot;
  roundStatus: ScoringRoundStatus;
  onSave: (input: CorrectHandicapInput) => Promise<void>;
}) {
  const [index, setIndex] = useState(String(handicap.index));
  const [effectiveDate, setEffectiveDate] = useState(handicap.indexEffectiveDate);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    if (busy) return;
    const input: CorrectHandicapInput = {
      playerId,
      index: Number(index),
      effectiveDate,
      reason,
    };
    const problem = handicapCorrectionProblem(input, roundStatus);
    if (problem) {
      setError(problem);
      return;
    }
    setError("");
    setBusy(true);
    try {
      await onSave(input);
      onOpenChange(false);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The handicap was not corrected. Nothing changed.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        title="Correct the handicap used for this round"
        description={`${playerName} · this round`}
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
              <b>This changes the snapshot the scores use for this round.</b> The player&apos;s
              record history and the event&apos;s frozen index are separate. The database records
              who made the change, why, and the old and new values, then recalculates this
              player&apos;s result.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 rounded-[12px] bg-surface-sunken p-3 text-[13px]">
            <div>
              <span className="overline !text-[10px]">In this round now</span>
              <b className="block font-display text-xl">{fmtHcp(handicap.playingHandicap)}</b>
              <span className="hint block">
                Index {fmtIndex(handicap.index)} · from {handicap.indexSource}
              </span>
            </div>
            <div>
              <span className="overline !text-[10px]">Effective</span>
              <b className="block font-display text-xl">{fmtIso(handicap.indexEffectiveDate)}</b>
            </div>
          </div>

          <label className="field">
            <span>Handicap index</span>
            <input
              type="number"
              step="0.1"
              min={-10}
              max={54}
              value={index}
              onChange={(event) => {
                setIndex(event.target.value);
                setError("");
              }}
              aria-label="Corrected handicap index"
              required
            />
            <span className="hint">
              The event maximum still applies. The playing handicap is worked out again from this
              index and the tee.
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
              aria-label="Corrected index effective date"
              required
            />
            <span className="hint">The date this index took effect.</span>
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
              placeholder="Why is the handicap being corrected?"
              aria-label="Reason for the correction"
              minLength={3}
              required
            />
            <span className="hint">
              Stored in the scoring audit with who made the change, when, and the old and new
              values.
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
              {busy ? "Correcting…" : "Correct handicap"}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
