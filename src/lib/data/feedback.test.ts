import { describe, expect, it } from "vitest";
import {
  canTriageFeedback,
  countNewFeedbackNotes,
  DEFAULT_FEEDBACK_FILTERS,
  FEEDBACK_CATEGORIES,
  FEEDBACK_CATEGORY_LABELS,
  FEEDBACK_DEMO_CATEGORY,
  FEEDBACK_INBOX_CATEGORIES,
  FEEDBACK_MESSAGE_MAX,
  FEEDBACK_RATE_LIMIT,
  FEEDBACK_RESOLUTION_NOTE_MAX,
  type FeedbackNote,
  feedbackStatusChoices,
  filterFeedback,
  isFeedbackCategory,
  isFeedbackRateLimited,
  isValidFeedbackEmail,
  matchesFeedbackFilters,
  normalizeFeedbackResolutionNote,
  normalizeFeedbackTournamentId,
  normalizePagePath,
  parseFeedbackFilters,
  parseFeedbackNote,
  sortFeedbackNewestFirst,
  validateFeedback,
} from "./feedback";

const NOTE: FeedbackNote = {
  id: "note-1",
  clubId: "club-1",
  tournamentId: null,
  eventName: null,
  category: "bug",
  message: "The pairings page shows the wrong hole.",
  contactName: null,
  contactEmail: null,
  contactConsent: false,
  pagePath: "/pairings",
  locale: "en",
  status: "new",
  resolutionNote: null,
  resolutionNoteUpdatedAt: null,
  resolutionNoteUpdatedBy: null,
  createdAt: "2026-11-10T08:00:00.000Z",
  updatedAt: "2026-11-10T08:00:00.000Z",
  statusChangedAt: null,
  statusChangedBy: null,
};

const draft = (overrides: Partial<Parameters<typeof validateFeedback>[0]> = {}) => ({
  category: "improvement",
  message: "Please add a print button to the pairings page.",
  contactName: "",
  contactEmail: "",
  contactConsent: false,
  pagePath: "/pairings",
  locale: "en",
  honeypot: "",
  ...overrides,
});

describe("validateFeedback", () => {
  it("accepts a plain note and trims what it stores", () => {
    const result = validateFeedback(draft({ message: "  Please add a print button.  " }));
    expect(result).toEqual({
      ok: true,
      kind: "submission",
      value: {
        category: "improvement",
        message: "Please add a print button.",
        contactName: null,
        contactEmail: null,
        contactConsent: false,
        pagePath: "/pairings",
        locale: "en",
      },
    });
  });

  it("refuses an empty message", () => {
    expect(validateFeedback(draft({ message: "   " }))).toEqual({
      ok: false,
      error: "messageRequired",
    });
  });

  it("refuses a message that is too short to act on", () => {
    expect(validateFeedback(draft({ message: "ok" }))).toEqual({
      ok: false,
      error: "messageTooShort",
    });
  });

  it("refuses an oversized message", () => {
    expect(validateFeedback(draft({ message: "x".repeat(FEEDBACK_MESSAGE_MAX + 1) }))).toEqual({
      ok: false,
      error: "messageTooLong",
    });
  });

  it("refuses an unknown category", () => {
    expect(validateFeedback(draft({ category: "praise" }))).toEqual({
      ok: false,
      error: "category",
    });
  });

  it("refuses contact details without consent", () => {
    expect(validateFeedback(draft({ contactName: "Jo" }))).toEqual({
      ok: false,
      error: "consentRequired",
    });
    expect(validateFeedback(draft({ contactEmail: "jo@example.com" }))).toEqual({
      ok: false,
      error: "consentRequired",
    });
  });

  it("accepts contact details when consent is ticked, and lower-cases the email", () => {
    const result = validateFeedback(
      draft({
        contactName: "  Jo Cruz ",
        contactEmail: "Jo@Example.COM ",
        contactConsent: true,
      }),
    );
    expect(result.ok).toBe(true);
    if (result.ok && result.kind === "submission") {
      expect(result.value.contactName).toBe("Jo Cruz");
      expect(result.value.contactEmail).toBe("jo@example.com");
      expect(result.value.contactConsent).toBe(true);
    }
  });

  it("does not record consent when there is no contact detail", () => {
    const result = validateFeedback(draft({ contactConsent: true }));
    expect(result.ok).toBe(true);
    if (result.ok && result.kind === "submission") {
      expect(result.value.contactConsent).toBe(false);
      expect(result.value.contactName).toBeNull();
      expect(result.value.contactEmail).toBeNull();
    }
  });

  it("refuses an incomplete email and an oversized name", () => {
    expect(validateFeedback(draft({ contactEmail: "not-an-email", contactConsent: true }))).toEqual(
      { ok: false, error: "contactEmailInvalid" },
    );
    expect(validateFeedback(draft({ contactName: "x".repeat(121), contactConsent: true }))).toEqual(
      { ok: false, error: "contactNameTooLong" },
    );
  });

  it("refuses an invalid locale", () => {
    expect(validateFeedback(draft({ locale: "fr" }))).toEqual({ ok: false, error: "locale" });
  });

  it("refuses a page path that is not a single absolute path", () => {
    expect(validateFeedback(draft({ pagePath: "https://example.com" }))).toEqual({
      ok: false,
      error: "pagePathInvalid",
    });
    expect(validateFeedback(draft({ pagePath: "//example.com" }))).toEqual({
      ok: false,
      error: "pagePathInvalid",
    });
  });

  it("treats a filled honeypot as a neutral success and stores nothing", () => {
    expect(validateFeedback(draft({ honeypot: "https://spam.example" }))).toEqual({
      ok: true,
      kind: "honeypot",
    });
    expect(validateFeedback(draft({ honeypot: "   " })).ok).toBe(true);
  });
});

