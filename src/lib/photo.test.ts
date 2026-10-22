import { afterEach, describe, expect, it, vi } from "vitest";
import { publicPhotoUrl } from "./photo";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("publicPhotoUrl", () => {
  it("builds a public-bucket URL from an allow-listed path", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co/");
    expect(publicPhotoUrl("club-id/player-id.jpg")).toBe(
      "https://example.supabase.co/storage/v1/object/public/player-photos-public/club-id/player-id.jpg",
    );
  });

  it("returns nothing without a path or a configured project", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    expect(publicPhotoUrl(null)).toBeUndefined();
    expect(publicPhotoUrl(undefined)).toBeUndefined();
    vi.unstubAllEnvs();
    expect(publicPhotoUrl("club-id/player-id.jpg")).toBeUndefined();
  });
});
