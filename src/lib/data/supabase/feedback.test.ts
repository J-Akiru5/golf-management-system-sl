import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import type { Database } from "@/lib/supabase/types";
import {
  countNewFeedback,
  loadFeedbackEventNames,
  loadFeedbackInbox,
  parseFeedbackSubmitResult,
  submitFeedback,
  updateFeedbackResolution,
  updateFeedbackStatus,
} from "./feedback";

const EVENT_ID = "a0b1c2d3-e4f5-4678-9abc-def012345678";

const ROW = {
  id: "note-1",
  club_id: "club-1",
  tournament_id: null,
  category: "bug",
  message: "The pairings page shows the wrong hole.",
  contact_name: null,
  contact_email: null,
  contact_consent: false,
  page_path: "/pairings",
  locale: "en",
  status: "new",
  resolution_note: null,
  resolution_note_updated_at: null,
  resolution_note_updated_by: null,
  rate_key: "12345",
  created_at: "2026-11-10T08:00:00.000Z",
  updated_at: "2026-11-10T08:00:00.000Z",
  status_changed_at: null,
  status_changed_by: null,
};

const SUBMISSION = {
  category: "bug" as const,
  message: "The pairings page shows the wrong hole.",
  contactName: "Jo",
  contactEmail: "jo@example.com",
  contactConsent: true,
  pagePath: "/pairings",
  locale: "en" as const,
};

describe("parseFeedbackSubmitResult", () => {
  it("passes an acceptance through", () => {
    expect(
      parseFeedbackSubmitResult({
        ok: true,
        code: "accepted",
        message: "Thank you. The organizer will read your note.",
      }),
    ).toEqual({
      ok: true,
      code: "accepted",
      message: "Thank you. The organizer will read your note.",
    });
  });

  it("keeps the RPC's code for a refusal", () => {
    expect(
      parseFeedbackSubmitResult({
        ok: false,
        code: "rate_limited",
        message: "Too many notes were sent just now.",
      }),
    ).toMatchObject({ ok: false, code: "rate_limited" });
  });

  it("does not invent a code from an unknown payload", () => {
    const result = parseFeedbackSubmitResult({ whatever: true });
    expect(result.ok).toBe(false);
    expect(result.code).toBe("error");
    expect(result.message).toMatch(/try again/i);
  });

  it("keeps the event refusal code for the form", () => {
    expect(
      parseFeedbackSubmitResult({
        ok: false,
        code: "invalid_event",
        message: "That event is not available for feedback.",
      }),
    ).toMatchObject({ ok: false, code: "invalid_event" });
  });
});

describe("submitFeedback before migration 20261122000000", () => {
  const details = {
    concerns: ["score" as const, "tee_off" as const],
    holeNo: 7,
    teeColour: "white" as const,
    playerName: "Juan Dela Cruz",
    handicap: "12.4",
    schedule: "Day 2, 7:12 AM",
    source: "form" as const,
  };

  it("files a concern as a content note carrying every answer when p_details is unknown", async () => {
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({
        data: null,
        error: { code: "PGRST202", message: "Could not find the function public.submit_feedback" },
      })
      .mockResolvedValueOnce({
        data: { ok: true, code: "accepted", message: "Thank you." },
        error: null,
      });
    const client = { rpc } as unknown as SupabaseClient<Database>;

    const result = await submitFeedback(client, {
      ...SUBMISSION,
      category: "concern" as never,
      message: "My score on 7 is wrong.",
      details,
    });

    expect(result).toMatchObject({ ok: true, code: "accepted" });
    const [, args] = rpc.mock.calls[1] as [string, Record<string, unknown>];
    expect(args.p_category).toBe("content");
    expect(args).not.toHaveProperty("p_details");
    expect(args.p_message).toBe(
      [
        "Player concern: Score (hole 7), Tee off (White)",
        "Player name: Juan Dela Cruz",
        "Handicap: 12.4",
        "Schedule: Day 2, 7:12 AM",
        "Sent from: the feedback form",
        "",
        "My score on 7 is wrong.",
      ].join("\n"),
    );
  });

  it("still reports not ready when even the old function is missing", async () => {
    const missing = {
      data: null,
      error: { code: "PGRST202", message: "Could not find the function" },
    };
    const rpc = vi.fn().mockResolvedValue(missing);
    const client = { rpc } as unknown as SupabaseClient<Database>;

    const result = await submitFeedback(client, { ...SUBMISSION, details });

    expect(rpc).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({ ok: false, code: "not_ready" });
  });
});

