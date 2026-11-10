import type {
  FeedbackCategory,
  FeedbackNote,
  FeedbackStatus,
  FeedbackSubmission,
} from "@/lib/data/feedback";

/**
 * The local demo feedback store.
 *
 * The demo build has no database. This store lets the public form and the desk inbox be reviewed
 * together in one browser without pretending that a note reached the live organizer. It is never
 * imported by a connected production path.
 */

export const DEMO_CLUB_ID = "demo-club";
const STORAGE_KEY = "teeline.demo.feedback.v1";

const SAMPLE: FeedbackNote[] = [
  {
    id: "demo-feedback-1",
    clubId: DEMO_CLUB_ID,
    category: "improvement",
    message:
      "The tee-time board is easy to read on a phone. A direct link to my own start from the home page would save a search.",
    contactName: "Sample visitor",
    contactEmail: "sample@example.test",
    contactConsent: true,
    pagePath: "/pairings",
    locale: "en",
    status: "new",
    createdAt: new Date(Date.now() - 1000 * 60 * 24).toISOString(),
    updatedAt: new Date(Date.now() - 1000 * 60 * 24).toISOString(),
    statusChangedAt: null,
    statusChangedBy: null,
  },
  {
    id: "demo-feedback-2",
    clubId: DEMO_CLUB_ID,
    category: "content",
    message:
      "The rules page says the entry cut-off is 1 November, but the home page still shows entry as open.",
    contactName: null,
    contactEmail: null,
    contactConsent: false,
    pagePath: "/rules",
    locale: "tl",
    status: "planned",
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString(),
    updatedAt: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
    statusChangedAt: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
    statusChangedBy: "Demo organizer",
  },
  {
    id: "demo-feedback-3",
    clubId: DEMO_CLUB_ID,
    category: "bug",
    message:
      "On a small phone the leaderboard filter row is hard to tap. The buttons are close together.",
    contactName: null,
    contactEmail: null,
    contactConsent: false,
    pagePath: "/leaderboard",
    locale: "hil",
    status: "read",
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 28).toISOString(),
    updatedAt: new Date(Date.now() - 1000 * 60 * 60 * 26).toISOString(),
    statusChangedAt: new Date(Date.now() - 1000 * 60 * 60 * 26).toISOString(),
    statusChangedBy: "Demo organizer",
  },
];

function isNote(value: unknown): value is FeedbackNote {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const note = value as Partial<FeedbackNote>;
  return (
    typeof note.id === "string" &&
    typeof note.clubId === "string" &&
    typeof note.message === "string" &&
    typeof note.createdAt === "string" &&
    typeof note.status === "string"
  );
}

function readStored(): FeedbackNote[] {
  if (typeof window === "undefined") return SAMPLE;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return SAMPLE;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return SAMPLE;
    const notes = parsed.filter(isNote);
    return notes.length > 0 ? notes : SAMPLE;
  } catch {
    return SAMPLE;
  }
}

function writeStored(notes: FeedbackNote[]): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
  } catch {
    // Storage off: the in-memory page can still show what was submitted in this render.
  }
}

export function loadDemoFeedback(): FeedbackNote[] {
  return [...readStored()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function addDemoFeedback(
  submission: FeedbackSubmission,
  clubId = DEMO_CLUB_ID,
): FeedbackNote {
  const now = new Date().toISOString();
  const note: FeedbackNote = {
    id: `demo-feedback-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    clubId,
    category: submission.category as FeedbackCategory,
    message: submission.message,
    contactName: submission.contactName,
    contactEmail: submission.contactEmail,
    contactConsent: submission.contactConsent,
    pagePath: submission.pagePath,
    locale: submission.locale,
    status: "new",
    createdAt: now,
    updatedAt: now,
    statusChangedAt: null,
    statusChangedBy: null,
  };
  writeStored([note, ...readStored()]);
  return note;
}

export function updateDemoFeedbackStatus(id: string, status: FeedbackStatus): FeedbackNote | null {
  const notes = readStored();
  const current = notes.find((note) => note.id === id);
  if (!current) return null;
  const updated: FeedbackNote = {
    ...current,
    status,
    updatedAt: new Date().toISOString(),
    statusChangedAt: new Date().toISOString(),
    statusChangedBy: "Demo organizer",
  };
  writeStored(notes.map((note) => (note.id === id ? updated : note)));
  return updated;
}
