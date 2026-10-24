import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import type { Database } from "@/lib/supabase/types";
import { saveEventLogo } from "./event-logo";

const CLUB = "club-1";
const TOURNAMENT_ID = "tournament-1";
const BUCKET = "event-logos";
const SIGNED_URL = "https://files.example.test/logo.png";

const dataUrl = (mime: string, bytes: string): string => `data:${mime};base64,${btoa(bytes)}`;

const PNG = dataUrl("image/png", "logo-bytes");

type StorageError = { message: string };

/**
 * A fake Supabase client for the logo helper: the private storage bucket and the tournaments update.
 * It records the object paths, the update payload and the filters so the tenant scope is visible.
 */
function fakeLogoClient(
  options: {
    upload?: { error: StorageError | null };
    update?: { error: StorageError | null };
    sign?: { data: { signedUrl: string } | null; error: StorageError | null };
  } = {},
) {
  const upload = vi.fn(
    async (_path: string, _file: Blob, _options?: { contentType: string; upsert: boolean }) =>
      options.upload ?? { error: null },
  );
  const remove = vi.fn(async (_paths: string[]) => ({ error: null }));
  const createSignedUrl = vi.fn(
    async (_path: string, _expiresIn: number) =>
      options.sign ?? { data: { signedUrl: SIGNED_URL }, error: null },
  );

  const filters: [string, string][] = [];
  const secondEq = vi.fn(async (column: string, value: string) => {
    filters.push([column, value]);
    return options.update ?? { error: null };
  });
  const firstEq = vi.fn((column: string, value: string) => {
    filters.push([column, value]);
    return { eq: secondEq };
  });
  const update = vi.fn((_payload: { logo_path: string | null }) => ({ eq: firstEq }));

  const from = vi.fn((table: string) => {
    if (table !== "tournaments") throw new Error(`Unexpected table ${table}`);
    return { update };
  });
  const storageFrom = vi.fn((bucket: string) => {
    if (bucket !== BUCKET) throw new Error(`Unexpected bucket ${bucket}`);
    return { upload, remove, createSignedUrl };
  });

  const client = { from, storage: { from: storageFrom } } as unknown as SupabaseClient<Database>;
  return {
    client,
    from,
    storageFrom,
    upload,
    remove,
    createSignedUrl,
    update,
    filters,
  };
}

describe("saveEventLogo", () => {
  it("saves a PNG to the private bucket and records the path on the event", async () => {
    const { client, upload, update, createSignedUrl, filters } = fakeLogoClient();

    const saved = await saveEventLogo(client, CLUB, TOURNAMENT_ID, PNG);

    expect(saved.path).toMatch(/^club-1\/tournament-1\/[0-9a-f-]{36}\.png$/);
    expect(saved.url).toBe(SIGNED_URL);

    expect(upload).toHaveBeenCalledTimes(1);
    const call = upload.mock.calls[0];
    expect(call?.[0]).toBe(saved.path);
    expect(call?.[1]).toBeInstanceOf(Blob);
    expect(call?.[1]?.type).toBe("image/png");
    await expect(call?.[1]?.text()).resolves.toBe("logo-bytes");
    expect(call?.[2]).toEqual({ contentType: "image/png", upsert: false });

    expect(update).toHaveBeenCalledWith({ logo_path: saved.path });
    expect(filters).toEqual([
      ["club_id", CLUB],
      ["id", TOURNAMENT_ID],
    ]);
    expect(createSignedUrl).toHaveBeenCalledWith(saved.path, 30 * 60);
  });

  it.each([
    ["image/png", "png", "image/png"],
    ["image/jpeg", "jpg", "image/jpeg"],
    ["image/jpg", "jpg", "image/jpeg"],
    ["image/webp", "webp", "image/webp"],
  ])("accepts %s and stores it as .%s", async (mime, extension, contentType) => {
    const { client, upload } = fakeLogoClient();

    const saved = await saveEventLogo(client, CLUB, TOURNAMENT_ID, dataUrl(mime, "image-bytes"));

    expect(saved.path).toMatch(new RegExp(`^club-1/tournament-1/[0-9a-f-]{36}\\.${extension}$`));
    expect(upload.mock.calls[0]?.[2]).toEqual({ contentType, upsert: false });
  });

  it.each([
    ["a GIF", "data:image/gif;base64,R0lGODlh"],
    ["an SVG", "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4="],
    ["a remote URL", "https://example.test/logo.png"],
    ["a plain-text data URL", "data:text/plain;base64,aGVsbG8="],
  ])("rejects %s before touching storage or the event row", async (_label, logo) => {
    const { client, upload, update } = fakeLogoClient();

    await expect(saveEventLogo(client, CLUB, TOURNAMENT_ID, logo)).rejects.toThrow(
      "The event logo must be a PNG, JPEG or WebP image.",
    );
    expect(upload).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it("removes the previous object after the event points at the new path", async () => {
    const { client, remove, update } = fakeLogoClient();

    const saved = await saveEventLogo(
      client,
      CLUB,
      TOURNAMENT_ID,
      PNG,
      "club-1/tournament-1/old.png",
    );

    expect(update).toHaveBeenCalledWith({ logo_path: saved.path });
    expect(remove).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledWith(["club-1/tournament-1/old.png"]);
    // The old object goes only after the event points at the new one, so a failed update keeps it.
    expect(update.mock.invocationCallOrder[0] ?? 0).toBeLessThan(
      remove.mock.invocationCallOrder[0] ?? 0,
    );
  });

  it("never removes a previous path that belongs to another club", async () => {
    const { client, remove } = fakeLogoClient();

    await saveEventLogo(client, CLUB, TOURNAMENT_ID, PNG, "club-2/tournament-1/old.png");

    expect(remove).not.toHaveBeenCalled();
  });

  it("removes the fresh upload when the event row cannot be updated", async () => {
    const { client, upload, remove, createSignedUrl, update } = fakeLogoClient({
      update: { error: { message: "permission denied" } },
    });

    await expect(
      saveEventLogo(client, CLUB, TOURNAMENT_ID, PNG, "club-1/tournament-1/old.png"),
    ).rejects.toThrow("Could not save the event logo: permission denied");

    const uploadedPath = upload.mock.calls[0]?.[0];
    expect(update).toHaveBeenCalledWith({ logo_path: uploadedPath });
    expect(remove).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledWith([uploadedPath]);
    expect(createSignedUrl).not.toHaveBeenCalled();
  });

  it("does not update the event when the upload fails", async () => {
    const { client, update, createSignedUrl } = fakeLogoClient({
      upload: { error: { message: "the bucket refused the object" } },
    });

    await expect(saveEventLogo(client, CLUB, TOURNAMENT_ID, PNG)).rejects.toThrow(
      "Could not save the event logo: the bucket refused the object",
    );
    expect(update).not.toHaveBeenCalled();
    expect(createSignedUrl).not.toHaveBeenCalled();
  });
});