describe("submitFeedback", () => {
  it("sends the whole validated note through the RPC, including the honeypot field", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { ok: true, code: "accepted", message: "Thank you." },
      error: null,
    });
    const client = { rpc } as unknown as SupabaseClient<Database>;

    const result = await submitFeedback(client, SUBMISSION);

    expect(rpc).toHaveBeenCalledWith("submit_feedback", {
      p_category: "bug",
      p_message: SUBMISSION.message,
      p_contact_name: "Jo",
      p_contact_email: "jo@example.com",
      p_contact_consent: true,
      p_page_path: "/pairings",
      p_locale: "en",
      p_honeypot: "",
      p_tournament: null,
      p_details: null,
    });
    expect(result).toMatchObject({ ok: true, code: "accepted" });
  });

  it("sends the concern's details through the same call", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { ok: true, code: "accepted", message: "Thank you." },
      error: null,
    });
    const client = { rpc } as unknown as SupabaseClient<Database>;
    const details = {
      concerns: ["score" as const],
      holeNo: 7,
      source: "form" as const,
    };

    await submitFeedback(client, {
      ...SUBMISSION,
      category: "concern",
      message: "Score (hole 7)",
      details,
    });

    expect(rpc).toHaveBeenCalledWith(
      "submit_feedback",
      expect.objectContaining({ p_category: "concern", p_details: details }),
    );
  });

  it("passes a validated event id through without changing it", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { ok: true, code: "accepted", message: "Thank you." },
      error: null,
    });
    const client = { rpc } as unknown as SupabaseClient<Database>;

    await submitFeedback(client, { ...SUBMISSION, tournamentId: EVENT_ID });

    expect(rpc).toHaveBeenCalledWith(
      "submit_feedback",
      expect.objectContaining({ p_tournament: EVENT_ID }),
    );
  });

  it("reports a migration that has not been applied without echoing the database error", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { code: "PGRST202", message: "Could not find the function public.submit_feedback" },
    });
    const client = { rpc } as unknown as SupabaseClient<Database>;

    const result = await submitFeedback(client, SUBMISSION);

    expect(result.code).toBe("not_ready");
    expect(result.message).not.toMatch(/PGRST202/);
  });

  it("turns a transport failure into a short, non-sensitive message", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { code: "08006", message: "connection failure at db.internal" },
    });
    const client = { rpc } as unknown as SupabaseClient<Database>;

    const result = await submitFeedback(client, SUBMISSION);

    expect(result.code).toBe("error");
    expect(result.message).not.toMatch(/db\.internal/);
  });
});

