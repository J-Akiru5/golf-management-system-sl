"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { PairingsView } from "@/components/PairingsView";
import { fmtDateLabel } from "@/lib/data/labels";
import { toPublicPairings } from "@/lib/data/public";
import type { Issue } from "@/lib/draw/validate";
import { buildPublished, useDesk } from "@/lib/store/desk-store";

/**
 * The only way to publish. It shows exactly what players will see, lists what is wrong, and needs
 * a deliberate click. Blocking problems switch the button off; warnings need a tick.
 */
export function PublishDialog({
  open,
  issues,
  onClose,
}: {
  open: boolean;
  issues: Issue[];
  onClose: () => void;
}) {
  const { draw, players, tournament, dispatch, isPublished, changedSincePublish } = useDesk();
  const ref = useRef<HTMLDialogElement>(null);
  const [ack, setAck] = useState(false);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      setAck(false);
      d.showModal();
    }
    if (!open && d.open) d.close();
  }, [open]);

  const blocking = issues.filter((i) => i.severity === "blocking");
  const warnings = issues.filter((i) => i.severity === "warning");
  const preview = useMemo(() => {
    if (!open || !draw || !tournament) return null;
    return toPublicPairings({
      published: buildPublished(draw, players, tournament, new Date().toISOString()),
      tournamentName: tournament.name,
      dateLabel: fmtDateLabel(tournament.dates),
      startFormat: tournament.config.startFormat,
      firstTeeTime: tournament.config.firstTeeTime,
    });
  }, [open, draw, players, tournament]);
  const canPublish = blocking.length === 0 && (warnings.length === 0 || ack);
  const nothingNew = isPublished && !changedSincePublish;

  return (
    <dialog ref={ref} className="wide" aria-labelledby="pub-title" onClose={onClose}>
      <div className="dialog-body">
        <h2 id="pub-title">{isPublished ? "Publish changes" : "Publish pairings"}</h2>
        <p className="muted">
          Players will see the list below on the player view. It shows names, hole and time only.
          Nothing goes out until you press the button at the bottom.
        </p>

        {blocking.length > 0 && (
          <div className="notice bad" role="alert">
            <b>Fix these before publishing</b>
            <ul>
              {blocking.map((i) => (
                <li key={i.id}>{i.message}</li>
              ))}
            </ul>
          </div>
        )}

        {warnings.length > 0 && (
          <div className="notice warn">
            <b>
              {warnings.length} thing{warnings.length === 1 ? "" : "s"} to check
            </b>
            <ul>
              {warnings.map((i) => (
                <li key={i.id}>{i.message}</li>
              ))}
            </ul>
            <label className="check">
              <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} />
              <span>I have looked at these and want to publish anyway.</span>
            </label>
          </div>
        )}

        {nothingNew && (
          <div className="notice" role="status">
            The published list already matches the board.
          </div>
        )}

        <section aria-label="What players will see" className="preview-box">
          {preview && <PairingsView pairings={preview} searchable={false} />}
        </section>

        <div className="row between">
          <button type="button" className="btn ghost" onClick={onClose}>
            Not yet
          </button>
          <button
            type="button"
            className="btn gold"
            disabled={!canPublish || nothingNew}
            onClick={() => {
              dispatch({ type: "publish" });
              onClose();
            }}
          >
            {preview ? `Publish ${preview.groups.length} groups` : "Publish"}
          </button>
        </div>
        {!canPublish && !nothingNew && (
          <p className="hint" role="status">
            {blocking.length > 0
              ? "Publishing is off until the problems above are fixed."
              : "Tick the box above to confirm you have checked the warnings."}
          </p>
        )}
      </div>
    </dialog>
  );
}
