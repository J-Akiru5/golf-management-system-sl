import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import type { Database } from "@/lib/supabase/types";
import { loadPublicEvents, loadShowcaseEvents, toPublicEvent } from "./public-events";

// The payload comes from `public_events()` and `public_showcase_events()`. These pin the field names
// so a change on one side cannot quietly blank the landing page.

const good = {
  tournamentId: "t1",
  name: "24th Bamboo Tee",
  dates: ["2026-11-12", "2026-11-13"],
  startFormat: "shotgun",
  firstTeeTime: "06:30",
  cutOffDate: "2026-11-01",
  entered: 87,
  entriesOpen: false,
};

const TODAY = "2026-11-14";

describe("toPublicEvent", () => {
  it("keeps a good row and marks it finished from the dates when today is passed", () => {
    expect(toPublicEvent(good, TODAY)).toEqual({ ...good, finished: true, featured: false });
  });

  it("drops a row with no id, because there is nowhere to send anyone", () => {
    expect(toPublicEvent({ ...good, tournamentId: "" })).toBeNull();
    expect(toPublicEvent({ ...good, tournamentId: undefined })).toBeNull();
  });

  it("drops a row with no name, because there is nothing to show", () => {
    expect(toPublicEvent({ ...good, name: "" })).toBeNull();
  });

  it("drops anything that is not an object", () => {
    expect(toPublicEvent(null)).toBeNull();
    expect(toPublicEvent("a string")).toBeNull();
    expect(toPublicEvent(42)).toBeNull();
  });

  it("keeps the event when a lesser field is missing, rather than hiding it", () => {
    const bare = { tournamentId: "t1", name: "Monthly Medal" };
    expect(toPublicEvent(bare)).toEqual({
      tournamentId: "t1",
      name: "Monthly Medal",
      dates: [],
      startFormat: "",
      firstTeeTime: "",
      cutOffDate: "",
      entered: 0,
      entriesOpen: true,
      featured: false,
      finished: false,
    });
  });

  it("never lets a negative or fractional entry count reach the page", () => {
    expect(toPublicEvent({ ...good, entered: -5 })?.entered).toBe(0);
    expect(toPublicEvent({ ...good, entered: 12.7 })?.entered).toBe(12);
    expect(toPublicEvent({ ...good, entered: "19" })?.entered).toBe(19);
    expect(toPublicEvent({ ...good, entered: "many" })?.entered).toBe(0);
  });

  it("keeps a closed event, so the page can still show it during tournament week", () => {
    expect(toPublicEvent({ ...good, entriesOpen: false })?.entriesOpen).toBe(false);
    expect(toPublicEvent({ ...good, entriesOpen: true })?.entriesOpen).toBe(true);
  });

  it("treats a payload without the flag as open, which is what the older function meant", () => {
    const { entriesOpen: _dropped, ...legacy } = good;
    expect(toPublicEvent(legacy)?.entriesOpen).toBe(true);
  });

  it("uses the showcase payload's finished flag when it is present", () => {
    expect(toPublicEvent({ ...good, finished: true }, "2026-01-01")?.finished).toBe(true);
    expect(toPublicEvent({ ...good, finished: false }, "2026-12-31")?.finished).toBe(false);
  });

  it("derives finished from the last date only when the payload has no flag", () => {
    expect(toPublicEvent(good, "2026-11-13")?.finished).toBe(false);
    expect(toPublicEvent(good, "2026-11-14")?.finished).toBe(true);
    // No day to compare against: not finished rather than guessed.
    expect(toPublicEvent(good)?.finished).toBe(false);
    // No dates: there is no last day to compare.
    expect(toPublicEvent({ ...good, dates: [] }, "2026-11-14")?.finished).toBe(false);
  });

  it("reads the organizer's feature flag only from an explicit true", () => {
    expect(toPublicEvent({ ...good, featured: true })?.featured).toBe(true);
    expect(toPublicEvent({ ...good, featured: false })?.featured).toBe(false);
    expect(toPublicEvent({ ...good, featured: "true" })?.featured).toBe(false);
    // The older payloads do not carry the flag, and the page then has no featured event.
    expect(toPublicEvent(good)?.featured).toBe(false);
  });

  it("filters a dates list down to strings", () => {
    expect(toPublicEvent({ ...good, dates: ["2026-11-12", null, 7, "2026-11-13"] })?.dates).toEqual(
      ["2026-11-12", "2026-11-13"],
    );
    expect(toPublicEvent({ ...good, dates: "2026-11-12" })?.dates).toEqual([]);
  });

  it("does not carry anything the database should not have sent", () => {
    const withExtras = {
      ...good,
      instructions: "call Jun",
      responseEmail: "a@b.c",
      players: ["x"],
    };
    expect(Object.keys(toPublicEvent(withExtras) ?? {}).sort()).toEqual([
      "cutOffDate",
      "dates",
      "entered",
      "entriesOpen",
      "featured",
      "finished",
      "firstTeeTime",
      "name",
      "startFormat",
      "tournamentId",
    ]);
  });
});