describe("normalizePagePath", () => {
  it("keeps the path and drops the query string and fragment", () => {
    expect(normalizePagePath("/pairings?player=abc#group-3")).toBe("/pairings");
    expect(normalizePagePath(" /feedback ")).toBe("/feedback");
  });

  it("returns null for anything that is not a path", () => {
    expect(normalizePagePath("")).toBeNull();
    expect(normalizePagePath(null)).toBeNull();
    expect(normalizePagePath("https://example.com")).toBeNull();
    expect(normalizePagePath("//example.com")).toBeNull();
    expect(normalizePagePath(`/${"x".repeat(300)}`)).toBeNull();
    expect(normalizePagePath("/bad\u0007path")).toBeNull();
  });
});

describe("event context", () => {
  it("accepts a UUID and drops anything else", () => {
    expect(normalizeFeedbackTournamentId("A0B1C2D3-E4F5-4678-9ABC-DEF012345678")).toBe(
      "a0b1c2d3-e4f5-4678-9abc-def012345678",
    );
    expect(normalizeFeedbackTournamentId("  a0b1c2d3-e4f5-4678-9abc-def012345678  ")).toBe(
      "a0b1c2d3-e4f5-4678-9abc-def012345678",
    );
    expect(normalizeFeedbackTournamentId("bamboo-tee")).toBeNull();
    expect(normalizeFeedbackTournamentId("")).toBeNull();
    expect(normalizeFeedbackTournamentId(null)).toBeNull();
    expect(normalizeFeedbackTournamentId("a0b1c2d3e4f546789abcdef012345678")).toBeNull();
  });

  it("keeps a note without an event visible under the all filter", () => {
    expect(matchesFeedbackFilters(NOTE, DEFAULT_FEEDBACK_FILTERS)).toBe(true);
  });
});

describe("resolution note", () => {
  it("trims a note and treats an empty one as cleared", () => {
    expect(normalizeFeedbackResolutionNote("  Reply sent to the team.  ")).toEqual({
      ok: true,
      value: "Reply sent to the team.",
    });
    expect(normalizeFeedbackResolutionNote("   ")).toEqual({ ok: true, value: null });
    expect(normalizeFeedbackResolutionNote(null)).toEqual({ ok: true, value: null });
  });

  it("refuses a note over the database limit", () => {
    expect(normalizeFeedbackResolutionNote("x".repeat(FEEDBACK_RESOLUTION_NOTE_MAX))).toEqual({
      ok: true,
      value: "x".repeat(FEEDBACK_RESOLUTION_NOTE_MAX),
    });
    expect(normalizeFeedbackResolutionNote("x".repeat(FEEDBACK_RESOLUTION_NOTE_MAX + 1))).toEqual({
      ok: false,
      error: "tooLong",
    });
  });
});

describe("countNewFeedbackNotes", () => {
  it("counts only the notes still new", () => {
    expect(
      countNewFeedbackNotes([NOTE, { ...NOTE, status: "read" }, { ...NOTE, status: "new" }]),
    ).toBe(2);
    expect(countNewFeedbackNotes([])).toBe(0);
  });
});

describe("email", () => {
  it("accepts a normal address and refuses an incomplete one", () => {
    expect(isValidFeedbackEmail("jo@example.com")).toBe(true);
    expect(isValidFeedbackEmail("jo@example")).toBe(false);
    expect(isValidFeedbackEmail("jo example@example.com")).toBe(false);
    expect(isValidFeedbackEmail("")).toBe(false);
  });
});

