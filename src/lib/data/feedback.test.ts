import { describe, expect, it } from "vitest";
import {
  canTriageFeedback,
  DEFAULT_FEEDBACK_FILTERS,
  FEEDBACK_MESSAGE_MAX,
  FEEDBACK_RATE_LIMIT,
  type FeedbackNote,
  feedbackStatusChoices,
  filterFeedback,
  isFeedbackRateLimited,
  isValidFeedbackEmail,
  matchesFeedbackFilters,
  normalizePagePath,
  parseFeedbackFilters,
  parseFeedbackNote,
  sortFeedbackNewestFirst,
  validateFeedback,
} from "./feedback";

const NOTE: FeedbackNote = {
  id: "note-1",
  clubId: "club-1",
  category: "bug",
  message: "The pairings page shows the wrong hole.",
  contactName: null,
  contactEmail: null,
  contactConsent: false,
  pagePath: "/pairings",
  locale: "en",
  status: "new",
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
        category: "content",
        message: "The rules page is out of date.",
        contact_name: "Jo",
        contact_email: "jo@example.com",
        contact_consent: true,
        page_path: "/rules",
        locale: "tl",
        status: "planned",
        created_at: "2026-11-10T08:00:00.000Z",
        updated_at: "2026-11-10T09:00:00.000Z",
        status_changed_at: "2026-11-10T09:00:00.000Z",
        status_changed_by: "user-1",
      }),
    ).toMatchObject({
      id: "note-1",
      clubId: "club-1",
      category: "content",
      contactName: "Jo",
      contactEmail: "jo@example.com",
      contactConsent: true,
      pagePath: "/rules",
      locale: "tl",
      status: "planned",
      statusChangedBy: "user-1",
    });
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
  const notes: FeedbackNote[] = [
    NOTE,
    {
      ...NOTE,
      id: "note-2",
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

  it("searches the message, contact and page path without case", () => {
    expect(
      filterFeedback(notes, { ...DEFAULT_FEEDBACK_FILTERS, query: "PRINT" }).map((n) => n.id),
    ).toEqual(["note-3"]);
    expect(
      filterFeedback(notes, { ...DEFAULT_FEEDBACK_FILTERS, query: "jo@example" }).map((n) => n.id),
    ).toEqual(["note-3"]);
    expect(
      filterFeedback(notes, { ...DEFAULT_FEEDBACK_FILTERS, query: "rules" }).map((n) => n.id),
    ).toEqual(["note-2"]);
  });

  it("does not match an empty query against everything else", () => {
    expect(matchesFeedbackFilters(notes[0]!, DEFAULT_FEEDBACK_FILTERS)).toBe(true);
  });

  it("sorts newest first with a stable id tie-break", () => {
    expect(sortFeedbackNewestFirst(notes).map((n) => n.id)).toEqual(["note-2", "note-1", "note-3"]);
  });

  it("reads query parameters and falls back to all on junk", () => {
    expect(parseFeedbackFilters({ status: "done", category: "bug", q: "  print " })).toEqual({
      status: "done",
      category: "bug",
      query: "print",
    });
    expect(parseFeedbackFilters({ status: "archived", category: "praise", q: [" x "] })).toEqual({
      status: "all",
      category: "all",
      query: "x",
    });
    expect(parseFeedbackFilters({})).toEqual(DEFAULT_FEEDBACK_FILTERS);
  });
});
