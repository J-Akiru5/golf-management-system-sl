import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import type { Database } from "@/lib/supabase/types";
import { saveConsentedPhoto, setPlayerPhotoConsent } from "./players";

const PHOTO = "data:image/jpeg;base64,/9j/4AAQSkZJRg==";

function fakePhotoClient() {
  const privateUpload = vi.fn().mockResolvedValue({ error: null });
  const publicUpload = vi.fn().mockResolvedValue({ error: null });
  const remove = vi.fn().mockResolvedValue({ error: null });
  const signed = vi.fn().mockResolvedValue({
    data: { signedUrl: "https://example.test/private.jpg" },
    error: null,
  });
  const update = vi.fn(() => ({
    eq: () => ({
      eq: () => ({
        select: () => ({
          maybeSingle: vi.fn().mockResolvedValue({ data: { id: "player-1" }, error: null }),
        }),
      }),
    }),
  }));
  const client = {
    storage: {
      from: (bucket: string) => {
        if (bucket === "player-photos") {
          return { upload: privateUpload, createSignedUrl: signed, remove };
        }
        if (bucket === "player-photos-public") {
          return { upload: publicUpload, remove };
        }
        throw new Error(`Unexpected bucket ${bucket}`);
      },
    },
    from: () => ({ update }),
  } as unknown as SupabaseClient<Database>;
  return { client, privateUpload, publicUpload, remove, update };
}

describe("saveConsentedPhoto", () => {
  it("writes the private original and only writes a public copy with public consent", async () => {
    const { client, privateUpload, publicUpload } = fakePhotoClient();
    const saved = await saveConsentedPhoto(client, "club-1", "player-1", PHOTO, true);

    expect(privateUpload).toHaveBeenCalledTimes(1);
    expect(publicUpload).toHaveBeenCalledWith(
      "club-1/player-1.jpg",
      expect.any(Blob),
      expect.objectContaining({ contentType: "image/jpeg", upsert: true }),
    );
    expect(saved.path).toMatch(/^club-1\/player-1\//);
    expect(saved.publicPath).toBe("club-1/player-1.jpg");
    expect(saved.publicConsentAt).not.toBeNull();
  });

  it("does not write a public copy when the separate consent is off", async () => {
    const { client, publicUpload } = fakePhotoClient();
    const saved = await saveConsentedPhoto(client, "club-1", "player-1", PHOTO, false);

    expect(publicUpload).not.toHaveBeenCalled();
    expect(saved.publicPath).toBeNull();
    expect(saved.publicConsentAt).toBeNull();
  });

  it("refuses anything that is not a JPEG, PNG or WebP", async () => {
    const { client } = fakePhotoClient();
    await expect(
      saveConsentedPhoto(client, "club-1", "player-1", "data:image/gif;base64,R0lGODlh"),
    ).rejects.toThrow("JPEG, PNG, or WebP");
  });
});

describe("setPlayerPhotoConsent", () => {
  it("writes both consent timestamps and the public path", async () => {
    const { client, update } = fakePhotoClient();
    await setPlayerPhotoConsent(
      client,
      "club-1",
      "player-1",
      "club-1/player-1/private.jpg",
      "2026-10-22T00:00:00.000Z",
      "club-1/player-1.jpg",
      "2026-10-22T00:00:00.000Z",
    );
    expect(update).toHaveBeenCalledWith({
      photo_path: "club-1/player-1/private.jpg",
      photo_consent_at: "2026-10-22T00:00:00.000Z",
      photo_public_path: "club-1/player-1.jpg",
      photo_public_consent_at: "2026-10-22T00:00:00.000Z",
    });
  });
});
