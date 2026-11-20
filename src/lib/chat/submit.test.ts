import { describe, expect, it, vi } from "vitest";
import { prepareConcernSubmission, submitConcernNote } from "./submit";

const DETAILS = {
  concerns: ["score"],
  holeNo: 7,
  playerName: "Juan",
  handicap: "12.4",
  schedule: "Day 2, 7:12 AM",
};

const TRANSCRIPT = [
  { role: "user", content: "My score on hole 7 is wrong." },
  { role: "assistant", content: "Which hole number is it?" },
];

describe("preparing the confirmed note", () => {
  it("accepts a complete concern and builds the inbox line", () => {
    const prepared = prepareConcernSubmission({
      details: DETAILS,
      transcript: TRANSCRIPT,
      locale: "en",
      pagePath: "/pairings",
    });
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) return;
    expect(prepared.prepared.details).toMatchObject({
      concerns: ["score"],
      holeNo: 7,
      source: "chat",
    });
    expect(prepared.prepared.details.transcript).toHaveLength(2);
    expect(prepared.prepared.message).toBe("Score (hole 7)");
    expect(prepared.prepared.pagePath).toBe("/pairings");
  });

  it("forces the source to chat, whatever the browser sent", () => {
    const prepared = prepareConcernSubmission({
      details: { ...DETAILS, source: "form" },
      transcript: TRANSCRIPT,
      locale: "en",
    });
    expect(prepared.ok).toBe(true);
    if (prepared.ok) expect(prepared.prepared.details.source).toBe("chat");
  });

  it("refuses a note without a concern", () => {
    expect(prepareConcernSubmission({ details: {} })).toEqual({
      ok: false,
      problem: "no_concern",
    });
    expect(prepareConcernSubmission({ details: null })).toEqual({
      ok: false,
      problem: "no_concern",
    });
  });

  it("refuses an unknown concern and a missing follow-up", () => {
    expect(prepareConcernSubmission({ details: { concerns: ["made-up"] }, locale: "en" })).toEqual({
      ok: false,
      problem: "unknown_concern",
    });
    expect(prepareConcernSubmission({ details: { concerns: ["score"] }, locale: "en" })).toEqual({
      ok: false,
      problem: "hole_required",
    });
  });

  it("refuses a hole outside the course", () => {
    expect(
      prepareConcernSubmission({
        details: { concerns: ["score"], holeNo: 22 },
        locale: "en",
      }),
    ).toEqual({ ok: false, problem: "hole_out_of_range" });
  });

  it("refuses a malformed transcript", () => {
    expect(
      prepareConcernSubmission({
        details: DETAILS,
        transcript: [{ role: "system", content: "no" }],
        locale: "en",
      }),
    ).toEqual({ ok: false, problem: "bad_transcript" });
  });

  it("accepts a note with no transcript", () => {
    expect(prepareConcernSubmission({ details: DETAILS, locale: "en" }).ok).toBe(true);
  });

  it("maps the chat language onto the locale the table accepts", () => {
    const tl = prepareConcernSubmission({ details: DETAILS, locale: "tl" });
    expect(tl.ok && tl.prepared.locale).toBe("tl");
    expect(tl.ok && tl.prepared.language).toBe("tl");

    const ceb = prepareConcernSubmission({ details: DETAILS, locale: "ceb" });
    expect(ceb.ok && ceb.prepared.locale).toBe("en");
    expect(ceb.ok && ceb.prepared.language).toBe("ceb");

    const unknown = prepareConcernSubmission({ details: DETAILS, locale: "fr" });
    expect(unknown.ok && unknown.prepared.locale).toBe("en");
  });

  it("reduces a page path to its pathname and drops a broken one", () => {
    const withQuery = prepareConcernSubmission({
      details: DETAILS,
      locale: "en",
      pagePath: "/pairings?tab=profile#top",
    });
    expect(withQuery.ok && withQuery.prepared.pagePath).toBe("/pairings");

    const broken = prepareConcernSubmission({
      details: DETAILS,
      locale: "en",
      pagePath: "https://evil.test/steal",
    });
    expect(broken.ok && broken.prepared.pagePath).toBeNull();
  });

  it("keeps a honeypot value so the submit can refuse it", () => {
    const prepared = prepareConcernSubmission({
      details: DETAILS,
      locale: "en",
      honeypot: "  bot  ",
    });
    expect(prepared.ok && prepared.prepared.honeypot).toBe("bot");
  });
});