describe("rate limit policy", () => {
  it("allows the first five notes in the window and refuses the sixth", () => {
    expect(isFeedbackRateLimited(0)).toBe(false);
    expect(isFeedbackRateLimited(FEEDBACK_RATE_LIMIT - 1)).toBe(false);
    expect(isFeedbackRateLimited(FEEDBACK_RATE_LIMIT)).toBe(true);
    expect(isFeedbackRateLimited(FEEDBACK_RATE_LIMIT + 1)).toBe(true);
    expect(isFeedbackRateLimited(Number.NaN)).toBe(false);
  });
});

describe("roles and statuses", () => {
  it("lets an owner or organizer triage, and keeps the desk read-only", () => {
    expect(canTriageFeedback("owner")).toBe(true);
    expect(canTriageFeedback("organizer")).toBe(true);
    expect(canTriageFeedback("desk")).toBe(false);
    expect(canTriageFeedback(null)).toBe(false);
  });

  it("offers every status in a stable order", () => {
    expect(feedbackStatusChoices()).toEqual(["new", "read", "planned", "done", "dismissed"]);
  });
});

describe("parseFeedbackNote", () => {
  it("reads the database shape into the inbox shape", () => {
    expect(
      parseFeedbackNote({
        id: "note-1",
        club_id: "club-1",
        tournament_id: "a0b1c2d3-e4f5-4678-9abc-def012345678",
        event_name: "24th Bamboo Tee",
        category: "content",
        message: "The rules page is out of date.",
        contact_name: "Jo",
        contact_email: "jo@example.com",
        contact_consent: true,
        page_path: "/rules",
        locale: "tl",
        status: "planned",
        resolution_note: "  Added to the content checklist.  ",
        resolution_note_updated_at: "2026-11-10T09:30:00.000Z",
        resolution_note_updated_by: "user-1",
        created_at: "2026-11-10T08:00:00.000Z",
        updated_at: "2026-11-10T09:00:00.000Z",
        status_changed_at: "2026-11-10T09:00:00.000Z",
        status_changed_by: "user-1",
      }),
    ).toMatchObject({
      id: "note-1",
      clubId: "club-1",
      tournamentId: "a0b1c2d3-e4f5-4678-9abc-def012345678",
      eventName: "24th Bamboo Tee",
      category: "content",
      contactName: "Jo",
      contactEmail: "jo@example.com",
      contactConsent: true,
      pagePath: "/rules",
      locale: "tl",
      status: "planned",
      resolutionNote: "Added to the content checklist.",
      resolutionNoteUpdatedBy: "user-1",
      statusChangedBy: "user-1",
    });
  });

  it("keeps a general note without an event", () => {
    const note = parseFeedbackNote({
      id: "note-2",
      club_id: "club-1",
      category: "bug",
      message: "The footer link is broken.",
      locale: "en",
      status: "read",
      created_at: "2026-11-10T08:00:00.000Z",
      updated_at: "2026-11-10T08:00:00.000Z",
    });
    expect(note).not.toBeNull();
    expect(note?.tournamentId).toBeNull();
    expect(note?.eventName).toBeNull();
    expect(note?.resolutionNote).toBeNull();
  });

  it("drops a row with an unknown status or category instead of guessing", () => {
    expect(
      parseFeedbackNote({
        id: "note-1",
        club_id: "club-1",
        category: "praise",
        message: "Nice",
        locale: "en",
        status: "new",
        created_at: "2026-11-10T08:00:00.000Z",
        updated_at: "2026-11-10T08:00:00.000Z",
      }),
    ).toBeNull();
    expect(
      parseFeedbackNote({
        id: "note-1",
        club_id: "club-1",
        category: "bug",
        message: "Broken",
        locale: "en",
        status: "archived",
        created_at: "2026-11-10T08:00:00.000Z",
        updated_at: "2026-11-10T08:00:00.000Z",
      }),
    ).toBeNull();
  });
});