describe("loadFeedbackInbox", () => {
  it("reads the newest notes for the club and maps them", async () => {
    const limit = vi.fn().mockResolvedValue({ data: [ROW], error: null });
    const order = vi.fn(() => ({ limit }));
    const eq = vi.fn(() => ({ order }));
    const select = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ select }));
    const client = { from } as unknown as SupabaseClient<Database>;

    const notes = await loadFeedbackInbox(client, "club-1", { limit: 50 });

    expect(from).toHaveBeenCalledWith("public_feedback");
    expect(select).toHaveBeenCalledWith(expect.stringContaining("message"));
    expect(select).toHaveBeenCalledWith(expect.not.stringContaining("rate_key"));
    expect(eq).toHaveBeenCalledWith("club_id", "club-1");
    expect(order).toHaveBeenCalledWith("created_at", { ascending: false });
    expect(limit).toHaveBeenCalledWith(50);
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({ id: "note-1", clubId: "club-1", status: "new" });
  });

  it("drops a malformed row rather than showing a guessed status", async () => {
    const limit = vi
      .fn()
      .mockResolvedValue({ data: [{ ...ROW, status: "archived" }], error: null });
    const order = vi.fn(() => ({ limit }));
    const eq = vi.fn(() => ({ order }));
    const select = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ select }));
    const client = { from } as unknown as SupabaseClient<Database>;

    expect(await loadFeedbackInbox(client, "club-1")).toEqual([]);
  });

  it("names the missing migration when the table is absent", async () => {
    const limit = vi.fn().mockResolvedValue({
      data: null,
      error: { code: "42P01", message: 'relation "public.public_feedback" does not exist' },
    });
    const order = vi.fn(() => ({ limit }));
    const eq = vi.fn(() => ({ order }));
    const select = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ select }));
    const client = { from } as unknown as SupabaseClient<Database>;

    await expect(loadFeedbackInbox(client, "club-1")).rejects.toThrow(/migration/i);
  });

  it("names the missing follow-up migration when the new columns are absent", async () => {
    const limit = vi.fn().mockResolvedValue({
      data: null,
      error: {
        code: "42703",
        message: "column public_feedback.tournament_id does not exist",
      },
    });
    const order = vi.fn(() => ({ limit }));
    const eq = vi.fn(() => ({ order }));
    const select = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ select }));
    const client = { from } as unknown as SupabaseClient<Database>;

    await expect(loadFeedbackInbox(client, "club-1")).rejects.toThrow(/follow-up migration/i);
  });

  it("reads the notes without their details while the concerns migration is not applied", async () => {
    const limit = vi
      .fn()
      .mockResolvedValueOnce({
        data: null,
        error: { code: "42703", message: "column public_feedback.details does not exist" },
      })
      .mockResolvedValueOnce({ data: [ROW], error: null });
    const order = vi.fn(() => ({ limit }));
    const eq = vi.fn(() => ({ order }));
    const select = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ select }));
    const client = { from } as unknown as SupabaseClient<Database>;

    const notes = await loadFeedbackInbox(client, "club-1");

    expect(select).toHaveBeenNthCalledWith(1, expect.stringContaining("details"));
    expect(select).toHaveBeenNthCalledWith(2, expect.not.stringMatching(/\bdetails\b/));
    expect(notes).toHaveLength(1);
    expect(notes[0]?.details).toBeNull();
  });

  it("labels a note with its event name from a club-scoped staff read", async () => {
    const limit = vi.fn().mockResolvedValue({
      data: [{ ...ROW, tournament_id: EVENT_ID }],
      error: null,
    });
    const order = vi.fn(() => ({ limit }));
    const eq = vi.fn(() => ({ order }));
    const select = vi.fn(() => ({ eq }));
    const feedbackFrom = vi.fn(() => ({ select }));

    const inIds = vi
      .fn()
      .mockResolvedValue({ data: [{ id: EVENT_ID, name: "24th Bamboo Tee" }], error: null });
    const eventClubScope = vi.fn(() => ({ in: inIds }));
    const eventSelect = vi.fn(() => ({ eq: eventClubScope }));
    const from = vi.fn((table: string) => {
      if (table === "tournaments") return { select: eventSelect };
      return feedbackFrom();
    });
    const client = { from } as unknown as SupabaseClient<Database>;

    const notes = await loadFeedbackInbox(client, "club-1");

    expect(eventSelect).toHaveBeenCalledWith("id, name");
    expect(eventClubScope).toHaveBeenCalledWith("club_id", "club-1");
    expect(inIds).toHaveBeenCalledWith("id", [EVENT_ID]);
    expect(notes[0]).toMatchObject({ tournamentId: EVENT_ID, eventName: "24th Bamboo Tee" });
  });

  it("keeps the note when the event-name read fails", async () => {
    const limit = vi.fn().mockResolvedValue({
      data: [{ ...ROW, tournament_id: EVENT_ID }],
      error: null,
    });
    const order = vi.fn(() => ({ limit }));
    const eq = vi.fn(() => ({ order }));
    const select = vi.fn(() => ({ eq }));
    const feedbackFrom = vi.fn(() => ({ select }));
    const inIds = vi
      .fn()
      .mockResolvedValue({ data: null, error: { code: "42501", message: "denied" } });
    const eventClubScope = vi.fn(() => ({ in: inIds }));
    const eventSelect = vi.fn(() => ({ eq: eventClubScope }));
    const from = vi.fn((table: string) => {
      if (table === "tournaments") return { select: eventSelect };
      return feedbackFrom();
    });
    const client = { from } as unknown as SupabaseClient<Database>;

    const notes = await loadFeedbackInbox(client, "club-1");

    expect(notes).toHaveLength(1);
    expect(notes[0]?.eventName).toBeNull();
  });
});

