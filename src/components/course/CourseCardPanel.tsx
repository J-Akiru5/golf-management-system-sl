"use client";

import { Flag, RotateCcw, Save } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { CourseCardEditor } from "@/components/course/CourseCardEditor";
import { SectionCard } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { blankHoles, holesComplete, parProblem, strokeIndexProblem } from "@/lib/data/course-data";
import type { Hole } from "@/lib/data/types";
import type { Tee } from "@/lib/routing";
import { useDesk } from "@/lib/store/desk-store";

/** Number, par and stroke index only: the fields the card owns. Order is not a change. */
const holesKey = (holes: readonly Hole[]) =>
  holes
    .map((hole) => `${hole.number}:${hole.par}:${hole.strokeIndex}`)
    .sort()
    .join("|");

/**
 * The course card on the Course & holes screen. It writes through the same setup repository and
 * the same `save_event_setup` transaction as Settings, so there is one card and one write path.
 *
 * The card belongs to the course, not the event on screen: the note says so, because an edit here
 * changes the pars every event on that course uses.
 */
export function CourseCardPanel() {
  const { tournament, tees, holes, adapters, status, member, saving, error } = useDesk();
  const canEdit = status === "demo" || member?.role === "owner" || member?.role === "organizer";
  const courseId = tournament?.courseId ?? holes[0]?.courseId ?? "";

  const [draftHoles, setDraftHoles] = useState<Hole[]>(() =>
    holes.length > 0 ? holes : blankHoles(courseId),
  );
  const [draftTees, setDraftTees] = useState<Tee[]>(tees);
  const [dirty, setDirty] = useState(false);
  const pending = useRef(false);

  // Re-seed only while the draft is clean, so a load or another screen's save cannot wipe a
  // half-typed card. The event switch is covered too: a new course brings new rows.
  useEffect(() => {
    if (!dirty) setDraftHoles(holes.length > 0 ? holes : blankHoles(courseId));
  }, [holes, dirty, courseId]);
  useEffect(() => {
    if (!dirty) setDraftTees(tees);
  }, [tees, dirty]);

  // Clear the dirty flag only when the write has landed. A failed write keeps the draft marked, so
  // the Save button is still there to retry.
  useEffect(() => {
    if (!pending.current || saving) return;
    if (!error) setDirty(false);
    pending.current = false;
  }, [saving, error]);

  const cardReady =
    holesComplete(draftHoles) &&
    strokeIndexProblem(draftHoles) === null &&
    parProblem(draftHoles) === null;
  // A partial or invalid card is not written by the payload, so do not offer a save that would
  // silently keep the stored card. A tee-only change is still saveable while the card is incomplete.
  const blocksSave = holesKey(draftHoles) !== holesKey(holes) && !cardReady;

  const editHoles = (next: Hole[]) => {
    setDraftHoles(next);
    setDirty(true);
  };
  const editTeePar = (id: string, par: number) => {
    setDraftTees((current) => current.map((tee) => (tee.id === id ? { ...tee, par } : tee)));
    setDirty(true);
  };
  const discard = () => {
    setDraftHoles(holes.length > 0 ? holes : blankHoles(courseId));
    setDraftTees(tees);
    setDirty(false);
  };
  const save = () => {
    if (!tournament) return;
    pending.current = true;
    adapters.setup.save({
      tournament,
      tees: draftTees,
      holes: draftHoles,
      sections: ["course"],
    });
    // The demo adapter writes synchronously and never reports `saving`, so its success is already
    // known here. Connected mode clears the flag when the write lands.
    if (status === "demo") {
      pending.current = false;
      setDirty(false);
    }
  };

  return (
    <SectionCard
      id="course-card"
      icon={<Flag />}
      title="Course card"
      subtitle="The pars and stroke indexes every event on this course uses."
      dataHelp="course-card"
    >
      {!tournament ? (
        <p className="hint m-0">
          No event is selected, so there is no course card to open. Choose an event first.
        </p>
      ) : (
        <>
          <div className="notice" role="note">
            <p className="text-[13px]">
              <b>This is the course&rsquo;s card, not one event&rsquo;s copy.</b> A saved par or
              stroke index applies to every event on this course. If the card was confirmed against
              the club scorecard, changing a number withdraws that confirmation.
            </p>
          </div>

          <CourseCardEditor
            holes={draftHoles}
            tees={draftTees}
            onChange={editHoles}
            onTeeParChange={canEdit ? editTeePar : undefined}
            disabled={!canEdit}
            showHeading={false}
            idPrefix="course-page"
          />

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="hint m-0" role="status">
              {!canEdit
                ? "Only the owner or an organizer can change the course card."
                : saving
                  ? "Saving the course card…"
                  : blocksSave
                    ? "The card has a problem; fix it before saving."
                    : dirty
                      ? "Unsaved changes."
                      : "No unsaved changes."}
            </p>
            <span className="flex flex-wrap gap-2">
              <Button
                variant="ghost"
                size="sm"
                disabled={!canEdit || !dirty || saving}
                onClick={discard}
              >
                <RotateCcw aria-hidden="true" />
                Discard
              </Button>
              <Button
                variant="primary"
                size="sm"
                disabled={!canEdit || !dirty || saving || blocksSave}
                onClick={save}
              >
                <Save aria-hidden="true" />
                Save card
              </Button>
            </span>
          </div>

          {error && dirty && (
            <p className="notice bad text-[13px]" role="alert">
              {error}
            </p>
          )}
        </>
      )}
    </SectionCard>
  );
}