type RpcAnswer = { data: unknown; error: { code: string; message: string } | null };

function clientWith(answers: Record<string, RpcAnswer>): {
  client: SupabaseClient<Database>;
  rpc: ReturnType<typeof vi.fn>;
} {
  const rpc = vi.fn(
    async (name: string) =>
      answers[name] ?? { data: null, error: { code: "PGRST202", message: "missing" } },
  );
  return { client: { rpc } as unknown as SupabaseClient<Database>, rpc };
}

describe("loadShowcaseEvents", () => {
  it("reads the showcase function first and parses its finished flag", async () => {
    const { client, rpc } = clientWith({
      public_showcase_events: { data: [{ ...good, finished: true }], error: null },
      public_events: { data: [good], error: null },
    });

    const events = await loadShowcaseEvents(client, TODAY);

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("public_showcase_events");
    expect(events).toEqual([{ ...good, finished: true, featured: false }]);
  });

  it("falls back to public_events when the showcase function is missing", async () => {
    const { client, rpc } = clientWith({
      public_showcase_events: {
        data: null,
        error: { code: "PGRST202", message: "Could not find the function" },
      },
      public_events: { data: [good], error: null },
    });

    const events = await loadShowcaseEvents(client, TODAY);

    expect(rpc.mock.calls.map(([name]) => name)).toEqual([
      "public_showcase_events",
      "public_events",
    ]);
    expect(events).toEqual([{ ...good, finished: true, featured: false }]);
  });

  it("falls back to public_open_events when the first two reads fail", async () => {
    const { client, rpc } = clientWith({
      public_showcase_events: { data: null, error: { code: "PGRST202", message: "missing" } },
      public_events: { data: null, error: { code: "PGRST202", message: "missing" } },
      public_open_events: { data: [good], error: null },
    });

    const events = await loadShowcaseEvents(client, TODAY);

    expect(rpc.mock.calls.map(([name]) => name)).toEqual([
      "public_showcase_events",
      "public_events",
      "public_open_events",
    ]);
    expect(events).toHaveLength(1);
  });

  it("answers null when every read fails, never sample events", async () => {
    const { client } = clientWith({});

    expect(await loadShowcaseEvents(client, TODAY)).toBeNull();
  });

  it("drops a malformed row rather than showing a guessed event", async () => {
    const { client } = clientWith({
      public_showcase_events: {
        data: [{ ...good, tournamentId: "" }, good],
        error: null,
      },
    });

    const events = await loadShowcaseEvents(client, TODAY);

    expect(events).toHaveLength(1);
    expect(events?.[0]?.tournamentId).toBe("t1");
  });
});

describe("loadPublicEvents", () => {
  it("derives finished from the dates the caller's today makes visible", async () => {
    const { client } = clientWith({
      public_events: { data: [good], error: null },
    });

    const events = await loadPublicEvents(client, TODAY);

    expect(events?.[0]).toMatchObject({ tournamentId: "t1", finished: true });
  });

  it("falls back to the older function", async () => {
    const { client, rpc } = clientWith({
      public_events: { data: null, error: { code: "PGRST202", message: "missing" } },
      public_open_events: { data: [good], error: null },
    });

    expect(await loadPublicEvents(client, TODAY)).toHaveLength(1);
    expect(rpc.mock.calls.map(([name]) => name)).toEqual(["public_events", "public_open_events"]);
  });

  it("answers null when both reads fail", async () => {
    const { client } = clientWith({});
    expect(await loadPublicEvents(client, TODAY)).toBeNull();
  });
});