function rpcClient(result: { data?: unknown; error?: { code?: string; message?: string } | null }) {
  const rpc = vi.fn(async (_fn: string, _args: Record<string, unknown>) => ({
    data: result.data ?? null,
    error: result.error ?? null,
  }));
  return { rpc, calls: rpc };
}

function preparedNote() {
  const prepared = prepareConcernSubmission({
    details: DETAILS,
    transcript: TRANSCRIPT,
    locale: "en",
    pagePath: "/pairings",
  });
  if (!prepared.ok) throw new Error("the fixture must be valid");
  return prepared.prepared;
}

describe("filing the note", () => {
  it("calls submit_feedback by named arguments with the details payload", async () => {
    const client = rpcClient({
      data: {
        ok: true,
        code: "accepted",
        message: "Thank you. The organizer will read your note.",
      },
    });
    const outcome = await submitConcernNote(client, preparedNote());
    expect(outcome.ok).toBe(true);

    const [fn, args] = client.calls.mock.calls[0] ?? [];
    expect(fn).toBe("submit_feedback");
    expect(args).toMatchObject({
      p_category: "concern",
      p_message: "Score (hole 7)",
      p_contact_email: null,
      p_contact_consent: false,
      p_locale: "en",
      p_honeypot: "",
      p_tournament: null,
      p_details: preparedNote().details,
    });
  });

  it("answers a filled honeypot with the ordinary success and writes nothing", async () => {
    const client = rpcClient({ data: { ok: true, code: "accepted" } });
    const prepared = { ...preparedNote(), honeypot: "bot" };
    const outcome = await submitConcernNote(client, prepared);
    expect(outcome.ok).toBe(true);
    expect(client.calls).not.toHaveBeenCalled();
  });

  it("files the note as a content note with every answer before migration 20261122000000", async () => {
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
    const outcome = await submitConcernNote({ rpc }, preparedNote());
    expect(outcome).toMatchObject({ ok: true });
    const [, args] = rpc.mock.calls[1] as [string, Record<string, unknown>];
    expect(args.p_category).toBe("content");
    expect(args).not.toHaveProperty("p_details");
    expect(String(args.p_message)).toMatch(/^Player concern: /);
    expect(String(args.p_message)).toContain("Sent from: the Teeo chat");
  });

  it("reports the inbox as not ready when the function is missing", async () => {
    const client = rpcClient({
      error: { code: "PGRST202", message: "Could not find the function public.submit_feedback" },
    });
    await expect(submitConcernNote(client, preparedNote())).resolves.toMatchObject({
      ok: false,
      code: "not_ready",
    });
  });

  it("passes the database's rate limit through", async () => {
    const client = rpcClient({ data: { ok: false, code: "rate_limited", message: "Too many." } });
    await expect(submitConcernNote(client, preparedNote())).resolves.toMatchObject({
      ok: false,
      code: "rate_limited",
    });
  });

  it("treats a refused note as invalid", async () => {
    const client = rpcClient({
      data: { ok: false, code: "invalid_category", message: "Choose what the note is about." },
    });
    await expect(submitConcernNote(client, preparedNote())).resolves.toMatchObject({
      ok: false,
      code: "invalid",
    });
  });

  it("never echoes a database message on a generic failure", async () => {
    const client = rpcClient({
      error: { code: "XX000", message: "relation public.secret_table does not exist" },
    });
    const outcome = await submitConcernNote(client, preparedNote());
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.message).not.toContain("secret_table");
      expect(outcome.code).toBe("error");
    }
  });
});
