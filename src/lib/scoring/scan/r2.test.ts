import { describe, expect, it } from "vitest";
import { UnsupportedMediaTypeError } from "@/lib/storage";
import {
  createScorecardObjectKey,
  extensionForImageMime,
  isSupportedImageMime,
  presignScorecardPut,
  scorecardObjectBelongsToClub,
} from "./r2";

const clubId = "6fa99409-3515-4253-88a1-5dad321ef573";

describe("scorecard R2 keys", () => {
  it("accepts the three image types and rejects others", () => {
    expect(extensionForImageMime("image/jpeg")).toBe("jpg");
    expect(extensionForImageMime("image/png")).toBe("png");
    expect(extensionForImageMime("image/webp")).toBe("webp");
    expect(extensionForImageMime("application/pdf")).toBeNull();
    expect(isSupportedImageMime("image/gif")).toBe(false);
  });

  it("creates a club-scoped key that the image table accepts", () => {
    const key = createScorecardObjectKey(clubId, "image/jpeg");
    expect(key.startsWith(`${clubId}/r2/scorecards/`)).toBe(true);
    expect(key.endsWith(".jpg")).toBe(true);
    expect(scorecardObjectBelongsToClub(key, clubId)).toBe(true);
  });

  it("rejects another club and path traversal", () => {
    expect(
      scorecardObjectBelongsToClub(
        "11111111-1111-1111-1111-111111111111/r2/scorecards/a.jpg",
        clubId,
      ),
    ).toBe(false);
    expect(scorecardObjectBelongsToClub(`${clubId}/r2/../other/a.jpg`, clubId)).toBe(false);
  });

  it("keeps scorecard uploads image-only", async () => {
    await expect(
      presignScorecardPut(`${clubId}/r2/scorecards/a.pdf`, "application/pdf"),
    ).rejects.toBeInstanceOf(UnsupportedMediaTypeError);
  });
});
