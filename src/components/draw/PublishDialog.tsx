"use client";

import { X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { PairingsView } from "@/components/PairingsView";
import { fmtDateLabel } from "@/lib/data/labels";
import { toPublicPairings } from "@/lib/data/public";
import type { Issue } from "@/lib/draw/validate";
import { buildPublished, useDesk } from "@/lib/store/desk-store";
import { provisionalIdsOf } from "@/lib/store/state";

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
  const {
    draw,
    players,
    tournament,
    dispatch,
    regById,
    isPublished,
    changedSincePublish,
    publishState,
    publishError,
    status,
    saveFailed,
    saving,
  } = useDesk();
  const ref = useRef<HTMLDialogElement>(null);
  const [ack, setAck] = useState(false);
  // True from the moment the desk asks to publish until the database answers. The dialog stays
  // open while it waits: closing early is what let a refused publish look like a success.
  const [sent, setSent] = useState(false);
  const busy = publishState === "working";

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      setAck(false);
      setSent(false);
      d.showModal();
    }
    if (!open && d.open) d.close();
  }, [open]);

  // Close only after the write confirms. A failed publish keeps the dialog open with the error, and
  // the button below becomes the retry. Nothing on screen claims Published before this point.
  useEffect(() => {
    if (!open || !sent || publishState === "working") return;
    if (publishState === "idle") {
      setSent(false);
      onClose();
    }
  }, [open, sent, publishState, onClose]);

  const blocking = issues.filter((i) => i.severity === "blocking");
  const warnings = issues.filter((i) => i.severity === "warning");
  const preview = useMemo(() => {
    if (!open || !draw || !tournament) return null;
    return toPublicPairings({
      published: buildPublished(
        draw,
        players,
        tournament,
        new Date().toISOString(),
        provisionalIdsOf([...regById.values()]),
      ),
      tournamentName: tournament.name,
      dateLabel: fmtDateLabel(tournament.dates),
      startFormat: tournament.config.startFormat,
      firstTeeTime: tournament.config.firstTeeTime,
    });
  }, [open, draw, players, tournament, regById]);
  const canPublish =
    blocking.length === 0 && (warnings.length === 0 || ack) && !saveFailed && !saving;
  const nothingNew = isPublished && !changedSincePublish;

  return (
    <dialog ref={ref} className="wide" aria-labelledby="pub-title" onClose={onClose}>
      <div className="dialog-body">
        <div className="flex items-start justify-between gap-3">
          <h2 id="pub-title">{isPublished ? "Publish changes" : "Publish pairings"}</h2>
          {/* A visible close at the top, so a phone can leave without scrolling the preview. */}
          <button
            type="button"
            className="btn ghost small shrink-0"
            aria-label="Close"
            onClick={onClose}
            disabled={busy}
          >
            <X aria-hidden="true" />
          </button>
        </div>
        <p className="muted">
          Players will see the published pairings below. The public page also shows the confirmed
          tee times for each playing day, the player list and the organizers&apos; rules of play. A
          tee time is not shown to players until it is ticked as confirmed on the Tee times screen.
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

        {(saveFailed || saving) && (
          <div className="notice warn" role="status">
            <b>{saving ? "Still saving this change." : "The last change was not saved."}</b>{" "}
            {saving
              ? "Wait for the save to finish, then publish."
              : "The board was put back to what the database holds. Make the change again and save it before publishing."}
          </div>
        )}

        {sent && publishState === "failed" && (
          <div className="notice bad" role="alert">
            <b>Not published.</b>{" "}
            {publishError ?? "The pairings were not saved. Nothing went out to players."} The list
            shown to players is unchanged.
          </div>
        )}

        <section aria-label="What players will see" className="preview-box">
          {preview && <PairingsView pairings={preview} searchable={false} />}
        </section>

        {/* The actions stay in thumb reach while the long preview scrolls under them. */}
        <div className="sticky bottom-0 -mx-5 -mb-5 row between border-t border-line bg-surface-raised px-5 py-3">
          <button type="button" className="btn ghost" onClick={onClose} disabled={busy}>
            Not yet
          </button>
          <button
            type="button"
            className="btn gold"
            disabled={!canPublish || nothingNew || busy}
            onClick={() => {
              if (busy) return;
              if (status === "demo") {
                // No database to wait for: the session reducer is the whole write.
                dispatch({ type: "publish" });
                onClose();
                return;
              }
              setSent(true);
              dispatch({ type: "publish" });
            }}
          >
            {busy
              ? "Publishing…"
              : sent && publishState === "failed"
                ? "Try again"
                : preview
                  ? `Publish ${preview.groups.length} groups`
                  : "Publish"}
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