describe("inbox filters", () => {
  const EVENT_ID = "a0b1c2d3-e4f5-4678-9abc-def012345678";
  const OTHER_EVENT_ID = "b1c2d3e4-f5a6-4789-8abc-def012345678";
  const notes: FeedbackNote[] = [
    { ...NOTE, tournamentId: EVENT_ID, eventName: "24th Bamboo Tee" },
    {
      ...NOTE,
      id: "note-2",
      tournamentId: OTHER_EVENT_ID,
      eventName: "Club Championship",
      category: "content",
      message: "The rules page is out of date.",
      pagePath: "/rules",
      status: "planned",
      createdAt: "2026-11-10T09:00:00.000Z",
    },
    {
      ...NOTE,
      id: "note-3",
      category: "improvement",
      message: "A print button would help.",
      contactName: "Jo",
      contactEmail: "jo@example.com",
      contactConsent: true,
      status: "done",
      createdAt: "2026-11-10T07:00:00.000Z",
    },
  ];

  it("filters by status and category", () => {
    expect(
      filterFeedback(notes, { ...DEFAULT_FEEDBACK_FILTERS, status: "planned" }).map((n) => n.id),
    ).toEqual(["note-2"]);
    expect(
      filterFeedback(notes, { ...DEFAULT_FEEDBACK_FILTERS, category: "bug" }).map((n) => n.id),
    ).toEqual(["note-1"]);
  });

  it("filters by event and keeps a note without an event under all", () => {
    expect(
      filterFeedback(notes, { ...DEFAULT_FEEDBACK_FILTERS, event: EVENT_ID }).map((n) => n.id),
    ).toEqual(["note-1"]);
    expect(filterFeedback(notes, DEFAULT_FEEDBACK_FILTERS).map((n) => n.id)).toContain("note-3");
  });

  it("searches the message, contact, page path and event without case", () => {
    expect(
      filterFeedback(notes, { ...DEFAULT_FEEDBACK_FILTERS, query: "PRINT" }).map((n) => n.id),
    ).toEqual(["note-3"]);
    expect(
      filterFeedback(notes, { ...DEFAULT_FEEDBACK_FILTERS, query: "jo@example" }).map((n) => n.id),
    ).toEqual(["note-3"]);
    expect(
      filterFeedback(notes, { ...DEFAULT_FEEDBACK_FILTERS, query: "rules" }).map((n) => n.id),
    ).toEqual(["note-2"]);
    expect(
      filterFeedback(notes, { ...DEFAULT_FEEDBACK_FILTERS, query: "championship" }).map(
        (n) => n.id,
      ),
    ).toEqual(["note-2"]);
  });

  it("does not match an empty query against everything else", () => {
    expect(matchesFeedbackFilters(notes[0]!, DEFAULT_FEEDBACK_FILTERS)).toBe(true);
  });

  it("sorts newest first with a stable id tie-break", () => {
    expect(sortFeedbackNewestFirst(notes).map((n) => n.id)).toEqual(["note-2", "note-1", "note-3"]);
  });

  it("reads query parameters and falls back to all on junk", () => {
    expect(
      parseFeedbackFilters({ status: "done", category: "bug", event: EVENT_ID, q: "  print " }),
    ).toEqual({
      status: "done",
      category: "bug",
      event: EVENT_ID,
      query: "print",
    });
    expect(
      parseFeedbackFilters({
        status: "archived",
        category: "praise",
        event: "not-an-event",
        q: [" x "],
      }),
    ).toEqual({
      status: "all",
      category: "all",
      event: "all",
      query: "x",
    });
    expect(parseFeedbackFilters({})).toEqual(DEFAULT_FEEDBACK_FILTERS);
  });
});

describe("the demo category", () => {
  it("is not offered on the public feedback form", () => {
    expect(FEEDBACK_CATEGORIES).not.toContain(FEEDBACK_DEMO_CATEGORY);
  });

  it("is available to the desk inbox and its filters", () => {
    expect(FEEDBACK_INBOX_CATEGORIES).toContain(FEEDBACK_DEMO_CATEGORY);
    expect(isFeedbackCategory(FEEDBACK_DEMO_CATEGORY)).toBe(true);
    expect(isFeedbackCategory("praise")).toBe(false);
  });

  it("has a plain label for the inbox", () => {
    expect(FEEDBACK_CATEGORY_LABELS[FEEDBACK_DEMO_CATEGORY]).toBe("Demo request");
  });

  it("passes validation with a careful contact and consent", () => {
    const result = validateFeedback(
      draft({
        category: FEEDBACK_DEMO_CATEGORY,
        message: "Club: Iloilo Golf and Country Club\n\nWhat would you like to see?",
        contactName: "Jo Cruz",
        contactEmail: "jo@example.com",
        contactConsent: true,
      }),
    );
    expect(result.ok).toBe(true);
    if (result.ok && result.kind === "submission") {
      expect(result.value.category).toBe("demo");
    }
  });

  it("is parsed from an inbox row instead of being dropped", () => {
    const row = {
      id: "note-1",
      club_id: "club-1",
      category: "demo",
      message: "Club: Iloilo Golf and Country Club",
      locale: "en",
      status: "new",
      created_at: "2026-11-10T08:00:00.000Z",
      updated_at: "2026-11-10T08:00:00.000Z",
    };
    expect(parseFeedbackNote(row)?.category).toBe("demo");
  });
});
