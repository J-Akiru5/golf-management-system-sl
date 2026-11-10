import { describe, expect, it } from "vitest";
import type { FeedbackSubmission } from "@/lib/data/feedback";
import {
  addDemoFeedback,
  DEMO_CLUB_ID,
  DEMO_FEEDBACK_EVENTS,
  demoEventName,
  loadDemoFeedback,
  updateDemoFeedbackResolution,
} from "./feedback";

const SUBMISSION: FeedbackSubmission = {
  category: "bug",
  message: "The pairings page shows the wrong hole.",
  contactName: null,
  contactEmail: null,
  contactConsent: false,
  pagePath: "/pairings",
  locale: "en",
};

describe("demo feedback", () => {
  it("gives the sample notes event ids and names", () => {
    const notes = loadDemoFeedback();
    expect(notes).toHaveLength(3);
    expect(notes.find((note) => note.id === "demo-feedback-1")).toMatchObject({
      tournamentId: DEMO_FEEDBACK_EVENTS.bamboo.id,
      eventName: DEMO_FEEDBACK_EVENTS.bamboo.name,
    });
    expect(notes.find((note) => note.id === "demo-feedback-3")).toMatchObject({
      tournamentId: null,
      eventName: null,
    });
  });

  it("maps a known demo event and rejects an unknown one", () => {
    expect(demoEventName(DEMO_FEEDBACK_EVENTS.championship.id)).toBe(
      DEMO_FEEDBACK_EVENTS.championship.name,
    );
    expect(demoEventName("not-a-demo-event")).toBeNull();
    expect(demoEventName(null)).toBeNull();
  });

  it("stores a resolution note with its own audit stamp", () => {
    const updated = updateDemoFeedbackResolution("demo-feedback-1", "  Checked with the team.  ");
    expect(updated).toMatchObject({
      clubId: DEMO_CLUB_ID,
      resolutionNote: "Checked with the team.",
      resolutionNoteUpdatedBy: "Demo organizer",
    });
    expect(updated?.resolutionNoteUpdatedAt).toEqual(expect.any(String));
  });

  it("clears a resolution note", () => {
    const updated = updateDemoFeedbackResolution("demo-feedback-2", "   ");
    expect(updated?.resolutionNote).toBeNull();
  });

  it("keeps a known event on a new note and drops an unknown one", () => {
    const note = addDemoFeedback(SUBMISSION, DEMO_CLUB_ID, DEMO_FEEDBACK_EVENTS.bamboo.id);
    expect(note).toMatchObject({
      tournamentId: DEMO_FEEDBACK_EVENTS.bamboo.id,
      eventName: DEMO_FEEDBACK_EVENTS.bamboo.name,
    });

    const unknown = addDemoFeedback(SUBMISSION, DEMO_CLUB_ID, "not-a-demo-event");
    expect(unknown.tournamentId).toBeNull();
    expect(unknown.eventName).toBeNull();
  });
});
