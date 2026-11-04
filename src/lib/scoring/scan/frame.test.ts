import { describe, expect, it } from "vitest";
import { CARD_ASPECT, cardCaptureWidth, cardFrame } from "./frame";

describe("cardFrame", () => {
  it("crops a wide desktop frame to a centred card band", () => {
    // 1920 / 1.8 = 1066.7, rounded to 1067, so a 1920 x 1067 band centred in 1080 starts at 7 px.
    expect(cardFrame(1920, 1080)).toEqual({ sx: 0, sy: 7, sw: 1920, sh: 1067 });
  });

  it("takes a wide strip from the middle of a portrait phone frame", () => {
    // A 1080 wide sensor gives 1080 / 1.8 = 600 tall, centred in the 1920 tall frame.
    expect(cardFrame(1080, 1920)).toEqual({ sx: 0, sy: 660, sw: 1080, sh: 600 });
  });

  it("narrows the band when the source is shorter than the card shape", () => {
    const frame = cardFrame(3000, 800);
    expect(frame).toEqual({ sx: 780, sy: 0, sw: 1440, sh: 800 });
    expect(frame ? frame.sw / frame.sh : 0).toBeCloseTo(CARD_ASPECT, 1);
  });

  it("refuses a frame with no pixels", () => {
    expect(cardFrame(0, 1080)).toBeNull();
    expect(cardFrame(1920, 0)).toBeNull();
    expect(cardFrame(1920, 1080, 0)).toBeNull();
  });

  it("honours another card aspect", () => {
    expect(cardFrame(1600, 1200, 4)).toEqual({ sx: 0, sy: 400, sw: 1600, sh: 400 });
  });
});

describe("cardCaptureWidth", () => {
  it("keeps the frame's own width below the cap", () => {
    expect(cardCaptureWidth({ sx: 0, sy: 0, sw: 1080, sh: 600 })).toBe(1080);
  });

  it("caps a large sensor so the upload stays small", () => {
    expect(cardCaptureWidth({ sx: 0, sy: 0, sw: 3840, sh: 2133 })).toBe(2400);
  });
});
