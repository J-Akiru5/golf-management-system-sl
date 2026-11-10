import { describe, expect, it } from "vitest";
import { buildFeedbackDigest, feedbackDigestDedupeKey } from "./feedback-digest";

const NOTES = [
  {
    category: "bug" as const,
    message: "The pairings page shows the wrong hole on the phone.",
    status: "new" as const,
    createdAt: "2026-11-10T08:00:00.000Z",
  },
  {
    category: "content" as const,
    message: "The rules page is out of date.",
    status: "planned" as const,
    createdAt: "2026-11-10T09:00:00.000Z",
  },
  {
    category: "improvement" as const,
    message: "A print button would help.",
    status: "done" as const,
    createdAt: "2026-11-10T07:00:00.000Z",
  },
];

describe("buildFeedbackDigest", () => {
  it("summarises only new and planned notes", () => {
    const digest = buildFeedbackDigest(NOTES, { day: "2026-11-10" });

    expect(digest).not.toBeNull();
    expect(digest?.newCount).toBe(1);
    expect(digest?.plannedCount).toBe(1);
    expect(digest?.subject).toBe("Feedback digest for 2026-11-10");
    expect(digest?.body).toContain("1 new note and 1 planned note");
    expect(digest?.body).toContain("The pairings page shows the wrong hole");
    expect(digest?.body).toContain("The rules page is out of date");
    expect(digest?.body).not.toContain("A print button would help");
  });

  it("does not include contact details", () => {
    const digest = buildFeedbackDigest(NOTES, { day: "2026-11-10" });
    expect(digest?.body).not.toMatch(/@|contact_name|contact_email/i);
  });

  it("returns nothing when no note is waiting", () => {
    expect(buildFeedbackDigest([NOTES[2]!], { day: "2026-11-10" })).toBeNull();
  });

  it("caps the list and says how many notes remain", () => {
    const many = Array.from({ length: 5 }, (_, index) => ({
      ...NOTES[0]!,
      message: `Note ${index}`,
    }));
    const digest = buildFeedbackDigest(many, { day: "2026-11-10", limit: 2 });
    expect(digest?.body).toContain("Note 0");
    expect(digest?.body).not.toContain("Note 2");
    expect(digest?.body).toContain("3 more notes");
  });
});

describe("feedbackDigestDedupeKey", () => {
  it("is stable for one club and one day", () => {
    expect(feedbackDigestDedupeKey("club-1", "2026-11-10")).toBe(
      "feedback_digest:club-1:2026-11-10",
    );
    expect(feedbackDigestDedupeKey(" club-1 ", " 2026-11-10 ")).toBe(
      "feedback_digest:club-1:2026-11-10",
    );
  });
});