describe("loadFeedbackEventNames", () => {
  it("returns an empty map without a query when there are no ids", async () => {
    const from = vi.fn();
    const client = { from } as unknown as SupabaseClient<Database>;

    expect(await loadFeedbackEventNames(client, "club-1", [])).toEqual(new Map());
    expect(from).not.toHaveBeenCalled();
  });
});

describe("updateFeedbackStatus", () => {
  it("updates only the status of one note in the caller's club", async () => {
    const maybeSingle = vi
      .fn()
      .mockResolvedValue({ data: { ...ROW, status: "planned" }, error: null });
    const select = vi.fn(() => ({ maybeSingle }));
    const byId = vi.fn(() => ({ select }));
    const byClub = vi.fn(() => ({ eq: byId }));
    const update = vi.fn(() => ({ eq: byClub }));
    const from = vi.fn(() => ({ update }));
    const client = { from } as unknown as SupabaseClient<Database>;

    const note = await updateFeedbackStatus(client, "club-1", "note-1", "planned");

    expect(update).toHaveBeenCalledWith({ status: "planned" });
    expect(byClub).toHaveBeenCalledWith("club_id", "club-1");
    expect(byId).toHaveBeenCalledWith("id", "note-1");
    expect(note.status).toBe("planned");
  });

  it("explains a role refusal instead of a bare RLS error", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: null,
      error: { code: "42501", message: "new row violates row-level security policy" },
    });
    const select = vi.fn(() => ({ maybeSingle }));
    const byId = vi.fn(() => ({ select }));
    const byClub = vi.fn(() => ({ eq: byId }));
    const update = vi.fn(() => ({ eq: byClub }));
    const from = vi.fn(() => ({ update }));
    const client = { from } as unknown as SupabaseClient<Database>;

    await expect(updateFeedbackStatus(client, "club-1", "note-1", "done")).rejects.toThrow(
      /owner or organizer/i,
    );
  });

  it("refuses a missing row instead of pretending it changed", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    const select = vi.fn(() => ({ maybeSingle }));
    const byId = vi.fn(() => ({ select }));
    const byClub = vi.fn(() => ({ eq: byId }));
    const update = vi.fn(() => ({ eq: byClub }));
    const from = vi.fn(() => ({ update }));
    const client = { from } as unknown as SupabaseClient<Database>;

    await expect(updateFeedbackStatus(client, "club-1", "missing", "done")).rejects.toThrow(
      /not found/i,
    );
  });
});

