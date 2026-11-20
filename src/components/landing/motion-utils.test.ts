import { describe, expect, it } from "vitest";
import { formatLandingCount, pickLandingMotionTier } from "./motion-utils";

describe("landing motion tier", () => {
  const fullFacts = {
    reducedMotion: false,
    coarsePointer: false,
    viewportWidth: 1440,
  };

  it("disables motion when reduced motion is requested", () => {
    expect(pickLandingMotionTier({ ...fullFacts, reducedMotion: true, saveData: true })).toBe(
      "none",
    );
  });

  it.each([
    { saveData: true },
    { deviceMemory: 4 },
    { hardwareConcurrency: 4 },
    { coarsePointer: true, viewportWidth: 767 },
  ])("selects lite motion for constrained devices: %o", (facts) => {
    expect(pickLandingMotionTier({ ...fullFacts, ...facts })).toBe("lite");
  });

  it("keeps full motion on capable devices, including wider coarse-pointer screens", () => {
    expect(pickLandingMotionTier(fullFacts)).toBe("full");
    expect(pickLandingMotionTier({ ...fullFacts, coarsePointer: true, viewportWidth: 768 })).toBe(
      "full",
    );
  });
});

describe("landing count formatter", () => {
  it("formats large integer figures with US grouping", () => {
    expect(formatLandingCount(118279)).toBe("118,279");
  });

  it("formats zero and rounds intermediate tween values", () => {
    expect(formatLandingCount(0)).toBe("0");
    expect(formatLandingCount(17402.6)).toBe("17,403");
  });
});
