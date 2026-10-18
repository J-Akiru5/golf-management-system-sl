import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import type { Database } from "@/lib/supabase/types";
import {
  DrawConflictError,
  drawToJson,
  publishPairings,
  saveDraw,
  unpublishPairings,
} from "./draw-sync";

type Reply = { data: unknown; error: { message: string; code?: string } | null };

function fakeClient(reply: Reply) {
  const rpc = vi.fn().mockResolvedValue(reply);
  return { client: { rpc } as unknown as SupabaseClient<Database>, rpc };
}

const group = {
  number: 1,
  flightId: "f1",
  playerIds: ["p1", "p2"],
  startHole: 1,
  wave: "A",
  time: "06:30",
  locked: false,
};

describe("drawToJson", () => {
  it("sends only the fields the database function reads", () => {
    expect(drawToJson([{ ...group, extra: "x" } as typeof group])).toEqual([group]);
  });
});

describe("saveDraw", () => {
  it("names the revision it started from and returns the new one", async () => {
    const { client, rpc } = fakeClient({ data: 5, error: null });
    await expect(saveDraw(client, "t1", 4, [group], [])).resolves.toBe(5);
    expect(rpc).toHaveBeenCalledWith("save_draw", {
      p_tournament: "t1",
      p_expected_revision: 4,
      p_groups: [group],
      p_overrides: [],
    });
  });

  it("leaves the stored overrides alone when none are sent", async () => {
    const { client, rpc } = fakeClient({ data: 1, error: null });
    await saveDraw(client, "t1", 0, [group], null);
    expect(rpc.mock.calls[0]?.[1]).toMatchObject({ p_overrides: null });
  });

  it("turns a stale revision into a conflict the screen can explain", async () => {
    const { client } = fakeClient({
      data: null,
      error: { message: "draw_revision_conflict: now revision 7", code: "40001" },
    });
    await expect(saveDraw(client, "t1", 4, [group], [])).rejects.toBeInstanceOf(DrawConflictError);
  });

  it("reports other failures with their message", async () => {
    const { client } = fakeClient({
      data: null,
      error: { message: "Only an owner", code: "42501" },
    });
    await expect(saveDraw(client, "t1", 0, [group], [])).rejects.toThrow("Could not save the draw");
  });

  it("refuses a response without a revision", async () => {
    const { client } = fakeClient({ data: null, error: null });
    await expect(saveDraw(client, "t1", 0, [group], [])).rejects.toThrow("no revision returned");
  });
});

describe("publishPairings", () => {
  const published = { groups: [], signature: "1:p1" };

  it("returns the version and time the database assigned", async () => {
    const { client, rpc } = fakeClient({
      data: { version: 3, at: "2026-11-13T23:10:00Z" },
      error: null,
    });
    await expect(publishPairings(client, "t1", 5, published, "Late withdrawal")).resolves.toEqual({
      version: 3,
      at: "2026-11-13T23:10:00Z",
    });
    expect(rpc).toHaveBeenCalledWith("publish_pairings", {
      p_tournament: "t1",
      p_expected_revision: 5,
      p_groups: [],
      p_signature: "1:p1",
      p_note: "Late withdrawal",
    });
  });

  it("refuses an incomplete response", async () => {
    const { client } = fakeClient({ data: { version: "3" }, error: null });
    await expect(publishPairings(client, "t1", 5, published)).rejects.toThrow("incomplete");
  });

  it("reports a stale draw as a conflict", async () => {
    const { client } = fakeClient({
      data: null,
      error: { message: "draw_revision_conflict", code: "40001" },
    });
    await expect(publishPairings(client, "t1", 5, published)).rejects.toBeInstanceOf(
      DrawConflictError,
    );
  });
});

describe("unpublishPairings", () => {
  it("surfaces a refusal", async () => {
    const { client } = fakeClient({ data: null, error: { message: "Only an owner or organizer" } });
    await expect(unpublishPairings(client, "t1")).rejects.toThrow("Could not unpublish");
  });
});