describe("updateFeedbackResolution", () => {
  it("updates only the resolution note of one note in the caller's club", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: { ...ROW, resolution_note: "Checked with the club." },
      error: null,
    });
    const select = vi.fn(() => ({ maybeSingle }));
    const byId = vi.fn(() => ({ select }));
    const byClub = vi.fn(() => ({ eq: byId }));
    const update = vi.fn(() => ({ eq: byClub }));
    const from = vi.fn(() => ({ update }));
    const client = { from } as unknown as SupabaseClient<Database>;

    const note = await updateFeedbackResolution(
      client,
      "club-1",
      "note-1",
      "  Checked with the club.  ",
    );

    expect(update).toHaveBeenCalledWith({ resolution_note: "Checked with the club." });
    expect(byClub).toHaveBeenCalledWith("club_id", "club-1");
    expect(byId).toHaveBeenCalledWith("id", "note-1");
    expect(note.resolutionNote).toBe("Checked with the club.");
  });

  it("clears a note by saving null", async () => {
    const maybeSingle = vi
      .fn()
      .mockResolvedValue({ data: { ...ROW, resolution_note: null }, error: null });
    const select = vi.fn(() => ({ maybeSingle }));
    const byId = vi.fn(() => ({ select }));
    const byClub = vi.fn(() => ({ eq: byId }));
    const update = vi.fn(() => ({ eq: byClub }));
    const from = vi.fn(() => ({ update }));
    const client = { from } as unknown as SupabaseClient<Database>;

    await updateFeedbackResolution(client, "club-1", "note-1", "   ");

    expect(update).toHaveBeenCalledWith({ resolution_note: null });
  });

  it("refuses an oversized note before touching the database", async () => {
    const from = vi.fn();
    const client = { from } as unknown as SupabaseClient<Database>;

    await expect(
      updateFeedbackResolution(client, "club-1", "note-1", "x".repeat(2001)),
    ).rejects.toThrow(/2000 characters/i);
    expect(from).not.toHaveBeenCalled();
  });

  it("explains a role refusal instead of a bare RLS error", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: null,
      error: { code: "42501", message: "new row violates row-level security policy" },
    });
    const select = vi.fn(() => ({ maybeSingle }));
    const byId = vi.fn(() => ({ select }));
    const byClub = vi.fn(() => ({ eq: byId }));
    const update = vi.fn(() => ({ eq: byClub }));
    const from = vi.fn(() => ({ update }));
    const client = { from } as unknown as SupabaseClient<Database>;

    await expect(updateFeedbackResolution(client, "club-1", "note-1", "Checked.")).rejects.toThrow(
      /owner or organizer/i,
    );
  });
});

describe("demo requests", () => {
  it("sends the demo category through the same feedback RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { ok: true, code: "accepted", message: "Thank you." },
      error: null,
    });
    const client = { rpc } as unknown as SupabaseClient<Database>;

    await submitFeedback(client, {
      ...SUBMISSION,
      category: "demo",
      message: "Club: Iloilo Golf and Country Club\n\nWhat would you like to see?",
      pagePath: "/demo",
    });

    expect(rpc).toHaveBeenCalledWith(
      "submit_feedback",
      expect.objectContaining({
        p_category: "demo",
        p_contact_email: "jo@example.com",
        p_contact_consent: true,
        p_page_path: "/demo",
      }),
    );
  });

  it("keeps the server's clear message when a demo request has no email", () => {
    const result = parseFeedbackSubmitResult({
      ok: false,
      code: "contact_email_required",
      message: "Enter an email address so the club can reply about a demo.",
    });
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/email address/i);
  });
});

describe("countNewFeedback", () => {
  it("counts only new notes for the club", async () => {
    const statusScope = vi.fn().mockResolvedValue({ count: 4, error: null });
    const clubScope = vi.fn(() => ({ eq: statusScope }));
    const select = vi.fn(() => ({ eq: clubScope }));
    const from = vi.fn(() => ({ select }));
    const client = { from } as unknown as SupabaseClient<Database>;

    expect(await countNewFeedback(client, "club-1")).toBe(4);
    expect(select).toHaveBeenCalledWith("id", { count: "exact", head: true });
    expect(clubScope).toHaveBeenCalledWith("club_id", "club-1");
    expect(statusScope).toHaveBeenCalledWith("status", "new");
  });

  it("answers zero when the feedback migration is missing", async () => {
    const statusScope = vi.fn().mockResolvedValue({
      count: null,
      error: { code: "42P01", message: 'relation "public.public_feedback" does not exist' },
    });
    const clubScope = vi.fn(() => ({ eq: statusScope }));
    const select = vi.fn(() => ({ eq: clubScope }));
    const from = vi.fn(() => ({ select }));
    const client = { from } as unknown as SupabaseClient<Database>;

    expect(await countNewFeedback(client, "club-1")).toBe(0);
  });
});
