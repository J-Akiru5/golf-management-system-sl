import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import type { Database } from "@/lib/supabase/types";
import {
  archivePhase,
  loadEventArchive,
  sortArchiveNewestFirst,
  toArchivedEvent,
} from "./event-archive";

// The payload comes from `public_event_archive()`; the fallback payloads come from
// `public_showcase_events()` and `public_events()`. These pin the field names and the ordering so a
// change on one side cannot quietly reorder the portfolio or hide an event.

const TODAY = "2026-11-20";

const archived = {
  tournamentId: "t1",
  name: "24th Bamboo Tee",
  dates: ["2026-11-12", "2026-11-15"],
  startFormat: "shotgun",
  firstTeeTime: "06:30",
  cutOffDate: "2026-11-01",
  entered: 96,
  entriesOpen: false,
  featured: false,
  hasRules: true,
};

describe("archivePhase", () => {
  it("calls an event in its own week live, even though its entries closed", () => {
    expect(
      archivePhase({ dates: ["2026-11-12", "2026-11-15"], finished: false }, "2026-11-13"),
    ).toBe("live");
  });

  it("calls the first and the last day live", () => {
    expect(
      archivePhase({ dates: ["2026-11-12", "2026-11-15"], finished: false }, "2026-11-12"),
    ).toBe("live");
    expect(
      archivePhase({ dates: ["2026-11-12", "2026-11-15"], finished: false }, "2026-11-15"),
    ).toBe("live");
  });

  it("calls a later event upcoming and an earlier one completed", () => {
    expect(archivePhase({ dates: ["2026-12-01"], finished: false }, TODAY)).toBe("upcoming");
    expect(archivePhase({ dates: ["2026-10-01"], finished: true }, TODAY)).toBe("completed");
  });

  it("falls back to the finished flag when there are no dates", () => {
    expect(archivePhase({ dates: [], finished: true }, TODAY)).toBe("completed");
    expect(archivePhase({ dates: [], finished: false }, TODAY)).toBe("upcoming");
  });
});

describe("toArchivedEvent", () => {
  it("keeps a good row and reads the archive's own flags", () => {
    expect(toArchivedEvent({ ...archived, finished: true }, TODAY)).toEqual({
      ...archived,
      finished: true,
      featured: false,
      phase: "completed",
    });
  });

  it("treats a missing hasRules as false rather than guessing rules exist", () => {
    const { hasRules: _dropped, ...withoutRules } = archived;
    expect(toArchivedEvent(withoutRules, TODAY)?.hasRules).toBe(false);
  });

  it("does not accept a truthy string as hasRules", () => {
    expect(toArchivedEvent({ ...archived, hasRules: "true" }, TODAY)?.hasRules).toBe(false);
  });

  it("drops a row with no id or no name", () => {
    expect(toArchivedEvent({ ...archived, tournamentId: "" }, TODAY)).toBeNull();
    expect(toArchivedEvent({ ...archived, name: "" }, TODAY)).toBeNull();
    expect(toArchivedEvent(null, TODAY)).toBeNull();
  });

  it("carries only the public fields, plus the archive's own", () => {
    const withExtras = { ...archived, rulesOfPlay: "local rules", contactEmail: "a@b.c" };
    expect(Object.keys(toArchivedEvent(withExtras, TODAY) ?? {}).sort()).toEqual([
      "cutOffDate",
      "dates",
      "entered",
      "entriesOpen",
      "featured",
      "finished",
      "firstTeeTime",
      "hasRules",
      "name",
      "phase",
      "startFormat",
      "tournamentId",
    ]);
  });
});

describe("sortArchiveNewestFirst", () => {
  it("puts the most recent last playing day first, and breaks a tie by name", () => {
    const event = (id: string, name: string, dates: string[]) => ({
      tournamentId: id,
      name,
      dates,
      startFormat: "shotgun",
      firstTeeTime: "06:30",
      cutOffDate: "2026-11-01",
      entered: 0,
      entriesOpen: false,
      featured: false,
      finished: true,
      hasRules: false,
      phase: "completed" as const,
    });

    const sorted = sortArchiveNewestFirst([
      event("a", "Alpha Cup", ["2026-01-02"]),
      event("b", "Bravo Cup", ["2026-06-01"]),
      event("c", "Charlie Cup", ["2026-06-01"]),
      event("d", "Delta Cup", ["2025-12-31"]),
    ]);

    expect(sorted.map((entry) => entry.tournamentId)).toEqual(["c", "b", "a", "d"]);
  });
});

type RpcAnswer = { data: unknown; error: { code: string; message: string } | null };

function clientWith(answers: Record<string, RpcAnswer>): SupabaseClient<Database> {
  const rpc = vi.fn(
    async (name: string) =>
      answers[name] ?? { data: null, error: { code: "PGRST202", message: "missing" } },
  );
  return { rpc } as unknown as SupabaseClient<Database>;
}

describe("loadEventArchive", () => {
  it("reads the archive function first and sorts newest first", async () => {
    const older = { ...archived, tournamentId: "t0", name: "Older Cup", dates: ["2025-05-01"] };
    const client = clientWith({
      public_event_archive: {
        data: [older, { ...archived, finished: true }],
        error: null,
      },
    });

    const events = await loadEventArchive(client, TODAY);

    expect(events?.map((event) => event.tournamentId)).toEqual(["t1", "t0"]);
    expect(events?.[0]?.phase).toBe("completed");
  });

  it("falls back to the showcase function while the archive is not applied", async () => {
    const client = clientWith({
      public_showcase_events: { data: [{ ...archived, finished: true }], error: null },
    });

    const events = await loadEventArchive(client, TODAY);

    expect(events).toHaveLength(1);
    expect(events?.[0]).toMatchObject({ tournamentId: "t1", hasRules: false, phase: "completed" });
  });

  it("falls back again to public_events when the showcase function is missing too", async () => {
    const rpc = vi.fn(async (name: string) =>
      name === "public_events"
        ? { data: [{ ...archived, finished: false }], error: null }
        : { data: null, error: { code: "PGRST202", message: "missing" } },
    );
    const client = { rpc } as unknown as SupabaseClient<Database>;

    const events = await loadEventArchive(client, TODAY);

    expect(rpc.mock.calls.map(([name]) => name)).toEqual([
      "public_event_archive",
      "public_showcase_events",
      "public_events",
    ]);
    expect(events?.[0]?.hasRules).toBe(false);
  });

  it("answers null when every read fails, never a sample event", async () => {
    expect(await loadEventArchive(clientWith({}), TODAY)).toBeNull();
  });

  it("answers an empty list when the archive is applied and the club has no events", async () => {
    const client = clientWith({ public_event_archive: { data: [], error: null } });

    expect(await loadEventArchive(client, TODAY)).toEqual([]);
  });
});
