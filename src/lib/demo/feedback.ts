import {
  type FeedbackCategory,
  type FeedbackNote,
  type FeedbackStatus,
  type FeedbackSubmission,
  normalizeFeedbackResolutionNote,
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

/**
 * Sample events for the browser-only preview. The ids are UUID-shaped so a demo `?event=` link goes
 * through the same parser as a real one, and they never leave the demo store.
 */
export const DEMO_FEEDBACK_EVENTS = {
  bamboo: { id: "a0000000-0000-4000-8000-000000000001", name: "24th Bamboo Tee" },
  championship: { id: "a0000000-0000-4000-8000-000000000002", name: "Club Championship" },
} as const;

export function demoEventName(tournamentId: string | null): string | null {
  if (!tournamentId) return null;
  for (const event of Object.values(DEMO_FEEDBACK_EVENTS)) {
    if (event.id === tournamentId) return event.name;
  }
  return null;
}

const SAMPLE: FeedbackNote[] = [
  {
    id: "demo-feedback-1",
    clubId: DEMO_CLUB_ID,
    tournamentId: DEMO_FEEDBACK_EVENTS.bamboo.id,
    eventName: DEMO_FEEDBACK_EVENTS.bamboo.name,
    category: "improvement",
    message:
      "The tee-time board is easy to read on a phone. A direct link to my own start from the home page would save a search.",
    contactName: "Sample visitor",
    contactEmail: "sample@example.test",
    contactConsent: true,
    pagePath: "/pairings",
    locale: "en",
    status: "new",
    resolutionNote: null,
    resolutionNoteUpdatedAt: null,
    resolutionNoteUpdatedBy: null,
    createdAt: new Date(Date.now() - 1000 * 60 * 24).toISOString(),
    updatedAt: new Date(Date.now() - 1000 * 60 * 24).toISOString(),
    statusChangedAt: null,
    statusChangedBy: null,
  },
  {
    id: "demo-feedback-2",
    clubId: DEMO_CLUB_ID,
    tournamentId: DEMO_FEEDBACK_EVENTS.championship.id,
    eventName: DEMO_FEEDBACK_EVENTS.championship.name,
    category: "content",
    message:
      "The rules page says the entry cut-off is 1 November, but the home page still shows entry as open.",
    contactName: null,
    contactEmail: null,
    contactConsent: false,
    pagePath: "/rules",
    locale: "tl",
    status: "planned",
    resolutionNote: "Added to the content checklist for the next update.",
    resolutionNoteUpdatedAt: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
    resolutionNoteUpdatedBy: "Demo organizer",
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString(),
    updatedAt: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
    statusChangedAt: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
    statusChangedBy: "Demo organizer",
  },
  {
    id: "demo-feedback-3",
    clubId: DEMO_CLUB_ID,
    tournamentId: null,
    eventName: null,
    category: "bug",
    message:
      "On a small phone the leaderboard filter row is hard to tap. The buttons are close together.",
    contactName: null,
    contactEmail: null,
    contactConsent: false,
    pagePath: "/leaderboard",
    locale: "hil",
    status: "read",
    resolutionNote: null,
    resolutionNoteUpdatedAt: null,
    resolutionNoteUpdatedBy: null,
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

/**
 * A note saved before the follow-up columns existed has no event or resolution fields. Fill them in
 * instead of dropping the organizer's preview notes.
 */
function withDefaults(note: FeedbackNote): FeedbackNote {
  const tournamentId = typeof note.tournamentId === "string" ? note.tournamentId : null;
  return {
    ...note,
    tournamentId,
    eventName: typeof note.eventName === "string" ? note.eventName : demoEventName(tournamentId),
    resolutionNote: typeof note.resolutionNote === "string" ? note.resolutionNote : null,
    resolutionNoteUpdatedAt:
      typeof note.resolutionNoteUpdatedAt === "string" ? note.resolutionNoteUpdatedAt : null,
    resolutionNoteUpdatedBy:
      typeof note.resolutionNoteUpdatedBy === "string" ? note.resolutionNoteUpdatedBy : null,
  };
}

function readStored(): FeedbackNote[] {
  if (typeof window === "undefined") return SAMPLE;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return SAMPLE;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return SAMPLE;
    const notes = parsed.filter(isNote).map(withDefaults);
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
  tournamentId: string | null = null,
): FeedbackNote {
  const now = new Date().toISOString();
  // An unknown event id is dropped rather than stored as a broken link. The real RPC makes the same
  // decision with a club and visibility check.
  const eventName = demoEventName(tournamentId);
  const note: FeedbackNote = {
    id: `demo-feedback-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    clubId,
    tournamentId: eventName ? tournamentId : null,
    eventName,
    category: submission.category as FeedbackCategory,
    message: submission.message,
    contactName: submission.contactName,
    contactEmail: submission.contactEmail,
    contactConsent: submission.contactConsent,
    pagePath: submission.pagePath,
    locale: submission.locale,
    status: "new",
    resolutionNote: null,
    resolutionNoteUpdatedAt: null,
    resolutionNoteUpdatedBy: null,
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

export function updateDemoFeedbackResolution(
  id: string,
  resolutionNote: string | null,
): FeedbackNote | null {
  const normalized = normalizeFeedbackResolutionNote(resolutionNote);
  if (!normalized.ok) return null;
  const notes = readStored();
  const current = notes.find((note) => note.id === id);
  if (!current) return null;
  const now = new Date().toISOString();
  const updated: FeedbackNote = {
    ...current,
    resolutionNote: normalized.value,
    resolutionNoteUpdatedAt: now,
    resolutionNoteUpdatedBy: "Demo organizer",
    updatedAt: now,
  };
  writeStored(notes.map((note) => (note.id === id ? updated : note)));
  return updated;
}
